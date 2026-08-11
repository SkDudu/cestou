import type { RawProduct } from "../types/index.js";

/** books.toscrape.com card → RawProduct */
export function mapBookCard(args: {
  name: string;
  priceText: string;
  url: string;
  imageUrl: string;
}): RawProduct {
  const price = Number(args.priceText.replace(/[^\d.]/g, ""));
  return {
    externalId: args.url,
    name: args.name,
    price: Number.isFinite(price) ? price : 0,
    url: args.url,
    imageUrl: args.imageUrl,
    source: "demo",
    collectedAt: new Date().toISOString(),
    rawData: args,
  };
}
