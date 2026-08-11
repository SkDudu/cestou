import {
  convexConfigured,
  findSupermarketId,
  imageAttach,
  imageEnsureAsset,
  imageFindByHash,
  imageGenerateUploadUrl,
  imageListPending,
  imageMarkFailed,
  imageUpload,
} from "./scrapers/services/convex.js";
import { logger } from "./scrapers/utils/logger.js";
import { downloadImage } from "./images/download.js";

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function syncOne(
  item: { _id: string; imageUrl: string; name: string },
  force: boolean,
): Promise<"stored" | "reused" | "failed" | "invalid" | "skipped"> {
  try {
    const img = await downloadImage(item.imageUrl);

    const existing = await imageFindByHash(img.hash);
    let storageId: string;

    if (existing?.storageId) {
      storageId = existing.storageId;
      const result = await imageAttach({
        rawProductId: item._id,
        storageId,
        hash: img.hash,
        contentType: img.contentType,
        size: img.size,
        sourceUrl: item.imageUrl,
        force,
      });
      if (result.skipped) return "skipped";
      return "reused";
    }

    const uploadUrl = await imageGenerateUploadUrl();
    storageId = await imageUpload(uploadUrl, img.bytes, img.contentType);
    await imageEnsureAsset({
      hash: img.hash,
      storageId,
      contentType: img.contentType,
      size: img.size,
    });
    const result = await imageAttach({
      rawProductId: item._id,
      storageId,
      hash: img.hash,
      contentType: img.contentType,
      size: img.size,
      sourceUrl: item.imageUrl,
      force,
    });
    if (result.skipped) return "skipped";
    return "stored";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status =
      /invalid|magic|content-type|domain not allowed|protocol/i.test(msg)
        ? ("invalid" as const)
        : ("failed" as const);
    await imageMarkFailed({
      rawProductId: item._id,
      status,
      error: msg,
    });
    logger.debug(`image ${status}: ${item.name.slice(0, 40)} — ${msg}`);
    return status;
  }
}

async function main() {
  console.log("Starting image sync...\n");

  if (!convexConfigured()) {
    logger.error("CONVEX_URL missing — abort");
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const force = args.force === "true";
  const includeFailed = args.failed === "true" || args.all === "true";
  const limit = args.limit ? Number(args.limit) : Infinity;
  const delayMs = Number(args.delay ?? process.env.IMAGE_SYNC_DELAY_MS ?? 500);

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
  let scanned = 0;
  let processed = 0;
  const counts = { stored: 0, reused: 0, failed: 0, invalid: 0, skipped: 0 };

  for (;;) {
    if (processed >= limit) break;

    const page = await imageListPending({
      supermarketId,
      numItems: 50,
      cursor,
      includeFailed,
    });

    if (page.page.length === 0 && page.isDone) break;

    for (const item of page.page) {
      if (processed >= limit) break;
      scanned++;
      const result = await syncOne(item, force);
      counts[result]++;
      processed++;
      if (delayMs > 0) await sleep(delayMs);
    }

    // if filter emptied the page but more docs exist, keep paginating
    if (page.isDone) break;
    cursor = page.continueCursor;
  }

  console.log("\nImage sync completed.");
  console.log(
    `Scanned pages items: ${scanned} | stored: ${counts.stored} | reused: ${counts.reused} | failed: ${counts.failed} | invalid: ${counts.invalid} | skipped: ${counts.skipped}`,
  );
}

main().catch((err) => {
  logger.error(String(err));
  process.exitCode = 1;
});
