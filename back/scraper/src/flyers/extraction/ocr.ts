import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWorker, PSM } from "tesseract.js";
import type { FlyerOCR, OCRResult } from "../core/flyer-types.js";
import { flyerLog } from "../core/flyer-logger.js";

const execFileAsync = promisify(execFile);

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("por");
      // Sparse text / mixed layout common in supermarket flyers
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
      });
      return worker;
    })();
  }
  return workerPromise;
}

/** Downscale less aggressively — keep prices readable (max edge 2800). */
async function maybeDownscale(buffer: Buffer): Promise<Buffer> {
  if (process.platform !== "darwin") return buffer;
  if (buffer.length < 400_000) return buffer;
  const dir = await mkdtemp(join(tmpdir(), "flyer-ocr-"));
  const input = join(dir, "in.jpg");
  const output = join(dir, "out.jpg");
  try {
    await writeFile(input, buffer);
    await execFileAsync("sips", ["-Z", "2800", input, "--out", output]);
    return await readFile(output);
  } catch {
    return buffer;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export class TesseractOCR implements FlyerOCR {
  async extractText(page: {
    pageNumber: number;
    buffer: Buffer;
  }): Promise<OCRResult> {
    flyerLog.info("OCR", `Page ${page.pageNumber}`);
    const worker = await getWorker();
    const input = await maybeDownscale(page.buffer);
    const result = await worker.recognize(input);
    const confidence =
      typeof result.data.confidence === "number"
        ? result.data.confidence / 100
        : undefined;
    return {
      text: result.data.text ?? "",
      confidence,
      pageNumber: page.pageNumber,
    };
  }
}

export async function terminateOcr() {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}
