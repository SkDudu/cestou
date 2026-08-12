import { TesseractOCR, terminateOcr } from "../extraction/ocr.js";
import { parseOffersFromText } from "../extraction/offer-parser.js";
import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import {
  getFlyer,
  insertFlyerError,
  insertOffers,
  listForExtract,
  listPendingExtract,
  setFlyerStatus,
} from "../core/flyer-storage.js";
import type { ParsedOffer } from "../core/flyer-types.js";

async function downloadPageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Page fetch HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function extractPending(opts?: { force?: boolean }) {
  if (!flyerConfig.ocrEnabled) {
    flyerLog.info("OCR", "FLYER_OCR_ENABLED=false — skip");
    return { processed: 0 };
  }

  const force = opts?.force ?? process.argv.includes("--force");
  const pending = force
    ? await listForExtract(true)
    : await listPendingExtract();
  const ocr = new TesseractOCR();
  let processed = 0;

  flyerLog.info(
    "OCR",
    `Extracting ${pending.length} flyer(s)${force ? " (force replace)" : ""}`,
  );

  for (const flyer of pending) {
    try {
      await setFlyerStatus(flyer._id, "processing");
      const full = await getFlyer(flyer._id);
      if (!full?.pages?.length) {
        throw new Error("No pages stored — cannot extract");
      }

      const offers: ParsedOffer[] = [];
      for (const page of full.pages) {
        if (!page.url) continue;
        try {
          const buffer = await downloadPageBuffer(page.url);
          const result = await ocr.extractText({
            pageNumber: page.pageNumber,
            buffer,
          });
          const parsed = parseOffersFromText(
            result.text,
            page.pageNumber,
            result.confidence,
          );
          flyerLog.info(
            "PARSER",
            `Flyer ${flyer._id} page ${page.pageNumber}: ${parsed.length} offers`,
          );
          offers.push(...parsed);
        } catch (err) {
          flyerLog.error(
            "OCR",
            `Flyer ${flyer._id} page ${page.pageNumber}: ${String(err)}`,
          );
          await insertFlyerError({
            flyerId: flyer._id,
            supermarketId: flyer.supermarketId,
            stage: "OCR",
            message: `page ${page.pageNumber}: ${String(err)}`,
            stack: err instanceof Error ? err.stack : undefined,
          });
          await setFlyerStatus(flyer._id, "downloaded");
          throw err;
        }
      }

      if (!offers.length) {
        await insertFlyerError({
          flyerId: flyer._id,
          supermarketId: flyer.supermarketId,
          stage: "PARSER",
          message: "No offers parsed from OCR text",
        });
        await setFlyerStatus(flyer._id, "downloaded");
        continue;
      }

      const result = await insertOffers({
        flyerId: flyer._id,
        supermarketId: flyer.supermarketId,
        validFrom: flyer.validFrom,
        validUntil: flyer.validUntil,
        offers,
        replace: force,
      });

      await setFlyerStatus(flyer._id, "processed");
      flyerLog.info(
        "PARSER",
        `Flyer ${flyer._id}: offers=${result.inserted} deleted=${result.deleted ?? 0} skipped=${result.skipped}`,
      );
      processed++;
    } catch (err) {
      flyerLog.error("PARSER", `${flyer._id}: ${String(err)}`);
      const current = await getFlyer(flyer._id);
      if (current?.status === "processing") {
        await setFlyerStatus(flyer._id, "downloaded");
      }
      await insertFlyerError({
        flyerId: flyer._id,
        supermarketId: flyer.supermarketId,
        stage: "PARSER",
        message: String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  }

  await terminateOcr();
  return { processed, pending: pending.length };
}

const isMain =
  process.argv[1]?.endsWith("flyer-extraction.js") ||
  process.argv[1]?.endsWith("flyer-extraction.ts");

if (isMain) {
  extractPending()
    .then((result) => {
      flyerLog.info(
        "OCR",
        `Done. processed=${result.processed}/${result.pending}`,
      );
    })
    .catch(async (err) => {
      console.error(err);
      await terminateOcr();
      process.exit(1);
    });
}
