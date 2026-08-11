import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { config } from "../config/index.js";
import type { NormalizedProduct, RawProduct } from "../types/index.js";
import type { ValidationResult } from "../../validation/index.js";
import { logger } from "../utils/logger.js";

// ponytail: anyApi avoids Id<> casts across package boundary
const api = anyApi;

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient {
  if (!config.convexUrl) {
    throw new Error("CONVEX_URL missing — set in .env");
  }
  if (!client) client = new ConvexHttpClient(config.convexUrl);
  return client;
}

export async function ensureSupermarket(args: {
  name: string;
  slug: string;
  website?: string;
}): Promise<string> {
  return await getClient().mutation(api.supermarkets.ensure, args);
}

export async function startJob(args: {
  supermarketId: string;
  type: string;
  query?: string;
}): Promise<string> {
  return await getClient().mutation(api.scrapingJobs.start, args);
}

export async function finishJob(args: {
  jobId: string;
  status: "completed" | "failed";
  productsFound?: number;
  productsSaved?: number;
  error?: string;
}): Promise<void> {
  await getClient().mutation(api.scrapingJobs.finish, args);
}

export async function persistProduct(args: {
  supermarketId: string;
  jobId: string;
  raw: RawProduct;
  normalized: NormalizedProduct;
  validation: ValidationResult;
}): Promise<string> {
  const { supermarketId, jobId, raw, normalized, validation } = args;
  const collectedAt = Date.parse(raw.collectedAt) || Date.now();

  try {
    const productId = await getClient().mutation(api.products.upsert, {
      name: normalized.name,
      normalizedName: normalized.normalizedName,
      brand: normalized.brand,
      brandSource: normalized.brandSource,
      brandConfidence: normalized.brandConfidence,
      quantity: normalized.quantity,
      unit: normalized.unit,
      imageUrl: normalized.imageUrl,
    });

    const rawProductId = await getClient().mutation(api.rawProducts.insert, {
      supermarketId,
      scrapingJobId: jobId,
      productId,
      externalId: raw.externalId,
      name: raw.name,
      brand: normalized.brand,
      brandSource: normalized.brandSource,
      brandConfidence: normalized.brandConfidence,
      price: raw.price,
      originalPrice: raw.originalPrice,
      url: raw.url,
      imageUrl: raw.imageUrl,
      rawData: raw.rawData,
      collectedAt,
    });

    const discount =
      normalized.originalPrice && normalized.originalPrice > normalized.price
        ? normalized.originalPrice - normalized.price
        : undefined;

    await getClient().mutation(api.prices.insert, {
      productId,
      supermarketId,
      price: normalized.price,
      originalPrice: normalized.originalPrice,
      discount,
      collectedAt,
      source: normalized.source,
    });

    await getClient().mutation(api.productValidations.setFromRules, {
      rawProductId,
      status: validation.status,
      score: validation.score,
      issues: validation.issues,
      rulesVersion: validation.rulesVersion,
    });

    return rawProductId as string;
  } catch (err) {
    logger.error(`Convex mutation failed: ${String(err)}`);
    throw err;
  }
}

export async function setValidationFromRules(args: {
  rawProductId: string;
  validation: ValidationResult;
  force?: boolean;
}): Promise<{ skipped: boolean }> {
  return await getClient().mutation(api.productValidations.setFromRules, {
    rawProductId: args.rawProductId,
    status: args.validation.status,
    score: args.validation.score,
    issues: args.validation.issues,
    rulesVersion: args.validation.rulesVersion,
    force: args.force,
  });
}

export type ValidateListItem = {
  _id: string;
  supermarketId: string;
  name: string;
  brand?: string;
  brandSource?: string;
  brandConfidence?: number;
  price: number;
  originalPrice?: number;
  quantity?: number;
  unit?: string;
  url?: string;
  imageUrl?: string;
  externalId?: string;
  collectedAt: number;
  validationSource?: string;
  validationStatus: string;
};

export async function listForValidate(args: {
  supermarketId?: string;
  numItems?: number;
  cursor?: string | null;
}): Promise<{
  page: ValidateListItem[];
  continueCursor: string;
  isDone: boolean;
}> {
  return await getClient().query(api.rawProducts.listForValidate, {
    supermarketId: args.supermarketId,
    paginationOpts: {
      numItems: args.numItems ?? 100,
      cursor: args.cursor ?? null,
    },
  });
}

export async function listBrands(): Promise<string[]> {
  return await getClient().query(api.rawProducts.listBrands, {});
}

export async function setBrand(args: {
  rawProductId: string;
  brand: string;
  brandSource: string;
  brandConfidence: number;
  force?: boolean;
}): Promise<{ skipped: boolean }> {
  return await getClient().mutation(api.rawProducts.setBrand, args);
}

export async function imageGenerateUploadUrl(): Promise<string> {
  return await getClient().mutation(api.images.generateUploadUrl, {});
}

export async function imageFindByHash(
  hash: string,
): Promise<{ storageId: string; hash: string } | null> {
  return await getClient().query(api.images.findByHash, { hash });
}

export async function imageEnsureAsset(args: {
  hash: string;
  storageId: string;
  contentType: string;
  size: number;
}): Promise<string> {
  return await getClient().mutation(api.images.ensureAsset, args);
}

export async function imageAttach(args: {
  rawProductId: string;
  storageId: string;
  hash: string;
  contentType: string;
  size: number;
  sourceUrl?: string;
  force?: boolean;
}): Promise<{ skipped: boolean }> {
  return await getClient().mutation(api.images.attachToRaw, args);
}

export async function imageMarkFailed(args: {
  rawProductId: string;
  status: "failed" | "invalid";
  error: string;
}): Promise<{ skipped: boolean }> {
  return await getClient().mutation(api.images.markFailed, args);
}

export async function imageListPending(args: {
  supermarketId?: string;
  numItems?: number;
  cursor?: string | null;
  includeFailed?: boolean;
}): Promise<{
  page: Array<{
    _id: string;
    name: string;
    imageUrl: string;
    imageStatus?: string;
    supermarketId: string;
  }>;
  continueCursor: string;
  isDone: boolean;
}> {
  return await getClient().query(api.images.listPending, {
    supermarketId: args.supermarketId,
    includeFailed: args.includeFailed,
    paginationOpts: {
      numItems: args.numItems ?? 50,
      cursor: args.cursor ?? null,
    },
  });
}

export async function imageUpload(
  uploadUrl: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`Convex upload ${res.status}`);
  const json = (await res.json()) as { storageId: string };
  if (!json.storageId) throw new Error("Convex upload missing storageId");
  return json.storageId;
}

export async function findSupermarketId(slug: string): Promise<string | null> {
  const list = await getClient().query(api.supermarkets.list, {});
  const found = (list as Array<{ _id: string; slug: string }>).find(
    (s) => s.slug === slug,
  );
  return found?._id ?? null;
}

export async function logScrapeError(args: {
  supermarketId: string;
  jobId?: string;
  query?: string;
  type: string;
  message: string;
  stack?: string;
  url?: string;
}): Promise<void> {
  await getClient().mutation(api.scrapeErrors.insert, {
    supermarketId: args.supermarketId,
    scrapingJobId: args.jobId,
    query: args.query,
    type: args.type,
    message: args.message,
    stack: args.stack,
    url: args.url,
  });
}

export function convexConfigured(): boolean {
  return Boolean(config.convexUrl);
}
