# Migration TODO

**Status**: 🔄 TRANSFORM — `kotoba/` on-chain reference slice landed 2026-06-01
(catalog + order + settlement). Remaining domains + appview wiring pending.

**Codemod required**: Stripe/fiat → USDC + ERC-4337 + TitheRouter

## kotoba/ slice (landed 2026-06-01, per ADR-2606011400 on-chain-only)

`60-apps/etzhayyim-project-okaimono/kotoba/` — Option B reference impl on the
etzhayyim substrate, same pattern as hanrei kotoba. **14/14 vitest pass,
`tsc --noEmit` clean.** Only `@etzhayyim/sdk` + local imports (no @atproto/api,
viem, RW, Stripe).

- `src/catalog.ts` — publishCatalogItem / getCatalogItem / listCatalogItems
  (AT PDS records; D2C OEM-only: manufacturerDid + factoryDid mandatory).
- `src/order.ts` — createOrder (pending_payment) + getOrder + settleOrder.
- `src/tithe.ts` — constitutional 10% split (tithe + net === gross, no leak).
- `src/types.ts` — records + `OkaimonoPaymentPurpose = "internal-purchase" |
  "escrow-refund"` (SBT↔SBT carve-out; external purchase/tip/subscription
  excluded).
- Settlement is via an injected `SettlementExecutor` (the sole value-transfer
  seam, ADR-2605172100). Real deployments wrap `@etzhayyim/sdk/donate`
  `donate({ to, amountUsdc, purpose: "internal-purchase" })` → TitheRouter.sol.

Follow-up: inventory / fulfillment / pricing / reviews / support / manufacturing
domains; appview wiring; replace injected executor with the donate() adapter.

## Substrate-boundary checks (per CLAUDE.md)

This seed was copied verbatim from `etzhayyim-root/60-apps/etzhayyim-project-okaimono`.
The following constitutional invariants are likely violated and MUST be
remediated before this app can be considered etzhayyim-aligned:

- [x] Replace any `@atproto/api`, `viem`, raw IPFS client, `@noble/ciphers`,
      `@signalapp/libsignal-client` imports with `@etzhayyim/sdk`. *(kotoba
      slice: only `@etzhayyim/sdk` imported; appview not yet ported)*
- [x] Strip RisingWave / Postgres / Kysely / centralized DB code — migrate to
      AT Protocol MST + IPFS + Base L2 anchor. *(kotoba slice: AT PDS records,
      no RW; appview not yet ported)*
- [x] Strip Stripe / PayPal / Square / fiat processors — migrate to USDC on
      Base L2 + ERC-4337 + `etzhayyim-tithe-router` (10% auto-split to
      Public Fund). *(kotoba slice: on-chain settlement via injected executor →
      donate()/TitheRouter; appview not yet ported)*
- [ ] Remove third-party advertising / AdSense / Meta Pixel / GA4 ad-linkage.
      Only internal-promo for etzhayyim's own religious activity is allowed.
- [ ] Verify identity flow uses did:web:etzhayyim.com + did:plc + WebAuthn
      passkey + Adherent SBT. Remove server-issued JWTs without DID binding.
- [x] Reclassify payment purposes to: donation / kisha / grant / tithe /
      escrow-refund (external) OR internal-purchase / internal-subscription /
      internal-promo (SBT↔SBT carve-out). *(kotoba slice: D2C sale =
      `internal-purchase`; external purchase/tip/subscription excluded)*
- [ ] Audit against Charter Rider v2.0 §2(a)-(h).

## Reference

- Constitution wave ADRs: ADR-2605192100 / 2605192115 / 2605192130 / 2605192200
- Substrate boundary table: `/CLAUDE.md` § "Substrate boundary"
- Charter Rider: `/CHARTER-RIDER.md`

---

## Codemod scan results (applied 2026-05-21)

Automated scan did NOT detect any of: Stripe / RisingWave / Kysely / Prisma /
Drizzle / GA4 / Meta Pixel / @atproto/api direct / viem direct imports.

The TRANSFORM classification was based on the app's domain pattern (commerce /
communication adapter / media etc.), not on detected violations. Manual review
is still required to confirm Charter §2(a)-(h) and substrate-boundary
compliance before this app is considered etzhayyim-aligned.
