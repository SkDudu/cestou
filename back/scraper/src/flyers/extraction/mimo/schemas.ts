import { parseJsonObject } from "../json-parse.js";
import { guardOffers } from "../offer-guards.js";
import type { ParsedOffer } from "../../core/flyer-types.js";

export function parseMimoOffers(
  raw: string,
  pageNumber: number,
): {
  offers: ParsedOffer[];
  confidence?: number;
  validFrom?: string;
  validUntil?: string;
} {
  const parsed = parseJsonObject(raw) as {
    offers?: unknown;
    confidence?: unknown;
    validFrom?: unknown;
    validUntil?: unknown;
  };
  if (!Array.isArray(parsed.offers)) {
    throw new Error("MiMo JSON missing offers array");
  }
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? parsed.confidence
      : undefined;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() && v !== "null" ? v.trim() : undefined;
  return {
    offers: guardOffers(parsed.offers, pageNumber),
    confidence,
    validFrom: str(parsed.validFrom),
    validUntil: str(parsed.validUntil),
  };
}
