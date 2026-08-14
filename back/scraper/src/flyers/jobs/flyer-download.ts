import { downloadFromPageUrls } from "../core/download-pages.js";
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

export async function downloadPending(opts?: {
  supermarketId?: string;
  flyerIds?: string[];
}) {
  let pending = await listPendingDownload();
  if (opts?.supermarketId) {
    pending = pending.filter(
      (f: { supermarketId: string }) => f.supermarketId === opts.supermarketId,
    );
  }
  if (opts?.flyerIds?.length) {
    const set = new Set(opts.flyerIds);
    pending = pending.filter((f: { _id: string }) => set.has(f._id));
  }
  let downloaded = 0;

  for (const flyer of pending) {
    try {
      await setFlyerStatus(flyer._id, "downloading");
      const sm = await getSupermarket(flyer.supermarketId);
      if (!sm?.slug) throw new Error("Supermarket missing slug");

      const storedPages = (flyer as { pageUrls?: string[] }).pageUrls;
      if (!storedPages?.length) {
        throw new Error(
          `Flyer ${flyer.title ?? flyer._id} has no pageUrls — re-run discover-flyer in Flow Builder`,
        );
      }

      const downloadedFlyer = await downloadFromPageUrls({
        supermarketSlug: sm.slug,
        sourceUrl: flyer.originalUrl,
        type: "image",
        title: flyer.title,
        originalUrl: flyer.originalUrl,
        pageUrls: storedPages,
      });

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
        `Flyer ${flyer._id} (${flyer.title ?? downloadedFlyer.source.title ?? ""}): ${downloadedFlyer.pages.length} pages stored`,
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
