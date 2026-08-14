import { TesseractOCR } from "./ocr.js";
import { parseOffersFromText } from "./offer-parser.js";
import type {
  FlyerOfferExtractor,
  FlyerOfferExtractionResult,
} from "../core/flyer-types.js";

export class TesseractRulesExtractor implements FlyerOfferExtractor {
  readonly name = "tesseract-rules" as const;
  private ocr = new TesseractOCR();

  async extractOffers(page: {
    flyerId: string;
    pageNumber: number;
    imageUrl?: string;
    imageBuffer?: Buffer;
    contentType?: string;
  }): Promise<FlyerOfferExtractionResult> {
    if (!page.imageBuffer) {
      throw new Error("Tesseract needs imageBuffer");
    }
    const started = Date.now();
    const result = await this.ocr.extractText({
      pageNumber: page.pageNumber,
      buffer: page.imageBuffer,
    });
    const offers = parseOffersFromText(
      result.text,
      page.pageNumber,
      result.confidence,
    );
    return {
      offers,
      rawResponse: result.text,
      provider: this.name,
      model: "tesseract.js",
      latencyMs: Date.now() - started,
    };
  }
}
