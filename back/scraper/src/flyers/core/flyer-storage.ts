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
  type: "pdf" | "image" | "web" | "dynamic" | "manual";
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
  pageUrls?: string[];
  validFrom?: number;
  validUntil?: number;
  externalId?: string;
  storeIds?: string[];
}): Promise<{ id: string; created: boolean }> {
  const res = (await getClient().mutation(api.flyers.createDiscovered, args)) as
    | { id: string; created: boolean }
    | string;
  // ponytail: old mutation returned id string
  if (typeof res === "string") return { id: res, created: true };
  return res;
}

export async function getSourceStoreIds(sourceId: string) {
  return (await getClient().query(api.flyerSources.getStoreIds, {
    id: sourceId as never,
  })) as string[] | null | undefined;
}

export async function findFlyerByHash(
  supermarketId: string,
  fileHash: string,
) {
  return await getClient().query(api.flyers.findByHash, {
    supermarketId,
    fileHash,
  });
}

export async function setFlyerStatus(
  id: string,
  status:
    | "discovered"
    | "downloading"
    | "downloaded"
    | "processing"
    | "partially_processed"
    | "processed"
    | "expired"
    | "duplicate"
    | "failed",
) {
  await getClient().mutation(api.flyers.setStatus, { id, status });
}

/** Error paths discard the full flyer, including partial offers and evidence. */
export async function discardFailedFlyer(id: string) {
  await getClient().mutation(api.flyers.discardFlyer, { id: id as never });
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
  replacePageNumbers?: number[];
  replaceStatuses?: Array<
    "pending" | "validated" | "rejected" | "suspicious"
  >;
}) {
  return await getClient().mutation(api.offers.insertBatch, {
    flyerId: args.flyerId,
    supermarketId: args.supermarketId,
    validFrom: args.validFrom,
    validUntil: args.validUntil,
    replace: args.replace,
    replacePageNumbers: args.replacePageNumbers,
    replaceStatuses: args.replaceStatuses,
    offers: args.offers.map((o) => ({
      name: o.name,
      brand: o.brand,
      quantity: o.quantity,
      unit: o.unit,
      price: o.price,
      originalPrice: o.originalPrice,
      cashPrice: o.cashPrice,
      installmentCount: o.installmentCount,
      installmentAmount: o.installmentAmount,
      installmentInterestFree: o.installmentInterestFree,
      discountPercentage: o.discountPercentage,
      pageNumber: o.pageNumber,
      rawText: o.rawText,
      extractionConfidence: o.extractionConfidence,
      eligibility: o.eligibility,
      conditions: o.conditions,
      eligibilityConfidence: o.eligibilityConfidence,
      eligibilityEvidence: o.eligibilityEvidence,
      eligibilityStatus: o.eligibilityStatus,
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
    | "VALIDATION"
    | "AI_VISION";
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

export async function insertExtraction(args: {
  flyerId: string;
  pageId: string;
  pageNumber: number;
  provider: "mimo-v2.5" | "tesseract-rules";
  model: string;
  promptVersion: string;
  status: "pending" | "processing" | "completed" | "failed";
  rawResponse?: string;
  offerCount?: number;
  extractionConfidence?: number;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
}) {
  const payload: Record<string, unknown> = {
    flyerId: args.flyerId,
    pageId: args.pageId,
    pageNumber: args.pageNumber,
    provider: args.provider,
    model: args.model,
    promptVersion: args.promptVersion,
    status: args.status,
  };
  if (args.rawResponse !== undefined) payload.rawResponse = args.rawResponse;
  if (args.offerCount !== undefined) payload.offerCount = args.offerCount;
  if (args.extractionConfidence !== undefined) {
    payload.extractionConfidence = args.extractionConfidence;
  }
  if (args.error !== undefined) payload.error = args.error;
  if (args.inputTokens !== undefined) payload.inputTokens = args.inputTokens;
  if (args.outputTokens !== undefined) payload.outputTokens = args.outputTokens;
  if (args.totalTokens !== undefined) payload.totalTokens = args.totalTokens;
  if (args.durationMs !== undefined) payload.durationMs = args.durationMs;
  return await getClient().mutation(api.flyerExtractions.insert, payload);
}

export async function findCompletedExtraction(args: {
  pageId: string;
  model: string;
  promptVersion: string;
}) {
  return await getClient().query(api.flyerExtractions.findCompleted, args);
}

export async function patchFlyerValidity(args: {
  id: string;
  validFrom?: number;
  validUntil?: number;
}) {
  await getClient().mutation(api.flyers.patchValidity, args);
}

export async function scheduleNextCheck(flowId: string) {
  return await getClient().mutation(api.scraperFlows.scheduleNextCheck, {
    flowId: flowId as never,
  });
}

export async function listDueFlows() {
  return await getClient().query(api.scraperFlows.listDue, {});
}

export async function recordDiscoveryResult(args: {
  flowId: string;
  ok: boolean;
  newFlyers: number;
  error?: string;
}) {
  return await getClient().mutation(
    api.scraperFlows.recordDiscoveryResult,
    args as never,
  );
}

export async function listScraperFlows(supermarketId?: string) {
  return await getClient().query(
    api.scraperFlows.list,
    supermarketId ? { supermarketId: supermarketId as never } : {},
  );
}

export async function getScraperFlow(id: string) {
  return await getClient().query(api.scraperFlows.get, { id: id as never });
}

export async function createScraperFlow(args: {
  supermarketId: string;
  name: string;
  startUrl: string;
  config?: string;
}) {
  return await getClient().mutation(api.scraperFlows.create, args as never);
}

export async function replaceScraperSteps(
  flowId: string,
  steps: Array<{ type: string; config: string; order: number }>,
) {
  return await getClient().mutation(api.scraperSteps.replaceAll, {
    flowId: flowId as never,
    steps: steps as never,
  });
}

export async function appendSetupEvent(args: {
  flowId: string;
  sessionId?: string;
  kind: string;
  label: string;
  payload?: string;
}) {
  return await getClient().mutation(api.scraperSetupEvents.append, {
    flowId: args.flowId as never,
    sessionId: args.sessionId,
    kind: args.kind as never,
    label: args.label,
    payload: args.payload,
  });
}

export async function startScraperRun(flowId: string) {
  return await getClient().mutation(api.scraperRuns.start, {
    flowId: flowId as never,
  });
}

export async function progressScraperRun(args: {
  id: string;
  stepsExecuted?: number;
  flyersFound?: number;
  storesFound?: number;
  log?: string;
}) {
  return await getClient().mutation(api.scraperRuns.progress, args as never);
}

export async function finishScraperRun(args: {
  id: string;
  status: "running" | "success" | "partial" | "cancelled" | "duplicate" | "failed";
  stepsExecuted: number;
  flyersFound: number;
  storesFound: number;
  error?: string;
  log?: string;
}) {
  return await getClient().mutation(api.scraperRuns.finish, args as never);
}

export async function fetchStorageUrl(storageId: string): Promise<string | null> {
  // Prefer flyer page URLs from getFlyer; for OCR we download via storage URL on pages
  void storageId;
  return null;
}
