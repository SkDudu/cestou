import {
  convexConfigured,
  findSupermarketId,
  listForValidate,
  setValidationFromRules,
} from "./scrapers/services/convex.js";
import { logger } from "./scrapers/utils/logger.js";
import { runValidation } from "./validation/index.js";

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

async function main() {
  console.log("Starting deterministic validation...\n");

  if (!convexConfigured()) {
    logger.error("CONVEX_URL missing — abort");
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const force = args.force === "true";
  const onlyPending = args.all !== "true";

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

  let cursor: string | null = null;
  let processed = 0;
  let written = 0;
  let skipped = 0;
  const counts = { validated: 0, suspicious: 0, invalid: 0, pending: 0 };

  for (;;) {
    const page = await listForValidate({
      supermarketId,
      numItems: 100,
      cursor,
    });

    if (page.page.length === 0) break;

    for (const item of page.page) {
      if (onlyPending && item.validationStatus !== "pending") continue;

      const validation = runValidation({
        name: item.name,
        brand: item.brand,
        price: item.price,
        originalPrice: item.originalPrice,
        quantity: item.quantity,
        unit: item.unit,
        url: item.url,
        imageUrl: item.imageUrl,
        externalId: item.externalId,
        supermarketId: item.supermarketId,
      });

      const result = await setValidationFromRules({
        rawProductId: item._id,
        validation,
        force,
      });

      processed++;
      if (result.skipped) skipped++;
      else written++;
      counts[validation.status]++;
    }

    if (page.isDone) break;
    cursor = page.continueCursor;
  }

  console.log("\nValidation completed.");
  console.log(
    `Processed: ${processed} | written: ${written} | human-skipped: ${skipped}`,
  );
  console.log(
    `validated: ${counts.validated} | suspicious: ${counts.suspicious} | invalid: ${counts.invalid}`,
  );
}

main().catch((err) => {
  logger.error(String(err));
  process.exitCode = 1;
});
