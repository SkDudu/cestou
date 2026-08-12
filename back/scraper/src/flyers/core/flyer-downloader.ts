import { createHash } from "node:crypto";
import { assertAllowedUrl, flyerConfig } from "./flyer-config.js";
import { flyerLog } from "./flyer-logger.js";

const MAGIC: Array<{ type: string; bytes: number[] }> = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
  { type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
];

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function detectContentType(buffer: Buffer): string | null {
  for (const m of MAGIC) {
    if (m.bytes.every((b, i) => buffer[i] === b)) return m.type;
  }
  return null;
}

export function validateBuffer(buffer: Buffer, contentTypeHint?: string) {
  if (!buffer.length) throw new Error("Empty file");
  const max = flyerConfig.maxSizeMb * 1024 * 1024;
  if (buffer.length > max) {
    throw new Error(`File too large: ${buffer.length} > ${max}`);
  }
  const detected = detectContentType(buffer);
  if (!detected) throw new Error("Unrecognized file magic bytes");
  if (
    contentTypeHint &&
    !contentTypeHint.includes("octet-stream") &&
    !contentTypeHint.includes(detected.split("/")[1]!) &&
    contentTypeHint !== detected
  ) {
    flyerLog.debug(
      "DOWNLOAD",
      `Content-Type hint mismatch: ${contentTypeHint} vs ${detected}`,
    );
  }
  return detected;
}

export async function downloadUrl(url: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  assertAllowedUrl(url);
  const max = flyerConfig.maxSizeMb * 1024 * 1024;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= flyerConfig.downloadRetries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(
        () => ctrl.abort(),
        flyerConfig.downloadTimeout,
      );
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > max) throw new Error(`Content-Length too large: ${len}`);

      const ab = await res.arrayBuffer();
      const buffer = Buffer.from(ab);
      const detected = validateBuffer(
        buffer,
        res.headers.get("content-type") ?? undefined,
      );
      return { buffer, contentType: detected };
    } catch (err) {
      lastErr = err;
      flyerLog.error(
        "DOWNLOAD",
        `Attempt ${attempt}/${flyerConfig.downloadRetries}: ${String(err)}`,
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
