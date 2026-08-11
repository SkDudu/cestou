import type { RawProduct } from "../types/index.js";

/** GPA search API product (api.vendas.gpa.digital/pa/search/search). */
export type GpaProduct = {
  id: number;
  name: string;
  brand?: string;
  price: number;
  priceFrom?: number;
  productImages?: string[];
  urlDetails?: string;
  sku?: string;
};

export type GpaSearchResponse = {
  products?: GpaProduct[];
  totalProducts?: number;
  totalPages?: number;
};

const SOURCE = "pao-de-acucar";
const IMAGE_BASE = "https://static.paodeacucar.com";
const SITE = "https://www.paodeacucar.com";

function imageUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${IMAGE_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function mapProduct(item: GpaProduct): RawProduct {
  const name = item.name.trim();
  const price = Number(item.price);
  const original = item.priceFrom != null ? Number(item.priceFrom) : undefined;

  return {
    externalId: String(item.id),
    name,
    brand: item.brand?.trim() || undefined,
    price: Number.isFinite(price) ? price : 0,
    originalPrice:
      original != null && Number.isFinite(original) && original !== price
        ? original
        : undefined,
    url: item.urlDetails?.startsWith("http")
      ? item.urlDetails
      : item.urlDetails
        ? `${SITE}${item.urlDetails.startsWith("/") ? "" : "/"}${item.urlDetails}`
        : `${SITE}/produto/${item.id}`,
    imageUrl: imageUrl(item.productImages?.[0]),
    source: SOURCE,
    collectedAt: new Date().toISOString(),
    rawData: {
      id: item.id,
      sku: item.sku,
      priceFrom: item.priceFrom,
    },
  };
}

export function flattenSearch(data: GpaSearchResponse): GpaProduct[] {
  return data.products ?? [];
}
