import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  clubFields,
  getDefaultLocation,
  isOfferValidNow,
  rankingPrice,
  requireAuth,
  resolveCompareStores,
  tokensMatch,
  validatedOffersForStores,
} from "./clientLib";
import type { Id } from "./_generated/dataModel";
import { publicCondition, publicPayment } from "./offerEligibility";

function offerMatchesQuery(
  offerName: string,
  brand: string | undefined,
  normalizedName: string | undefined,
  canonicalName: string | undefined,
  q: string,
) {
  return (
    tokensMatch(offerName, q) ||
    (brand ? tokensMatch(brand, q) : false) ||
    (normalizedName ? tokensMatch(normalizedName, q) : false) ||
    (canonicalName ? tokensMatch(canonicalName, q) : false)
  );
}

export const searchOffers = query({
  args: {
    q: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const q = args.q.trim();
    if (q.length < 2) return [];

    const loc = await getDefaultLocation(ctx, userId);
    if (!loc) return [];

    const stores = await resolveCompareStores(
      ctx,
      userId,
      loc.city,
      loc.state,
      loc.lat,
      loc.lng,
    );
    const storeName = new Map(
      stores.map((s) => [
        s.supermarketId as string,
        `${s.network.name} · ${s.name}`,
      ]),
    );
    const networkName = new Map(
      stores.map((s) => [s.supermarketId as string, s.network.name]),
    );

    const offers = await validatedOffersForStores(ctx, stores);
    const canonicalCache = new Map<
      string,
      { name: string; brand?: string; quantity?: string; unit?: string }
    >();

    type PriceRow = {
      offerId: Id<"offers">;
      supermarketId: Id<"supermarkets">;
      supermarketName: string;
      price: number;
      originalPrice?: number;
      publicPrice: number;
      memberPrice?: number;
      requiresMembership: boolean;
      membershipName?: string;
      condition: ReturnType<typeof publicCondition>;
    } & ReturnType<typeof publicPayment>;

    const groups = new Map<
      string,
      {
        key: string;
        canonicalProductId: Id<"canonicalProducts"> | null;
        name: string;
        brand?: string;
        quantity?: string;
        unit?: string;
        prices: PriceRow[];
      }
    >();

    for (const o of offers) {
      let canonicalName: string | undefined;
      let canonicalMeta:
        | { name: string; brand?: string; quantity?: string; unit?: string }
        | undefined;
      if (o.canonicalProductId) {
        const cid = o.canonicalProductId as string;
        let cached = canonicalCache.get(cid);
        if (!cached) {
          const p = await ctx.db.get(o.canonicalProductId);
          if (p) {
            const brand = p.brandId ? await ctx.db.get(p.brandId) : null;
            cached = {
              name: p.canonicalName,
              brand: brand?.name,
              quantity: p.quantity,
              unit: p.unit,
            };
            canonicalCache.set(cid, cached);
          }
        }
        canonicalMeta = cached;
        canonicalName = cached?.name;
      }

      if (
        !offerMatchesQuery(
          o.name,
          o.brand ?? o.normalizedBrand,
          o.normalizedName,
          canonicalName,
          q,
        )
      ) {
        continue;
      }

      const key = o.canonicalProductId
        ? `c:${o.canonicalProductId}`
        : `t:${o.normalizedName ?? o.name}:${o.brand ?? ""}:${o.quantity ?? ""}`;

      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          canonicalProductId: o.canonicalProductId ?? null,
          name: canonicalMeta?.name ?? o.normalizedName ?? o.name,
          brand: canonicalMeta?.brand ?? o.brand,
          quantity: canonicalMeta?.quantity ?? o.quantity,
          unit: canonicalMeta?.unit ?? o.unit,
          prices: [],
        };
        groups.set(key, g);
      }
      const club = clubFields(o);
      g.prices.push({
        offerId: o._id,
        supermarketId: o.supermarketId,
        supermarketName:
          networkName.get(o.supermarketId) ??
          storeName.get(o.supermarketId) ??
          "—",
        price: rankingPrice(o),
        originalPrice: o.originalPrice,
        ...club,
        condition: publicCondition(o),
        ...publicPayment(o),
      });
    }

    const limit = args.limit ?? 40;
    return [...groups.values()]
      .map((g) => {
        const prices = [...g.prices].sort(
          (a, b) => a.publicPrice - b.publicPrice,
        );
        return {
          ...g,
          prices,
          cheapest: prices[0] ?? null,
        };
      })
      .sort(
        (a, b) =>
          (a.cheapest?.publicPrice ?? 0) - (b.cheapest?.publicPrice ?? 0),
      )
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
    return {
      ...offer,
      supermarket,
      flyer,
      condition: publicCondition(offer),
      ...clubFields(offer),
    };
  },
});

export const listNearbyFlyers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const loc = await getDefaultLocation(ctx, userId);
    if (!loc) return [];

    const stores = await resolveCompareStores(
      ctx,
      userId,
      loc.city,
      loc.state,
      loc.lat,
      loc.lng,
    );
    const storeIds = new Set(stores.map((s) => s._id as string));
    const now = Date.now();
    const seen = new Set<string>();
    const rows = [];

    for (const store of stores) {
      const flyers = await ctx.db
        .query("flyers")
        .withIndex("by_supermarket", (q) =>
          q.eq("supermarketId", store.supermarketId),
        )
        .collect();

      for (const f of flyers) {
        if (seen.has(f._id)) continue;
        if (f.status === "expired" || f.status === "failed") continue;
        if (f.validUntil !== undefined && f.validUntil < now) continue;
        if (
          f.status !== "processed" &&
          f.status !== "partially_processed" &&
          f.status !== "processing"
        ) {
          continue;
        }
        if (f.storeIds?.length && !f.storeIds.some((id) => storeIds.has(id))) {
          continue;
        }
        seen.add(f._id);
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
          supermarketId: store.supermarketId,
          supermarketName: store.network.name,
          storeName: store.name,
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
          (o.brand ? tokensMatch(o.brand, q) : false) ||
          (o.normalizedName ? tokensMatch(o.normalizedName, q) : false),
      );
    }
    list.sort((a, b) => rankingPrice(a) - rankingPrice(b));
    return {
      flyer,
      supermarket,
      offers: list.map((o) => ({
        ...o,
        condition: publicCondition(o),
        ...clubFields(o),
      })),
    };
  },
});

export const listHomeOffers = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const loc = await getDefaultLocation(ctx, userId);
    if (!loc) return [];

    const stores = await resolveCompareStores(
      ctx,
      userId,
      loc.city,
      loc.state,
      loc.lat,
      loc.lng,
    );
    const networkName = new Map(
      stores.map((s) => [s.supermarketId as string, s.network.name]),
    );

    const offers = await validatedOffersForStores(ctx, stores);
    return offers
      .sort((a, b) => {
        const da = a.discountPercentage ?? 0;
        const db = b.discountPercentage ?? 0;
        if (db !== da) return db - da;
        return rankingPrice(a) - rankingPrice(b);
      })
      .slice(0, args.limit ?? 12)
      .map((o) => ({
        _id: o._id,
        name: o.name,
        brand: o.brand,
        price: rankingPrice(o),
        originalPrice: o.originalPrice,
        discountPercentage: o.discountPercentage,
        supermarketId: o.supermarketId,
        supermarketName: networkName.get(o.supermarketId) ?? "—",
        condition: publicCondition(o),
        ...clubFields(o),
        ...publicPayment(o),
      }));
  },
});
