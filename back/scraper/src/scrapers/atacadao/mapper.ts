import type { RawProduct } from "../types/index.js";

/** VTEX catalog_system product (Atacadão). */
export type VtexProduct = {
  productId: string;
  productName: string;
  brand?: string;
  link?: string;
  linkText?: string;
  items?: Array<{
    itemId?: string;
    ean?: string;
    images?: Array<{ imageUrl?: string }>;
    sellers?: Array<{
      sellerId?: string;
      sellerDefault?: boolean;
      commertialOffer?: {
        Price?: number;
        ListPrice?: number;
        AvailableQuantity?: number;
      };
    }>;
  }>;
};

const SOURCE = "atacadao";
const SITE = "https://www.atacadao.com.br";

function pickSeller(item: NonNullable<VtexProduct["items"]>[number]) {
  const sellers = item.sellers ?? [];
  return sellers.find((s) => s.sellerDefault) ?? sellers[0];
}

export function mapProduct(p: VtexProduct): RawProduct | null {
  const sku = p.items?.[0];
  if (!sku) return null;
  const seller = pickSeller(sku);
  const offer = seller?.commertialOffer;
  const price = Number(offer?.Price ?? 0);
  const list = Number(offer?.ListPrice ?? 0);
  if (!Number.isFinite(price) || price <= 0) return null;

  const path = p.link?.startsWith("http")
    ? p.link
    : p.linkText
      ? `${SITE}/${p.linkText}/p`
      : p.link
        ? `${SITE}${p.link.startsWith("/") ? "" : "/"}${p.link}`
        : undefined;

  return {
    externalId: String(p.productId),
    name: p.productName.trim(),
    brand: p.brand?.trim() || undefined,
    price,
    originalPrice:
      Number.isFinite(list) && list > price ? list : undefined,
    url: path,
    imageUrl: sku.images?.[0]?.imageUrl,
    source: SOURCE,
    collectedAt: new Date().toISOString(),
    rawData: {
      productId: p.productId,
      itemId: sku.itemId,
      ean: sku.ean,
      sellerId: seller?.sellerId,
      available: offer?.AvailableQuantity,
    },
  };
}
