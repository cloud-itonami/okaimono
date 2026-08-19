# okaimono

`okaimono.etzhayyim.com` — AI-operated D2C OEM-only EC marketplace on the
etzhayyim substrate.

**Start here: [`docs/operator-quickstart.md`](docs/operator-quickstart.md)** —
what actually runs from this repository, what does not, and why.

## Layout

| Path | What it is | Runnable here? |
|---|---|---|
| `kotoba/` | Reference implementation (TypeScript): catalog, orders, tithe split, inventory, fulfillment, support, settlement seam | **Yes** — `npm install && npm test` (32 tests) |
| `appview/okaimono-shopping-mcp-component/` | Marketplace component `ok4imn1o` — SvelteKit app + `wrangler.jsonc` | No — see below |
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

## Deployment — currently blocked

The appview cannot be built from this repository alone: its `package.json`
requires `@etzhayyim/design-system` via pnpm's `workspace:*` protocol, and the
workspace that provided it did not come along when the app was extracted from
`etzhayyim/root` (see `migration.edn`). `wrangler.jsonc` points `main` at the
output of that build, so deploy is blocked behind the same gap.

Earlier revisions of this file documented

```bash
cd wasm/okaimono-shopping-mcp-component && etzhayyim build && etzhayyim deploy
```

Neither the `wasm/` directory nor the `etzhayyim` CLI exists in this
repository. The components live under `appview/`. Restoring a working deploy
means restoring the design-system workspace first; the quickstart records the
exact errors.

## Names

This repository answers to four names that do not agree — `okaimono`,
`com-etzhayyim-app-okaimono`, `etzhayyim-project-okaimono`, and a separate
archived `com-etzhayyim-okaimono`. The quickstart's closing section maps them.
