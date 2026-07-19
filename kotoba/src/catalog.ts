/**
 * okaimono kotoba — catalog tier.
 *
 * D2C OEM-only product catalog on AT PDS records (materializing the kotoba
 * datom log). Replaces the vendor `createKyselyDb().insertInto(...)` RW path
 * with `e.write({ collection, record, rkey })` — same Option B pattern as
 * hanrei kotoba.
 *
 * D2C OEM-only policy (okaimono CLAUDE.md): every item MUST carry both a
 * manufacturerDid and a factoryDid (tsukuru OEM manufacturing). External resale
 * / marketplace sourcing is prohibited, so an item with no factory is rejected.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  CATALOG_ITEM_COLLECTION,
  catalogItemDid,
  catalogItemRkey,
  type CatalogItemRecord,
  type CatalogItemView,
  type GetCatalogItemInput,
  type GetCatalogItemOutput,
  type ListCatalogItemsInput,
  type ListCatalogItemsOutput,
  type PublishCatalogItemInput,
  type PublishCatalogItemOutput,
} from "./types.js";
import { parseMicros } from "./tithe.js";

const PRODUCTION_MODES = new Set(["OEM", "BTO", "MTO", "CTO"]);

/**
 * Publish an OEM catalog item. Idempotent on sku (rkey = item-{sku}); a re-
 * publish of the same sku returns alreadyExists.
 */
export async function publishCatalogItem(
  e: Etzhayyim,
  input: PublishCatalogItemInput
): Promise<PublishCatalogItemOutput> {
  if (!input.sku || !input.title) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  // D2C OEM-only: no external resale — manufacturer + factory are mandatory.
  if (!input.manufacturerDid || !input.factoryDid) {
    return { status: "rejected", error: "oemRequiresManufacturerAndFactory" };
  }
  if (!PRODUCTION_MODES.has(input.productionMode)) {
    return { status: "rejected", error: "invalidProductionMode" };
  }
  try {
    parseMicros(input.priceMicros);
  } catch {
    return { status: "rejected", error: "invalidPriceMicros" };
  }

  const rkey = catalogItemRkey(input.sku);
  const existing = await e
    .read<CatalogItemRecord>({ collection: CATALOG_ITEM_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      itemUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      sku: existing.records[0].value.sku,
    };
  }

  const did = catalogItemDid(input.sku);
  const record: CatalogItemRecord = {
    did,
    sku: input.sku,
    title: input.title,
    descriptionShort: input.descriptionShort,
    priceMicros: input.priceMicros,
    manufacturerDid: input.manufacturerDid,
    factoryDid: input.factoryDid,
    productionMode: input.productionMode,
    category: input.category,
    active: input.active ?? true,
    createdAt: new Date().toISOString(),
  };

  const receipt = await e.write({
    collection: CATALOG_ITEM_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });

  return { status: "published", itemUri: receipt.uri, did, sku: input.sku };
}

/** Look up a catalog item by sku. */
export async function getCatalogItem(
  e: Etzhayyim,
  input: GetCatalogItemInput
): Promise<GetCatalogItemOutput> {
  if (!input.sku) return { error: "invalidSku" };
  const resp = await e
    .read<CatalogItemRecord>({
      collection: CATALOG_ITEM_COLLECTION,
      rkey: catalogItemRkey(input.sku),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { item: { ...r.value, itemUri: r.uri } };
}

/**
 * List catalog items with cursor pagination + post-fetch filter on production
 * mode / category / active. A Phase-3 kotoba-datomic projector will move these
 * filters into an indexed datalog query; small catalogs full-scan in Phase 2.
 */
export async function listCatalogItems(
  e: Etzhayyim,
  input: ListCatalogItemsInput = {}
): Promise<ListCatalogItemsOutput> {
  const limit = Math.min(input.limit ?? 50, 100);
  const resp = await e.read<CatalogItemRecord>({
    collection: CATALOG_ITEM_COLLECTION,
    cursor: input.cursor,
    limit,
  });

  const items: CatalogItemView[] = resp.records
    .filter((r) =>
      input.productionMode ? r.value.productionMode === input.productionMode : true
    )
    .filter((r) => (input.category ? r.value.category === input.category : true))
    .filter((r) => (input.activeOnly ? r.value.active === true : true))
    .map((r) => ({ ...r.value, itemUri: r.uri }));

  return { items, cursor: resp.cursor, total: items.length };
}
