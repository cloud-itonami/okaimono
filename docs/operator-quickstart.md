# Operator quickstart — okaimono

What an operator can actually run in this repository today, and what they
cannot. Every command below was executed against commit `5ae21a2` on
2026-08-19; the outputs quoted are the ones it produced, not expected values —
**except** the "The ClojureScript appview" section below, which documents a
2026-08-26 migration that replaced the SvelteKit frontend and was verified
separately (see that section for its own measured commands/output).

## TL;DR

| Part | Path | Runnable from this repo alone? |
|---|---|---|
| kotoba reference implementation | `kotoba/` | **Yes** — install, test, typecheck |
| shopping-mcp appview (ClojureScript) | `appview/okaimono-shopping-mcp-component/cljs/` | **Yes** — install, `shadow-cljs compile app`/`test`, see below |
| checkout-agent appview | `appview/okaimono-checkout-agent-component/` | **No** — design documents only, no source |
| Cloudflare deploy | `appview/*/wrangler.jsonc` | **No** — depends on the appview build above |

There is no top-level `package.json`. Every command below runs from `kotoba/`.

## Prerequisites

Measured on the machine used for this walkthrough:

```
$ node --version
v26.3.0
$ npm --version
11.16.0
```

The two dependencies are fetched from GitHub over `git+https` and pinned by
commit. Both source repositories are public, so no credentials are needed:

- `@etzhayyim/sdk` — `etzhayyim/com-etzhayyim-sdk` @ `12314a0c`
- `@etzhayyim/sdk-mock` — `etzhayyim/com-etzhayyim-sdk-mock` @ `c857ff9b`

Both are TypeScript sources that build to `dist/` in a `prepare` script, so the
install is not a plain download — it runs `tsc` for the SDK and its seven
transitive `@etzhayyim/*` packages. Budget the time: two runs on an M-series
laptop took **5m56s** and **4m28s** wall clock (~310s user CPU each; the
spread is contention on a busy machine, not cache warmth).

## 1. Install

```bash
cd kotoba
npm install
```

### If you get `EALLOWSCRIPTS`, it is your npm config, not this repo

npm 11.16 refuses the `allow-scripts` setting when it recurses to prepare a
git-hosted dependency, and it inherits that setting from your **user-level**
`~/.npmrc`. The failure looks like a problem with the dependency:

```
npm error git dep preparation failed
npm error npm error code EALLOWSCRIPTS
npm error npm error --allow-scripts is not allowed in project-scoped installs.
```

It is not. Isolated on 2026-08-19 by running the same install twice, changing
only the user config:

| `--userconfig` contents | Result |
|---|---|
| `allow-scripts[]=@anthropic-ai/claude-code` | `EALLOWSCRIPTS` |
| *(empty)* | installs, `found 0 vulnerabilities` |

Check whether you are affected, and work around it without editing your
config:

```bash
grep -n 'allow-scripts' ~/.npmrc     # if this prints anything, you are affected
npm install --userconfig /dev/null   # workaround
```

The workaround also drops any private-registry auth lines in `~/.npmrc`. That
is fine here — every dependency of this package resolves from public npm and
public GitHub — but do not copy the flag into unrelated projects.

`pnpm install` does **not** avoid this: pnpm delegates git-dependency
preparation to `npm install` and surfaces the same error wrapped as
`ERR_PNPM_PREPARE_PACKAGE`.

### Install leaves two untracked paths

`kotoba/node_modules/` is ignored (see `.gitignore`). `kotoba/package-lock.json`
is **not** — this repository has never tracked one. Either commit it
deliberately or delete it before you push; do not let it ride along in an
unrelated change.

## 2. Test

```bash
npm test        # vitest run
```

Produced:

```
 Test Files  1 passed (1)
      Tests  32 passed (32)
   Duration  2.17s
```

All 32 live in `test/okaimono.test.ts` and run against `MockEtzhayyim` from
`@etzhayyim/sdk-mock` — no PDS, no network, no chain. They cover the
constitutional 10% tithe split, catalog publish/get/list, the order lifecycle
(create → settle → refund), support cases, inventory reserve/release, and
shipment status.

Note that `MIGRATION-TODO.md` still claims "14/14 vitest pass". That number is
stale; 32 is the measured count at `5ae21a2`.

## 3. Typecheck

```bash
npm run typecheck    # tsc --noEmit
```

Produced no output and exited 0. `tsconfig.json` includes `src/**/*.ts` only,
so this checks the implementation and not the test file.

## The ClojureScript appview (2026-08-26 migration)

`appview/okaimono-shopping-mcp-component/svelte/` (SvelteKit 5 + Vite 6 +
`@sveltejs/adapter-cloudflare`) was **removed** and replaced with
`appview/okaimono-shopping-mcp-component/cljs/` (shadow-cljs + reagent +
re-frame, rendered with `jp-go-dds.core` — this workspace's base design
system). The old frontend was never buildable from this repository alone:
its `package.json` declared `"@etzhayyim/design-system": "workspace:*"`, but
no `pnpm-workspace.yaml` existed anywhere in this repository — it was left
behind when the app was extracted from `etzhayyim/root` (see `migration.edn`).
Both `pnpm install --frozen-lockfile` (`ERR_PNPM_OUTDATED_LOCKFILE`) and plain
`pnpm install` (`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`) failed against it. The new
frontend has no workspace-protocol dependency and does not have this problem.

There were exactly two source files to port, and both were ported one-to-one
(see the docstring in `cljs/src/okaimono/app.cljs`):

- `svelte/src/App.svelte` — a heading + one paragraph scaffold, no
  interactivity — ported as `okaimono.app/app-component`.
- `svelte/src/routes/+page.svelte` — the SvelteKit route for `/`, whose body
  was only `<script>import App from '../App.svelte'</script><App />` — ported
  as `okaimono.app/home-page`, the thing mounted at `/` (this workspace is
  single-page-app-only, ADR-2608080100: one document, one bundle, one mount).

```bash
cd appview/okaimono-shopping-mcp-component/cljs
npm install
npx shadow-cljs compile app                          # -> public/js/app.js
npx shadow-cljs compile test && node out/tests.js    # cljs.test over the re-frame event/sub logic
```

Measured 2026-08-26, from a clean `npm install`:

```
[:app] Build completed. (111 files, 110 compiled, 0 warnings, 15.71s)
[:test] Build completed. (112 files, 111 compiled, 0 warnings, 11.05s)

Testing okaimono.app-test
re-frame: Subscribe was called outside of a reactive context.
 https://day8.github.io/re-frame/FAQs/UseASubscriptionInAnEventHandler/
[... same warning, 4 times — expected: the test namespace calls
 rf/subscribe directly, not inside a Reagent render, same as the other
 cljs migrations in this workspace ...]

Ran 4 tests containing 6 assertions.
0 failures, 0 errors.
```

### `etzhayyim build` / `etzhayyim deploy`

The `etzhayyim` CLI is not on `PATH` here and this repository does not vendor
it, so that CLI invocation still cannot run regardless of the frontend
migration. Separately, `appview/okaimono-shopping-mcp-component/wrangler.jsonc`
used to point `main` at `svelte/.svelte-kit/cloudflare/_worker.js` (an output
of the old SvelteKit build); it has been updated to drop `main` (the new
frontend has no server-rendering step — a Cloudflare Worker can be
assets-only) and point `assets.directory` at `./cljs/public` instead. **That
`wrangler.jsonc` edit is unverified** — `wrangler deploy`/`wrangler dev` were
not run against it here; actually deploying is out of scope for a frontend
migration.

## Repository identity is inconsistent

Worth knowing before you file anything against this repo. The checkout lives at
`cloud-itonami/okaimono` (west entry `cloud-itonami-okaimono`), but:

- `README.edn` names it `com-etzhayyim-app-okaimono`
- `migration.edn` names the destination `etzhayyim/com-etzhayyim-app-okaimono`
- `README.md`'s title is `etzhayyim-project-okaimono`
- a separate, **archived** `cloud-itonami/com-etzhayyim-okaimono` also exists,
  as does an unrelated `kotoba-lang/okaimono`

The npm dependencies point at `github.com/etzhayyim/com-etzhayyim-sdk`, while
west registers the same libraries as `kotoba-lang/sdk` and
`kotoba-lang/sdk-mock`. Nothing here is broken by that — the pinned git URLs
resolve — but do not assume the four names refer to four things.
