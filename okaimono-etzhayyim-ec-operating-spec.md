# okaimono.etzhayyim.com D2C OEM-Only AI自動運営EC 実装仕様（MVP）

この仕様は「**自社ブランドOEM商品のD2C販売〜OEM製造〜発送〜CSをAIで閉じる**」運用を前提に、
`okaimono.etzhayyim.com`（`60-apps/etzhayyim-project-okaimono`）で実装する。

## 1) コア前提

- **D2C OEM-Only**: 自社ブランドOEM商品のみ。外部マーケットプレイス仕入・転売禁止
- **販売チャネル**: okaimono.etzhayyim.com のみ (D2C ストアフロント)
- **製造**: tsukuru.etzhayyim.com 経由 OEM 工場。全商品に `manufacturer_did` + `factory_did` 必須
- 人手操作は **エスカレーション時のみ**（異常系、規約違反、監査要件）
- すべての意思決定は W Protocol MDAG で自動監査
- **Data access**: W Protocol Event Stream のみ。Write = `WRecord()`, Read = `G()` (Cypher)
- **禁止**: DO SQLite / KV / PostgreSQL 直接 write / Amazon・Rakuten・Mercari 等の外部仕入・転売・アービトラージ

## 2) API設計（XRPC/MCP前提）

実運用では XRPC + ConnectRPC の1チャネルに寄せ、RESTは外部連携用アダプタのみに限定。

### 2.1 サービス一覧（最低実装）

```proto
syntax = "proto3";
package okaimono.v1;

service CatalogService {
  rpc GetCatalog (CatalogQuery) returns (CatalogPage);
  rpc UpsertListing (ListingUpsertRequest) returns (ListingSnapshot);
}

service InventoryService {
  rpc ReserveStock (StockReserveRequest) returns (StockReserveResult);
  rpc ConfirmReceipt (StockReceipt) returns (InventoryState);
  rpc GetReorderNeeds (ReorderWindow) returns (ReorderList);
}

service OrderService {
  rpc CreateOrder (CreateOrderRequest) returns (OrderEnvelope);
  rpc GetOrder (OrderLookupRequest) returns (OrderSnapshot);
  rpc UpdateOrderState (OrderStatePatch) returns (OrderSnapshot);
}

service FulfillmentService {
  rpc CreateShipmentPlan (ShipmentPlanRequest) returns (ShipmentPlan);
  rpc RegisterCarrierEvent (CarrierEvent) returns (CarrierEventAck);
}

service ManufacturingService {
  rpc CreateProductionOrder (ProductionOrderRequest) returns (ProductionOrderReceipt);
  rpc GetProductionStatus (ProductionStatusQuery) returns (ProductionStatusSnapshot);
  rpc ListManufacturers (ManufacturerQuery) returns (ManufacturerList);
  rpc ReorderStock (ReorderRequest) returns (ReorderReceipt);
}

service SupportService {
  rpc CreateCase (CaseCreateRequest) returns (CaseSnapshot);
  rpc PostCaseMessage (CaseMessageRequest) returns (CaseMessageAck);
  rpc CloseCase (CaseCloseRequest) returns (CaseSnapshot);
}

service FinanceService {
  rpc CreateRefund (RefundRequest) returns (RefundReceipt);
  rpc CreatePayout (PayoutRequest) returns (PayoutReceipt);
  rpc GetDailyPnl (PnlRequest) returns (PnlSnapshot);
}

service OrchestratorService {
  rpc ReceiveIntent (CustomerIntent) returns (OrderPlan);
  rpc ValidateDecision (DecisionInput) returns (DecisionResult);
}
```

### 2.2 イベント配信（W Protocol wCommit）

**NATS/Kafka は使用しない。** 全イベントは W Protocol AT Record として `wCommit` trigger で配信される。

| W Protocol Kind | AT Lexicon |
|---|---|
| `okaimono.order` (status=created) | `com.etzhayyim.apps.okaimono.order` |
| `okaimono.order` (status=paid) | `com.etzhayyim.apps.okaimono.order` |
| `okaimono.shipment` | `com.etzhayyim.apps.okaimono.shipment` |
| `okaimono.refund` | `com.etzhayyim.apps.okaimono.refund` |
| `okaimono.stock-reservation` | `com.etzhayyim.apps.okaimono.stockReservation` |
| `okaimono.production-link` | `com.etzhayyim.apps.okaimono.productionLink` |
| `okaimono.production-progress` | `com.etzhayyim.apps.okaimono.productionProgress` |
| `okaimono.quality-result` | `com.etzhayyim.apps.okaimono.qualityResult` |
| `okaimono.support-case` | `com.etzhayyim.apps.okaimono.supportCase` |
| `okaimono.promotion` | `com.etzhayyim.apps.okaimono.promotion` |

### 2.3 idempotency / SAGA

- 全 `Create/Update` 系は `request_id` を必須にする
- 決済→在庫確保/製造発注→ステータス更新は `order.saga_id` 単位で管理
- 実行境界:
  - `CreateOrder`: 3回まで再試行、重複は `idempotency_key` で抑止
  - `ReserveStock` (stock mode): 在庫確保のみ先行（未払ならTTS/TTL付きロック）
  - `CreateProductionOrder` (BTO/MTO/CTO mode): 決済確定後に OEM 工場に製造発注
  - `CreateShipmentPlan`: 決済確定 + 製造完了後にのみ実行

## 3) データモデル（W Protocol Event Stream — AT Record + yata graph）

**PostgreSQL / D1 / DO SQLite は使用しない。** 全データは W Protocol Event Stream で永続化する。

### W Protocol Record Kinds (Write path)

| Kind | AT Lexicon NSID | 用途 |
|---|---|---|
| `okaimono.catalog-item` | `com.etzhayyim.apps.okaimono.catalogItem` | OEM 商品カタログ |
| `okaimono.order` | `com.etzhayyim.apps.okaimono.order` | D2C 注文 (items embedded) |
| `okaimono.stock-reservation` | `com.etzhayyim.apps.okaimono.stockReservation` | 在庫予約/解放 |
| `okaimono.stock-movement` | `com.etzhayyim.apps.okaimono.stockMovement` | 入庫/出庫/棚卸 |
| `okaimono.shipment` | `com.etzhayyim.apps.okaimono.shipment` | 出荷計画 |
| `okaimono.carrier-event` | `com.etzhayyim.apps.okaimono.carrierEvent` | 配送追跡イベント |
| `okaimono.production-link` | `com.etzhayyim.apps.okaimono.productionLink` | 注文 ↔ OEM 製造リンク |
| `okaimono.production-progress` | `com.etzhayyim.apps.okaimono.productionProgress` | OEM 製造進捗 |
| `okaimono.quality-result` | `com.etzhayyim.apps.okaimono.qualityResult` | OEM 品質検査結果 |
| `okaimono.promotion` | `com.etzhayyim.apps.okaimono.promotion` | プロモーション/クーポン |
| `okaimono.review` | `com.etzhayyim.apps.okaimono.review` | 商品レビュー |
| `okaimono.support-case` | `com.etzhayyim.apps.okaimono.supportCase` | CS ケース |
| `okaimono.support-message` | `com.etzhayyim.apps.okaimono.supportMessage` | CS メッセージ |
| `okaimono.return` | `com.etzhayyim.apps.okaimono.return` | 返品 |
| `okaimono.refund` | `com.etzhayyim.apps.okaimono.refund` | 返金 |
| `okaimono.checkout-execution` | `com.etzhayyim.apps.okaimono.checkoutExecution` | Checkout SAGA 実行 |
| `okaimono.analytics-event` | `com.etzhayyim.apps.okaimono.analyticsEvent` | KPI イベント |

### UNSPSC classification fields

UNSPSC-backed catalog rows use the same `okaimono.catalog-item` record kind and
add these classification fields:

| Field | Meaning |
|---|---|
| `unispsc_code` | 8-digit UNSPSC commodity code |
| `unispsc_segment` | 2-digit segment |
| `unispsc_family` | 4-digit family |
| `unispsc_class` | 6-digit class |
| `commodity_did` | `did:web:unispsc.etzhayyim.com:seg{NN}:commodity:c{code}` |

`import-unispsc-segment` is a bulk import command: query
`G("unispsc_commodities").Where(Eq{"segment": segment})`, transform each row via
`com.etzhayyim.apps.openUnispsc.syncCatalogItem`, and upsert
`com.etzhayyim.apps.okaimono.catalogItem` with `product_id = unispsc-{code}`.
`catalog-search-unispsc` filters catalog rows by `unispsc_code`, segment, family,
or class. `procurement-find-offers-unispsc` resolves `product_id=unispsc-{code}`
through `com.etzhayyim.apps.openUnispsc.planCatalogPurchase` before checkout SAGA
handoff.

### Status Enums (application-level)

- **order_status**: draft → pending_payment → paid → manufacturing → packed → shipped → delivered → cancelled → refunded
- **payment_status**: pending → authorized → captured → failed → refunded
- **production_status**: pending → in_production → quality_check → passed → failed → shipped_to_warehouse
- **case_status**: new → in_progress → waiting_for_customer → awaiting_human → resolved → closed

## 4) AI エージェント設計（最小構成）

### 4.1 エージェント定義

```json
[
  {
    "name": "intent_orchestrator",
    "goal": "顧客チャネル入力を注文意図に変換し、D2C受注フローへ安全に接続する",
    "allowed_tools": ["CatalogService.GetCatalog", "OrderService.CreateOrder", "OrderService.UpdateOrderState", "SupportService.CreateCase"],
    "guardrails": [
      "価格・在庫・製造リードタイム・規約照合は必須",
      "BTO/CTO 注文はカスタマイズオプション確認必須",
      "高リスク注文は human escalation"
    ]
  },
  {
    "name": "manufacturing_agent",
    "goal": "OEM工場連携・製造進捗管理・品質検査・在庫補充発注を自動実行する",
    "allowed_tools": ["ManufacturingService.CreateProductionOrder", "ManufacturingService.GetProductionStatus", "ManufacturingService.ReorderStock", "InventoryService.ConfirmReceipt"],
    "guardrails": [
      "安全在庫を下回るSKUのみ OEM 再発注",
      "品質検査不合格品は出荷禁止・工場にフィードバック",
      "製造コスト上昇時は pricing_agent に通知"
    ]
  },
  {
    "name": "pricing_agent",
    "goal": "D2C 粗利最大化を優先しつつ在庫回転率を維持する価格設定",
    "allowed_tools": ["CatalogService.GetCatalog", "CatalogService.UpsertListing", "OrderService.GetOrder"],
    "guardrails": [
      "OEM 製造原価以下の価格は許可しない",
      "セール価格は1時間単位で上限回数制限",
      "価格改定イベントは監査ログへ必ず残す"
    ]
  },
  {
    "name": "fulfillment_agent",
    "goal": "受注完了・製造完了後の出荷を最適化し、配送遅延を最小化する",
    "allowed_tools": ["FulfillmentService.CreateShipmentPlan", "FulfillmentService.RegisterCarrierEvent", "InventoryService.ConfirmReceipt", "SupportService.CreateCase"],
    "guardrails": [
      "決済未完了・製造未完了状態では出荷計画を作成しない",
      "品質検査不合格品は出荷禁止",
      "遅延が閾値超ならエスカレーション"
    ]
  },
  {
    "name": "support_agent",
    "goal": "顧客問い合わせを一次解決し、必要時のみエスカレーションする",
    "allowed_tools": ["SupportService.CreateCase", "SupportService.PostCaseMessage", "OrderService.GetOrder", "ManufacturingService.GetProductionStatus", "FinanceService.CreateRefund"],
    "guardrails": [
      "BTO/MTO 注文の製造進捗照会対応",
      "返品条件外は人間承認を要求",
      "返金実行前に注文ステータスと決済状態を再確認"
    ]
  }
]
```

## 5) 導入順（12週間）

1. Week 1–2: OEM商品データの正規化 + Catalog/Inventory/APIコア + tsukuru連携
2. Week 3–4: OrderFlow + 決済イベントのSAGA + BTO/MTO/CTO分岐 + 監査ログ
3. Week 5–6: Fulfillment + 配送イベントハンドラ + OEM品質検査連携
4. Week 7–8: Manufacturing Agent + 自動在庫補充 + 価格設定Agent
5. Week 9–10: CS Agent、返金/交換フロー (BTO返品ポリシー含む)
6. Week 11–12: 監査KPI（製造品質率、D2C CVR、平均対応秒、粗利率）を本番監視化

## 6) メトリクス・評価基盤

### 6.1 指標設計（KGI/KPI）

| 種別 | 指標 | 定義 |
|---|---|---|
| KGI | 月次売上（GMV） | D2C 確定受注金額合計 |
| KGI | 純売上 | 返金控除後の実質売上 |
| KGI | 粗利 | 売上 - OEM製造原価 - 返品原価 - 出荷費 |
| KPI | D2C CVR | 購入確定/カート投入 |
| KPI | 受注単価（AOV） | 注文1件あたりの平均金額 |
| KPI | OEM 品質合格率 | 品質検査合格数/検査数 |
| KPI | 製造リードタイム | 発注→入庫の平均日数 |
| KPI | 欠品率 | 在庫切れ時点で失注した割合 |
| KPI | 決済失敗率 | 決済失敗/注文試行 |

### 6.2 改善サイクル（PDCA）

1. **Plan（週次）**: 低下したKPIを1本ずつ仮説化し施策化
2. **Do（実行）**: D2C ストアの商品説明・価格・製造仕様を最小変更で試験
3. **Check（検証）**: KPI差分を検定し、`decision_context`に結果と根拠を保存
4. **Act（定着）**: 成果が高い施策を本番化、悪影響施策はロールバック
