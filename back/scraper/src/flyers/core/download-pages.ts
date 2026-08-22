import {
  downloadUrl,
  sha256,
  detectContentType,
  validateBuffer,
} from "../core/flyer-downloader.js";
import { rasterizePdf } from "../core/pdf-raster.js";
import type { DownloadedFlyer, FlyerSourceRef } from "../core/flyer-types.js";

export type PageFetch = (url: string) => Promise<{
  buffer: Buffer;
  contentType: string;
}>;

export type CapturedPage = {
  buffer: Buffer;
  contentType: string;
  url?: string;
};

async function appendPage(
  pages: DownloadedFlyer["pages"],
  hashParts: Buffer[],
  buffer: Buffer,
  contentTypeHint: string,
  url: string,
): Promise<number> {
  const detected = detectContentType(buffer) ?? contentTypeHint;
  if (detected === "application/pdf") {
    const raster = await rasterizePdf(buffer);
    if (!raster.length) throw new Error(`PDF had no renderable pages: ${url}`);
    let size = 0;
    for (const img of raster) {
      pages.push({
        pageNumber: pages.length + 1,
        buffer: img.buffer,
        contentType: img.contentType,
        url,
      });
      hashParts.push(img.buffer);
      size += img.buffer.length;
    }
    return size;
  }
  validateBuffer(buffer, detected);
  pages.push({
    pageNumber: pages.length + 1,
    buffer,
    contentType: detected,
    url,
  });
  hashParts.push(buffer);
  return buffer.length;
}

/** Download pages from buffers and/or URLs. PDFs → JPEG pages. */
export async function downloadFromPageUrls(
  source: FlyerSourceRef,
  opts?: {
    fetchPage?: PageFetch;
    capturedPages?: CapturedPage[];
  },
): Promise<DownloadedFlyer> {
  const pages: DownloadedFlyer["pages"] = [];
  const hashParts: Buffer[] = [];
  let totalSize = 0;

  if (opts?.capturedPages?.length) {
    for (let i = 0; i < opts.capturedPages.length; i++) {
      const cap = opts.capturedPages[i]!;
      const url = cap.url ?? `capture://${i}`;
      totalSize += await appendPage(
        pages,
        hashParts,
        cap.buffer,
        cap.contentType,
        url,
      );
    }
  } else {
    const urls = (source.pageUrls ?? []).filter((u) => !u.startsWith("capture://"));
    if (!urls.length) throw new Error("No pageUrls");
    for (const url of urls) {
      const { buffer, contentType } = opts?.fetchPage
        ? await opts.fetchPage(url)
        : await downloadUrl(url, { anyHttps: true });
      totalSize += await appendPage(
        pages,
        hashParts,
        buffer,
        contentType,
        url,
      );
    }
  }

  if (!pages.length) throw new Error("Empty file");

  return {
    source,
    pages,
    fileHash: sha256(Buffer.concat(hashParts)),
    fileType: pages[0]?.contentType ?? "image/jpeg",
    fileSize: totalSize,
  };
}
