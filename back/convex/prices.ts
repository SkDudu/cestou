import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const insert = mutation({
  args: {
    productId: v.id("products"),
    supermarketId: v.id("supermarkets"),
    price: v.number(),
    originalPrice: v.optional(v.number()),
    discount: v.optional(v.number()),
    collectedAt: v.number(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("prices", args);
  },
});

export const listPromotions = query({
  args: {
    paginationOpts: paginationOptsValidator,
    supermarketId: v.optional(v.id("supermarkets")),
    sortBy: v.optional(
      v.union(v.literal("discount"), v.literal("price"), v.literal("date")),
    ),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("rawProducts")
      .withIndex("by_collectedAt")
      .order("desc")
      .paginate(args.paginationOpts);

    type PromoRow = (typeof result.page)[number] & { discount: number };

    let page: PromoRow[] = result.page
      .filter((r) => r.originalPrice !== undefined && r.originalPrice > r.price)
      .filter((r) => !args.supermarketId || r.supermarketId === args.supermarketId)
      .map((r) => ({
        ...r,
        discount:
          r.originalPrice && r.originalPrice > r.price
            ? Math.round(((r.originalPrice - r.price) / r.originalPrice) * 100)
            : 0,
      }));

    if (args.sortBy === "discount") {
      page = [...page].sort((a, b) => b.discount - a.discount);
    } else if (args.sortBy === "price") {
      page = [...page].sort((a, b) => a.price - b.price);
    }

    const enriched = await Promise.all(
      page.map(async (raw) => {
        const supermarket = await ctx.db.get(raw.supermarketId);
        return {
          ...raw,
          supermarketName: (supermarket as { name: string } | null)?.name ?? "—",
        };
      }),
    );

    return { ...result, page: enriched };
  },
});

export const historyByProduct = query({
  args: {
    productId: v.id("products"),
    supermarketId: v.optional(v.id("supermarkets")),
  },
  handler: async (ctx, args) => {
    let prices;
    if (args.supermarketId) {
      prices = await ctx.db
        .query("prices")
        .withIndex("by_product_supermarket", (q) =>
          q.eq("productId", args.productId).eq("supermarketId", args.supermarketId!),
        )
        .collect();
    } else {
      prices = await ctx.db
        .query("prices")
        .withIndex("by_product", (q) => q.eq("productId", args.productId))
        .collect();
    }

    return prices.sort((a, b) => b.collectedAt - a.collectedAt);
  },
});
