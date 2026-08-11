import type { NormalizedProduct, RawProduct } from "../types/index.js";

const UNIT_RE = /\b(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un|unid|unidade|pack|cx|pct)\b/i;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function clean(s: string): string {
  return s
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQtyUnit(name: string): { quantity?: number; unit?: string } {
  const m = name.match(UNIT_RE);
  if (!m) return {};
  return {
    quantity: Number(m[1].replace(",", ".")),
    unit: m[2].toLowerCase().replace(/unidade|unid/, "un"),
  };
}

/** Deterministic normalize — no AI. */
export function normalizeProduct(raw: RawProduct): NormalizedProduct {
  const name = titleCase(clean(raw.name));
  const normalizedName = name.toLowerCase();
  const fromName = extractQtyUnit(raw.name);

  return {
    name,
    normalizedName,
    brand: raw.brand ? titleCase(clean(raw.brand)) : undefined,
    price: raw.price,
    originalPrice: raw.originalPrice,
    quantity: raw.quantity ?? fromName.quantity,
    unit: raw.unit ?? fromName.unit,
    url: raw.url,
    imageUrl: raw.imageUrl,
    externalId: raw.externalId,
    source: raw.source,
    collectedAt: raw.collectedAt,
  };
}
