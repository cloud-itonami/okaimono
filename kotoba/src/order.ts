/**
 * okaimono kotoba — order + on-chain settlement tier.
 *
 * createOrder writes an order record (status pending_payment) to AT PDS.
 * settleOrder performs on-chain USDC settlement via an injected
 * SettlementExecutor (real deployments wrap `@etzhayyim/sdk/donate`
 * `donate({ to, amountUsdc, purpose: "internal-purchase" })`, which routes
 * through TitheRouter.sol for the 10% Public-Fund auto-split), then writes a
 * payment record and flips the order to paid.
 *
 * No Stripe, no RisingWave. The only value-transfer seam is the injected
 * SettlementExecutor (ADR-2605172100: app code never calls viem/USDC directly).
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  ORDER_COLLECTION,
  PAYMENT_COLLECTION,
  orderDid,
  orderRkey,
  paymentRkey,
  refundRkey,
  type CreateOrderInput,
  type CreateOrderOutput,
  type GetOrderInput,
  type GetOrderOutput,
  type OrderLine,
  type OrderRecord,
  type PaymentRecord,
  type RefundOrderInput,
  type RefundOrderOutput,
  type SettlementExecutor,
  type SettleOrderInput,
  type SettleOrderOutput,
} from "./types.js";
import { parseMicros, splitTithe } from "./tithe.js";

/** Sum qty × unitPriceMicros across lines (bigint, micros). */
function orderTotalMicros(lines: OrderLine[]): bigint {
  return lines.reduce(
    (acc, l) => acc + parseMicros(l.unitPriceMicros) * BigInt(l.qty),
    0n
  );
}

/**
 * Create an order (idempotent on orderId, rkey = order-{orderId}). Computes the
 * total from the line snapshots and records status pending_payment.
 */
export async function createOrder(
  e: Etzhayyim,
  input: CreateOrderInput
): Promise<CreateOrderOutput> {
  if (!input.orderId || !input.buyerDid) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!input.lines || input.lines.length === 0) {
    return { status: "rejected", error: "emptyOrder" };
  }
  let totalMicros: bigint;
  try {
    for (const l of input.lines) {
      if (!l.sku || !Number.isInteger(l.qty) || l.qty <= 0) {
        return { status: "rejected", error: "invalidOrderLine" };
      }
      parseMicros(l.unitPriceMicros);
    }
    totalMicros = orderTotalMicros(input.lines);
  } catch {
    return { status: "rejected", error: "invalidUnitPrice" };
  }

  const rkey = orderRkey(input.orderId);
  const existing = await e
    .read<OrderRecord>({ collection: ORDER_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      orderUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      orderId: existing.records[0].value.orderId,
      totalMicros: existing.records[0].value.totalMicros,
    };
  }

  const did = orderDid(input.orderId);
  const record: OrderRecord = {
    did,
    orderId: input.orderId,
    buyerDid: input.buyerDid,
    lines: input.lines.map((l) => ({
      sku: l.sku,
      qty: l.qty,
      unitPriceMicros: l.unitPriceMicros,
    })),
    totalMicros: totalMicros.toString(),
    status: "pending_payment",
    createdAt: new Date().toISOString(),
  };

  const receipt = await e.write({
    collection: ORDER_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });

  return {
    status: "created",
    orderUri: receipt.uri,
    did,
    orderId: input.orderId,
    totalMicros: record.totalMicros,
  };
}

/** Look up an order by orderId. */
export async function getOrder(
  e: Etzhayyim,
  input: GetOrderInput
): Promise<GetOrderOutput> {
  if (!input.orderId) return { error: "invalidOrderId" };
  const resp = await e
    .read<OrderRecord>({
      collection: ORDER_COLLECTION,
      rkey: orderRkey(input.orderId),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { order: { ...r.value, orderUri: r.uri } };
}

/**
 * Settle an order on-chain. Validates the order is pending_payment, executes the
 * USDC transfer through the injected SettlementExecutor with purpose
 * `internal-purchase` (SBT↔SBT carve-out; TitheRouter applies the 10% split),
 * writes a payment record carrying the gross/tithe/net breakdown, and flips the
 * order to paid.
 *
 * @param settle injected on-chain executor. Real: wrap @etzhayyim/sdk/donate.
 */
export async function settleOrder(
  e: Etzhayyim,
  settle: SettlementExecutor,
  input: SettleOrderInput
): Promise<SettleOrderOutput> {
  if (!input.orderId || !input.to) {
    return { status: "rejected", error: "missingRequiredFields" };
  }

  const resp = await e
    .read<OrderRecord>({
      collection: ORDER_COLLECTION,
      rkey: orderRkey(input.orderId),
    })
    .catch(() => ({ records: [] }));
  const orderRec = resp.records[0];
  if (!orderRec?.value) return { status: "notFound", error: "orderNotFound" };
  const order = orderRec.value;
  if (order.status !== "pending_payment") {
    return order.status === "paid"
      ? { status: "alreadyPaid", error: "orderAlreadyPaid" }
      : { status: "rejected", error: `orderNotPayable:${order.status}` };
  }

  const split = splitTithe(parseMicros(order.totalMicros));

  // Sole value-transfer seam. internal-purchase → TitheRouter 10% auto-split.
  const { txHash } = await settle({
    to: input.to,
    amountMicros: split.gross,
    purpose: "internal-purchase",
    memo: input.memo,
    forUri: orderRec.uri,
  });

  const payment: PaymentRecord = {
    orderId: order.orderId,
    buyerDid: order.buyerDid,
    purpose: "internal-purchase",
    grossMicros: split.gross.toString(),
    titheMicros: split.tithe.toString(),
    netMicros: split.net.toString(),
    txHash,
    settledAt: new Date().toISOString(),
  };
  const payReceipt = await e.write({
    collection: PAYMENT_COLLECTION,
    record: payment as unknown as Record<string, unknown>,
    rkey: paymentRkey(order.orderId),
  });

  // Flip order → paid (same rkey overwrite; idempotent record identity).
  const paidOrder: OrderRecord = { ...order, status: "paid" };
  await e.write({
    collection: ORDER_COLLECTION,
    record: paidOrder as unknown as Record<string, unknown>,
    rkey: orderRkey(order.orderId),
  });

  return {
    status: "settled",
    paymentUri: payReceipt.uri,
    txHash,
    titheMicros: payment.titheMicros,
    netMicros: payment.netMicros,
  };
}

/**
 * Refund a paid order on-chain (full refund of the gross to the buyer) via the
 * `escrow-refund` purpose. Validates the order is paid, executes the reverse
 * USDC transfer through the injected SettlementExecutor, writes a refund payment
 * record, and flips the order to refunded. Idempotent: a second refund of an
 * already-refunded order returns alreadyRefunded.
 */
export async function refundOrder(
  e: Etzhayyim,
  settle: SettlementExecutor,
  input: RefundOrderInput
): Promise<RefundOrderOutput> {
  if (!input.orderId || !input.to) {
    return { status: "rejected", error: "missingRequiredFields" };
  }

  const resp = await e
    .read<OrderRecord>({
      collection: ORDER_COLLECTION,
      rkey: orderRkey(input.orderId),
    })
    .catch(() => ({ records: [] }));
  const orderRec = resp.records[0];
  if (!orderRec?.value) return { status: "notFound", error: "orderNotFound" };
  const order = orderRec.value;
  if (order.status === "refunded") {
    return { status: "alreadyRefunded", error: "orderAlreadyRefunded" };
  }
  if (order.status !== "paid") {
    return { status: "notRefundable", error: `orderNotPaid:${order.status}` };
  }

  const gross = parseMicros(order.totalMicros);

  // Reverse transfer back to the buyer. escrow-refund is a non-titheable purpose.
  const { txHash } = await settle({
    to: input.to,
    amountMicros: gross,
    purpose: "escrow-refund",
    memo: input.reason,
    forUri: orderRec.uri,
  });

  const refund: PaymentRecord = {
    orderId: order.orderId,
    buyerDid: order.buyerDid,
    purpose: "escrow-refund",
    grossMicros: gross.toString(),
    titheMicros: "0",
    netMicros: gross.toString(),
    txHash,
    settledAt: new Date().toISOString(),
  };
  const refundReceipt = await e.write({
    collection: PAYMENT_COLLECTION,
    record: refund as unknown as Record<string, unknown>,
    rkey: refundRkey(order.orderId),
  });

  const refundedOrder: OrderRecord = { ...order, status: "refunded" };
  await e.write({
    collection: ORDER_COLLECTION,
    record: refundedOrder as unknown as Record<string, unknown>,
    rkey: orderRkey(order.orderId),
  });

  return {
    status: "refunded",
    refundUri: refundReceipt.uri,
    txHash,
    amountMicros: gross.toString(),
  };
}
