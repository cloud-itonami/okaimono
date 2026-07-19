# okaimono Purchase Assist — Components Design

## Goal

- 商品情報の参照元を追跡可能にする
- cart 追加後、対象ECサイトへの入力を AI agents が支援する
- 商品レビューと運営元(merchant)信頼性を継続評価する

## Components

### 1) `okaimono-shopping-mcp-component` (ok4imn1o)

- 役割: Marketplace 本体 — 10 domain capability
- Data access: W Protocol Event Stream のみ
  - Write: `WRecord("okaimono.{kind}", payload)` → PDS → yata Cypher direct (SHA-256 content CID)
  - Read: `G("Label")` (Cypher)

### 2) `okaimono-checkout-agent-component` (chk8uty2)

- 役割: Checkout SAGA orchestrator
- 実行モデル: 6-step SAGA (validate → inventory → reserve → pay → confirm → ship)
- cross-actor: `Invoke("", tool, args)` で marketplace 呼び出し
- 安全制御:
  - 補償トランザクション (stock release on payment failure)
  - `RequireApproval` で refund は承認必須
  - 監査ログは W Protocol MDAG で自動記録

## Runtime Flow

1. `catalog-upsert` で商品登録 (→ `WRecord("okaimono.catalog-item")`)
2. `review-submit` でレビュー収集 (→ `WRecord("okaimono.review")`)
3. `order-create` で注文作成 (→ `WRecord("okaimono.order")`)
4. checkout-agent が SAGA 実行 (validate → reserve → pay → confirm → ship)
5. 結果は `WRecord("okaimono.checkout-execution")` で永続化
6. analytics コマンドで KPI 追跡 (`G()` 経由)

## Trust Scoring

- 入力シグナル:
  - レビュー評価 (`review_score`) — `G("Review").Match(Eq{...}).Query()`
  - 返金率 (`refund_score`) — `G("Refunds").Match(Eq{...}).Return("*").Query()`
  - 配送イベント品質 (`delivery_score`) — `G("CarrierEvents").Match(Eq{...}).Return("*").Query()`
- 出力: `score` (0..100), `level` (high/medium/low), `rationale`
