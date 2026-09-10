# okaimono

`okaimono.etzhayyim.com` — AI-operated D2C OEM-only EC marketplace on the
etzhayyim substrate.

**Start here: [`docs/operator-quickstart.md`](docs/operator-quickstart.md)** —
what actually runs from this repository, what does not, and why.

> ⚠️ **2026-08-28: `kotoba/` cannot be installed.** Its TypeScript dependency
> closure is frozen at the last TS commits of six packages that have since
> become Clojure, and it cannot be repaired — root `overrides` do not reach
> inside `@etzhayyim/checkpointer`'s nested `npm install`, and the next commit
> to that package's `package.json` deletes it. Earlier green installs recorded
> here came from warm stores. The path forward is the port to
> `kotoba-lang/pay` + `pay.rail.base-l2`; see `cloud-itonami/ec` ADR-0002 and
> superproject ADR-2608281200.
>
> **The ClojureScript appview is unaffected** and still builds — it does not
> depend on the SDK.

## Layout

| Path | What it is | Runnable here? |
|---|---|---|
| `kotoba/` | Reference implementation (TypeScript): catalog, orders, tithe split, inventory, fulfillment, support, settlement seam | **Yes** — `npm install && npm test` (32 tests) |
| `appview/okaimono-shopping-mcp-component/` | Marketplace component `ok4imn1o` — ClojureScript (shadow-cljs + reagent + re-frame + jp-go-dds) frontend + `wrangler.jsonc` | **Yes**, the frontend — `cd appview/okaimono-shopping-mcp-component/cljs && npm install && npx shadow-cljs compile app` |
| `appview/okaimono-checkout-agent-component/` | Checkout SAGA orchestrator `chk8uty2` — design documents only | No — no source |
| `proto/v1/shopping.proto` | Wire schema | — |

## Repository-level checks

```bash
nbb --classpath test run_tests.kotoba
```

No install, no network, no JVM. These check the *seams between files*, which
neither existing suite can see: the nanoid spelled in five places, the
`did:web` host against the routes that have to answer for it, the descriptor's
fields against the Worker's `vars`, the static-bundle wiring (`:output-dir` →
`:asset-path` → `<script src>` → `assets.directory`), whether `:ns-regexp`
still selects the ClojureScript test namespace at all, and whether the test
counts published in this file and in `docs/operator-quickstart.md` are still
the counts the code has. `kotoba/`'s suite sees only `kotoba/src` and cannot
be installed at all (see the notice above); the ClojureScript suite compares
`default-db` with `default-db` and needs a JVM.

Three inconsistencies are **deliberately not pinned**, because they are not
fixed and pinning them would freeze an error as correct:

- `PROJECT.jsonld`'s six `hasPart` URLs all point at paths that do not exist
  here — `wasm/okaimono-shopping-mcp-component`,
  `wasm/okaimono-source-crawler-component`, `integration/ec/PROJECT.jsonld`,
  `data/resources/`, `data/entities/`, `data/crawler/collection-plan.jsonld`.
- `kotodama.jsonld`'s `triggers.http.staticDir` is `/wasm/cljs/public` — the
  same removed `wasm/` tree the section below already disclaims.
- Both `kotodama.jsonld` files carry the same `@id`
  (`did:web:okaimono.etzhayyim.com`), and the checkout-agent's `nanoid`
  (`a1ef52ee`) does not match its own channel name (`1ef52ee4-feed`).

A fourth is pinned only in the safe direction: `vars.APP_CAPABILITIES` (2) and
`profile.capabilities` (4) are not equal, so the suite checks containment —
the Worker must not advertise a capability the descriptor did not grant.

## Data Access

W Protocol Event Stream only:
- Write: `WRecord()` / `WUpdate()` / `WDelete()` → PDS → yata Cypher direct (SHA-256 content CID)
- Read: `G()` (Cypher)

## Settlement

On-chain only (ADR-2606011400): USDC via `TitheRouter`, constitutional 10%
tithe to the Public Fund. No Stripe, no fiat. `kotoba/src/settlement.ts` keeps
value transfer behind an injected `SettlementExecutor` — the single seam
(ADR-2605172100) — so the test suite exercises the full order lifecycle without
touching a chain.

## Frontend

```bash
cd appview/okaimono-shopping-mcp-component/cljs
npm install
npx shadow-cljs compile app      # -> public/js/, served alongside public/index.html
npx shadow-cljs compile test && node out/tests.js   # cljs.test over the re-frame event/sub logic
```

ClojureScript (shadow-cljs) + reagent 1.2.0 + re-frame 1.4.3, rendered with
`jp-go-dds.core` (デジタル庁デザインシステム) hiccup — this workspace's base
design system. `public/index.html`'s inlined CSS was produced once via
`jp-go-dds.page/->page`; see the docstring at the top of
`src/okaimono/app.cljs` for how to regenerate it. Migrated from the previous
SvelteKit frontend (`appview/okaimono-shopping-mcp-component/svelte`, removed
— it was a scaffold, `App.svelte` + `routes/+page.svelte`, both ported
one-to-one; see `docs/operator-quickstart.md`). Unlike the old SvelteKit
setup, this frontend has no `workspace:*` dependency and no pnpm workspace
requirement, so it is not blocked the way the Svelte build was.

## Deployment — untested, not attempted here

`wrangler.jsonc` used to point `main` at
`svelte/.svelte-kit/cloudflare/_worker.js` (a server-rendering Worker script
the SvelteKit Cloudflare adapter produced) and `assets.directory` at that
adapter's static client output — both paths under the now-removed `svelte/`
tree. The new ClojureScript frontend is a plain static bundle (no
server-rendering step), so `wrangler.jsonc` here now points `assets.directory`
at `./cljs/public` and drops `main` entirely (a Cloudflare Worker can be
assets-only, with no Worker script, when there is nothing to render
server-side). **This edit is unverified — `wrangler deploy`/`wrangler
dev` were not run against it; actually deploying is a separate decision from
porting the frontend, and is out of scope for this migration.**

Earlier revisions of this file also documented

```bash
cd wasm/okaimono-shopping-mcp-component && etzhayyim build && etzhayyim deploy
```

Neither the `wasm/` directory nor the `etzhayyim` CLI exists in this
repository. The components live under `appview/`.

## Names

This repository answers to four names that do not agree — `okaimono`,
`com-etzhayyim-app-okaimono`, `etzhayyim-project-okaimono`, and a separate
archived `com-etzhayyim-okaimono`. The quickstart's closing section maps them.
