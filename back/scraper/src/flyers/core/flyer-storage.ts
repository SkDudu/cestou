import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { flyerConfig } from "./flyer-config.js";
import { flyerLog } from "./flyer-logger.js";
import type { ParsedOffer } from "./flyer-types.js";

const api = anyApi;

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient {
  if (!flyerConfig.convexUrl) {
    throw new Error("CONVEX_URL missing — set in .env");
  }
  if (!client) client = new ConvexHttpClient(flyerConfig.convexUrl);
  return client;
}

export async function ensureSupermarket(args: {
  name: string;
  slug: string;
  city: string;
  state: string;
  country: string;
  websiteUrl?: string;
}): Promise<string> {
  return await getClient().mutation(api.supermarkets.ensure, args);
}

export async function ensureFlyerSource(args: {
  supermarketId: string;
  type: "pdf" | "image" | "web" | "dynamic";
  url: string;
  active?: boolean;
}): Promise<string> {
  return await getClient().mutation(api.flyerSources.ensure, args);
}

export async function listActiveSources(): Promise<
  Array<{
    _id: string;
    supermarketId: string;
    type: string;
    url: string;
  }>
> {
  return await getClient().query(api.flyerSources.listActive, {});
}

export async function getSupermarket(id: string) {
  return await getClient().query(api.supermarkets.get, { id });
}

export async function getSupermarketBySlug(slug: string) {
  return await getClient().query(api.supermarkets.getBySlug, { slug });
}

export async function createDiscoveredFlyer(args: {
  supermarketId: string;
  sourceId: string;
  title?: string;
  originalUrl: string;
  validFrom?: number;
  validUntil?: number;
}): Promise<string> {
  return await getClient().mutation(api.flyers.createDiscovered, args);
}

export async function findFlyerByHash(fileHash: string) {
  return await getClient().query(api.flyers.findByHash, { fileHash });
}

export async function setFlyerStatus(
  id: string,
  status:
    | "discovered"
    | "downloading"
    | "downloaded"
    | "processing"
    | "processed"
    | "expired"
    | "failed",
) {
  await getClient().mutation(api.flyers.setStatus, { id, status });
}

export async function uploadBuffer(
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const uploadUrl = await getClient().mutation(api.flyers.generateUploadUrl, {});
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
  const json = (await res.json()) as { storageId: string };
  return json.storageId;
}

export async function attachFlyerFile(args: {
  id: string;
  storageId: string;
  fileType?: string;
  fileSize?: number;
  fileHash?: string;
}): Promise<{ duplicateOf: string | null }> {
  return await getClient().mutation(api.flyers.attachFile, args);
}

export async function upsertFlyerPage(args: {
  flyerId: string;
  pageNumber: number;
  storageId: string;
}): Promise<string> {
  return await getClient().mutation(api.flyerPages.upsertPage, args);
}

export async function listPendingDownload() {
  return await getClient().query(api.flyers.listPendingDownload, {});
}

export async function listPendingExtract() {
  return await getClient().query(api.flyers.listPendingExtract, {});
}

export async function listForExtract(includeProcessed = false) {
  return await getClient().query(api.flyers.listForExtract, {
    includeProcessed,
  });
}

export async function getFlyer(id: string) {
  return await getClient().query(api.flyers.get, { id });
}

export async function insertOffers(args: {
  flyerId: string;
  supermarketId: string;
  validFrom?: number;
  validUntil?: number;
  offers: ParsedOffer[];
  replace?: boolean;
}) {
  return await getClient().mutation(api.offers.insertBatch, {
    flyerId: args.flyerId,
    supermarketId: args.supermarketId,
    validFrom: args.validFrom,
    validUntil: args.validUntil,
    replace: args.replace,
    offers: args.offers.map((o) => ({
      name: o.name,
      brand: o.brand,
      quantity: o.quantity,
      unit: o.unit,
      price: o.price,
      originalPrice: o.originalPrice,
      discountPercentage: o.discountPercentage,
      pageNumber: o.pageNumber,
      rawText: o.rawText,
      extractionConfidence: o.extractionConfidence,
    })),
  });
}

export async function insertFlyerError(args: {
  flyerId?: string;
  supermarketId: string;
  stage:
    | "DISCOVERY"
    | "DOWNLOAD"
    | "STORAGE"
    | "OCR"
    | "PARSER"
    | "VALIDATION";
  message: string;
  stack?: string;
}) {
  try {
    await getClient().mutation(api.flyerErrors.insert, args);
  } catch (err) {
    flyerLog.error("STORAGE", `Failed to log error: ${String(err)}`);
  }
}

export async function markExpired() {
  return await getClient().mutation(api.flyers.markExpired, {});
}

export async function fetchStorageUrl(storageId: string): Promise<string | null> {
  // Prefer flyer page URLs from getFlyer; for OCR we download via storage URL on pages
  void storageId;
  return null;
}
