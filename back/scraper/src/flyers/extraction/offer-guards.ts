import {
  nameDedupeKey,
  normalizeUnit,
  sanitizeName,
  stripUnknown,
  titleCaseBrand,
} from "./text-normalizer.js";
import type { ParsedOffer } from "../core/flyer-types.js";

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

    const price = toNumber(rec.price);
    if (price === undefined || !(price > 0) || price >= 10000) continue;

    let originalPrice = toNumber(rec.originalPrice);
    if (originalPrice !== undefined && originalPrice < price) {
      originalPrice = undefined;
    }

    const quantity = stripUnknown(rec.quantity);
    const unitRaw = stripUnknown(rec.unit);
    const unit = unitRaw ? normalizeUnit(unitRaw) : undefined;
    const brandRaw = stripUnknown(rec.brand);
    const brand = brandRaw ? titleCaseBrand(brandRaw) : undefined;

    const key = `${nameDedupeKey(name)}|${nameDedupeKey(brand ?? "")}|${quantity ?? ""}|${unit ?? ""}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      name: name.slice(0, 200),
      brand,
      quantity,
      unit,
      price,
      originalPrice,
      discountPercentage:
        originalPrice !== undefined
          ? discountPct(originalPrice, price)
          : undefined,
      pageNumber,
      rawText: JSON.stringify({
        name,
        price,
        originalPrice,
        quantity,
        brand,
      }).slice(0, 1000),
      extractionConfidence: toNumber(rec.confidence) ?? 0.7,
    });
  }

  return out;
}
