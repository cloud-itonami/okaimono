# okaimono-shopping-mcp-component

okaimono.etzhayyim.com の App marketplace コンポーネント (nanoid: `ok4imn1o`)。

## Data Access

W Protocol Event Stream:
- Write: `kotodama.WRecord("okaimono.{kind}", payload)` → PDS → yata Cypher direct (SHA-256 content CID)
- Read: `kotodama.G("Label").Match(Eq{...}).Return("prop").Query()` (Cypher)
- DO SQLite / KV / PostgreSQL 直接 write 禁止

## Endpoints

- `GET /health`, `GET /healthz`, `GET /readyz`
- `POST /xrpc/...` (XRPC)

## Commands (40+)

### Catalog
- `catalog-list` — List items with filters
- `catalog-get` — Get product detail
- `catalog-upsert` — Create/update listing (→ `WRecord("okaimono.catalog-item")`)
- `catalog-search` — Keyword + facet search
- `catalog-search-unispsc` — Filter catalog by `unispsc_code`, segment, family, or class
- `import-unispsc-segment` — Bulk import one UNSPSC segment via `openUnispsc.importSegmentCatalog`

### Orders
- `order-create` — Create order with line items (→ `WRecord("okaimono.order")`)
- `order-get` — Get order with items + shipments
- `order-update-status` — Update status (→ `WUpdate`)
- `order-cancel` — Cancel with reason
- `order-list` — List orders with filters

### Inventory
- `inventory-reserve` — Reserve stock (→ `WRecord("okaimono.stock-reservation")`)
- `inventory-release` — Release reserved stock
- `inventory-receipt` — Confirm supplier receipt (→ `WRecord("okaimono.stock-movement")`)
- `inventory-reorder-needs` — Below safety stock (Graph query)
- `inventory-get-stock` — Stock levels

### Pricing
- `pricing-optimize` — AI optimal price calculation
- `pricing-create-promotion` — Create promo/flash sale (→ `WRecord("okaimono.promotion")`)
- `pricing-validate-coupon` — Validate coupon

### Reviews
- `review-submit` — Submit review (→ `WRecord("okaimono.review")`)
- `review-list` — List reviews
- `review-summary` — AI review summary

### Recommendations
- `recommend-for-customer` — Personalized (Graph)
- `recommend-bought-together` — Co-purchase (Graph)
- `recommend-similar` — Similar products
- `recommend-trending` — Trending products (Graph)

### Analytics
- `analytics-daily-kpi` — GMV, orders, CVR, AOV
- `analytics-funnel` — Session → view → cart → purchase
- `analytics-inventory-health` — Stock-out risk, overstock

### Fulfillment
- `fulfillment-create-shipment` — Create shipment (→ `WRecord("okaimono.shipment")`)
- `fulfillment-carrier-event` — Tracking event (→ `WRecord("okaimono.carrier-event")`)
- `fulfillment-get-shipment` — Get with tracking history
- `fulfillment-estimate` — Delivery date + cost estimate

### Procurement
- `procurement-find-offers` — Supplier price comparison
- `procurement-find-offers-unispsc` — Resolve `product_id=unispsc-{code}` through `openUnispsc.planCatalogPurchase`
- `procurement-place-po` — Place PO (→ `WRecord("okaimono.purchase-order")`)
- `procurement-list-suppliers` — List with metrics

## UNSPSC Catalog Contract

`catalog-upsert` accepts UNSPSC classification fields on the product record:
`unispsc_code`, `unispsc_segment`, `unispsc_family`, `unispsc_class`, and
`commodity_did`. `import-unispsc-segment` queries `G("unispsc_commodities")`
for a segment and applies `com.etzhayyim.apps.openUnispsc.syncCatalogItem` to produce
idempotent `com.etzhayyim.apps.okaimono.catalogItem` writes. Purchase flows for
`product_id = "unispsc-{code}"` call
`com.etzhayyim.apps.openUnispsc.planCatalogPurchase` before checkout hands off to
procurement and fulfillment.

Verification:

```bash
python3 60-apps/etzhayyim-project-okaimono/scripts/verify_unispsc_contracts.py --pretty
```

### Support
- `support-create-case` — Create CS case (→ `WRecord("okaimono.support-case")`)
- `support-post-message` — Post message (→ `WRecord("okaimono.support-message")`)
- `support-close-case` — Close case (→ `WUpdate`)
- `support-initiate-return` — Initiate return (→ `WRecord("okaimono.return")`)
- `support-refund` — Process refund (→ `WRecord("okaimono.refund")`, approval required)

### Webhook
- `webhook-receive` — Payment/logistics provider event (→ `WRecord("okaimono.webhook-event")`)

## KPI

| Metric | Target |
|---|---|
| CVR (purchase conversion) | >= 2.2% |
| Payment failure rate | < 1.2% |
| Stockout rate | < 2.0% |
| Return rate | < 3.0% |
| Gross margin | >= 32% |

KPI は `analytics-daily-kpi` / `analytics-funnel` コマンドで W Protocol Event Stream 経由で取得。
