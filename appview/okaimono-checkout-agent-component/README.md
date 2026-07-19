# okaimono-checkout-agent-component

Checkout SAGA orchestrator for okaimono.etzhayyim.com (nanoid: `chk8uty2`)。

## Data Access

W Protocol Event Stream:
- Write: `kotodama.WRecord("okaimono.checkout-execution", payload)` → PDS → yata Cypher direct (SHA-256 content CID)
- Read: `kotodama.G("CheckoutExecutions").Match(Eq{...}).Return("*").Query()` (Cypher)
- cross-actor: `kotodama.Invoke("", tool, args)` → marketplace commands

## SAGA Flow

```
validate-cart → check-inventory → reserve-stock → process-payment → confirm-order → create-shipment
```

Compensation: stock release on payment failure, refund trigger on shipment failure.

## Commands

- `execute` — Full checkout flow (validate → reserve → pay → ship)
- `get-execution` — Get checkout execution status
- `retry-step` — Retry a failed step

## Config

- `app.version` — Deploy version (via `ConfigGet`)
