export const flyerConfig = {
  convexUrl: process.env.CONVEX_URL ?? "",
  downloadTimeout: Number(process.env.FLYER_DOWNLOAD_TIMEOUT ?? 30000),
  downloadRetries: Number(process.env.FLYER_DOWNLOAD_RETRIES ?? 3),
  maxSizeMb: Number(process.env.FLYER_MAX_SIZE_MB ?? 50),
  discoveryBeforeExpirationHours: Number(
    process.env.FLYER_DISCOVERY_BEFORE_EXPIRATION_HOURS ?? 24,
  ),
  ocrEnabled: (process.env.FLYER_OCR_ENABLED ?? "true") !== "false",
  batchSize: Number(process.env.FLYER_BATCH_SIZE ?? 10),
  concurrency: Number(process.env.FLYER_CONCURRENCY ?? 2),
  allowedHosts: (
    process.env.FLYER_ALLOWED_HOSTS ??
    "mercadapp.com.br,merconnect.mercadapp.com.br,cdn.mercadapp.services,mercadinhossaoluiz.com.br"
  )
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
};

export function assertAllowedUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Only HTTPS allowed: ${url}`);
  }
  const host = parsed.hostname.toLowerCase();
  const ok = flyerConfig.allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
  if (!ok) {
    throw new Error(`Host not allowlisted: ${host}`);
  }
}
