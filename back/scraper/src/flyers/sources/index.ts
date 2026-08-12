import type { FlyerScraper } from "../core/flyer-types.js";
import { SaoLuizFlyerScraper } from "./sao-luiz/scraper.js";

const registry: Record<string, () => FlyerScraper> = {
  "sao-luiz": () => new SaoLuizFlyerScraper(),
};

export function getFlyerScraper(slug: string): FlyerScraper | null {
  const factory = registry[slug];
  return factory ? factory() : null;
}

export function listFlyerScraperSlugs(): string[] {
  return Object.keys(registry);
}
