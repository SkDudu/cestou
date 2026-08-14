import { chromium, type Browser } from "playwright";
import { flyerLog } from "./flyer-logger.js";

/** Render PDF pages to JPEG via Chromium + pdf.js (no extra native deps). */
export async function rasterizePdf(
  pdf: Buffer,
  browser?: Browser,
): Promise<Array<{ buffer: Buffer; contentType: string }>> {
  const owned = !browser;
  const br = browser ?? (await chromium.launch({ headless: true }));
  try {
    const page = await br.newPage({ viewport: { width: 1200, height: 1600 } });
    page.setDefaultTimeout(90_000);
    const dataUrls = await page.evaluate(
      async ({
        b64,
        maxPages,
        scale,
      }: {
        b64: string;
        maxPages: number;
        scale: number;
      }) => {
        const pdfjsMod = await (
          Function("u", "return import(u)") as (u: string) => Promise<{
            getDocument: (args: { data: Uint8Array }) => {
              promise: Promise<{
                numPages: number;
                getPage: (n: number) => Promise<{
                  getViewport: (o: { scale: number }) => {
                    width: number;
                    height: number;
                  };
                  render: (o: {
                    canvasContext: CanvasRenderingContext2D;
                    viewport: { width: number; height: number };
                  }) => { promise: Promise<void> };
                }>;
              }>;
            };
            GlobalWorkerOptions: { workerSrc: string };
          }>
        )("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs");
        pdfjsMod.GlobalWorkerOptions.workerSrc =
          "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs";
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const doc = await pdfjsMod.getDocument({ data: bytes }).promise;
        const n = Math.min(doc.numPages, maxPages);
        const out: string[] = [];
        for (let i = 1; i <= n; i++) {
          const p = await doc.getPage(i);
          const viewport = p.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await p.render({ canvasContext: ctx, viewport }).promise;
          out.push(canvas.toDataURL("image/jpeg", 0.82));
        }
        return out;
      },
      { b64: pdf.toString("base64"), maxPages: 24, scale: 1.6 },
    );
    await page.close();
    const pages = dataUrls.map((u) => ({
      buffer: Buffer.from(u.slice(u.indexOf(",") + 1), "base64"),
      contentType: "image/jpeg",
    }));
    flyerLog.info("DOWNLOAD", `PDF rasterized → ${pages.length} jpeg page(s)`);
    return pages;
  } finally {
    if (owned) await br.close().catch(() => undefined);
  }
}
