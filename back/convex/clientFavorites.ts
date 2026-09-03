import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./clientLib";

export const listMyFavoriteProducts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const favs = await ctx.db
      .query("favoriteProducts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const rows = [];
    for (const f of favs) {
      const p = await ctx.db.get(f.canonicalProductId);
      if (!p) continue;
      const brand = p.brandId ? await ctx.db.get(p.brandId) : null;
      rows.push({
        favoriteId: f._id,
        canonicalProductId: p._id,
        name: p.canonicalName,
        brand: brand?.name,
        quantity: p.quantity,
        unit: p.unit,
      });
    }
    return rows;
  },
});

export const listFavoriteProductIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const favs = await ctx.db
      .query("favoriteProducts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return favs.map((f) => f.canonicalProductId);
  },
});

export const toggleFavoriteProduct = mutation({
  args: { canonicalProductId: v.id("canonicalProducts") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const existing = await ctx.db
      .query("favoriteProducts")
      .withIndex("by_user_product", (q) =>
        q
          .eq("userId", userId)
          .eq("canonicalProductId", args.canonicalProductId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorited: false };
    }
    await ctx.db.insert("favoriteProducts", {
      userId,
      canonicalProductId: args.canonicalProductId,
      createdAt: Date.now(),
    });
    return { favorited: true };
  },
});
