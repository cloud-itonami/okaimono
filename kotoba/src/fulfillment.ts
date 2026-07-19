/**
 * okaimono kotoba — fulfillment tier (shipment lifecycle).
 *
 * Shipment records on AT PDS. Implements the SAGA "ship" step. Status follows
 * the proto ShipmentStatus ladder: created → ready → picked → in_transit →
 * delivered (or exception). No RW.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  SHIPMENT_COLLECTION,
  shipmentDid,
  shipmentRkey,
  type CreateShipmentInput,
  type CreateShipmentOutput,
  type GetShipmentInput,
  type GetShipmentOutput,
  type ShipmentRecord,
  type ShipmentStatus,
  type UpdateShipmentStatusInput,
  type UpdateShipmentStatusOutput,
} from "./types.js";

const SHIPMENT_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  "created",
  "ready",
  "picked",
  "in_transit",
  "delivered",
  "exception",
]);

/** Create a shipment for an order (idempotent on shipmentId, status=created). */
export async function createShipment(
  e: Etzhayyim,
  input: CreateShipmentInput
): Promise<CreateShipmentOutput> {
  if (!input.shipmentId || !input.orderId) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const rkey = shipmentRkey(input.shipmentId);
  const existing = await e
    .read<ShipmentRecord>({ collection: SHIPMENT_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      shipmentUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      shipmentId: existing.records[0].value.shipmentId,
    };
  }

  const now = new Date().toISOString();
  const did = shipmentDid(input.shipmentId);
  const record: ShipmentRecord = {
    did,
    shipmentId: input.shipmentId,
    orderId: input.orderId,
    carrier: input.carrier,
    serviceType: input.serviceType,
    trackingId: input.trackingId,
    status: "created",
    createdAt: now,
    updatedAt: now,
  };
  const receipt = await e.write({
    collection: SHIPMENT_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return { status: "created", shipmentUri: receipt.uri, did, shipmentId: input.shipmentId };
}

/** Advance a shipment's status (and optionally attach a tracking id). */
export async function updateShipmentStatus(
  e: Etzhayyim,
  input: UpdateShipmentStatusInput
): Promise<UpdateShipmentStatusOutput> {
  if (!input.shipmentId || !SHIPMENT_STATUSES.has(input.status)) {
    return { status: "rejected", error: "invalidStatus" };
  }
  const rkey = shipmentRkey(input.shipmentId);
  const resp = await e
    .read<ShipmentRecord>({ collection: SHIPMENT_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  const current = resp.records[0]?.value;
  if (!current) return { status: "notFound", error: "shipmentNotFound" };

  const updated: ShipmentRecord = {
    ...current,
    status: input.status,
    trackingId: input.trackingId ?? current.trackingId,
    updatedAt: new Date().toISOString(),
  };
  await e.write({
    collection: SHIPMENT_COLLECTION,
    record: updated as unknown as Record<string, unknown>,
    rkey,
  });
  return { status: "updated", shipmentId: input.shipmentId, newStatus: input.status };
}

/** Look up a shipment by id. */
export async function getShipment(
  e: Etzhayyim,
  input: GetShipmentInput
): Promise<GetShipmentOutput> {
  if (!input.shipmentId) return { error: "invalidShipmentId" };
  const resp = await e
    .read<ShipmentRecord>({
      collection: SHIPMENT_COLLECTION,
      rkey: shipmentRkey(input.shipmentId),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { shipment: { ...r.value, shipmentUri: r.uri } };
}
