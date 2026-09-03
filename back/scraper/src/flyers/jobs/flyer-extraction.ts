import {
  extractPageOffers,
  parseProviderArg,
} from "../extraction/offer-extractor.js";
import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import { detectContentType } from "../core/flyer-downloader.js";
import { rasterizePdf } from "../core/pdf-raster.js";
import {
  discardFailedFlyer,
  findCompletedExtraction,
  getFlyer,
  insertExtraction,
  insertFlyerError,
  insertOffers,
  listForExtract,
  listPendingExtract,
  markExpired,
  normalizeFlyer,
  patchFlyerValidity,
  setFlyerStatus,
} from "../core/flyer-storage.js";
import type { ParsedOffer } from "../core/flyer-types.js";
import { parseValidity, extractSkipReason } from "../core/validity.js";

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

export type ExtractPageEvent = {
  pageNumber: number;
  status: "running" | "done" | "failed" | "skipped";
  offers?: number;
  error?: string;
};

export async function extractPending(opts?: {
  force?: boolean;
  supermarketId?: string;
  flyerIds?: string[];
  pageNumbers?: number[];
  replaceStatuses?: Array<
    "pending" | "validated" | "rejected" | "suspicious"
  >;
  onLog?: (line: string) => void;
  onPage?: (ev: ExtractPageEvent) => void;
}) {
  const say = (tag: string, msg: string) => {
    flyerLog.info(tag, msg);
    opts?.onLog?.(`[${tag}] ${msg}`);
  };

  const force = opts?.force ?? process.argv.includes("--force");
  const provider = parseProviderArg();
  const flyerFilter = argValue("flyer");
  const pageFilter =
    opts?.pageNumbers?.length
      ? new Set(opts.pageNumbers)
      : parsePageFilter();
  const replaceStatuses = opts?.replaceStatuses;
  if (!force) {
    const expired = (await markExpired()) as { expired?: number };
    if (expired.expired) {
      say("EXTRACT", `marcou expired=${expired.expired} (validUntil < now)`);
    }
  }
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

  say(
    "EXTRACT",
    `fila: ${flyers.length} flyer(s) | provider=${provider} concurrency=${flyerConfig.mimoConcurrency}${force ? " force" : ""}`,
  );
  if (!flyers.length) {
    say("EXTRACT", "nada pra analisar");
    return { processed: 0, pending: 0, offersFound: 0 };
  }

  for (let fi = 0; fi < flyers.length; fi++) {
    const flyer = flyers[fi]!;
    const label = (flyer as { title?: string }).title ?? flyer._id;
    const progress = `${fi + 1}/${flyers.length}`;
    try {
      const windowMs =
        flyerConfig.discoveryBeforeExpirationHours * 60 * 60 * 1000;
      const skipWhy = force
        ? null
        : extractSkipReason(
            flyer as { validFrom?: number; validUntil?: number },
            Date.now(),
            windowMs,
          );
      if (skipWhy) {
        say("EXTRACT", `${progress} skip (${skipWhy}) — ${label}`);
        if (skipWhy === "validUntil expirado") {
          await setFlyerStatus(flyer._id, "expired");
        }
        continue;
      }
      await setFlyerStatus(flyer._id, "processing");
      say("EXTRACT", `${progress} em análise — ${label}`);

      const full = await getFlyer(flyer._id);
      if (!full?.pages?.length) {
        throw new Error("No pages stored — cannot extract");
      }

      const pages = (full.pages as PageRow[]).filter((p) =>
        pageFilter ? pageFilter.has(p.pageNumber) : true,
      );
      say(
        "EXTRACT",
        `${progress} ${pages.length} página(s) pra analisar`,
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
              say(
                "EXTRACT",
                `${progress} pág ${page.pageNumber}/${pages.length} skip (já analisada)`,
              );
              opts?.onPage?.({
                pageNumber: page.pageNumber,
                status: "skipped",
              });
              return {
                pageNumber: page.pageNumber,
                offers: [] as ParsedOffer[],
                failed: false,
                skipped: true,
              };
            }
          }

          say(
            "EXTRACT",
            `${progress} pág ${page.pageNumber}/${pages.length} analisando…`,
          );
          opts?.onPage?.({
            pageNumber: page.pageNumber,
            status: "running",
          });

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
            const validFrom = parts.find((p) => p.validFrom)?.validFrom;
            const validUntil = parts.find((p) => p.validUntil)?.validUntil;
            const result = {
              offers,
              status: failed ? ("failed" as const) : parts[0]!.status,
              provider: parts[0]!.provider,
              model: parts[0]!.model,
              rawResponse: parts.map((p) => p.rawResponse).join("\n"),
              pageConfidence: parts[0]!.pageConfidence,
              usage: parts[0]!.usage,
              latencyMs: parts.reduce((s, p) => s + (p.latencyMs ?? 0), 0),
              rawCount: parts.reduce((s, p) => s + (p.rawCount ?? 0), 0),
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

            say(
              "EXTRACT",
              `${progress} pág ${page.pageNumber}/${pages.length} ${result.status === "failed" ? "✕" : "✓"} offers=${result.offers.length}${result.rawCount != null ? `/${result.rawCount}` : ""} ${result.latencyMs ?? 0}ms${result.error ? ` — ${result.error}` : ""}`,
            );

            if (result.status === "failed") {
              await insertFlyerError({
                flyerId: flyer._id,
                supermarketId: flyer.supermarketId,
                stage: "AI_VISION",
                message: `page ${page.pageNumber}: ${result.error ?? "failed"}`,
              });
              opts?.onPage?.({
                pageNumber: page.pageNumber,
                status: "failed",
                offers: 0,
                error: result.error,
              });
            } else {
              opts?.onPage?.({
                pageNumber: page.pageNumber,
                status: "done",
                offers: result.offers.length,
              });
            }

            return {
              pageNumber: page.pageNumber,
              offers: result.offers,
              failed: result.status === "failed",
              skipped: false,
              validFrom,
              validUntil,
            };
          } catch (err) {
            flyerLog.error(
              "OCR",
              `flyer=${flyer._id} page=${page.pageNumber} status=failed error=${String(err)}`,
            );
            say(
              "EXTRACT",
              `${progress} pág ${page.pageNumber}/${pages.length} ✕ ${String(err)}`,
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
            opts?.onPage?.({
              pageNumber: page.pageNumber,
              status: "failed",
              offers: 0,
              error: String(err),
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

      const mimoFrom = ran.find((r) => r.validFrom)?.validFrom;
      const mimoUntil = ran.find((r) => r.validUntil)?.validUntil;
      const tz =
        (full as { supermarket?: { timezone?: string } }).supermarket
          ?.timezone || "America/Fortaleza";
      const parsedFrom = parseValidity(mimoFrom, tz, "from");
      const parsedUntil = parseValidity(mimoUntil, tz, "until");
      if (parsedFrom !== undefined || parsedUntil !== undefined) {
        await patchFlyerValidity({
          id: flyer._id,
          validFrom: parsedFrom,
          validUntil: parsedUntil,
        });
      }

      const fresh = await getFlyer(flyer._id);
      const offerFrom = fresh?.validFrom ?? flyer.validFrom;
      const offerUntil = fresh?.validUntil ?? flyer.validUntil;

      if (ran.length && offers.length) {
        const ranPages = ran.map((r) => r.pageNumber);
        const wholeForce = Boolean(force && !pageFilter && !replaceStatuses);
        await insertOffers({
          flyerId: flyer._id,
          supermarketId: flyer.supermarketId,
          validFrom: offerFrom,
          validUntil: offerUntil,
          offers,
          replace: wholeForce,
          replacePageNumbers: wholeForce
            ? undefined
            : pageFilter
              ? ranPages
              : replaceStatuses
                ? undefined
                : ranPages,
          replaceStatuses,
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
      if (failedCount > 0) {
        say(
          "EXTRACT",
          `${progress} removendo encarte após falha de análise (${failedCount} página(s))`,
        );
        await discardFailedFlyer(flyer._id);
        continue;
      }
      const nextStatus =
        skippedCount > 0 ? "partially_processed" : "processed";
      await setFlyerStatus(flyer._id, nextStatus);
      if (offers.length) {
        await normalizeFlyer(flyer._id);
        say(
          "EXTRACT",
          `${progress} ofertas salvas: ${offers.length}`,
        );
      }
      say(
        "EXTRACT",
        `${progress} ✓ terminou — ${label} status=${nextStatus} offers=${offers.length} ok=${ran.length} fail=${failedCount} skip=${results.length - ran.length}`,
      );
      processed++;
    } catch (err) {
      flyerLog.error("PARSER", `${flyer._id}: ${String(err)}`);
      opts?.onLog?.(
        `[EXTRACT] ${progress} ✕ ${label}: ${String(err)}`,
      );
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
      await discardFailedFlyer(flyer._id);
    }
  }

  say(
    "EXTRACT",
    `fim: processados ${processed}/${flyers.length} | ofertas=${offersFound}`,
  );
  return { processed, pending: flyers.length, offersFound };
}

const isMain =
  process.argv[1]?.endsWith("flyer-extraction.js") ||
  process.argv[1]?.endsWith("flyer-extraction.ts");

if (isMain) {
  extractPending()
    .then((result) => {
      flyerLog.info(
        "EXTRACT",
        `Done. processed=${result.processed}/${result.pending}`,
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
