import type { BrowserContextOptions } from "playwright";

export function buildContextOptions(): BrowserContextOptions {
  return {
    viewport: { width: 1280, height: 720 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
  };
}
