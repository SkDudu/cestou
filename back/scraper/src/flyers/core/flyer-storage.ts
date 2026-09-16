import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getScraperPrisma } from "./postgres-client.js";
import { flyerLog } from "./flyer-logger.js";
import type { ParsedOffer } from "./flyer-types.js";
import { processFlyerNormalization } from "../extraction/catalog-normalization.js";

type Endpoint = { __path: string };
const endpoint = (path = ""): Endpoint => new Proxy({ __path: path }, {
  get(target, property) {
    if (property === "__path") return target.__path;
    return endpoint(path ? `${path}.${String(property)}` : String(property));
  },
}) as Endpoint;
const api: any = endpoint();

const toDate = (value?: number) => value === undefined ? undefined : new Date(value);
const toMs = (value: Date | null | undefined) => value?.getTime();
const enumValue = (value: string) => value.toUpperCase();
const compact = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
// ponytail: extractor still says ai_validated; Prisma EligibilityStatus does not
const offerEligibilityStatus = (value?: string) => {
  if (!value) return undefined;
  const v = enumValue(value);
  return v === "AI_VALIDATED" ? "CONFIRMED" : v;
};
const MEMBER_ELIGIBILITY = new Set([
  "MEMBERS_ONLY",
  "LOYALTY_PROGRAM",
  "STORE_CARD",
  "CPF_REQUIRED",
  "APP_ONLY",
  "COUPON_REQUIRED",
  "PAYMENT_METHOD",
]);
// ponytail: quantity/coupon detail stays in conditions Json
const offerEligibility = (value?: string) => {
  if (!value) return undefined;
  const v = enumValue(value);
  if (v === "ALL_CUSTOMERS") return "ALL_CUSTOMERS";
  if (MEMBER_ELIGIBILITY.has(v)) return "MEMBERS_ONLY";
  return "UNKNOWN";
};

function asFlyer(row: any) {
  if (!row) return null;
  const pages = [...(row.pages ?? [])]
    .sort((a: any, b: any) => a.pageNumber - b.pageNumber)
    .map((page: any) => ({
      ...page,
      _id: page.id,
      url: page.filePath,
      storageId: page.filePath,
    }));
  return {
    ...row,
    _id: row.id,
    storageId: row.filePath ?? undefined,
    validFrom: toMs(row.validFrom),
    validUntil: toMs(row.validUntil),
    pageUrls: pages.map((page: any) => page.filePath).filter(Boolean),
    pages,
  };
}

async function writeDiscoveredPages(prisma: any, flyerId: string, pageUrls: unknown) {
  const urls = (Array.isArray(pageUrls) ? pageUrls : []).filter((url): url is string =>
    typeof url === "string" && /^https?:\/\//i.test(url),
  );
  if (!urls.length) return;
  const count = await prisma.flyerPage.count({ where: { flyerId } });
  if (count) return;
  await prisma.flyerPage.createMany({
    data: urls.map((filePath, index) => ({ flyerId, pageNumber: index + 1, filePath })),
  });
}

async function invoke(path: string, args: Record<string, unknown>) {
  const prisma = await getScraperPrisma() as any;
  switch (path) {
    case "supermarkets.ensure": {
      const row = await prisma.supermarket.upsert({ where: { slug: args.slug }, update: { name: args.name, city: args.city, state: args.state, country: args.country, websiteUrl: args.websiteUrl }, create: { ...args, active: true } });
      return row.id;
    }
    case "supermarkets.get": return prisma.supermarket.findUnique({ where: { id: args.id } });
    case "supermarkets.getBySlug": return prisma.supermarket.findUnique({ where: { slug: args.slug } });
    case "flyerSources.ensure": {
      const existing = await prisma.flyerSource.findFirst({ where: { supermarketId: args.supermarketId, url: args.url } });
      if (existing) return existing.id;
      const row = await prisma.flyerSource.create({ data: { supermarketId: args.supermarketId, type: enumValue(args.type as string), url: args.url, active: args.active ?? true } });
      return row.id;
    }
    case "flyerSources.listActive": return prisma.flyerSource.findMany({ where: { active: true }, select: { id: true, supermarketId: true, type: true, url: true } }).then((rows: any[]) => rows.map(({ id, ...row }) => ({ _id: id, ...row, type: row.type.toLowerCase() })));
    case "flyerSources.getStoreIds": return prisma.flyerSourceStore.findMany({ where: { sourceId: args.id }, select: { storeId: true } }).then((rows: any[]) => rows.map((row) => row.storeId));
    case "scraperFlows.get": {
      const flow = await prisma.scraperFlow.findUnique({ where: { id: args.id }, include: { steps: { orderBy: { order: "asc" } } } });
      if (!flow) return null;
      return { ...flow, _id: flow.id, supermarketId: flow.supermarketId, storeId: flow.storeId, scope: flow.scope?.toLowerCase(), steps: flow.steps.map((step: any) => ({ ...step, config: JSON.stringify(step.config) })) };
    }
    case "scraperFlows.list": return prisma.scraperFlow.findMany({ where: args.supermarketId ? { supermarketId: args.supermarketId } : undefined, include: { steps: { orderBy: { order: "asc" } } } });
    case "scraperFlows.create": return prisma.scraperFlow.create({ data: { supermarketId: args.supermarketId, name: args.name, startUrl: args.startUrl, config: args.config ? JSON.parse(args.config as string) : undefined, status: "DRAFT", version: 1 } }).then((row: any) => row.id);
    case "scraperSteps.replaceAll": return prisma.$transaction(async (tx: any) => { await tx.scraperStep.deleteMany({ where: { flowId: args.flowId } }); return tx.scraperStep.createMany({ data: (args.steps as any[]).map((step) => ({ flowId: args.flowId, order: step.order, type: step.type, config: JSON.parse(step.config) })) }); });
    case "scraperRuns.start": return prisma.scraperRun.create({ data: { flowId: args.flowId, status: "RUNNING" } }).then((row: any) => row.id);
    case "scraperRuns.progress": return prisma.scraperRun.update({ where: { id: args.id }, data: { stepsExecuted: args.stepsExecuted, flyersFound: args.flyersFound, storesFound: args.storesFound, log: args.log } });
    case "scraperRuns.finish": return prisma.scraperRun.update({ where: { id: args.id }, data: { status: enumValue(args.status as string), stepsExecuted: args.stepsExecuted, flyersFound: args.flyersFound, storesFound: args.storesFound, error: args.error, log: args.log, finishedAt: new Date() } });
    case "scraperFlows.scheduleNextCheck": return prisma.scraperFlow.update({ where: { id: args.flowId }, data: { lastRunAt: new Date() } });
    case "scraperFlows.listDue": return prisma.scraperFlow.findMany({ where: { status: "ACTIVE", OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }] } });
    case "scraperFlows.recordDiscoveryResult": return prisma.scraperFlow.update({ where: { id: args.flowId }, data: { discoveryAttempts: { increment: 1 }, lastRunAt: new Date() } });
    case "flyers.createDiscovered": {
      const existing = args.externalId ? await prisma.flyer.findFirst({ where: { supermarketId: args.supermarketId, externalId: args.externalId } }) : null;
      if (existing) {
        await writeDiscoveredPages(prisma, existing.id, args.pageUrls);
        return { id: existing.id, created: false };
      }
      const row = await prisma.flyer.create({ data: { supermarketId: args.supermarketId, sourceId: args.sourceId, title: args.title, originalUrl: args.originalUrl, externalId: args.externalId, validFrom: toDate(args.validFrom as number | undefined), validUntil: toDate(args.validUntil as number | undefined), status: "DISCOVERED" } });
      if (Array.isArray(args.storeIds) && args.storeIds.length) await prisma.flyerStore.createMany({ data: args.storeIds.map((storeId: string) => ({ flyerId: row.id, storeId })), skipDuplicates: true });
      await writeDiscoveredPages(prisma, row.id, args.pageUrls);
      return { id: row.id, created: true };
    }
    case "flyers.findByHash": return asFlyer(await prisma.flyer.findFirst({ where: { supermarketId: args.supermarketId, fileHash: args.fileHash } }));
    case "flyers.setStatus": return prisma.flyer.update({ where: { id: args.id }, data: { status: enumValue(args.status as string) } });
    case "flyers.discardFlyer": return prisma.flyer.delete({ where: { id: args.id } });
    case "flyers.attachFile": {
      const duplicate = args.fileHash ? await prisma.flyer.findFirst({ where: { fileHash: args.fileHash, NOT: { id: args.id } } }) : null;
      await prisma.flyer.update({ where: { id: args.id }, data: { filePath: args.storageId, fileType: args.fileType, fileSize: args.fileSize, fileHash: args.fileHash, status: duplicate ? "DUPLICATE" : "DOWNLOADED" } });
      return { duplicateOf: duplicate?.id ?? null };
    }
    case "flyerPages.upsertPage": return prisma.flyerPage.upsert({ where: { flyerId_pageNumber: { flyerId: args.flyerId, pageNumber: args.pageNumber } }, update: { filePath: args.storageId }, create: { flyerId: args.flyerId, pageNumber: args.pageNumber, filePath: args.storageId } }).then((row: any) => row.id);
    case "flyers.listPendingDownload": return prisma.flyer.findMany({ where: { status: "DISCOVERED" }, include: { pages: { orderBy: { pageNumber: "asc" } } } }).then((rows: any[]) => rows.map(asFlyer));
    case "flyers.listPendingExtract": return prisma.flyer.findMany({ where: { status: "DOWNLOADED" }, include: { pages: { orderBy: { pageNumber: "asc" } } } }).then((rows: any[]) => rows.map(asFlyer));
    case "flyers.listForExtract": return prisma.flyer.findMany({ where: args.includeProcessed ? undefined : { status: { in: ["DOWNLOADED", "PARTIALLY_PROCESSED"] } }, include: { pages: { orderBy: { pageNumber: "asc" } } } }).then((rows: any[]) => rows.map(asFlyer));
    case "flyers.get": return asFlyer(await prisma.flyer.findUnique({ where: { id: args.id }, include: { pages: { orderBy: { pageNumber: "asc" } }, stores: true } }));
    case "flyers.markExpired": return prisma.flyer.updateMany({ where: { validUntil: { lt: new Date() }, status: { not: "EXPIRED" } }, data: { status: "EXPIRED", expiredAt: new Date() } }).then((result: any) => ({ expired: result.count }));
    case "flyers.patchValidity": return prisma.flyer.update({ where: { id: args.id }, data: { validFrom: toDate(args.validFrom as number | undefined), validUntil: toDate(args.validUntil as number | undefined) } });
    case "offers.insertBatch": {
      if (args.replace) await prisma.offer.deleteMany({ where: { flyerId: args.flyerId, ...(Array.isArray(args.replacePageNumbers) ? { pageNumber: { in: args.replacePageNumbers } } : {}) } });
      const offers = (args.offers as any[]).map((offer) => compact({
        flyerId: args.flyerId,
        supermarketId: args.supermarketId,
        validFrom: toDate(args.validFrom as number | undefined),
        validUntil: toDate(args.validUntil as number | undefined),
        name: offer.name,
        brand: offer.brand,
        quantity: offer.quantity,
        unit: offer.unit,
        price: offer.price,
        originalPrice: offer.originalPrice,
        cashPrice: offer.cashPrice,
        installmentCount: offer.installmentCount,
        installmentAmount: offer.installmentAmount,
        installmentInterestFree: offer.installmentInterestFree,
        discountPercentage: offer.discountPercentage,
        pageNumber: offer.pageNumber,
        rawText: offer.rawText,
        extractionConfidence: offer.extractionConfidence,
        eligibility: offerEligibility(offer.eligibility),
        conditions: offer.conditions,
        eligibilityConfidence: offer.eligibilityConfidence,
        eligibilityEvidence: offer.eligibilityEvidence,
        eligibilityStatus: offerEligibilityStatus(offer.eligibilityStatus),
        validationStatus: "PENDING",
      }));
      return prisma.offer.createMany({ data: offers });
    }
    case "normalization.processFlyer":
      return processFlyerNormalization(prisma, args.flyerId as string);
    case "flyerErrors.insert": return prisma.flyerError.create({ data: { flyerId: args.flyerId, supermarketId: args.supermarketId, stage: args.stage, message: args.message, stack: args.stack } });
    case "flyerExtractions.insert": return prisma.flyerExtraction.create({ data: { flyerId: args.flyerId, pageId: args.pageId, pageNumber: args.pageNumber, provider: args.provider, model: args.model, promptVersion: args.promptVersion, status: enumValue(args.status as string), rawResponse: args.rawResponse, offerCount: args.offerCount, extractionConfidence: args.extractionConfidence, error: args.error, inputTokens: args.inputTokens, outputTokens: args.outputTokens, totalTokens: args.totalTokens, durationMs: args.durationMs } });
    case "flyerExtractions.findCompleted": return prisma.flyerExtraction.findFirst({ where: { pageId: args.pageId, model: args.model, promptVersion: args.promptVersion, status: "COMPLETED" }, orderBy: { createdAt: "desc" } });
    case "scraperSetupEvents.append": {
      const previous = await prisma.scraperSetupEvent.findFirst({ where: { flowId: args.flowId }, orderBy: { order: "desc" } });
      return prisma.scraperSetupEvent.create({ data: { flowId: args.flowId, sessionId: args.sessionId, order: (previous?.order ?? 0) + 1, at: new Date(), kind: args.kind, label: args.label, payload: args.payload ? JSON.parse(args.payload as string) : undefined } });
    }
    default: throw new Error(`PostgreSQL scraper adapter has no handler for ${path}`);
  }
}

function getClient() {
  return {
    mutation: (target: Endpoint, args: Record<string, unknown>) => invoke(target.__path, args),
    query: (target: Endpoint, args: Record<string, unknown>) => invoke(target.__path, args),
  };
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
}): Promise<{ id: string; created: boolean; retired?: number }> {
  const res = (await getClient().mutation(api.flyers.createDiscovered, args)) as
    | { id: string; created: boolean; retired?: number }
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
  const extension = contentType.includes("pdf") ? ".pdf" : contentType.split("/")[1] ? `.${contentType.split("/")[1]}` : ".bin";
  const filename = `${createHash("sha256").update(buffer).digest("hex")}-${randomUUID()}${extension}`;
  const relativePath = join("flyers", filename);
  const root = process.env.STORAGE_ROOT ?? join(process.cwd(), "storage");
  const destination = join(root, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
  return relativePath;
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

/** Fase 2: normalizar ofertas + resolver produtos canônicos após extração */
export async function normalizeFlyer(flyerId: string) {
  try {
    await getClient().mutation(api.normalization.processFlyer, { flyerId });
  } catch (err) {
    flyerLog.error("NORMALIZE", `falha ao normalizar ${flyerId}: ${String(err)}`);
  }
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
