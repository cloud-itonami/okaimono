/**
 * okaimono kotoba — record types.
 *
 * D2C OEM-only EC on the etzhayyim substrate. Replaces the vendor's
 * Stripe + RisingWave path with AT PDS / kotoba datomic records and on-chain
 * USDC settlement (per ADR-2606011400 on-chain-only + okaimono MIGRATION-TODO).
 *
 * Constitutional invariants (root CLAUDE.md § Substrate boundary):
 *   - State    : AT PDS records (materialize kotoba datom log). No RW / Kysely.
 *   - Payment  : USDC on Base L2 + ERC-4337 + TitheRouter. No Stripe / fiat.
 *   - Purpose  : internal-purchase (SBT↔SBT carve-out) for D2C sales.
 *   - Amounts  : USDC base units (6-decimal micros) as decimal STRINGS — AT
 *                Lexicon has no float type and bigint is not JSON-serializable.
 *
 * Identity hierarchy:
 *   did:web:okaimono.etzhayyim.com                       — controller
 *   did:web:okaimono.etzhayyim.com:item:{sku}            — catalog item
 *   did:web:okaimono.etzhayyim.com:order:{orderId}       — order
 */

export const OKAIMONO_DID_PREFIX = "did:web:okaimono.etzhayyim.com:" as const;

export const CATALOG_ITEM_COLLECTION = "com.etzhayyim.apps.okaimono.catalogItem";
export const ORDER_COLLECTION = "com.etzhayyim.apps.okaimono.order";
export const PAYMENT_COLLECTION = "com.etzhayyim.apps.okaimono.payment";
export const STOCK_COLLECTION = "com.etzhayyim.apps.okaimono.stock";
export const STOCK_RESERVATION_COLLECTION =
  "com.etzhayyim.apps.okaimono.stockReservation";
export const SHIPMENT_COLLECTION = "com.etzhayyim.apps.okaimono.shipment";
export const SUPPORT_CASE_COLLECTION = "com.etzhayyim.apps.okaimono.supportCase";

/** D2C OEM-only production modes (no external resale; tsukuru manufacturing). */
export type ProductionMode = "OEM" | "BTO" | "MTO" | "CTO";

/**
 * Allowed on-chain settlement purposes for okaimono. A D2C sale between the
 * store and an Adherent (SBT holder) is an `internal-purchase` (SBT↔SBT
 * carve-out, root CLAUDE.md § Payment purpose). External `purchase`/`tip`/
 * `subscription` are constitutionally prohibited. Refunds use `escrow-refund`.
 */
export type OkaimonoPaymentPurpose = "internal-purchase" | "escrow-refund";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

// ─── Catalog tier ───────────────────────────────────────────────────

export interface CatalogItemRecord {
  did: string;
  sku: string;
  title: string;
  descriptionShort?: string;
  /** USDC base units (micros) as a decimal string, e.g. "12000000" = 12 USDC. */
  priceMicros: string;
  /** D2C OEM-only: both DIDs are REQUIRED (no external resale). */
  manufacturerDid: string;
  factoryDid: string;
  productionMode: ProductionMode;
  category?: string;
  active: boolean;
  createdAt: string;
}

export interface CatalogItemView extends CatalogItemRecord {
  itemUri: string;
}

export interface PublishCatalogItemInput {
  sku: string;
  title: string;
  descriptionShort?: string;
  priceMicros: string;
  manufacturerDid: string;
  factoryDid: string;
  productionMode: ProductionMode;
  category?: string;
  active?: boolean;
}

export interface PublishCatalogItemOutput {
  status: "published" | "alreadyExists" | "rejected";
  itemUri?: string;
  did?: string;
  sku?: string;
  error?: string;
}

export interface GetCatalogItemInput {
  sku: string;
}

export interface GetCatalogItemOutput {
  item?: CatalogItemView;
  error?: string;
}

export interface ListCatalogItemsInput {
  productionMode?: ProductionMode;
  category?: string;
  activeOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ListCatalogItemsOutput {
  items: CatalogItemView[];
  cursor?: string;
  total: number;
}

// ─── Order tier ─────────────────────────────────────────────────────

export interface OrderLine {
  sku: string;
  qty: number;
  /** Unit price snapshot at order time, USDC micros as string. */
  unitPriceMicros: string;
}

export interface OrderRecord {
  did: string;
  orderId: string;
  buyerDid: string;
  lines: OrderLine[];
  /** Sum of qty × unitPriceMicros across lines, USDC micros as string. */
  totalMicros: string;
  status: OrderStatus;
  createdAt: string;
}

export interface OrderView extends OrderRecord {
  orderUri: string;
}

export interface OrderLineInput {
  sku: string;
  qty: number;
  unitPriceMicros: string;
}

export interface CreateOrderInput {
  orderId: string;
  buyerDid: string;
  lines: OrderLineInput[];
}

export interface CreateOrderOutput {
  status: "created" | "alreadyExists" | "rejected";
  orderUri?: string;
  did?: string;
  orderId?: string;
  totalMicros?: string;
  error?: string;
}

export interface GetOrderInput {
  orderId: string;
}

export interface GetOrderOutput {
  order?: OrderView;
  error?: string;
}

// ─── Settlement tier (on-chain) ─────────────────────────────────────

export interface PaymentRecord {
  orderId: string;
  buyerDid: string;
  purpose: OkaimonoPaymentPurpose;
  /** Gross amount the buyer pays, USDC micros as string. */
  grossMicros: string;
  /** 10% tithe to the Public Fund (constitutional), USDC micros as string. */
  titheMicros: string;
  /** Net to the store after tithe, USDC micros as string. */
  netMicros: string;
  /** Base L2 tx hash from the on-chain settlement. */
  txHash?: string;
  settledAt: string;
}

export interface PaymentReceiptView extends PaymentRecord {
  paymentUri: string;
}

/**
 * Injected on-chain settlement executor. Real deployments wrap
 * `@etzhayyim/sdk/donate` `donate({ to, amountUsdc, purpose })`; tests inject a
 * fake. This is the ONLY seam where value transfer happens — app code never
 * calls viem/USDC directly (ADR-2605172100).
 */
export interface SettlementExecutor {
  (opts: {
    to: string;
    amountMicros: bigint;
    purpose: OkaimonoPaymentPurpose;
    memo?: string;
    forUri?: string;
  }): Promise<{ txHash: string }>;
}

export interface SettleOrderInput {
  orderId: string;
  /** Store recipient address (Base L2). */
  to: string;
  memo?: string;
}

export interface SettleOrderOutput {
  status: "settled" | "rejected" | "notFound" | "alreadyPaid";
  paymentUri?: string;
  txHash?: string;
  titheMicros?: string;
  netMicros?: string;
  error?: string;
}

// ─── DID / rkey helpers ─────────────────────────────────────────────

export function catalogItemDid(sku: string): string {
  return `${OKAIMONO_DID_PREFIX}item:${sku.toLowerCase()}`;
}

export function catalogItemRkey(sku: string): string {
  return `item-${sku.toLowerCase()}`;
}

export function orderDid(orderId: string): string {
  return `${OKAIMONO_DID_PREFIX}order:${orderId.toLowerCase()}`;
}

export function orderRkey(orderId: string): string {
  return `order-${orderId.toLowerCase()}`;
}

export function paymentRkey(orderId: string): string {
  return `payment-${orderId.toLowerCase()}`;
}

// ─── Inventory tier ─────────────────────────────────────────────────

export interface StockRecord {
  did: string;
  sku: string;
  /** Physical units on hand. */
  onHand: number;
  /** Units reserved against open orders (onHand - reserved = sellable). */
  reserved: number;
  updatedAt: string;
}

export interface StockView extends StockRecord {
  stockUri: string;
  sellable: number;
}

export interface StockReservationRecord {
  orderId: string;
  sku: string;
  qty: number;
  reservedAt: string;
}

export interface SetStockInput {
  sku: string;
  onHand: number;
}

export interface SetStockOutput {
  status: "ok" | "rejected";
  stockUri?: string;
  sku?: string;
  error?: string;
}

export interface ReserveStockInput {
  orderId: string;
  sku: string;
  qty: number;
}

export interface ReserveStockOutput {
  status: "reserved" | "alreadyReserved" | "insufficient" | "notFound" | "rejected";
  sellableAfter?: number;
  error?: string;
}

export interface ReleaseStockInput {
  orderId: string;
  sku: string;
}

export interface ReleaseStockOutput {
  status: "released" | "noReservation" | "notFound" | "rejected";
  sellableAfter?: number;
  error?: string;
}

export interface GetStockInput {
  sku: string;
}

export interface GetStockOutput {
  stock?: StockView;
  error?: string;
}

export function stockRkey(sku: string): string {
  return `stock-${sku.toLowerCase()}`;
}

export function stockDid(sku: string): string {
  return `${OKAIMONO_DID_PREFIX}stock:${sku.toLowerCase()}`;
}

export function reservationRkey(orderId: string, sku: string): string {
  return `resv-${orderId.toLowerCase()}-${sku.toLowerCase()}`;
}

// ─── Fulfillment tier ───────────────────────────────────────────────

export type ShipmentStatus =
  | "created"
  | "ready"
  | "picked"
  | "in_transit"
  | "delivered"
  | "exception";

export interface ShipmentRecord {
  did: string;
  shipmentId: string;
  orderId: string;
  carrier?: string;
  serviceType?: string;
  trackingId?: string;
  status: ShipmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentView extends ShipmentRecord {
  shipmentUri: string;
}

export interface CreateShipmentInput {
  shipmentId: string;
  orderId: string;
  carrier?: string;
  serviceType?: string;
  trackingId?: string;
}

export interface CreateShipmentOutput {
  status: "created" | "alreadyExists" | "rejected";
  shipmentUri?: string;
  did?: string;
  shipmentId?: string;
  error?: string;
}

export interface UpdateShipmentStatusInput {
  shipmentId: string;
  status: ShipmentStatus;
  trackingId?: string;
}

export interface UpdateShipmentStatusOutput {
  status: "updated" | "notFound" | "rejected";
  shipmentId?: string;
  newStatus?: ShipmentStatus;
  error?: string;
}

export interface GetShipmentInput {
  shipmentId: string;
}

export interface GetShipmentOutput {
  shipment?: ShipmentView;
  error?: string;
}

export function shipmentRkey(shipmentId: string): string {
  return `shipment-${shipmentId.toLowerCase()}`;
}

export function shipmentDid(shipmentId: string): string {
  return `${OKAIMONO_DID_PREFIX}shipment:${shipmentId.toLowerCase()}`;
}

// ─── Support tier (CS cases + returns) ──────────────────────────────

export type CaseStatus =
  | "new"
  | "in_progress"
  | "waiting_for_customer"
  | "awaiting_human"
  | "resolved"
  | "closed";

export type CasePriority = "low" | "medium" | "high" | "critical";

export interface SupportCaseRecord {
  did: string;
  caseId: string;
  buyerDid: string;
  orderId?: string;
  subject: string;
  channel?: string;
  status: CaseStatus;
  priority: CasePriority;
  escalatedToHuman: boolean;
  rootCause?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportCaseView extends SupportCaseRecord {
  caseUri: string;
}

export interface OpenSupportCaseInput {
  caseId: string;
  buyerDid: string;
  subject: string;
  orderId?: string;
  channel?: string;
  priority?: CasePriority;
}

export interface OpenSupportCaseOutput {
  status: "opened" | "alreadyExists" | "rejected";
  caseUri?: string;
  did?: string;
  caseId?: string;
  error?: string;
}

export interface UpdateSupportCaseInput {
  caseId: string;
  status?: CaseStatus;
  priority?: CasePriority;
  escalatedToHuman?: boolean;
  rootCause?: string;
}

export interface UpdateSupportCaseOutput {
  status: "updated" | "notFound" | "rejected";
  caseId?: string;
  newStatus?: CaseStatus;
  error?: string;
}

export interface GetSupportCaseInput {
  caseId: string;
}

export interface GetSupportCaseOutput {
  case?: SupportCaseView;
  error?: string;
}

export function supportCaseRkey(caseId: string): string {
  return `case-${caseId.toLowerCase()}`;
}

export function supportCaseDid(caseId: string): string {
  return `${OKAIMONO_DID_PREFIX}case:${caseId.toLowerCase()}`;
}

// ─── Refund (escrow-refund settlement) ──────────────────────────────

export interface RefundOrderInput {
  orderId: string;
  /** Buyer address to refund to (Base L2). */
  to: string;
  reason?: string;
}

export interface RefundOrderOutput {
  status: "refunded" | "notFound" | "notRefundable" | "alreadyRefunded" | "rejected";
  refundUri?: string;
  txHash?: string;
  amountMicros?: string;
  error?: string;
}

export function refundRkey(orderId: string): string {
  return `refund-${orderId.toLowerCase()}`;
}
