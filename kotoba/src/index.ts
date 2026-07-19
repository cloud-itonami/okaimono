/**
 * okaimono kotoba — barrel.
 *
 * D2C OEM-only EC on the etzhayyim substrate (on-chain-only per ADR-2606011400).
 * Initial slice: catalog + order + on-chain settlement (internal-purchase via
 * TitheRouter). Replaces the vendor Stripe + RisingWave path; no fiat, no RW.
 *
 * Remaining domains (inventory / fulfillment / pricing / reviews / support /
 * manufacturing per okaimono CLAUDE.md) ship in follow-up slices on the same
 * Option B pattern.
 */

export * from "./types.js";
export { splitTithe, parseMicros, TITHE_PERMILLE, type TitheSplit } from "./tithe.js";
export {
  publishCatalogItem,
  getCatalogItem,
  listCatalogItems,
} from "./catalog.js";
export { createOrder, getOrder, settleOrder, refundOrder } from "./order.js";
export {
  openSupportCase,
  updateSupportCase,
  getSupportCase,
} from "./support.js";
export {
  setStock,
  reserveStock,
  releaseStock,
  getStock,
} from "./inventory.js";
export {
  createShipment,
  updateShipmentStatus,
  getShipment,
} from "./fulfillment.js";
export { donateSettlementExecutor } from "./settlement.js";
