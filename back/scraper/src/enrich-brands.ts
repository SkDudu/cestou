import {
  BRAND_ENRICHMENT_VERSION,
  enrichBrand,
  getBrandDictionary,
  resetBrandDictionary,
} from "./enrichment/brand/index.js";
import {
  convexConfigured,
  findSupermarketId,
  listBrands,
  listForValidate,
  setBrand,
} from "./scrapers/services/convex.js";
import { logger } from "./scrapers/utils/logger.js";

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

async function main() {
  console.log(`Starting brand enrichment (${BRAND_ENRICHMENT_VERSION})...\n`);

  if (!convexConfigured()) {
    logger.error("CONVEX_URL missing — abort");
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const force = args.force === "true";
  const missingOnly = args["missing-brand"] === "true" || args.all !== "true";

  let supermarketId: string | undefined;
  if (args.supermarket) {
    const id = await findSupermarketId(args.supermarket);
    if (!id) {
      logger.error(`Unknown supermarket: ${args.supermarket}`);
      process.exitCode = 1;
      return;
    }
    supermarketId = id;
  }

  resetBrandDictionary();
  const known = await listBrands();
  const dict = getBrandDictionary(known);
  logger.info(`Dictionary size: ${dict.size()} (seed + ${known.length} from DB)`);

  let cursor: string | null = null;
  let scanned = 0;
  let filled = 0;
  let skipped = 0;
  let none = 0;
  const bySource: Record<string, number> = {};

  for (;;) {
    const page = await listForValidate({
      supermarketId,
      numItems: 100,
      cursor,
    });

    if (page.page.length === 0) break;

    for (const item of page.page) {
      scanned++;
      if (missingOnly && item.brand?.trim()) continue;

      const { product, extraction } = enrichBrand(
        {
          name: item.name,
          normalizedName: item.name.toLowerCase(),
          brand: item.brand,
          price: item.price,
          originalPrice: item.originalPrice,
          quantity: item.quantity,
          unit: item.unit,
          url: item.url,
          imageUrl: item.imageUrl,
          externalId: item.externalId,
          source: "enrich",
          collectedAt: new Date(item.collectedAt).toISOString(),
        },
        dict,
      );

      if (!product.brand || extraction.source === "none" || extraction.source === "scraper") {
        if (extraction.source === "none") none++;
        if (extraction.source === "scraper") skipped++;
        continue;
      }

      const result = await setBrand({
        rawProductId: item._id,
        brand: product.brand,
        brandSource: extraction.source,
        brandConfidence: extraction.confidence,
        force,
      });

      if (result.skipped) {
        skipped++;
      } else {
        filled++;
        bySource[extraction.source] = (bySource[extraction.source] ?? 0) + 1;
      }
    }

    if (page.isDone) break;
    cursor = page.continueCursor;
  }

  console.log("\nBrand enrichment completed.");
  console.log(`Scanned: ${scanned} | filled: ${filled} | skipped: ${skipped} | none: ${none}`);
  console.log(`By source: ${JSON.stringify(bySource)}`);
}

main().catch((err) => {
  logger.error(String(err));
  process.exitCode = 1;
});
