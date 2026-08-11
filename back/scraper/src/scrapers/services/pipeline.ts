import { scraperConfig } from "../../config/scraper.config.js";
import { enrichBrand, getBrandDictionary } from "../../enrichment/brand/index.js";
import { normalizeProduct } from "../normalizers/product.js";
import { validateRaw } from "../parsers/validate.js";
import type { SupermarketScraper } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { runValidation } from "../../validation/index.js";
import {
  convexConfigured,
  ensureSupermarket,
  finishJob,
  listBrands,
  logScrapeError,
  persistProduct,
  startJob,
} from "./convex.js";
import type { ScraperQuery } from "../../types/query.types.js";

export type PipelineResult = {
  query: string;
  found: number;
  saved: number;
  ok: boolean;
  error?: string;
};

let dictReady = false;

async function ensureDict() {
  if (dictReady) return;
  try {
    const brands = await listBrands();
    getBrandDictionary(brands);
  } catch {
    getBrandDictionary();
  }
  dictReady = true;
}

export async function ensureScraperSupermarket(
  scraper: SupermarketScraper,
): Promise<string> {
  if (!convexConfigured()) {
    throw new Error("CONVEX_URL missing — scrape abort");
  }
  return ensureSupermarket({
    name: scraper.name,
    slug: scraper.slug,
    website: scraper.website,
  });
}

/** One query → search → persist. Does not close browser. */
export async function runQueryPipeline(
  scraper: SupermarketScraper,
  supermarketId: string,
  q: ScraperQuery,
): Promise<PipelineResult> {
  const maxProducts = q.maxProducts ?? scraperConfig.maxProducts;
  logger.info(`Query: ${q.query} (${q.id})`);

  await ensureDict();

  const jobId = await startJob({
    supermarketId,
    type: "search",
    query: q.query,
  });

  let found = 0;
  let saved = 0;

  try {
    const raws = await scraper.search(q.query, { maxProducts });
    found = raws.length;
    logger.info(`Products found: ${found}`);

    let normalized = 0;
    for (const raw of raws) {
      try {
        if (!validateRaw(raw)) continue;
        const { product: norm } = enrichBrand(normalizeProduct(raw));
        normalized++;
        const validation = runValidation({
          name: norm.name,
          normalizedName: norm.normalizedName,
          brand: norm.brand,
          price: norm.price,
          originalPrice: norm.originalPrice,
          quantity: norm.quantity,
          unit: norm.unit,
          url: norm.url,
          imageUrl: norm.imageUrl,
          externalId: norm.externalId,
          supermarketId,
          source: norm.source,
        });
        await persistProduct({
          supermarketId,
          jobId,
          raw,
          normalized: norm,
          validation,
        });
        saved++;
        logger.debug(
          `Saved: ${norm.name} — R$ ${norm.price.toFixed(2)} [${validation.status}/${validation.score}] brand=${norm.brand ?? "—"}`,
        );
      } catch (err) {
        const message = String(err);
        logger.error(`Failed to parse product: ${message}`);
        await logScrapeError({
          supermarketId,
          jobId,
          query: q.query,
          type: "ParserError",
          message,
          url: raw.url,
        });
      }
    }

    logger.info(`Products normalized: ${normalized}`);
    logger.info(`Products saved: ${saved}`);

    await finishJob({
      jobId,
      status: "completed",
      productsFound: found,
      productsSaved: saved,
    });

    return { query: q.query, found, saved, ok: true };
  } catch (err) {
    const error = String(err);
    await finishJob({
      jobId,
      status: "failed",
      productsFound: found,
      productsSaved: saved,
      error,
    });
    logger.error(error);
    return { query: q.query, found, saved, ok: false, error };
  }
}

/** @deprecated single-query helper — prefer runQueryPipeline loop */
export async function runPipeline(
  scraper: SupermarketScraper,
  query: string,
): Promise<void> {
  logger.info("Scraper started");
  logger.info(`Supermarket: ${scraper.name}`);
  const supermarketId = await ensureScraperSupermarket(scraper);
  try {
    const result = await runQueryPipeline(scraper, supermarketId, {
      id: "adhoc",
      query,
      categoryId: "adhoc",
      enabled: true,
      priority: 1,
    });
    if (!result.ok) throw new Error(result.error);
    logger.info("Scraper finished");
  } finally {
    await scraper.close?.();
  }
}

export { scraperConfig as config };
