import { normalizeWhitespace } from "./text-normalizer.js";
import type { ParsedOffer } from "../core/flyer-types.js";

const PRICE_RE = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g;
const QTY_RE =
  /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|lt|un|und|unid|pack|pct|cx|fd)\b/i;

function parseBrl(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

function discountPct(original: number, price: number): number {
  if (original <= 0 || price >= original) return 0;
  return Math.round(((original - price) / original) * 1000) / 10;
}

function isPriceOnlyLine(line: string): boolean {
  const t = line.trim();
  return (
    /^(DE|POR|R\$|A\s*PARTIR)?\s*R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2}$/i.test(t) ||
    /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(t)
  );
}

function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 2) return true;
  if (/^\d+%$/.test(t)) return true;
  if (/^(oferta|promo|leve|pague|validade|encarte|página)/i.test(t)) return true;
  if (isPriceOnlyLine(t)) return true;
  return false;
}

function extractPrices(text: string): number[] {
  return [...text.matchAll(PRICE_RE)]
    .map((m) => parseBrl(m[1]!))
    .filter((p) => p > 0 && p < 10000);
}

function cleanName(raw: string): string {
  return raw
    .replace(PRICE_RE, " ")
    .replace(/\bR\$\b/gi, " ")
    .replace(/\b(DE|POR|A\s*PARTIR\.?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lookbackName(lines: string[], index: number): string {
  const parts: string[] = [];
  for (let j = index - 1; j >= Math.max(0, index - 6) && parts.length < 3; j--) {
    const line = lines[j]!;
    if (isNoiseLine(line)) {
      if (parts.length) break;
      continue;
    }
    // Stop if previous line already looks like another price block
    if (extractPrices(line).length >= 2) break;
    parts.unshift(line);
  }
  return cleanName(parts.join(" "));
}

function pushOffer(
  offers: ParsedOffer[],
  seen: Set<string>,
  partial: ParsedOffer,
) {
  const name = cleanName(partial.name).slice(0, 200);
  if (name.length < 3) return;
  if (!(partial.price > 0) || partial.price > 10000) return;

  const key = `${name.toLowerCase()}|${partial.price}|${partial.pageNumber ?? 0}`;
  if (seen.has(key)) return;
  seen.add(key);

  const original =
    partial.originalPrice && partial.originalPrice > partial.price
      ? partial.originalPrice
      : undefined;

  offers.push({
    ...partial,
    name,
    originalPrice: original,
    discountPercentage: original
      ? discountPct(original, partial.price)
      : undefined,
  });
}

/**
 * Rule-based OCR → offers.
 * Always scans DE/POR + standalone R$ prices (not only when DE/POR is empty).
 */
export function parseOffersFromText(
  text: string,
  pageNumber: number,
  pageConfidence?: number,
): ParsedOffer[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const offers: ParsedOffer[] = [];
  const seen = new Set<string>();
  const conf = pageConfidence ?? 0.5;
  // Track line indexes already consumed by a DE/POR hit
  const usedPriceLines = new Set<number>();

  // Pass 1: DE/POR pairs (highest confidence)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const window = lines.slice(Math.max(0, i - 5), i + 2).join(" ");

    const dePorInline = window.match(
      /DE\s*R?\$?\s*([\d.,]+)\s*POR\s*R?\$?\s*([\d.,]+)/i,
    );

    let price: number | undefined;
    let originalPrice: number | undefined;
    let rawText = "";

    if (dePorInline && /POR/i.test(line)) {
      originalPrice = parseBrl(dePorInline[1]!);
      price = parseBrl(dePorInline[2]!);
      rawText = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
      usedPriceLines.add(i);
      if (i > 0) usedPriceLines.add(i - 1);
    } else if (
      /POR\s*R?\$?\s*([\d.,]+)/i.test(line) &&
      i > 0 &&
      /DE/i.test(lines[i - 1] ?? "")
    ) {
      const por = line.match(/POR\s*R?\$?\s*([\d.,]+)/i)!;
      const deMatch = lines[i - 1]!.match(/([\d.,]+)/);
      originalPrice = deMatch ? parseBrl(deMatch[1]!) : undefined;
      price = parseBrl(por[1]!);
      rawText = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
      usedPriceLines.add(i);
      usedPriceLines.add(i - 1);
    } else {
      continue;
    }

    const name = lookbackName(lines, i);
    const qtyMatch = rawText.match(QTY_RE) ?? name.match(QTY_RE);
    pushOffer(offers, seen, {
      name,
      quantity: qtyMatch
        ? `${qtyMatch[1]}${qtyMatch[2]!.toLowerCase()}`
        : undefined,
      price: price!,
      originalPrice,
      pageNumber,
      rawText: rawText.slice(0, 1000),
      extractionConfidence: conf,
    });
  }

  // Pass 2: standalone prices — always, not only when pass 1 empty
  for (let i = 0; i < lines.length; i++) {
    if (usedPriceLines.has(i)) continue;
    const line = lines[i]!;
    const prices = extractPrices(line);
    if (!prices.length) continue;

    // "R$ 12,99" alone or "Produto ... 12,99"
    let price: number;
    let originalPrice: number | undefined;

    if (prices.length >= 2) {
      const sorted = [...prices].sort((a, b) => b - a);
      originalPrice = sorted[0];
      price = sorted[1]!;
      // only treat as promo pair if gap looks like discount
      if (originalPrice! / price < 1.02) {
        price = prices[prices.length - 1]!;
        originalPrice = undefined;
      }
    } else {
      price = prices[0]!;
    }

    let name = cleanName(line);
    if (name.length < 3) {
      name = lookbackName(lines, i);
    } else {
      // Prefer lookback + current name fragment without prices
      const look = lookbackName(lines, i);
      if (look.length >= 3) {
        name = cleanName(`${look} ${name}`);
      }
    }

    // Skip pure noise / too short after clean
    if (name.length < 3) continue;
    // Skip if name is mostly digits leftover
    if (/^[\d\s.,/-]+$/.test(name)) continue;

    const qtyMatch = `${name}\n${line}`.match(QTY_RE);
    const rawText = lines.slice(Math.max(0, i - 4), i + 1).join("\n");

    pushOffer(offers, seen, {
      name,
      quantity: qtyMatch
        ? `${qtyMatch[1]}${qtyMatch[2]!.toLowerCase()}`
        : undefined,
      price,
      originalPrice,
      pageNumber,
      rawText: rawText.slice(0, 1000),
      extractionConfidence: conf * (usedPriceLines.size ? 0.75 : 0.85),
    });
  }

  return offers;
}
