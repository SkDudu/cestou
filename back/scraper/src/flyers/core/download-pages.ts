import { downloadUrl, sha256, detectContentType } from "../core/flyer-downloader.js";
import { rasterizePdf } from "../core/pdf-raster.js";
import type { DownloadedFlyer, FlyerSourceRef } from "../core/flyer-types.js";

/** Download pages from explicit URLs (no live scraper lookup). PDFs → JPEG pages. */
export async function downloadFromPageUrls(
  source: FlyerSourceRef,
): Promise<DownloadedFlyer> {
  const urls = source.pageUrls ?? [];
  if (!urls.length) throw new Error("No pageUrls");

  const pages: DownloadedFlyer["pages"] = [];
  const hashParts: Buffer[] = [];
  let totalSize = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    const { buffer, contentType } = await downloadUrl(url, { anyHttps: true });
    const detected = detectContentType(buffer) ?? contentType;
    if (detected === "application/pdf") {
      const raster = await rasterizePdf(buffer);
      if (!raster.length) throw new Error(`PDF had no renderable pages: ${url}`);
      for (const img of raster) {
        pages.push({
          pageNumber: pages.length + 1,
          buffer: img.buffer,
          contentType: img.contentType,
          url,
        });
        hashParts.push(img.buffer);
        totalSize += img.buffer.length;
      }
      continue;
    }
    pages.push({
      pageNumber: pages.length + 1,
      buffer,
      contentType: detected,
      url,
    });
    hashParts.push(buffer);
    totalSize += buffer.length;
  }

  return {
    source,
    pages,
    fileHash: sha256(Buffer.concat(hashParts)),
    fileType: pages[0]?.contentType ?? "image/jpeg",
    fileSize: totalSize,
  };
}
