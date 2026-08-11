import { scraperConfig } from "./config/scraper.config.js";
import { getCategory } from "./services/category.service.js";
import { resolveQueries } from "./services/query.service.js";
import { getScraper } from "./scrapers/index.js";
import {
  ensureScraperSupermarket,
  runQueryPipeline,
} from "./scrapers/services/pipeline.js";
import { logger } from "./scrapers/utils/logger.js";
import type { QueryFilters, QueryFrequency } from "./types/query.types.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse `--key=value` / `--key value` from argv. */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const body = a.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[body] = next;
        i++;
      } else {
        out[body] = "true";
      }
    }
  }
  return out;
}

function buildFilters(args: Record<string, string>): QueryFilters {
  const filters: QueryFilters = {};

  const category = args.category ?? scraperConfig.category;
  if (category) filters.category = category;

  if (args.subcategory) filters.subcategory = args.subcategory;
  if (args.query) filters.query = args.query;

  const priorityRaw = args.priority ?? scraperConfig.priority?.toString();
  if (priorityRaw && priorityRaw !== "all") {
    filters.priority = Number(priorityRaw);
  }

  if (args.frequency) {
    filters.frequency = args.frequency as QueryFrequency;
  }

  return filters;
}

async function main() {
  console.log("Starting scraper...\n");

  const args = parseArgs(process.argv.slice(2));
  const filters = buildFilters(args);
  const queries = resolveQueries(filters);

  if (queries.length === 0) {
    logger.error("No queries matched filters — abort");
    process.exitCode = 1;
    return;
  }

  const supermarket = args.supermarket ?? scraperConfig.supermarket;
  const scraper = getScraper(supermarket);
  logger.info(`Supermarket: ${scraper.name} (${scraper.slug})`);
  logger.info(`Queries to run: ${queries.length}`);

  if (filters.category) {
    const cat = getCategory(filters.category);
    logger.info(`Category: ${cat?.name ?? filters.category}`);
  }

  const supermarketId = await ensureScraperSupermarket(scraper);

  let ok = 0;
  let fail = 0;
  let totalSaved = 0;

  try {
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      logger.info(`[${i + 1}/${queries.length}] ${q.query}`);

      const result = await runQueryPipeline(scraper, supermarketId, q);
      if (result.ok) ok++;
      else fail++;
      totalSaved += result.saved;

      if (i < queries.length - 1 && scraperConfig.delayMs > 0) {
        await sleep(scraperConfig.delayMs);
      }
    }

    console.log("\nScraping completed.");
    console.log(`Queries ok: ${ok} | failed: ${fail} | products saved: ${totalSaved}`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await scraper.close?.();
  }
}

main().catch((err) => {
  logger.error(String(err));
  process.exitCode = 1;
});
