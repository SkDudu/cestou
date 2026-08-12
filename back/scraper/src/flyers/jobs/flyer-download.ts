import { getFlyerScraper } from "../sources/index.js";
import {
  attachFlyerFile,
  findFlyerByHash,
  getSupermarket,
  insertFlyerError,
  listPendingDownload,
  setFlyerStatus,
  uploadBuffer,
  upsertFlyerPage,
} from "../core/flyer-storage.js";
import { flyerLog } from "../core/flyer-logger.js";
import { closeSaoLuizBrowser } from "../sources/sao-luiz/scraper.js";
import type { FlyerSourceRef } from "../core/flyer-types.js";

async function resolveSourcesBySlug(
  slug: string,
  cache: Map<string, FlyerSourceRef[]>,
): Promise<FlyerSourceRef[]> {
  if (cache.has(slug)) return cache.get(slug)!;
  const scraper = getFlyerScraper(slug);
  if (!scraper) {
    cache.set(slug, []);
    return [];
  }
  const list = await scraper.findFlyers();
  cache.set(slug, list);
  return list;
}

function pickSource(
  flyer: {
    originalUrl: string;
    title?: string;
    validFrom?: number;
    validUntil?: number;
  },
  candidates: FlyerSourceRef[],
): FlyerSourceRef | null {
  const byUrl = candidates.find((c) => c.originalUrl === flyer.originalUrl);
  if (byUrl) return byUrl;

  const idFromUrl = flyer.originalUrl.match(/\/(\d+)\/?$/)?.[1];
  if (idFromUrl) {
    const byId = candidates.find((c) => c.externalId === idFromUrl);
    if (byId) return byId;
  }

  if (flyer.title) {
    const byTitle = candidates.find((c) => c.title === flyer.title);
    if (byTitle) return byTitle;
  }

  if (flyer.validFrom !== undefined && flyer.validUntil !== undefined) {
    const byDates = candidates.find(
      (c) =>
        c.validFrom === flyer.validFrom && c.validUntil === flyer.validUntil,
    );
    if (byDates) return byDates;
  }

  return null;
}

export async function downloadPending() {
  const pending = await listPendingDownload();
  let downloaded = 0;
  const liveCache = new Map<string, FlyerSourceRef[]>();

  for (const flyer of pending) {
    try {
      await setFlyerStatus(flyer._id, "downloading");
      const sm = await getSupermarket(flyer.supermarketId);
      if (!sm?.slug) throw new Error("Supermarket missing slug");

      const candidates = await resolveSourcesBySlug(sm.slug, liveCache);
      const source = pickSource(flyer, candidates);
      if (!source?.pageUrls?.length) {
        throw new Error(
          `Could not resolve page URLs for flyer ${flyer.title ?? flyer._id}`,
        );
      }

      const scraper = getFlyerScraper(sm.slug);
      if (!scraper) throw new Error(`No scraper for ${sm.slug}`);

      const downloadedFlyer = await scraper.downloadFlyer(source);

      const existing = await findFlyerByHash(downloadedFlyer.fileHash);
      if (existing && existing._id !== flyer._id) {
        flyerLog.info(
          "DOWNLOAD",
          `Duplicate hash of ${existing._id}; marking failed`,
        );
        await setFlyerStatus(flyer._id, "failed");
        await insertFlyerError({
          flyerId: flyer._id,
          supermarketId: flyer.supermarketId,
          stage: "DOWNLOAD",
          message: `Duplicate fileHash of flyer ${existing._id}`,
        });
        continue;
      }

      const cover = downloadedFlyer.pages[0]!;
      const coverStorageId = await uploadBuffer(cover.buffer, cover.contentType);
      const attach = await attachFlyerFile({
        id: flyer._id,
        storageId: coverStorageId,
        fileType: downloadedFlyer.fileType,
        fileSize: downloadedFlyer.fileSize,
        fileHash: downloadedFlyer.fileHash,
      });
      if (attach.duplicateOf) {
        await setFlyerStatus(flyer._id, "failed");
        continue;
      }

      for (const page of downloadedFlyer.pages) {
        const storageId = await uploadBuffer(page.buffer, page.contentType);
        await upsertFlyerPage({
          flyerId: flyer._id,
          pageNumber: page.pageNumber,
          storageId,
        });
      }

      flyerLog.info(
        "DOWNLOAD",
        `Flyer ${flyer._id} (${source.title ?? ""}): ${downloadedFlyer.pages.length} pages stored`,
      );
      downloaded++;
    } catch (err) {
      flyerLog.error("DOWNLOAD", `${flyer._id}: ${String(err)}`);
      await setFlyerStatus(flyer._id, "failed");
      await insertFlyerError({
        flyerId: flyer._id,
        supermarketId: flyer.supermarketId,
        stage: "DOWNLOAD",
        message: String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  }

  await closeSaoLuizBrowser();
  return { downloaded, pending: pending.length };
}

const isMain =
  process.argv[1]?.endsWith("flyer-download.js") ||
  process.argv[1]?.endsWith("flyer-download.ts");

if (isMain) {
  downloadPending()
    .then((result) => {
      flyerLog.info(
        "DOWNLOAD",
        `Done. downloaded=${result.downloaded}/${result.pending}`,
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
