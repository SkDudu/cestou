import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import { MimoVisionExtractor } from "./mimo/index.js";
import { TesseractRulesExtractor } from "./tesseract-extractor.js";
import type {
  FlyerOfferExtractionResult,
  FlyerOfferExtractorName,
} from "../core/flyer-types.js";

export type ExtractorChoice = "auto" | "mimo" | "tesseract";

export function parseProviderArg(argv = process.argv): ExtractorChoice {
  const flag = argv.find((a) => a.startsWith("--provider="));
  const value = (flag?.slice("--provider=".length) ?? flyerConfig.aiProvider)
    .toLowerCase();
  if (value === "tesseract") return "tesseract";
  if (value === "mimo" || value === "mimo-v2.5") return "mimo";
  return "auto";
}

function canUseMimo(choice: ExtractorChoice): boolean {
  if (choice === "tesseract") return false;
  if (!flyerConfig.aiEnabled) return false;
  if (!flyerConfig.mimoApiKey) return false;
  return true;
}

export async function extractPageOffers(
  page: {
    flyerId: string;
    pageNumber: number;
    imageUrl?: string;
    imageBuffer?: Buffer;
    contentType?: string;
  },
  choice: ExtractorChoice,
): Promise<
  FlyerOfferExtractionResult & {
    status: "ok" | "fallback" | "failed";
    error?: string;
  }
> {
  const tesseract = new TesseractRulesExtractor();
  const tryAi = canUseMimo(choice);

  if (!tryAi) {
    if (!flyerConfig.ocrEnabled) {
      return {
        offers: [],
        rawResponse: "",
        provider: "tesseract-rules",
        latencyMs: 0,
        status: "failed",
        error: "AI disabled and FLYER_OCR_ENABLED=false",
      };
    }
    if (choice === "mimo" && !flyerConfig.mimoApiKey) {
      flyerLog.info("AI_FALLBACK", "MIMO_API_KEY missing — Tesseract");
    } else if (!flyerConfig.aiEnabled) {
      flyerLog.info("AI_FALLBACK", "FLYER_AI_ENABLED=false — Tesseract");
    }
    const result = await tesseract.extractOffers(page);
    return { ...result, status: "ok" };
  }

  try {
    const vision = new MimoVisionExtractor();
    const result = await vision.extractOffers(page);
    if (!result.offers.length && flyerConfig.aiFallbackOnEmpty) {
      flyerLog.info(
        "AI_FALLBACK",
        `page ${page.pageNumber}: empty MiMo list`,
      );
      if (!flyerConfig.ocrEnabled) {
        return { ...result, status: "failed", error: "MiMo returned no offers" };
      }
      const fallback = await tesseract.extractOffers(page);
      return {
        ...fallback,
        status: "fallback",
        error: "MiMo returned no offers",
      };
    }
    return { ...result, status: "ok" };
  } catch (err) {
    const message = String(err);
    flyerLog.info("AI_FALLBACK", `page ${page.pageNumber}: ${message}`);
    if (!flyerConfig.ocrEnabled) {
      return {
        offers: [],
        rawResponse: "",
        provider: "mimo-v2.5" as FlyerOfferExtractorName,
        model: flyerConfig.mimoModel,
        latencyMs: 0,
        status: "failed",
        error: message,
      };
    }
    try {
      const fallback = await tesseract.extractOffers(page);
      return { ...fallback, status: "fallback", error: message };
    } catch (ocrErr) {
      return {
        offers: [],
        rawResponse: "",
        provider: "mimo-v2.5" as FlyerOfferExtractorName,
        model: flyerConfig.mimoModel,
        latencyMs: 0,
        status: "failed",
        error: `${message}; OCR: ${String(ocrErr)}`,
      };
    }
  }
}
