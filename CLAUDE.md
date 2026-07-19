# okaimono.etzhayyim.com — D2C OEM-Only AI-operated EC Platform

## Architecture

D2C (Direct-to-Consumer) OEM 専用 EC。自社ブランド OEM 商品のみを tsukuru.etzhayyim.com 経由で製造・販売。外部マーケットプレイス仕入・転売 (せどり/アービトラージ) 禁止。全運営（カタログ管理・注文・在庫・出荷・価格最適化・レビュー・レコメンド・CS・分析・製造管理）を AI Agent が自律実行。

## D2C OEM-Only Policy (CRITICAL)

- **販売チャネル**: okaimono.etzhayyim.com のみ (自社ストアフロント D2C)
- **商品**: OEM/BTO/MTO/CTO 製造品のみ。外部仕入・転売禁止
- **製造**: tsukuru.etzhayyim.com 経由 OEM 工場。全商品に `manufacturer_did` + `factory_did` 必須
- **禁止**: Amazon/Rakuten/Mercari 等の外部マーケットプレイス出品・仕入・価格監視・クロスボーダーアービトラージ

## Components

| Component | nanoid | 役割 |
|---|---|---|
| `okaimono-shopping-mcp-component` | `ok4imn1o` | **D2C Store 本体** — 9 domain (catalog/orders/inventory/pricing/reviews/recommendations/analytics/fulfillment/support) + manufacturing |
| `okaimono-checkout-agent-component` | `chk8uty2` | **Checkout orchestrator** — SAGA pattern (validate → reserve/production → pay → confirm → ship) |

## Domain Contracts

**権威ソース**:

- `60-apps/etzhayyim-project-okaimono/proto/v1/shopping.proto`
- `60-apps/etzhayyim-project-okaimono/appview/okaimono-shopping-mcp-component/kotodama.jsonld`

AT Lexicon namespace: `com.etzhayyim.apps.okaimono.*`

| Domain | Lexicon prefix | 主要 record kinds |
|---|---|---|
| `catalog` | `com.etzhayyim.apps.okaimono.catalogItem` | OEM product listing |
| `orders` | `com.etzhayyim.apps.okaimono.order` | order lifecycle |
| `inventory` | `com.etzhayyim.apps.okaimono.stock*` | reservation, movement |
| `fulfillment` | `com.etzhayyim.apps.okaimono.shipment` | shipment, carrier event |
| `manufacturing` | `com.etzhayyim.apps.okaimono.productionLink` | OEM/BTO/MTO/CTO production |
| `pricing` | `com.etzhayyim.apps.okaimono.promotion` | promotions, coupons |
| `reviews` | `com.etzhayyim.apps.okaimono.review` | product reviews |
| `recommendations` | — (read-only, graph query) | collaborative filtering |
| `support` | `com.etzhayyim.apps.okaimono.supportCase` | CS cases, returns, refunds |
| `analytics` | `com.etzhayyim.apps.okaimono.analyticsEvent` | KPI events |

## Data Access (W Protocol Event Stream)

- **Write**: `WRecord("okaimono.{kind}", payload)` → PDS → yata SQL direct (SHA-256 content CID)
- **Read (SQL)**: `G("Label").Match(Eq{...}).Return("prop").Query()` (SQL)
- **DO SQLite / KV 直接 write 禁止**

## Contract

`contract-category: service-agreement` (D2C EC プラットフォーム利用規約)

## AI Agent Roles (5 autonomous agents)

| Agent | 責務 |
|---|---|
| **Intent Orchestrator** | 顧客入力 → 注文意図正規化 → CreateOrder |
| **Manufacturing Agent** | OEM 工場連携・製造進捗管理・品質検査 |
| **Pricing Agent** | 粗利最大化・在庫回転率維持・D2C 価格設定 |
| **Fulfillment Agent** | 出荷最適化・配送遅延最小化 |
| **Support Agent** | 一次解決・FAQ/RAG・エスカレーション判定 |

## UNSPSC Integration (~70K Commodity Items)

UNSPSC 51 segment APP を Follow → `com.etzhayyim.apps.unispsc.commodity` commit を reactive に受信 → OEM 商品分類として使用。

| Command | 用途 |
|---|---|
| `catalog-search-unispsc` | UNSPSC code/segment/family/class で catalog 検索 |
| `import-unispsc-segment` | `com.etzhayyim.apps.openUnispsc.importSegmentCatalog` の plan に従い、UNSPSC segment を bulk import |
| `procurement-find-offers-unispsc` | `product_id=unispsc-{code}` を `com.etzhayyim.apps.openUnispsc.planCatalogPurchase` で item spec invocation に変換 |

Catalog record fields for UNSPSC-backed items:

- `unispsc_code`, `unispsc_segment`, `unispsc_family`, `unispsc_class`
- `commodity_did = did:web:unispsc.etzhayyim.com:seg{NN}:commodity:c{8-digit}`
- `product_id = unispsc-{8-digit}` and `sku = UNSPSC-{8-digit}` for imported commodity catalog rows
- `com.etzhayyim.apps.openUnispsc.syncCatalogItem` transforms upstream commodity records into `com.etzhayyim.apps.okaimono.catalogItem`

Verification gate:

```bash
python3 60-apps/etzhayyim-project-okaimono/scripts/verify_unispsc_contracts.py --pretty
```

The verifier checks proto fields/RPCs, component manifest capabilities/subscriptions,
and docs for the UNSPSC import/search/purchase contract surface.

## OEM Manufacturing Integration (tsukuru.etzhayyim.com) — CORE

**全商品が OEM 製造品。** catalog item に `fulfillment_mode` を設定。

| Mode | 説明 |
|---|---|
| `stock` | OEM 製造済み在庫販売 (default) |
| `bto` | Build-to-Order — 注文後 OEM 製造 |
| `mto` | Made-to-Order — カスタム仕様 OEM |
| `cto` | Configure-to-Order — オプション選択 OEM |

**Commands**: `catalog_upsert` (OEM product), `order_create`, `bto-production-status`, `bto-list-manufacturers`, `bto-estimate`

**Record kinds**: `okaimono_production_link`, `okaimono_production_progress`, `okaimono_quality_result`

**Flow**: OEM product listing → customer order → checkout SAGA → Invoke(tsukr8u0, "create-production-order") → factory progress → QC → ship → D2C delivery

**tsukuru contract**: production-order, production-progress, quality-inspection

**Convo**: `yoro.etzhayyim.com/convo` で tsukuru agent と DM しながら OEM 注文 → 製造管理 → 出荷追跡が可能 (Murakumo LLM + MCP tool calling)

## OEM Manufacturing Site Governance (CRITICAL)

**各国で適切な OEM 製造拠点を tsukuru.etzhayyim.com の manufacturer-registry + factory-registry で管理。** Governance は verification tier + trade compliance + quality inspection の 3 軸で enforcement。

### 製造拠点選定フロー

1. **商品企画**: UNSPSC/CPC 分類 → tsukuru process-registry で適切な製造プロセス特定
2. **SP 登録 (hc.etzhayyim.com)**: 新規製造者は `Invoke(hc0mp7ng, "create_sp_application", {...})` で HC 登録パイプラインに投入
   → KYC/KYB 検証タスク → 工場監査タスク → tsukuru 正式登録
3. **拠点探索**: `Invoke(tsukr8u0, "search-manufacturers", {category, country, certifications})` → HC 検証済み候補一覧
4. **Governance 検証**: verification tier (BASIC→VERIFIED→GOLD→DIAMOND) + 認証 (ISO-9001 等) + sanctions screening (yabai.etzhayyim.com)
5. **Trade Compliance**: HS 分類 + 関税率 + 輸出規制 + 原産地規則 (tsukuru trade-compliance API)
6. **QC タスク生成**: 出荷前品質検査は `Invoke(hc0mp7ng, "create_inspection_task", {...})` で HC worker にアサイン
7. **Contract 締結**: OEM 製造契約 → manufacturer_did + factory_did を catalog item に紐付け

### Governance 3 軸

| 軸 | tsukuru contract | okaimono enforcement |
|---|---|---|
| **Verification Tier** | `etzhayyim:tsukuru-manufacturer-registry/verification@1.0.0` | catalog_upsert 時に manufacturer の tier ≥ `min_tier` を検証。BASIC は試作のみ、VERIFIED 以上で本番販売 |
| **Trade Compliance** | `etzhayyim:tsukuru-trade-compliance@1.0.0` | 注文確定前に HS 分類 + 輸出規制 + 関税率を自動チェック。restricted/prohibited 品は reject |
| **Quality Inspection** | `etzhayyim:tsukuru-production-order/quality-inspection@1.0.0` | 出荷前 QC 必須 (inline/final/third-party)。defect_rate_ppm > 閾値で出荷ブロック |

### 各国製造拠点ポリシー

| 地域 | 主要国 | 強い製造分野 | 必須認証 | tsukuru 対応 |
|---|---|---|---|---|
| 東アジア | JPN | 精密機器・自動車・電子部品 | ISO-9001, IATF-16949 | 460+ manufacturer DIDs |
| 東アジア | CHN | 汎用製造・電子組立・繊維 | ISO-9001, CCC, RoHS | Alibaba 1688 工場 DID 連携 |
| 東アジア | KOR | 半導体・バッテリー・ディスプレイ | ISO-9001, KETI | Hyundai/SK/LG 等 registered |
| 東アジア | TWN | 半導体・PCB・光学 | ISO-9001, UL | TSMC/MediaTek/ASUS 等 registered |
| 東南アジア | VNM | 繊維・靴・電子組立 | ISO-9001, BSCI | VinFast 等 registered |
| 東南アジア | THA | 食品・自動車部品・HDD | ISO-9001, HACCP, Thai FDA | CP Foods 等 registered |
| 東南アジア | IDN | 食品・パームオイル・繊維 | ISO-22000, HALAL | Indofood 等 registered |
| 東南アジア | MYS | 半導体後工程・ゴム・パームオイル | ISO-9001, SIRIM | Intel Penang 等 registered |
| 南アジア | IND | 医薬品・鉄鋼・自動車 | ISO-9001, FDA/GMP, BIS | Tata/Sun Pharma 等 registered |
| 欧州 | DEU | 自動車・化学・精密機械 | ISO-9001, CE, REACH | tsukuru 拡張予定 |
| 欧州 | ITA | ファッション・食品・機械 | CE, ISO-22000 | tsukuru 拡張予定 |
| 北米 | USA | 半導体・航空宇宙・医療機器 | FDA, UL, AS-9100 | tsukuru 拡張予定 |

### Cross-Project Dependencies (Governance)

| 連携先 | 用途 |
|---|---|
| `hc.etzhayyim.com` | **SP 登録パイプライン** — KYC/KYB 検証 → 工場監査 → QC 検査 (HC タスク) |
| `tsukuru.etzhayyim.com` | OEM manufacturer/factory registry, production order, QC, trade compliance |
| `yabai.etzhayyim.com` | 制裁スクリーニング (OFAC/EU/UN) — manufacturer 登録時 + 注文時 |
| `trust.etzhayyim.com` | manufacturer DID trust score — 拠点選定の信頼性指標 |
| `completer.etzhayyim.com` | 規制コンプライアンス評価 — 各国製造規制の遵守チェック |
| `treaty.etzhayyim.com` | FTA/EPA 解決 — 関税優遇の自動適用 |
| `supply_chain.etzhayyim.com` | サプライチェーンリスク評価 — upstream vendor assessment |
| `maps.etzhayyim.com` | 工場 geolocation — `:LOCATED_IN` relation で地理的リスク分析 |

## Checkout SAGA (chk8uty2)

**Stock (OEM 製造済み在庫)**: `validate-cart → check-inventory → reserve-stock → process-payment → confirm-order → create-shipment`

**BTO/MTO/CTO (OEM 受注製造)**: `validate-cart → check-product-spec → process-payment → create-production-order → confirm-order → await-manufacturing`

失敗時は補償トランザクション（stock: release, BTO: refund + cancel production）。
