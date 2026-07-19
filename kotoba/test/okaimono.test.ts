import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  publishCatalogItem,
  getCatalogItem,
  listCatalogItems,
  createOrder,
  getOrder,
  settleOrder,
  refundOrder,
  openSupportCase,
  updateSupportCase,
  getSupportCase,
  splitTithe,
  parseMicros,
  setStock,
  reserveStock,
  releaseStock,
  getStock,
  createShipment,
  updateShipmentStatus,
  getShipment,
  type SettlementExecutor,
} from "../src/index.js";

const MANUF = "did:web:tsukuru.etzhayyim.com:manufacturer:acme";
const FACTORY = "did:web:tsukuru.etzhayyim.com:factory:osaka-1";

// Fake on-chain executor for tests (real deployments wrap @etzhayyim/sdk/donate).
const fakeSettle: SettlementExecutor = async () => ({ txHash: "0xdeadbeef" });

describe("okaimono kotoba", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:okaimono.etzhayyim.com" });
  });

  describe("tithe math (constitutional 10%)", () => {
    it("splits 10% with tithe + net === gross", () => {
      const s = splitTithe(parseMicros("12000000")); // 12 USDC
      expect(s.tithe).toBe(1_200_000n);
      expect(s.net).toBe(10_800_000n);
      expect(s.tithe + s.net).toBe(s.gross);
    });
    it("floors tithe and keeps remainder in net (no leak)", () => {
      const s = splitTithe(7n); // 0.7 of a micro-tithe → floors to 0
      expect(s.tithe).toBe(0n);
      expect(s.net).toBe(7n);
      expect(s.tithe + s.net).toBe(7n);
    });
    it("rejects negative", () => {
      expect(() => splitTithe(-1n)).toThrow();
    });
    it("rejects non-integer micros strings", () => {
      expect(() => parseMicros("1.5")).toThrow();
    });
  });

  describe("publishCatalogItem (D2C OEM-only)", () => {
    const base = {
      sku: "MAT-001",
      title: "OEM Mattress",
      priceMicros: "120000000",
      manufacturerDid: MANUF,
      factoryDid: FACTORY,
      productionMode: "OEM" as const,
      category: "bedding",
    };
    it("publishes a valid OEM item", async () => {
      const r = await publishCatalogItem(e, base);
      expect(r.status).toBe("published");
      expect(r.itemUri).toBeDefined();
      expect(r.did).toContain("item:mat-001");
    });
    it("is idempotent on sku", async () => {
      await publishCatalogItem(e, base);
      const again = await publishCatalogItem(e, base);
      expect(again.status).toBe("alreadyExists");
    });
    it("rejects items without manufacturer/factory (no external resale)", async () => {
      const r = await publishCatalogItem(e, {
        ...base,
        manufacturerDid: "",
        factoryDid: "",
      });
      expect(r.status).toBe("rejected");
      expect(r.error).toBe("oemRequiresManufacturerAndFactory");
    });
    it("rejects invalid production mode", async () => {
      const r = await publishCatalogItem(e, {
        ...base,
        productionMode: "RESALE" as any,
      });
      expect(r.status).toBe("rejected");
    });
    it("get + list round-trip", async () => {
      await publishCatalogItem(e, base);
      const got = await getCatalogItem(e, { sku: "MAT-001" });
      expect(got.item?.title).toBe("OEM Mattress");
      const list = await listCatalogItems(e, { productionMode: "OEM" });
      expect(list.total).toBe(1);
    });
  });

  describe("order + on-chain settlement", () => {
    const order = {
      orderId: "ORD-1",
      buyerDid: "did:web:alice.etzhayyim.com",
      lines: [
        { sku: "MAT-001", qty: 2, unitPriceMicros: "120000000" },
        { sku: "PIL-001", qty: 1, unitPriceMicros: "30000000" },
      ],
    };
    it("creates an order with computed total + pending_payment", async () => {
      const r = await createOrder(e, order);
      expect(r.status).toBe("created");
      // 2×120 + 1×30 = 270 USDC
      expect(r.totalMicros).toBe("270000000");
      const got = await getOrder(e, { orderId: "ORD-1" });
      expect(got.order?.status).toBe("pending_payment");
    });
    it("rejects empty orders", async () => {
      const r = await createOrder(e, { ...order, lines: [] });
      expect(r.status).toBe("rejected");
    });
    it("settles on-chain: tithe split + payment record + order→paid", async () => {
      await createOrder(e, order);
      const s = await settleOrder(e, fakeSettle, {
        orderId: "ORD-1",
        to: "0x1111111111111111111111111111111111111111",
      });
      expect(s.status).toBe("settled");
      expect(s.txHash).toBe("0xdeadbeef");
      expect(s.titheMicros).toBe("27000000"); // 10% of 270
      expect(s.netMicros).toBe("243000000");
      const got = await getOrder(e, { orderId: "ORD-1" });
      expect(got.order?.status).toBe("paid");
    });
    it("does not double-settle a paid order", async () => {
      await createOrder(e, order);
      await settleOrder(e, fakeSettle, {
        orderId: "ORD-1",
        to: "0x1111111111111111111111111111111111111111",
      });
      const again = await settleOrder(e, fakeSettle, {
        orderId: "ORD-1",
        to: "0x1111111111111111111111111111111111111111",
      });
      expect(again.status).toBe("alreadyPaid");
    });
    it("settling a missing order returns notFound", async () => {
      const s = await settleOrder(e, fakeSettle, {
        orderId: "NOPE",
        to: "0x1111111111111111111111111111111111111111",
      });
      expect(s.status).toBe("notFound");
    });
  });

  describe("inventory (reserve / release)", () => {
    beforeEach(async () => {
      await setStock(e, { sku: "MAT-001", onHand: 10 });
    });
    it("reserves and decrements sellable", async () => {
      const r = await reserveStock(e, { orderId: "ORD-1", sku: "MAT-001", qty: 3 });
      expect(r.status).toBe("reserved");
      expect(r.sellableAfter).toBe(7);
      const s = await getStock(e, { sku: "MAT-001" });
      expect(s.stock?.sellable).toBe(7);
      expect(s.stock?.reserved).toBe(3);
    });
    it("is idempotent on (orderId, sku)", async () => {
      await reserveStock(e, { orderId: "ORD-1", sku: "MAT-001", qty: 3 });
      const again = await reserveStock(e, { orderId: "ORD-1", sku: "MAT-001", qty: 3 });
      expect(again.status).toBe("alreadyReserved");
      const s = await getStock(e, { sku: "MAT-001" });
      expect(s.stock?.reserved).toBe(3); // not double-counted
    });
    it("rejects over-reservation", async () => {
      const r = await reserveStock(e, { orderId: "ORD-9", sku: "MAT-001", qty: 99 });
      expect(r.status).toBe("insufficient");
      expect(r.sellableAfter).toBe(10);
    });
    it("releases a reservation and restores sellable", async () => {
      await reserveStock(e, { orderId: "ORD-1", sku: "MAT-001", qty: 4 });
      const rel = await releaseStock(e, { orderId: "ORD-1", sku: "MAT-001" });
      expect(rel.status).toBe("released");
      expect(rel.sellableAfter).toBe(10);
      const s = await getStock(e, { sku: "MAT-001" });
      expect(s.stock?.reserved).toBe(0);
    });
    it("release without reservation is a no-op status", async () => {
      const rel = await releaseStock(e, { orderId: "NONE", sku: "MAT-001" });
      expect(rel.status).toBe("noReservation");
    });
    it("reserve on unstocked sku returns notFound", async () => {
      const r = await reserveStock(e, { orderId: "ORD-1", sku: "GHOST", qty: 1 });
      expect(r.status).toBe("notFound");
    });
  });

  describe("fulfillment (shipment lifecycle)", () => {
    it("creates a shipment in status created", async () => {
      const r = await createShipment(e, {
        shipmentId: "SHP-1",
        orderId: "ORD-1",
        carrier: "yamato",
      });
      expect(r.status).toBe("created");
      const got = await getShipment(e, { shipmentId: "SHP-1" });
      expect(got.shipment?.status).toBe("created");
      expect(got.shipment?.carrier).toBe("yamato");
    });
    it("is idempotent on shipmentId", async () => {
      await createShipment(e, { shipmentId: "SHP-1", orderId: "ORD-1" });
      const again = await createShipment(e, { shipmentId: "SHP-1", orderId: "ORD-1" });
      expect(again.status).toBe("alreadyExists");
    });
    it("advances status + attaches tracking", async () => {
      await createShipment(e, { shipmentId: "SHP-1", orderId: "ORD-1" });
      const u = await updateShipmentStatus(e, {
        shipmentId: "SHP-1",
        status: "in_transit",
        trackingId: "TRK-42",
      });
      expect(u.status).toBe("updated");
      const got = await getShipment(e, { shipmentId: "SHP-1" });
      expect(got.shipment?.status).toBe("in_transit");
      expect(got.shipment?.trackingId).toBe("TRK-42");
    });
    it("rejects an invalid status", async () => {
      await createShipment(e, { shipmentId: "SHP-1", orderId: "ORD-1" });
      const u = await updateShipmentStatus(e, {
        shipmentId: "SHP-1",
        status: "teleported" as any,
      });
      expect(u.status).toBe("rejected");
    });
    it("updating a missing shipment returns notFound", async () => {
      const u = await updateShipmentStatus(e, {
        shipmentId: "GHOST",
        status: "ready",
      });
      expect(u.status).toBe("notFound");
    });
  });

  describe("support (CS cases)", () => {
    const c = {
      caseId: "CASE-1",
      buyerDid: "did:web:alice.etzhayyim.com",
      subject: "Pillow arrived flat",
      orderId: "ORD-1",
    };
    it("opens a case with default priority + status new", async () => {
      const r = await openSupportCase(e, c);
      expect(r.status).toBe("opened");
      const got = await getSupportCase(e, { caseId: "CASE-1" });
      expect(got.case?.status).toBe("new");
      expect(got.case?.priority).toBe("medium");
      expect(got.case?.escalatedToHuman).toBe(false);
    });
    it("is idempotent on caseId", async () => {
      await openSupportCase(e, c);
      const again = await openSupportCase(e, c);
      expect(again.status).toBe("alreadyExists");
    });
    it("escalates + resolves", async () => {
      await openSupportCase(e, c);
      await updateSupportCase(e, {
        caseId: "CASE-1",
        status: "awaiting_human",
        escalatedToHuman: true,
        priority: "high",
      });
      const u = await updateSupportCase(e, { caseId: "CASE-1", status: "resolved" });
      expect(u.status).toBe("updated");
      const got = await getSupportCase(e, { caseId: "CASE-1" });
      expect(got.case?.status).toBe("resolved");
      expect(got.case?.escalatedToHuman).toBe(true);
      expect(got.case?.priority).toBe("high");
    });
    it("rejects an invalid status", async () => {
      await openSupportCase(e, c);
      const u = await updateSupportCase(e, {
        caseId: "CASE-1",
        status: "abducted" as any,
      });
      expect(u.status).toBe("rejected");
    });
  });

  describe("refund (escrow-refund settlement)", () => {
    const order = {
      orderId: "ORD-R",
      buyerDid: "did:web:alice.etzhayyim.com",
      lines: [{ sku: "MAT-001", qty: 1, unitPriceMicros: "120000000" }],
    };
    const buyerAddr = "0x2222222222222222222222222222222222222222";
    it("refunds a paid order: escrow-refund + order→refunded", async () => {
      await createOrder(e, order);
      await settleOrder(e, fakeSettle, {
        orderId: "ORD-R",
        to: "0x1111111111111111111111111111111111111111",
      });
      const r = await refundOrder(e, fakeSettle, { orderId: "ORD-R", to: buyerAddr });
      expect(r.status).toBe("refunded");
      expect(r.amountMicros).toBe("120000000");
      const got = await getOrder(e, { orderId: "ORD-R" });
      expect(got.order?.status).toBe("refunded");
    });
    it("refusing to refund an unpaid order", async () => {
      await createOrder(e, order);
      const r = await refundOrder(e, fakeSettle, { orderId: "ORD-R", to: buyerAddr });
      expect(r.status).toBe("notRefundable");
    });
    it("does not double-refund", async () => {
      await createOrder(e, order);
      await settleOrder(e, fakeSettle, {
        orderId: "ORD-R",
        to: "0x1111111111111111111111111111111111111111",
      });
      await refundOrder(e, fakeSettle, { orderId: "ORD-R", to: buyerAddr });
      const again = await refundOrder(e, fakeSettle, { orderId: "ORD-R", to: buyerAddr });
      expect(again.status).toBe("alreadyRefunded");
    });
  });
});
