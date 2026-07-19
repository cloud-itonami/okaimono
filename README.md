# etzhayyim-project-okaimono

okaimono.etzhayyim.com — Amazon-grade AI-operated EC marketplace.

## Components

| Component | nanoid | 役割 |
|---|---|---|
| `okaimono-shopping-mcp-component` | `ok4imn1o` | Marketplace (catalog/orders/inventory/pricing/reviews/recommendations/fulfillment/procurement/support/analytics) |
| `okaimono-checkout-agent-component` | `chk8uty2` | Checkout SAGA orchestrator |

## Data Access

W Protocol Event Stream only:
- Write: `WRecord()` / `WUpdate()` / `WDelete()` → PDS → yata Cypher direct (SHA-256 content CID)
- Read: `G()` (Cypher)

## Deployment

```bash
cd wasm/okaimono-shopping-mcp-component && etzhayyim build && etzhayyim deploy
cd wasm/okaimono-checkout-agent-component && etzhayyim build && etzhayyim deploy
```

- `okaimono.etzhayyim.com` — marketplace UI + API
- `chk8uty2.etzhayyim.com` — checkout agent
