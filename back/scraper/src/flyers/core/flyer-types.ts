export type FlyerSourceType = "pdf" | "image" | "web" | "dynamic";

export type FlyerSourceRef = {
  supermarketSlug: string;
  sourceUrl: string;
  type: FlyerSourceType;
  /** External identifier from provider (e.g. flipbook id) */
  externalId?: string;
  title?: string;
  originalUrl: string;
  pageUrls?: string[];
  validFrom?: number;
  validUntil?: number;
};

export type DownloadedPage = {
  pageNumber: number;
  buffer: Buffer;
  contentType: string;
  url: string;
};

export type DownloadedFlyer = {
  source: FlyerSourceRef;
  pages: DownloadedPage[];
  /** Combined hash of all page bytes */
  fileHash: string;
  fileType: string;
  fileSize: number;
};

export type FlyerMetadata = {
  title?: string;
  validFrom?: number;
  validUntil?: number;
};

export type OCRResult = {
  text: string;
  confidence?: number;
  pageNumber: number;
};

export interface FlyerOCR {
  extractText(page: {
    pageNumber: number;
    buffer: Buffer;
  }): Promise<OCRResult>;
}

export type ParsedOffer = {
  name: string;
  brand?: string;
  quantity?: string;
  unit?: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  pageNumber?: number;
  rawText?: string;
  extractionConfidence?: number;
};

export type FlyerOfferExtractorName = "mimo-v2.5" | "tesseract-rules";

export type FlyerOfferExtractionResult = {
  offers: ParsedOffer[];
  rawResponse: string;
  provider: FlyerOfferExtractorName;
  model?: string;
  latencyMs: number;
  pageConfidence?: number;
  validFrom?: string;
  validUntil?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export interface FlyerOfferExtractor {
  readonly name: FlyerOfferExtractorName;
  extractOffers(page: {
    flyerId: string;
    pageNumber: number;
    imageUrl?: string;
    imageBuffer?: Buffer;
    contentType?: string;
  }): Promise<FlyerOfferExtractionResult>;
}
