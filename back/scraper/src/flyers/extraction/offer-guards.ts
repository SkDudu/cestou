import {
  nameDedupeKey,
  normalizeUnit,
  sanitizeName,
  stripUnknown,
  titleCaseBrand,
} from "./text-normalizer.js";
import type { ParsedOffer } from "../core/flyer-types.js";
import { resolveEligibility } from "./eligibility.js";
import {
  asInstallmentCount,
  asInterestFree,
  shapePayment,
} from "./payment.js";

function discountPct(original: number, price: number): number {
  const o = Math.round(original * 100);
  const p = Math.round(price * 100);
  if (o <= 0 || p >= o) return 0;
  return Math.round(((o - p) / o) * 10000) / 100;
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const t = value.replace(/R\$/gi, "").trim();
  if (!t) return undefined;
  if (t.includes(",")) {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function guardOffers(
  raw: unknown[],
  pageNumber: number,
): ParsedOffer[] {
  const seen = new Set<string>();
  const out: ParsedOffer[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = sanitizeName(stripUnknown(rec.name) ?? "");
    if (name.length < 3 || /^\d+$/.test(name)) continue;

    const rawPrice = toNumber(rec.price);

    const quantity = stripUnknown(rec.quantity);
    const unitRaw = stripUnknown(rec.unit);
    const unit = unitRaw ? normalizeUnit(unitRaw) : undefined;
    const brandRaw = stripUnknown(rec.brand);
    const brand = brandRaw ? titleCaseBrand(brandRaw) : undefined;

    const haystack = [
      name,
      typeof rec.evidence === "object" && rec.evidence
        ? JSON.stringify(rec.evidence)
        : "",
      typeof rec.conditions === "object" ? JSON.stringify(rec.conditions) : "",
      typeof rec.cashPrice === "string" ? rec.cashPrice : "",
    ].join(" ");

    const pay = shapePayment({
      price: rawPrice,
      cashPrice: toNumber(rec.cashPrice),
      originalPrice: toNumber(rec.originalPrice),
      installmentCount: asInstallmentCount(rec.installmentCount),
      installmentAmount: toNumber(rec.installmentAmount),
      installmentInterestFree: asInterestFree(
        rec.installmentInterestFree,
        haystack,
      ),
      haystack,
    });
    if (!pay) continue;

    // ponytail: same SKU two prices (cash vs Nx) = 1 row
    const key = `${nameDedupeKey(name)}|${nameDedupeKey(brand ?? "")}|${quantity ?? ""}|${unit ?? ""}|${pageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const elig = resolveEligibility({
      haystack,
      pageNumber,
      ai: {
        eligibility: rec.eligibility,
        conditions: rec.conditions,
        confidence: rec.confidence,
        evidence: rec.evidence,
      },
    });

    out.push({
      name: name.slice(0, 200),
      brand,
      quantity,
      unit,
      price: pay.price,
      originalPrice: pay.originalPrice,
      cashPrice: pay.cashPrice,
      installmentCount: pay.installmentCount,
      installmentAmount: pay.installmentAmount,
      installmentInterestFree: pay.installmentInterestFree,
      discountPercentage:
        pay.originalPrice !== undefined
          ? discountPct(pay.originalPrice, pay.price)
          : undefined,
      pageNumber,
      rawText: JSON.stringify({
        name,
        price: pay.price,
        originalPrice: pay.originalPrice,
        cashPrice: pay.cashPrice,
        installmentCount: pay.installmentCount,
        installmentAmount: pay.installmentAmount,
        quantity,
        brand,
        eligibility: elig.eligibility,
        evidence: elig.eligibilityEvidence?.text,
      }).slice(0, 1000),
      extractionConfidence: toNumber(rec.confidence) ?? 0.7,
      eligibility: elig.eligibility,
      conditions: elig.conditions,
      eligibilityConfidence: elig.eligibilityConfidence,
      eligibilityEvidence: elig.eligibilityEvidence,
      eligibilityStatus: elig.eligibilityStatus,
    });
  }

  return out;
}
