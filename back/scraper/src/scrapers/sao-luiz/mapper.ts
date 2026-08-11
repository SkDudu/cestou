import type { RawProduct } from "../types/index.js";

/** Mercadapp item from /mapp/v3/markets/:id/items/search */
export type MercadappItem = {
  id: number;
  product_id: number;
  market_id: number;
  price: number;
  original_price?: number;
  description?: string;
  short_description?: string;
  bar_code?: string;
  image?: string;
  slug?: string | null;
  is_offer?: boolean;
};

export type MercadappSearchResponse = {
  mixes?: Array<{ items?: MercadappItem[] }>;
  has_next_page?: boolean;
};

const SOURCE = "sao-luiz";
const SITE = "https://mercadinhossaoluiz.com.br";

export function mapItem(item: MercadappItem, marketId: number): RawProduct {
  const name = (item.description || item.short_description || "").trim();
  const price = Number(item.price);
  const original = item.original_price != null ? Number(item.original_price) : undefined;

  return {
    externalId: String(item.product_id ?? item.id),
    name,
    price: Number.isFinite(price) ? price : 0,
    originalPrice:
      original != null && Number.isFinite(original) && original !== price
        ? original
        : undefined,
    url: item.slug
      ? `${SITE}/loja/${marketId}/produto/${item.slug}`
      : `${SITE}/loja/${marketId}`,
    imageUrl: item.image || undefined,
    source: SOURCE,
    collectedAt: new Date().toISOString(),
    rawData: {
      id: item.id,
      product_id: item.product_id,
      bar_code: item.bar_code,
      is_offer: item.is_offer,
    },
  };
}

export function flattenSearch(data: MercadappSearchResponse): MercadappItem[] {
  return (data.mixes ?? []).flatMap((m) => m.items ?? []);
}
