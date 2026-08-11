function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

function allOrValue(key: string): string | undefined {
  const v = process.env[key];
  if (!v || v === "all") return undefined;
  return v;
}

/** Runtime env — sem lista de produtos (SPEC 003). */
export const scraperConfig = {
  convexUrl: process.env.CONVEX_URL ?? "",
  headless: bool("SCRAPER_HEADLESS", true),
  timeout: Number(process.env.SCRAPER_TIMEOUT ?? 60_000),
  maxProducts: Number(process.env.SCRAPER_MAX_PRODUCTS ?? 100),
  delayMs: Number(process.env.SCRAPER_DELAY_MS ?? 1000),
  supermarket: process.env.SCRAPER_SUPERMARKET ?? "sao-luiz",
  logLevel: process.env.LOG_LEVEL ?? "info",
  /** env filter; CLI args override in main */
  category: allOrValue("SCRAPER_CATEGORY"),
  priority: (() => {
    const v = allOrValue("SCRAPER_PRIORITY");
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  })(),
};

/** @deprecated use scraperConfig — kept for scrapers/* imports */
export const config = {
  get convexUrl() {
    return scraperConfig.convexUrl;
  },
  get headless() {
    return scraperConfig.headless;
  },
  get timeout() {
    return scraperConfig.timeout;
  },
  get maxProducts() {
    return scraperConfig.maxProducts;
  },
  get supermarket() {
    return scraperConfig.supermarket;
  },
  get logLevel() {
    return scraperConfig.logLevel;
  },
  get delayMs() {
    return scraperConfig.delayMs;
  },
};

export { scraperConfig as default };
