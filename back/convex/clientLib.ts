import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

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

export async function requireUser(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  return user;
}

export async function getDefaultLocation(ctx: QueryCtx, userId: Id<"users">) {
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

export async function listRegionSupermarkets(
  ctx: QueryCtx,
  city: string,
  state: string,
) {
  const all = await ctx.db.query("supermarkets").collect();
  const c = normalizeText(city);
  const s = normalizeText(state);
  return all.filter(
    (m) =>
      m.active &&
      normalizeText(m.city) === c &&
      normalizeText(m.state) === s,
  );
}

export async function resolveCompareStores(
  ctx: QueryCtx,
  userId: Id<"users">,
  city: string,
  state: string,
) {
  const region = await listRegionSupermarkets(ctx, city, state);
  const favs = await ctx.db
    .query("favoriteStores")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const favSet = new Set(favs.map((f) => f.supermarketId));
  const favored = region.filter((m) => favSet.has(m._id));
  return favored.length > 0 ? favored : region;
}
