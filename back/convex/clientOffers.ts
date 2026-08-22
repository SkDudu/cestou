import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  getDefaultLocation,
  isOfferValidNow,
  normalizeText,
  requireUser,
  resolveCompareStores,
  tokensMatch,
} from "./clientLib";
import type { Id } from "./_generated/dataModel";

export const searchOffers = query({
  args: {
    userId: v.id("users"),
    q: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    const q = args.q.trim();
    if (q.length < 2) return [];

    const loc = await getDefaultLocation(ctx, args.userId);
    if (!loc) return [];

    const stores = await resolveCompareStores(
      ctx,
      args.userId,
      loc.city,
      loc.state,
    );
    const storeIds = new Set(stores.map((s) => s._id as string));
    const storeName = new Map(stores.map((s) => [s._id as string, s.name]));

    const validated = await ctx.db
      .query("offers")
      .withIndex("by_validationStatus", (q) => q.eq("validationStatus", "validated"))
      .collect();

    const now = Date.now();
    const matched = validated.filter(
      (o) =>
        storeIds.has(o.supermarketId) &&
        isOfferValidNow(o, now) &&
        (tokensMatch(o.name, q) ||
          (o.brand ? tokensMatch(o.brand, q) : false) ||
          (o.rawText ? tokensMatch(o.rawText, q) : false)),
    );

    // Agrupa por nome normalizado → preços por mercado
    const groups = new Map<
      string,
      {
        key: string;
        name: string;
        brand?: string;
        quantity?: string;
        unit?: string;
        prices: {
          offerId: Id<"offers">;
          supermarketId: Id<"supermarkets">;
          supermarketName: string;
          price: number;
          originalPrice?: number;
        }[];
      }
    >();

    for (const o of matched) {
      const key = normalizeText(
        `${o.brand ?? ""} ${o.name} ${o.quantity ?? ""} ${o.unit ?? ""}`,
      );
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          name: o.name,
          brand: o.brand,
          quantity: o.quantity,
          unit: o.unit,
          prices: [],
        };
        groups.set(key, g);
      }
      g.prices.push({
        offerId: o._id,
        supermarketId: o.supermarketId,
        supermarketName: storeName.get(o.supermarketId) ?? "—",
        price: o.price,
        originalPrice: o.originalPrice,
      });
    }

    const limit = args.limit ?? 40;
    return [...groups.values()]
      .map((g) => {
        const prices = [...g.prices].sort((a, b) => a.price - b.price);
        return {
          ...g,
          prices,
          cheapest: prices[0] ?? null,
        };
      })
      .sort((a, b) => (a.cheapest?.price ?? 0) - (b.cheapest?.price ?? 0))
      .slice(0, limit);
  },
});

export const getOffer = query({
  args: { id: v.id("offers") },
  handler: async (ctx, args) => {
    const offer = await ctx.db.get(args.id);
    if (!offer || offer.validationStatus !== "validated") return null;
    const supermarket = await ctx.db.get(offer.supermarketId);
    const flyer = await ctx.db.get(offer.flyerId);
    return { ...offer, supermarket, flyer };
  },
});

export const listNearbyFlyers = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    const loc = await getDefaultLocation(ctx, args.userId);
    if (!loc) return [];

    const stores = await resolveCompareStores(
      ctx,
      args.userId,
      loc.city,
      loc.state,
    );
    const now = Date.now();
    const rows = [];

    for (const store of stores) {
      const flyers = await ctx.db
        .query("flyers")
        .withIndex("by_supermarket", (q) => q.eq("supermarketId", store._id))
        .collect();

      const active = flyers.filter((f) => {
        if (f.status === "expired" || f.status === "failed") return false;
        if (f.validUntil !== undefined && f.validUntil < now) return false;
        return (
          f.status === "processed" ||
          f.status === "partially_processed" ||
          f.status === "processing"
        );
      });

      for (const f of active) {
        const offers = await ctx.db
          .query("offers")
          .withIndex("by_flyer", (q) => q.eq("flyerId", f._id))
          .collect();
        const validatedCount = offers.filter((o) =>
          isOfferValidNow(o, now),
        ).length;
        rows.push({
          _id: f._id,
          title: f.title,
          supermarketId: store._id,
          supermarketName: store.name,
          validFrom: f.validFrom,
          validUntil: f.validUntil,
          status: f.status,
          offerCount: validatedCount,
        });
      }
    }

    return rows.sort((a, b) => (b.validUntil ?? 0) - (a.validUntil ?? 0));
  },
});

export const listFlyerOffers = query({
  args: {
    flyerId: v.id("flyers"),
    q: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const flyer = await ctx.db.get(args.flyerId);
    if (!flyer) return null;
    const supermarket = await ctx.db.get(flyer.supermarketId);
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.flyerId))
      .collect();
    const now = Date.now();
    let list = offers.filter((o) => isOfferValidNow(o, now));
    const q = args.q?.trim();
    if (q && q.length >= 2) {
      list = list.filter(
        (o) =>
          tokensMatch(o.name, q) ||
          (o.brand ? tokensMatch(o.brand, q) : false),
      );
    }
    list.sort((a, b) => a.price - b.price);
    return {
      flyer,
      supermarket,
      offers: list,
    };
  },
});

export const listHomeOffers = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    const loc = await getDefaultLocation(ctx, args.userId);
    if (!loc) return [];

    const stores = await resolveCompareStores(
      ctx,
      args.userId,
      loc.city,
      loc.state,
    );
    const storeIds = new Set(stores.map((s) => s._id as string));
    const storeName = new Map(stores.map((s) => [s._id as string, s.name]));

    const validated = await ctx.db
      .query("offers")
      .withIndex("by_validationStatus", (q) => q.eq("validationStatus", "validated"))
      .collect();
    const now = Date.now();

    return validated
      .filter((o) => storeIds.has(o.supermarketId) && isOfferValidNow(o, now))
      .sort((a, b) => {
        const da = a.discountPercentage ?? 0;
        const db = b.discountPercentage ?? 0;
        if (db !== da) return db - da;
        return a.price - b.price;
      })
      .slice(0, args.limit ?? 12)
      .map((o) => ({
        _id: o._id,
        name: o.name,
        brand: o.brand,
        price: o.price,
        originalPrice: o.originalPrice,
        discountPercentage: o.discountPercentage,
        supermarketId: o.supermarketId,
        supermarketName: storeName.get(o.supermarketId) ?? "—",
      }));
  },
});
