import { createHash } from "node:crypto";

const ALLOWED_HOST_SUFFIXES = [
  "mercadinhossaoluiz.com.br",
  "paodeacucar.com",
  "static.paodeacucar.com",
  "atacadao.com.br",
  "atacadaobr.vteximg.com.br",
  "vteximg.com.br",
  "vtexassets.com",
];

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const MAX_BYTES = Number(process.env.IMAGE_MAX_SIZE_MB ?? 5) * 1024 * 1024;
const TIMEOUT_MS = Number(process.env.IMAGE_DOWNLOAD_TIMEOUT ?? 15_000);
const RETRIES = Number(process.env.IMAGE_DOWNLOAD_RETRIES ?? 3);

export type DownloadedImage = {
  bytes: Buffer;
  contentType: string;
  hash: string;
  size: number;
};

function hostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.endsWith(".local")
  ) {
    return false;
  }
  // block obvious private IP literals
  if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h)) {
    return false;
  }
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

function sniffType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46
  ) {
    return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function assertSafeImageUrl(urlStr: string): URL {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error("invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL protocol not allowed");
  }
  if (!hostAllowed(url.hostname)) {
    throw new Error(`domain not allowed: ${url.hostname}`);
  }
  return url;
}

export async function downloadImage(urlStr: string): Promise<DownloadedImage> {
  const url = assertSafeImageUrl(urlStr);
  let lastErr: unknown;

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          referer: "https://www.atacadao.com.br/",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
      });

      if (res.status === 403 || res.status === 429) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_BYTES) throw new Error("file too large");

      const ab = await res.arrayBuffer();
      const bytes = Buffer.from(ab);
      if (bytes.length > MAX_BYTES) throw new Error("file too large");
      if (bytes.length < 24) throw new Error("file too small");

      const sniffed = sniffType(bytes);
      const headerType = (res.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();

      const contentType = sniffed ?? headerType;
      if (!contentType || !ALLOWED_TYPES.has(contentType)) {
        throw new Error(`invalid content-type: ${contentType || "unknown"}`);
      }
      if (!sniffed) throw new Error("magic bytes not an image");

      const hash = createHash("sha256").update(bytes).digest("hex");
      return { bytes, contentType: sniffed, hash, size: bytes.length };
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
