export interface RawProduct {
  externalId?: string;
  name: string;
  brand?: string;
  price: number;
  originalPrice?: number;
  url?: string;
  imageUrl?: string;
  quantity?: number;
  unit?: string;
  source: string;
  collectedAt: string;
  rawData?: unknown;
}

export interface NormalizedProduct {
  name: string;
  normalizedName: string;
  brand?: string;
  brandSource?: string;
  brandConfidence?: number;
  brandMatchedText?: string;
  price: number;
  originalPrice?: number;
  quantity?: number;
  unit?: string;
  url?: string;
  imageUrl?: string;
  externalId?: string;
  source: string;
  collectedAt: string;
}

export interface SupermarketScraper {
  name: string;
  slug: string;
  website?: string;
  search(
    query: string,
    opts?: { maxProducts?: number },
  ): Promise<RawProduct[]>;
  getProduct?(url: string): Promise<RawProduct>;
  close?(): Promise<void>;
}
