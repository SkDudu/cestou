import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getDefaultLocation,
  listRegionSupermarkets,
  requireUser,
} from "./clientLib";

export const listSupermarketsByRegion = query({
  args: {
    city: v.string(),
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const stores = await listRegionSupermarkets(ctx, args.city, args.state);
    return await Promise.all(
      stores.map(async (s) => {
        const offers = await ctx.db
          .query("offers")
          .withIndex("by_supermarket_status", (q) =>
            q.eq("supermarketId", s._id).eq("validationStatus", "validated"),
          )
          .collect();
        return {
          _id: s._id,
          name: s.name,
          slug: s.slug,
          city: s.city,
          state: s.state,
          offerCount: offers.length,
        };
      }),
    );
  },
});

export const listMyFavoriteStores = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    const favs = await ctx.db
      .query("favoriteStores")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const rows = [];
    for (const f of favs) {
      const store = await ctx.db.get(f.supermarketId);
      if (!store) continue;
      rows.push({
        favoriteId: f._id,
        supermarketId: store._id,
        name: store.name,
        city: store.city,
        state: store.state,
      });
    }
    return rows;
  },
});

export const listStoresForMe = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    const loc = await getDefaultLocation(ctx, args.userId);
    if (!loc) return { location: null, stores: [], favorites: [] as string[] };

    const stores = await listRegionSupermarkets(ctx, loc.city, loc.state);
    const favs = await ctx.db
      .query("favoriteStores")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const favSet = new Set(favs.map((f) => f.supermarketId as string));

    const enriched = await Promise.all(
      stores.map(async (s) => {
        const offers = await ctx.db
          .query("offers")
          .withIndex("by_supermarket_status", (q) =>
            q.eq("supermarketId", s._id).eq("validationStatus", "validated"),
          )
          .collect();
        return {
          _id: s._id,
          name: s.name,
          slug: s.slug,
          city: s.city,
          state: s.state,
          offerCount: offers.length,
          isFavorite: favSet.has(s._id),
        };
      }),
    );

    return {
      location: loc,
      stores: enriched.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite)),
      favorites: [...favSet],
    };
  },
});

export const toggleFavoriteStore = mutation({
  args: {
    userId: v.id("users"),
    supermarketId: v.id("supermarkets"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    const existing = await ctx.db
      .query("favoriteStores")
      .withIndex("by_user_store", (q) =>
        q.eq("userId", args.userId).eq("supermarketId", args.supermarketId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorited: false };
    }
    await ctx.db.insert("favoriteStores", {
      userId: args.userId,
      supermarketId: args.supermarketId,
      createdAt: Date.now(),
    });
    return { favorited: true };
  },
});
