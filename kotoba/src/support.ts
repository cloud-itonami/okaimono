/**
 * okaimono kotoba — support tier (CS cases / returns).
 *
 * Support-case lifecycle on AT PDS records. Mirrors the proto SupportCase
 * (status / priority / escalation). The monetary side of a return — refunding a
 * paid order — lives in order.ts `refundOrder` (escrow-refund settlement), since
 * it touches the on-chain value seam.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  SUPPORT_CASE_COLLECTION,
  supportCaseDid,
  supportCaseRkey,
  type CaseStatus,
  type GetSupportCaseInput,
  type GetSupportCaseOutput,
  type OpenSupportCaseInput,
  type OpenSupportCaseOutput,
  type SupportCaseRecord,
  type UpdateSupportCaseInput,
  type UpdateSupportCaseOutput,
} from "./types.js";

const CASE_STATUSES: ReadonlySet<CaseStatus> = new Set([
  "new",
  "in_progress",
  "waiting_for_customer",
  "awaiting_human",
  "resolved",
  "closed",
]);

/** Open a support case (idempotent on caseId, status=new). */
export async function openSupportCase(
  e: Etzhayyim,
  input: OpenSupportCaseInput
): Promise<OpenSupportCaseOutput> {
  if (!input.caseId || !input.buyerDid || !input.subject) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const rkey = supportCaseRkey(input.caseId);
  const existing = await e
    .read<SupportCaseRecord>({ collection: SUPPORT_CASE_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      caseUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      caseId: existing.records[0].value.caseId,
    };
  }

  const now = new Date().toISOString();
  const did = supportCaseDid(input.caseId);
  const record: SupportCaseRecord = {
    did,
    caseId: input.caseId,
    buyerDid: input.buyerDid,
    orderId: input.orderId,
    subject: input.subject,
    channel: input.channel,
    status: "new",
    priority: input.priority ?? "medium",
    escalatedToHuman: false,
    createdAt: now,
    updatedAt: now,
  };
  const receipt = await e.write({
    collection: SUPPORT_CASE_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return { status: "opened", caseUri: receipt.uri, did, caseId: input.caseId };
}

/** Update a support case's status / priority / escalation / root cause. */
export async function updateSupportCase(
  e: Etzhayyim,
  input: UpdateSupportCaseInput
): Promise<UpdateSupportCaseOutput> {
  if (!input.caseId) return { status: "rejected", error: "invalidCaseId" };
  if (input.status && !CASE_STATUSES.has(input.status)) {
    return { status: "rejected", error: "invalidStatus" };
  }
  const rkey = supportCaseRkey(input.caseId);
  const resp = await e
    .read<SupportCaseRecord>({ collection: SUPPORT_CASE_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  const current = resp.records[0]?.value;
  if (!current) return { status: "notFound", error: "caseNotFound" };

  const updated: SupportCaseRecord = {
    ...current,
    status: input.status ?? current.status,
    priority: input.priority ?? current.priority,
    escalatedToHuman: input.escalatedToHuman ?? current.escalatedToHuman,
    rootCause: input.rootCause ?? current.rootCause,
    updatedAt: new Date().toISOString(),
  };
  await e.write({
    collection: SUPPORT_CASE_COLLECTION,
    record: updated as unknown as Record<string, unknown>,
    rkey,
  });
  return { status: "updated", caseId: input.caseId, newStatus: updated.status };
}

/** Look up a support case by id. */
export async function getSupportCase(
  e: Etzhayyim,
  input: GetSupportCaseInput
): Promise<GetSupportCaseOutput> {
  if (!input.caseId) return { error: "invalidCaseId" };
  const resp = await e
    .read<SupportCaseRecord>({
      collection: SUPPORT_CASE_COLLECTION,
      rkey: supportCaseRkey(input.caseId),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { case: { ...r.value, caseUri: r.uri } };
}
