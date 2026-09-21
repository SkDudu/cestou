export const flyerConfig = {
  downloadTimeout: Number(process.env.FLYER_DOWNLOAD_TIMEOUT ?? 30000),
  downloadRetries: Number(process.env.FLYER_DOWNLOAD_RETRIES ?? 3),
  maxSizeMb: Number(process.env.FLYER_MAX_SIZE_MB ?? 50),
  discoveryBeforeExpirationHours: Number(
    process.env.FLYER_DISCOVERY_BEFORE_EXPIRATION_HOURS ?? 24,
  ),
  batchSize: Number(process.env.FLYER_BATCH_SIZE ?? 10),
  concurrency: Number(process.env.FLYER_CONCURRENCY ?? 2),
  allowedHosts: (
    process.env.FLYER_ALLOWED_HOSTS ??
    "mercadapp.com.br,merconnect.mercadapp.com.br,cdn.mercadapp.services,mercadinhossaoluiz.com.br,atacadao.com.br,vtexassets.com,carrefour.com.br,apigw.cloud.carrefour.com.br,assai.com.br,www.assai.com.br,cloudfront.net,grupocenterbox.com.br,adminx.cometasupermercados.com.br,regexsolutions.com.br"
  )
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
  mimoApiKey: process.env.MIMO_API_KEY ?? "",
  mimoBaseUrl: (
    process.env.MIMO_BASE_URL ?? "https://api.xiaomimimo.com/v1"
  ).replace(/\/$/, ""),
  mimoModel: process.env.MIMO_MODEL ?? "mimo-v2.5",
  mimoMaxCompletionTokens: Number(
    process.env.MIMO_MAX_COMPLETION_TOKENS ?? 8192,
  ),
  mimoTimeout: Number(process.env.MIMO_TIMEOUT ?? 120000),
  mimoMaxRetries: Number(process.env.MIMO_MAX_RETRIES ?? 3),
  mimoConcurrency: Number(process.env.MIMO_CONCURRENCY ?? 1),
  aiEnabled: (process.env.FLYER_AI_ENABLED ?? "true") !== "false",
  aiProvider: (process.env.FLYER_AI_PROVIDER ?? "mimo").toLowerCase(),
  aiPromptVersion: process.env.FLYER_AI_PROMPT_VERSION ?? "flyer-offers-v7",
  aiMaxImageEdgePx: Number(process.env.FLYER_AI_MAX_IMAGE_EDGE_PX ?? 2048),

  // Defaults for flow context / supermarket bootstrap
  saoLuizBaseUrl: (
    process.env.SAO_LUIZ_BASE_URL ?? "https://mercadinhossaoluiz.com.br"
  ).replace(/\/$/, ""),
  discoveryCity: process.env.DISCOVERY_CITY ?? "Fortaleza",
  discoveryState: process.env.DISCOVERY_STATE ?? "CE",

  browserHeadless: (process.env.BROWSER_HEADLESS ?? "true") !== "false",
  browserTimeout: Number(process.env.BROWSER_TIMEOUT ?? 30000),
  browserNavigationTimeout: Number(
    process.env.BROWSER_NAVIGATION_TIMEOUT ?? 30000,
  ),
  scraperMaxRetries: Number(process.env.SCRAPER_MAX_RETRIES ?? 3),
  schedulerPollMs: Number(process.env.FLYER_SCHEDULER_POLL_MS ?? 3_600_000),
};

export function assertAllowedUrl(url: string, opts?: { anyHttps?: boolean }) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Only HTTPS allowed: ${url}`);
  }
  if (opts?.anyHttps) return;
  const host = parsed.hostname.toLowerCase();
  const ok = flyerConfig.allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
  if (!ok) {
    throw new Error(`Host not allowlisted: ${host}`);
  }
}
