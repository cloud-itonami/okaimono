/**
 * okaimono kotoba — inventory tier (stock reservation).
 *
 * Stock + reservations on AT PDS records. Implements the SAGA "reserve" step
 * (validate → reserve → pay → confirm → ship). No RW; read-modify-write on the
 * stock record keyed by sku.
 *
 * Reservation identity is (orderId, sku) → rkey resv-{orderId}-{sku}. Release
 * rewrites the reservation with qty 0 (hard-delete is not in the v0.1 SDK
 * surface; a zero-qty reservation is the released tombstone).
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  STOCK_COLLECTION,
  STOCK_RESERVATION_COLLECTION,
  reservationRkey,
  stockDid,
  stockRkey,
  type GetStockInput,
  type GetStockOutput,
  type ReleaseStockInput,
  type ReleaseStockOutput,
  type ReserveStockInput,
  type ReserveStockOutput,
  type SetStockInput,
  type SetStockOutput,
  type StockRecord,
  type StockReservationRecord,
} from "./types.js";

async function readStock(e: Etzhayyim, sku: string): Promise<StockRecord | null> {
  const resp = await e
    .read<StockRecord>({ collection: STOCK_COLLECTION, rkey: stockRkey(sku) })
    .catch(() => ({ records: [] }));
  return resp.records[0]?.value ?? null;
}

async function readReservation(
  e: Etzhayyim,
  orderId: string,
  sku: string
): Promise<StockReservationRecord | null> {
  const resp = await e
    .read<StockReservationRecord>({
      collection: STOCK_RESERVATION_COLLECTION,
      rkey: reservationRkey(orderId, sku),
    })
    .catch(() => ({ records: [] }));
  return resp.records[0]?.value ?? null;
}

async function writeStock(e: Etzhayyim, stock: StockRecord): Promise<void> {
  await e.write({
    collection: STOCK_COLLECTION,
    record: stock as unknown as Record<string, unknown>,
    rkey: stockRkey(stock.sku),
  });
}

/** Set (or reset) on-hand stock for a sku. Preserves existing reservations. */
export async function setStock(
  e: Etzhayyim,
  input: SetStockInput
): Promise<SetStockOutput> {
  if (!input.sku || !Number.isInteger(input.onHand) || input.onHand < 0) {
    return { status: "rejected", error: "invalidStock" };
  }
  const existing = await readStock(e, input.sku);
  const record: StockRecord = {
    did: stockDid(input.sku),
    sku: input.sku,
    onHand: input.onHand,
    reserved: existing?.reserved ?? 0,
    updatedAt: new Date().toISOString(),
  };
  await writeStock(e, record);
  return { status: "ok", sku: input.sku };
}

/**
 * Reserve qty of a sku against an order. Idempotent on (orderId, sku): a second
 * reserve for the same pair returns alreadyReserved. Fails if sellable
 * (onHand - reserved) < qty.
 */
export async function reserveStock(
  e: Etzhayyim,
  input: ReserveStockInput
): Promise<ReserveStockOutput> {
  if (!input.orderId || !input.sku || !Number.isInteger(input.qty) || input.qty <= 0) {
    return { status: "rejected", error: "invalidReservation" };
  }
  const stock = await readStock(e, input.sku);
  if (!stock) return { status: "notFound", error: "skuNotStocked" };

  const existing = await readReservation(e, input.orderId, input.sku);
  if (existing && existing.qty > 0) {
    return { status: "alreadyReserved", sellableAfter: stock.onHand - stock.reserved };
  }

  const sellable = stock.onHand - stock.reserved;
  if (sellable < input.qty) {
    return { status: "insufficient", sellableAfter: sellable };
  }

  await writeStock(e, {
    ...stock,
    reserved: stock.reserved + input.qty,
    updatedAt: new Date().toISOString(),
  });
  const reservation: StockReservationRecord = {
    orderId: input.orderId,
    sku: input.sku,
    qty: input.qty,
    reservedAt: new Date().toISOString(),
  };
  await e.write({
    collection: STOCK_RESERVATION_COLLECTION,
    record: reservation as unknown as Record<string, unknown>,
    rkey: reservationRkey(input.orderId, input.sku),
  });

  return { status: "reserved", sellableAfter: stock.onHand - (stock.reserved + input.qty) };
}

/** Release a prior reservation (e.g. on order cancel). */
export async function releaseStock(
  e: Etzhayyim,
  input: ReleaseStockInput
): Promise<ReleaseStockOutput> {
  if (!input.orderId || !input.sku) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const stock = await readStock(e, input.sku);
  if (!stock) return { status: "notFound", error: "skuNotStocked" };

  const existing = await readReservation(e, input.orderId, input.sku);
  if (!existing || existing.qty <= 0) {
    return { status: "noReservation", sellableAfter: stock.onHand - stock.reserved };
  }

  const reservedAfter = Math.max(0, stock.reserved - existing.qty);
  await writeStock(e, {
    ...stock,
    reserved: reservedAfter,
    updatedAt: new Date().toISOString(),
  });
  // Zero-qty tombstone marks the reservation released.
  await e.write({
    collection: STOCK_RESERVATION_COLLECTION,
    record: { ...existing, qty: 0 } as unknown as Record<string, unknown>,
    rkey: reservationRkey(input.orderId, input.sku),
  });

  return { status: "released", sellableAfter: stock.onHand - reservedAfter };
}

/** Read current stock for a sku, including computed sellable. */
export async function getStock(
  e: Etzhayyim,
  input: GetStockInput
): Promise<GetStockOutput> {
  if (!input.sku) return { error: "invalidSku" };
  const resp = await e
    .read<StockRecord>({ collection: STOCK_COLLECTION, rkey: stockRkey(input.sku) })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return {
    stock: {
      ...r.value,
      stockUri: r.uri,
      sellable: r.value.onHand - r.value.reserved,
    },
  };
}
