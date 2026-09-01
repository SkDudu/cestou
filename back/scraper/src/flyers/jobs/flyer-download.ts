import { downloadFromPageUrls } from "../core/download-pages.js";
import {
  attachFlyerFile,
  findFlyerByHash,
  getSupermarket,
  insertFlyerError,
  listPendingDownload,
  markExpired,
  setFlyerStatus,
  uploadBuffer,
  upsertFlyerPage,
} from "../core/flyer-storage.js";
import { flyerLog } from "../core/flyer-logger.js";
import { extractSkipReason } from "../core/validity.js";
import { flyerConfig } from "../core/flyer-config.js";

export async function downloadPending(opts?: {
  supermarketId?: string;
  flyerIds?: string[];
  onLog?: (line: string) => void;
  fetchPage?: (url: string) => Promise<{ buffer: Buffer; contentType: string }>;
  capturedPages?: Map<
    string,
    Array<{ buffer: Buffer; contentType: string; url?: string }>
  >;
}) {
  const say = (msg: string) => {
    flyerLog.info("DOWNLOAD", msg);
    opts?.onLog?.(`[DOWNLOAD] ${msg}`);
  };

  const expired = (await markExpired()) as { expired?: number };
  if (expired.expired) {
    say(`marcou expired=${expired.expired} (validUntil < now)`);
  }

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
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;

  say(`fila: ${pending.length} flyer(s) pendente(s)`);
  if (!pending.length) {
    say("nada pra baixar");
    return { downloaded: 0, pending: 0, duplicates: 0, skipped: 0, failed: 0 };
  }

  for (let i = 0; i < pending.length; i++) {
    const flyer = pending[i]!;
    const label = flyer.title ?? flyer._id;
    const progress = `${i + 1}/${pending.length}`;
    try {
      const windowMs =
        flyerConfig.discoveryBeforeExpirationHours * 60 * 60 * 1000;
      const skipWhy = extractSkipReason(
        flyer as { validFrom?: number; validUntil?: number },
        Date.now(),
        windowMs,
      );
      if (skipWhy) {
        say(`${progress} skip (${skipWhy}) — ${label}`);
        if (skipWhy === "validUntil expirado") {
          await setFlyerStatus(flyer._id, "expired");
        }
        skipped++;
        continue;
      }
      if ((flyer as { storageId?: string }).storageId) {
        say(`${progress} skip já no storage — ${label}`);
        await setFlyerStatus(flyer._id, "downloaded");
        duplicates++;
        continue;
      }
      await setFlyerStatus(flyer._id, "downloading");
      say(`${progress} baixando — ${label}`);
      const sm = await getSupermarket(flyer.supermarketId);
      if (!sm?.slug) throw new Error("Supermarket missing slug");

      const storedPages = (flyer as { pageUrls?: string[] }).pageUrls;
      const captured = opts?.capturedPages?.get(flyer._id);
      if (!captured?.length && !storedPages?.length) {
        throw new Error(
          `Flyer ${flyer.title ?? flyer._id} has no pageUrls — re-run discover-flyer in Flow Builder`,
        );
      }
      say(
        `${progress} ${captured?.length ? `${captured.length} buf` : `${storedPages!.length} página(s)`} → download…`,
      );

      const downloadedFlyer = await downloadFromPageUrls(
        {
          supermarketSlug: sm.slug,
          sourceUrl: flyer.originalUrl,
          type: "image",
          title: flyer.title,
          originalUrl: flyer.originalUrl,
          pageUrls: storedPages,
        },
        {
          fetchPage: opts?.fetchPage,
          capturedPages: captured,
        },
      );

      const existing = await findFlyerByHash(
        flyer.supermarketId,
        downloadedFlyer.fileHash,
      );
      if (existing && existing._id !== flyer._id) {
        say(`${progress} skip duplicata hash de ${existing._id} — ${label}`);
        await setFlyerStatus(flyer._id, "duplicate");
        duplicates++;
        continue;
      }

      say(
        `${progress} enviando ${downloadedFlyer.pages.length} página(s) pro storage…`,
      );
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
        say(
          `${progress} skip duplicata attach de ${attach.duplicateOf} — ${label}`,
        );
        await setFlyerStatus(flyer._id, "duplicate");
        duplicates++;
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

      say(
        `${progress} ✓ enviado — ${label} (${downloadedFlyer.pages.length} págs)`,
      );
      downloaded++;
    } catch (err) {
      flyerLog.error("DOWNLOAD", `${flyer._id}: ${String(err)}`);
      opts?.onLog?.(`[DOWNLOAD] ${progress} ✕ ${label}: ${String(err)}`);
      failed++;
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

  say(
    `fim: baixados ${downloaded}/${pending.length} dup=${duplicates} skip=${skipped} fail=${failed}`,
  );
  return {
    downloaded,
    pending: pending.length,
    duplicates,
    skipped,
    failed,
  };
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
