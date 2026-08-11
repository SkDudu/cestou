import { DemoScraper } from "./demo/index.js";
import { PaoDeAcucarScraper } from "./pao-de-acucar/index.js";
import { SaoLuizScraper } from "./sao-luiz/index.js";
import type { SupermarketScraper } from "./types/index.js";

const registry: Record<string, () => SupermarketScraper> = {
  demo: () => new DemoScraper(),
  "sao-luiz": () => new SaoLuizScraper(),
  "pao-de-acucar": () => new PaoDeAcucarScraper(),
};

export function getScraper(slug: string): SupermarketScraper {
  const factory = registry[slug];
  if (!factory) {
    throw new Error(`Unknown supermarket: ${slug}. Available: ${Object.keys(registry).join(", ")}`);
  }
  return factory();
}

export type { RawProduct, SupermarketScraper } from "./types/index.js";
