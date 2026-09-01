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

function isPdfCap(c: CapturedPage): boolean {
  return (
    c.contentType.includes("pdf") ||
    (c.buffer.length >= 5 && c.buffer.subarray(0, 5).toString("latin1") === "%PDF-")
  );
}

function looksPdfUrl(u: string): boolean {
  return /\.pdf(\?|#|$)/i.test(u);
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

  const captured = opts?.capturedPages ?? [];
  const pdfCaps = captured.filter(isPdfCap);
  const pdfUrls = (source.pageUrls ?? []).filter(
    (u) => looksPdfUrl(u) && !u.startsWith("capture://") && !u.startsWith("blob:"),
  );

  // ponytail: real PDF file beats a 1-page canvas screenshot of the viewer
  if (pdfCaps.length) {
    for (let i = 0; i < pdfCaps.length; i++) {
      const cap = pdfCaps[i]!;
      totalSize += await appendPage(
        pages,
        hashParts,
        cap.buffer,
        cap.contentType,
        cap.url ?? `capture://pdf-${i}`,
      );
    }
  } else if (pdfUrls.length) {
    for (const url of pdfUrls) {
      const { buffer, contentType } = opts?.fetchPage
        ? await opts.fetchPage(url)
        : await downloadUrl(url, { anyHttps: true });
      totalSize += await appendPage(pages, hashParts, buffer, contentType, url);
    }
  } else if (captured.length) {
    for (let i = 0; i < captured.length; i++) {
      const cap = captured[i]!;
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
