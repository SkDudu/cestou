import { terminateOcr } from "../extraction/ocr.js";
import {
  extractPageOffers,
  parseProviderArg,
} from "../extraction/offer-extractor.js";
import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import { detectContentType } from "../core/flyer-downloader.js";
import { rasterizePdf } from "../core/pdf-raster.js";
import {
  findCompletedExtraction,
  getFlyer,
  insertExtraction,
  insertFlyerError,
  insertOffers,
  listForExtract,
  listPendingExtract,
  setFlyerStatus,
} from "../core/flyer-storage.js";
import type { ParsedOffer } from "../core/flyer-types.js";

type PageRow = {
  _id: string;
  pageNumber: number;
  url?: string | null;
};

function argValue(name: string, argv = process.argv): string | undefined {
  const flag = argv.find((a) => a.startsWith(`--${name}=`));
  return flag?.slice(name.length + 3);
}

function parsePageFilter(argv = process.argv): Set<number> | undefined {
  const raw = argValue("page", argv) ?? argValue("pages", argv);
  if (!raw) return undefined;
  const pages = new Set<number>();
  for (const part of raw.split(",")) {
    const range = part.split("-").map((s) => Number(s.trim()));
    if (range.length === 2 && range[0] && range[1]) {
      for (let n = range[0]; n <= range[1]; n++) pages.add(n);
    } else if (range[0]) {
      pages.add(range[0]);
    }
  }
  return pages.size ? pages : undefined;
}

async function downloadPageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Page fetch HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export async function extractPending(opts?: {
  force?: boolean;
  supermarketId?: string;
  flyerIds?: string[];
}) {
  const force = opts?.force ?? process.argv.includes("--force");
  const provider = parseProviderArg();
  const flyerFilter = argValue("flyer");
  const pageFilter = parsePageFilter();
  let pending = force
    ? await listForExtract(true)
    : await listPendingExtract();
  if (opts?.supermarketId) {
    pending = pending.filter(
      (f: { supermarketId: string }) => f.supermarketId === opts.supermarketId,
    );
  }
  if (opts?.flyerIds?.length) {
    const set = new Set(opts.flyerIds);
    pending = pending.filter((f: { _id: string }) => set.has(f._id));
  }
  const flyers = flyerFilter
    ? pending.filter((f: { _id: string }) => f._id === flyerFilter)
    : pending;
  let processed = 0;
  let offersFound = 0;

  flyerLog.info(
    "OCR",
    `Extracting ${flyers.length} flyer(s) provider=${provider} concurrency=${flyerConfig.mimoConcurrency}${force ? " force" : ""}`,
  );

  for (const flyer of flyers) {
    try {
      await setFlyerStatus(flyer._id, "processing");

      const full = await getFlyer(flyer._id);
      if (!full?.pages?.length) {
        throw new Error("No pages stored — cannot extract");
      }

      const pages = (full.pages as PageRow[]).filter((p) =>
        pageFilter ? pageFilter.has(p.pageNumber) : true,
      );

      const results = await mapLimit(
        pages,
        flyerConfig.mimoConcurrency,
        async (page) => {
          if (!page.url) {
            return {
              pageNumber: page.pageNumber,
              offers: [] as ParsedOffer[],
              failed: true,
              skipped: false,
            };
          }

          if (!force) {
            const done = await findCompletedExtraction({
              pageId: page._id,
              model: flyerConfig.mimoModel,
              promptVersion: flyerConfig.aiPromptVersion,
            });
            if (done) {
              flyerLog.info(
                "AI_VISION",
                `skip page ${page.pageNumber} (idempotent ${flyerConfig.mimoModel}/${flyerConfig.aiPromptVersion})`,
              );
              return {
                pageNumber: page.pageNumber,
                offers: [] as ParsedOffer[],
                failed: false,
                skipped: true,
              };
            }
          }

          try {
            const buffer = await downloadPageBuffer(page.url);
            const detected =
              detectContentType(buffer) ?? "application/octet-stream";
            const images =
              detected === "application/pdf"
                ? await rasterizePdf(buffer)
                : [{ buffer, contentType: detected }];
            if (!images.length) {
              throw new Error("No images to extract (PDF rasterize empty)");
            }

            const parts = [];
            for (let i = 0; i < images.length; i++) {
              const img = images[i]!;
              const isImg = img.contentType.startsWith("image/");
              parts.push(
                await extractPageOffers(
                  {
                    flyerId: flyer._id,
                    pageNumber:
                      images.length === 1 ? page.pageNumber : i + 1,
                    imageUrl:
                      isImg && detected !== "application/pdf"
                        ? page.url
                        : undefined,
                    imageBuffer: img.buffer,
                    contentType: isImg ? img.contentType : "image/jpeg",
                  },
                  provider,
                ),
              );
            }

            const offers = parts.flatMap((p) => p.offers);
            const failed = parts.every((p) => p.status === "failed");
            const result = {
              offers,
              status: failed ? ("failed" as const) : parts[0]!.status,
              provider: parts[0]!.provider,
              model: parts[0]!.model,
              rawResponse: parts.map((p) => p.rawResponse).join("\n"),
              pageConfidence: parts[0]!.pageConfidence,
              usage: parts[0]!.usage,
              latencyMs: parts.reduce((s, p) => s + (p.latencyMs ?? 0), 0),
              error: failed
                ? parts
                    .map((p) => p.error)
                    .filter(Boolean)
                    .join("; ")
                : parts.find((p) => p.error)?.error,
            };

            const extractionStatus =
              result.status === "failed" ? "failed" : "completed";

            await insertExtraction({
              flyerId: flyer._id,
              pageId: page._id,
              pageNumber: page.pageNumber,
              provider: result.provider,
              model: result.model ?? flyerConfig.mimoModel,
              promptVersion: flyerConfig.aiPromptVersion,
              status: extractionStatus,
              rawResponse: result.rawResponse,
              offerCount: result.offers.length,
              extractionConfidence: result.pageConfidence,
              error: result.error,
              inputTokens: result.usage?.promptTokens,
              outputTokens: result.usage?.completionTokens,
              totalTokens: result.usage?.totalTokens,
              durationMs: result.latencyMs,
            });

            flyerLog.info(
              "PARSER",
              `flyer=${flyer._id} page=${page.pageNumber} model=${result.model ?? result.provider} status=${result.status} duration=${result.latencyMs}ms offers=${result.offers.length}${result.error ? ` error=${result.error}` : ""}`,
            );

            if (result.status === "failed") {
              await insertFlyerError({
                flyerId: flyer._id,
                supermarketId: flyer.supermarketId,
                stage: "AI_VISION",
                message: `page ${page.pageNumber}: ${result.error ?? "failed"}`,
              });
            }

            return {
              pageNumber: page.pageNumber,
              offers: result.offers,
              failed: result.status === "failed",
              skipped: false,
            };
          } catch (err) {
            flyerLog.error(
              "OCR",
              `flyer=${flyer._id} page=${page.pageNumber} status=failed error=${String(err)}`,
            );
            await insertFlyerError({
              flyerId: flyer._id,
              supermarketId: flyer.supermarketId,
              stage: "OCR",
              message: `page ${page.pageNumber}: ${String(err)}`,
              stack: err instanceof Error ? err.stack : undefined,
            });
            await insertExtraction({
              flyerId: flyer._id,
              pageId: page._id,
              pageNumber: page.pageNumber,
              provider: "mimo-v2.5",
              model: flyerConfig.mimoModel,
              promptVersion: flyerConfig.aiPromptVersion,
              status: "failed",
              error: String(err),
              offerCount: 0,
              durationMs: 0,
            });
            return {
              pageNumber: page.pageNumber,
              offers: [] as ParsedOffer[],
              failed: true,
              skipped: false,
            };
          }
        },
      );

      const ran = results.filter((r) => !r.skipped);
      const offers = ran.flatMap((r) => r.offers);
      const failedCount = results.filter((r) => r.failed).length;
      const okCount = results.filter((r) => !r.failed && !r.skipped).length;

      if (ran.length && offers.length) {
        await insertOffers({
          flyerId: flyer._id,
          supermarketId: flyer.supermarketId,
          validFrom: flyer.validFrom,
          validUntil: flyer.validUntil,
          offers,
          replace: force && !pageFilter,
          replacePageNumbers:
            force && !pageFilter ? undefined : ran.map((r) => r.pageNumber),
        });
        offersFound += offers.length;
      } else if (!offers.length && !results.some((r) => r.skipped)) {
        await insertFlyerError({
          flyerId: flyer._id,
          supermarketId: flyer.supermarketId,
          stage: "PARSER",
          message: "No offers extracted",
        });
      }

      const skippedCount = results.filter((r) => r.skipped).length;
      const nextStatus =
        failedCount > 0 && (okCount > 0 || skippedCount > 0)
          ? "partially_processed"
          : failedCount > 0
            ? "downloaded"
            : "processed";
      await setFlyerStatus(flyer._id, nextStatus);
      flyerLog.info(
        "PARSER",
        `Flyer ${flyer._id}: status=${nextStatus} offers=${offers.length} ok=${okCount} failed=${failedCount} skipped=${results.length - ran.length}`,
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
  return { processed, pending: flyers.length, offersFound };
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
