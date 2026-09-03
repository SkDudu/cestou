import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokensMatch(haystack: string, query: string) {
  const h = normalizeText(haystack);
  const tokens = normalizeText(query).split(" ").filter((t) => t.length >= 2);
  if (!tokens.length) return false;
  return tokens.every((t) => h.includes(t));
}

export function isOfferValidNow(offer: Doc<"offers">, now = Date.now()) {
  if (offer.validationStatus !== "validated") return false;
  if (offer.validFrom !== undefined && offer.validFrom > now) return false;
  if (offer.validUntil !== undefined && offer.validUntil < now) return false;
  return true;
}

/** Ranking da cesta usa preço público, nunca só o clube. */
export function rankingPrice(offer: Doc<"offers">) {
  if (offer.publicPrice != null) return offer.publicPrice;
  if (offer.requiresMembership && offer.originalPrice != null) {
    return offer.originalPrice;
  }
  return offer.price;
}

export function clubFields(offer: Doc<"offers">) {
  return {
    publicPrice: rankingPrice(offer),
    memberPrice: offer.memberPrice,
    requiresMembership: offer.requiresMembership ?? false,
    membershipName: offer.membershipName,
  };
}

export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Não autenticado");
  return userId;
}

export async function getDefaultLocation(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  const marked = await ctx.db
    .query("locations")
    .withIndex("by_user_default", (q) =>
      q.eq("userId", userId).eq("isDefault", true),
    )
    .first();
  if (marked) return marked;
  return await ctx.db
    .query("locations")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

export function flyerAppliesToStores(
  flyer: Doc<"flyers"> | null,
  storeIds: Set<string>,
) {
  if (!flyer) return false;
  if (!flyer.storeIds?.length) return true;
  return flyer.storeIds.some((id) => storeIds.has(id));
}

export async function listRegionStores(
  ctx: QueryCtx,
  city: string,
  state: string,
) {
  const c = normalizeText(city);
  const s = normalizeText(state);
  const stores = await ctx.db.query("stores").collect();
  const out: Array<Doc<"stores"> & { network: Doc<"supermarkets"> }> = [];
  for (const store of stores) {
    if (!store.active) continue;
    const network = await ctx.db.get(store.supermarketId);
    if (!network?.active) continue;
    const storeCity = normalizeText(store.city);
    const storeState = normalizeText(store.state);
    const netCity = normalizeText(network.city);
    const netState = normalizeText(network.state);
    const match =
      (storeCity === c && storeState === s) ||
      (netCity === c && netState === s);
    if (match) out.push({ ...store, network });
  }
  return out;
}

export type NearbyStore = Doc<"stores"> & {
  network: Doc<"supermarkets">;
  distanceKm: number | null;
};

export function withDistance(
  stores: Array<Doc<"stores"> & { network: Doc<"supermarkets"> }>,
  lat?: number,
  lng?: number,
): NearbyStore[] {
  const hasUser = lat != null && lng != null;
  return stores
    .map((store) => {
      let distanceKm: number | null = null;
      if (
        hasUser &&
        store.latitude != null &&
        store.longitude != null
      ) {
        distanceKm = haversineKm(lat, lng, store.latitude, store.longitude);
      }
      return { ...store, distanceKm };
    })
    .sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}

export async function resolveCompareStores(
  ctx: QueryCtx,
  userId: Id<"users">,
  city: string,
  state: string,
  lat?: number,
  lng?: number,
): Promise<NearbyStore[]> {
  const region = withDistance(
    await listRegionStores(ctx, city, state),
    lat,
    lng,
  );
  const favs = await ctx.db
    .query("favoriteStores")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (!favs.length) return region;
  const favSet = new Set(favs.map((f) => f.storeId as string));
  const favored = region.filter((m) => favSet.has(m._id));
  return favored.length > 0 ? favored : region;
}

export async function validatedOffersForStores(
  ctx: QueryCtx,
  stores: NearbyStore[],
  now = Date.now(),
) {
  const storeIds = new Set(stores.map((s) => s._id as string));
  const supermarketIds = [...new Set(stores.map((s) => s.supermarketId))];
  const flyerCache = new Map<string, Doc<"flyers"> | null>();
  const out: Doc<"offers">[] = [];
  for (const sid of supermarketIds) {
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_supermarket_status", (q) =>
        q.eq("supermarketId", sid).eq("validationStatus", "validated"),
      )
      .collect();
    for (const o of offers) {
      if (!isOfferValidNow(o, now)) continue;
      const key = o.flyerId as string;
      let flyer = flyerCache.get(key);
      if (flyer === undefined) {
        flyer = await ctx.db.get(o.flyerId);
        flyerCache.set(key, flyer);
      }
      if (!flyerAppliesToStores(flyer, storeIds)) continue;
      out.push(o);
    }
  }
  return out;
}
