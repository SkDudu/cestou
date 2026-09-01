import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import { MimoVisionExtractor } from "./mimo/index.js";
import type {
  FlyerOfferExtractionResult,
  FlyerOfferExtractorName,
} from "../core/flyer-types.js";

export type ExtractorChoice = "auto" | "mimo";

export function parseProviderArg(argv = process.argv): ExtractorChoice {
  const flag = argv.find((a) => a.startsWith("--provider="));
  const value = (flag?.slice("--provider=".length) ?? flyerConfig.aiProvider)
    .toLowerCase();
  if (value === "mimo" || value === "mimo-v2.5") return "mimo";
  return "auto";
}

function canUseMimo(): boolean {
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
  _choice: ExtractorChoice,
): Promise<
  FlyerOfferExtractionResult & {
    status: "ok" | "fallback" | "failed";
    error?: string;
  }
> {
  if (!canUseMimo()) {
    return {
      offers: [],
      rawResponse: "",
      provider: "mimo-v2.5" as FlyerOfferExtractorName,
      latencyMs: 0,
      status: "failed",
      error: "MiMo unavailable",
    };
  }

  try {
    const vision = new MimoVisionExtractor();
    const result = await vision.extractOffers(page);
    const rawN = result.rawCount ?? result.offers.length;
    if (!result.offers.length) {
      if (rawN > 0) {
        return {
          ...result,
          status: "failed",
          error: `guard dropped ${rawN}`,
        };
      }
      return { ...result, status: "ok" };
    }
    return { ...result, status: "ok" };
  } catch (err) {
    const message = String(err);
    flyerLog.info("AI_VISION", `page ${page.pageNumber}: ${message}`);
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
}
