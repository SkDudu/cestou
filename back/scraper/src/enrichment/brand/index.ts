import type { NormalizedProduct } from "../../scrapers/types/index.js";
import {
  createBrandDictionary,
  type BrandDictionary,
} from "./dictionary.js";
import {
  BRAND_ENRICHMENT_VERSION,
  extractBrand,
  type BrandExtractionResult,
  type BrandSource,
} from "./extract.js";

export type EnrichedProduct = NormalizedProduct & {
  brandSource?: BrandSource;
  brandConfidence?: number;
  brandMatchedText?: string;
};

let sharedDict: BrandDictionary | null = null;

export function getBrandDictionary(extra: string[] = []): BrandDictionary {
  if (!sharedDict) sharedDict = createBrandDictionary(extra);
  else if (extra.length) sharedDict.mergeFromList(extra);
  return sharedDict;
}

export function resetBrandDictionary(): void {
  sharedDict = null;
}

/** Apply brand enrichment onto a normalized product. */
export function enrichBrand(
  product: NormalizedProduct,
  dict: BrandDictionary = getBrandDictionary(),
): { product: EnrichedProduct; extraction: BrandExtractionResult } {
  const extraction = extractBrand(product.name, product.brand, dict);
  const next: EnrichedProduct = {
    ...product,
    brand: extraction.brand ?? product.brand,
    brandSource: extraction.source === "none" ? undefined : extraction.source,
    brandConfidence:
      extraction.source === "none" ? undefined : extraction.confidence,
    brandMatchedText: extraction.matchedText,
  };
  return { product: next, extraction };
}

export {
  BRAND_ENRICHMENT_VERSION,
  createBrandDictionary,
  extractBrand,
  type BrandDictionary,
  type BrandExtractionResult,
  type BrandSource,
};
