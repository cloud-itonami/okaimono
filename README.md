# okaimono

`okaimono.etzhayyim.com` — AI-operated D2C OEM-only EC marketplace on the
etzhayyim substrate.

**Start here: [`docs/operator-quickstart.md`](docs/operator-quickstart.md)** —
what actually runs from this repository, what does not, and why.

## Layout

| Path | What it is | Runnable here? |
|---|---|---|
| `kotoba/` | Reference implementation (TypeScript): catalog, orders, tithe split, inventory, fulfillment, support, settlement seam | **Yes** — `npm install && npm test` (32 tests) |
| `appview/okaimono-shopping-mcp-component/` | Marketplace component `ok4imn1o` — ClojureScript (shadow-cljs + reagent + re-frame + jp-go-dds) frontend + `wrangler.jsonc` | **Yes**, the frontend — `cd appview/okaimono-shopping-mcp-component/cljs && npm install && npx shadow-cljs compile app` |
| `appview/okaimono-checkout-agent-component/` | Checkout SAGA orchestrator `chk8uty2` — design documents only | No — no source |
| `proto/v1/shopping.proto` | Wire schema | — |

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
