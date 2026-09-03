import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getDefaultLocation,
  listRegionStores,
  requireAuth,
  withDistance,
} from "./clientLib";

export const listSupermarketsByRegion = query({
  args: {
    city: v.string(),
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const stores = await listRegionStores(ctx, args.city, args.state);
    return stores.map((s) => ({
      _id: s._id,
      name: s.name,
      networkName: s.network.name,
      city: s.city,
      state: s.state,
    }));
  },
});

export const listMyFavoriteStores = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const favs = await ctx.db
      .query("favoriteStores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const rows = [];
    for (const f of favs) {
      const store = await ctx.db.get(f.storeId);
      if (!store) continue;
      const network = await ctx.db.get(store.supermarketId);
      rows.push({
        favoriteId: f._id,
        storeId: store._id,
        supermarketId: store.supermarketId,
        name: store.name,
        networkName: network?.name ?? "—",
        city: store.city,
        state: store.state,
      });
    }
    return rows;
  },
});

export const listStoresForMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const loc = await getDefaultLocation(ctx, userId);
    if (!loc) return { location: null, stores: [] };

    const region = withDistance(
      await listRegionStores(ctx, loc.city, loc.state),
      loc.lat,
      loc.lng,
    );
    const favs = await ctx.db
      .query("favoriteStores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const favSet = new Set(favs.map((f) => f.storeId as string));

    const now = Date.now();
    const offerCountByNetwork = new Map<string, number>();
    const stores = [];
    for (const s of region) {
      const netKey = s.supermarketId as string;
      if (!offerCountByNetwork.has(netKey)) {
        const offers = await ctx.db
          .query("offers")
          .withIndex("by_supermarket_status", (q) =>
            q
              .eq("supermarketId", s.supermarketId)
              .eq("validationStatus", "validated"),
          )
          .collect();
        offerCountByNetwork.set(
          netKey,
          offers.filter((o) => {
            if (o.validFrom !== undefined && o.validFrom > now) return false;
            if (o.validUntil !== undefined && o.validUntil < now) return false;
            return true;
          }).length,
        );
      }
      stores.push({
        _id: s._id,
        supermarketId: s.supermarketId,
        name: s.name,
        networkName: s.network.name,
        city: s.city,
        state: s.state,
        neighborhood: s.neighborhood,
        distanceKm: s.distanceKm,
        offerCount: offerCountByNetwork.get(netKey) ?? 0,
        isFavorite: favSet.has(s._id),
      });
    }

    stores.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return Number(b.isFavorite) - Number(a.isFavorite);
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });

    return { location: loc, stores };
  },
});

export const toggleFavoriteStore = mutation({
  args: { storeId: v.id("stores") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const store = await ctx.db.get(args.storeId);
    if (!store) throw new Error("Store not found");
    const existing = await ctx.db
      .query("favoriteStores")
      .withIndex("by_user_store", (q) =>
        q.eq("userId", userId).eq("storeId", args.storeId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorited: false };
    }
    await ctx.db.insert("favoriteStores", {
      userId,
      storeId: args.storeId,
      createdAt: Date.now(),
    });
    return { favorited: true };
  },
});
