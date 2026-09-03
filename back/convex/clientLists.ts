import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  clubFields,
  getDefaultLocation,
  rankingPrice,
  requireAuth,
  resolveCompareStores,
  tokensMatch,
  validatedOffersForStores,
} from "./clientLib";
import { publicCondition, publicPayment } from "./offerEligibility";

async function requireListOwner(
  ctx: QueryCtx | MutationCtx,
  listId: Id<"shoppingLists">,
  userId: Id<"users">,
) {
  const list = await ctx.db.get(listId);
  if (!list || list.userId !== userId) throw new Error("List not found");
  return list;
}

function offerMatchesItem(
  offer: Doc<"offers">,
  item: Doc<"shoppingListItems">,
  canonicalName?: string,
) {
  if (
    item.canonicalProductId &&
    offer.canonicalProductId === item.canonicalProductId
  ) {
    return true;
  }
  if (item.offerId && offer._id === item.offerId) return true;
  if (canonicalName && tokensMatch(canonicalName, item.queryText)) return true;
  return (
    tokensMatch(offer.name, item.queryText) ||
    (offer.normalizedName
      ? tokensMatch(offer.normalizedName, item.queryText)
      : false)
  );
}

function findBestOfferForItem(
  item: Doc<"shoppingListItems">,
  supermarketId: Id<"supermarkets">,
  validatedCache: Doc<"offers">[],
  canonicalNames: Map<string, string>,
): Doc<"offers"> | null {
  const matches = validatedCache.filter((o) => {
    if (o.supermarketId !== supermarketId) return false;
    const cName = o.canonicalProductId
      ? canonicalNames.get(o.canonicalProductId)
      : undefined;
    return offerMatchesItem(o, item, cName);
  });
  if (!matches.length) return null;
  return matches.sort((a, b) => rankingPrice(a) - rankingPrice(b))[0]!;
}

export const listMyShoppingLists = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const lists = await ctx.db
      .query("shoppingLists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return await Promise.all(
      lists.map(async (l) => {
        const items = await ctx.db
          .query("shoppingListItems")
          .withIndex("by_list", (q) => q.eq("listId", l._id))
          .collect();
        return { ...l, itemCount: items.length };
      }),
    );
  },
});

export const getShoppingList = query({
  args: {
    listId: v.id("shoppingLists"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const list = await requireListOwner(ctx, args.listId, userId);
    const items = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .collect();

    const enriched = await Promise.all(
      items.map(async (item) => {
        const offer = item.offerId ? await ctx.db.get(item.offerId) : null;
        const supermarket = offer
          ? await ctx.db.get(offer.supermarketId)
          : null;
        return {
          ...item,
          offer: offer
            ? {
                _id: offer._id,
                name: offer.name,
                price: rankingPrice(offer),
                supermarketName: supermarket?.name ?? "—",
                condition: publicCondition(offer),
                ...clubFields(offer),
                ...publicPayment(offer),
              }
            : null,
        };
      }),
    );

    return { ...list, items: enriched };
  },
});

export const getOrCreateDefaultList = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const existing = await ctx.db
      .query("shoppingLists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return existing._id;

    const loc = await getDefaultLocation(ctx, userId);
    const now = Date.now();
    return await ctx.db.insert("shoppingLists", {
      userId,
      name: "Compras da semana",
      locationId: loc?._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createShoppingList = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const loc = await getDefaultLocation(ctx, userId);
    const now = Date.now();
    return await ctx.db.insert("shoppingLists", {
      userId,
      name: args.name.trim() || "Minha lista",
      locationId: loc?._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const renameShoppingList = mutation({
  args: {
    listId: v.id("shoppingLists"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireListOwner(ctx, args.listId, userId);
    await ctx.db.patch(args.listId, {
      name: args.name.trim(),
      updatedAt: Date.now(),
    });
  },
});

export const deleteShoppingList = mutation({
  args: {
    listId: v.id("shoppingLists"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireListOwner(ctx, args.listId, userId);
    const items = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .collect();
    for (const item of items) await ctx.db.delete(item._id);
    await ctx.db.delete(args.listId);
  },
});

export const addListItem = mutation({
  args: {
    listId: v.id("shoppingLists"),
    queryText: v.string(),
    offerId: v.optional(v.id("offers")),
    canonicalProductId: v.optional(v.id("canonicalProducts")),
    quantity: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireListOwner(ctx, args.listId, userId);
    const text = args.queryText.trim();
    if (!text) throw new Error("queryText required");
    let canonicalProductId = args.canonicalProductId;
    if (!canonicalProductId && args.offerId) {
      const offer = await ctx.db.get(args.offerId);
      canonicalProductId = offer?.canonicalProductId;
    }
    const now = Date.now();
    return await ctx.db.insert("shoppingListItems", {
      listId: args.listId,
      queryText: text,
      offerId: args.offerId,
      canonicalProductId,
      quantity: args.quantity ?? 1,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeListItem = mutation({
  args: {
    itemId: v.id("shoppingListItems"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    await requireListOwner(ctx, item.listId, userId);
    await ctx.db.delete(args.itemId);
    await ctx.db.patch(item.listId, { updatedAt: Date.now() });
  },
});

export const attachOfferToItem = mutation({
  args: {
    itemId: v.id("shoppingListItems"),
    offerId: v.id("offers"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    await requireListOwner(ctx, item.listId, userId);
    const offer = await ctx.db.get(args.offerId);
    if (!offer || offer.validationStatus !== "validated") {
      throw new Error("Offer not available");
    }
    await ctx.db.patch(args.itemId, {
      offerId: args.offerId,
      canonicalProductId: offer.canonicalProductId,
      queryText: offer.name,
      updatedAt: Date.now(),
    });
  },
});

export const compareShoppingList = query({
  args: {
    listId: v.id("shoppingLists"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireListOwner(ctx, args.listId, userId);
    const loc = await getDefaultLocation(ctx, userId);
    if (!loc) {
      return {
        error: "Defina sua região antes de comparar.",
        markets: [],
        bestSingle: null,
        split: null,
        disclaimer:
          "Comparação baseada em ofertas de encarte validadas e vigentes.",
      };
    }

    const stores = await resolveCompareStores(
      ctx,
      userId,
      loc.city,
      loc.state,
      loc.lat,
      loc.lng,
    );
    const items = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .collect();

    const disclaimer =
      "Comparação baseada em ofertas de encarte validadas e vigentes. Preço da cesta usa o valor público; clube aparece à parte.";

    if (!items.length) {
      return {
        error: null,
        markets: [],
        bestSingle: null,
        split: null,
        itemCount: 0,
        disclaimer,
      };
    }

    const validated = await validatedOffersForStores(ctx, stores);
    const canonicalNames = new Map<string, string>();
    for (const o of validated) {
      if (!o.canonicalProductId) continue;
      const cid = o.canonicalProductId as string;
      if (canonicalNames.has(cid)) continue;
      const p = await ctx.db.get(o.canonicalProductId);
      if (p) canonicalNames.set(cid, p.canonicalName);
    }

    type Line = {
      itemId: Id<"shoppingListItems">;
      queryText: string;
      quantity: number;
      offerId: Id<"offers"> | null;
      offerName: string | null;
      unitPrice: number | null;
      memberPrice: number | null;
      lineTotal: number | null;
      available: boolean;
      condition: ReturnType<typeof publicCondition> | null;
    };

    const networks = new Map<
      string,
      { supermarketId: Id<"supermarkets">; name: string; storeLabel: string }
    >();
    for (const store of stores) {
      const key = store.supermarketId as string;
      const existing = networks.get(key);
      const label = `${store.network.name} · ${store.name}`;
      if (!existing) {
        networks.set(key, {
          supermarketId: store.supermarketId,
          name: store.network.name,
          storeLabel: label,
        });
      }
    }

    const markets = [];
    for (const net of networks.values()) {
      const lines: Line[] = [];
      let total = 0;
      let missing = 0;
      for (const item of items) {
        const offer = findBestOfferForItem(
          item,
          net.supermarketId,
          validated,
          canonicalNames,
        );
        if (!offer) {
          missing++;
          lines.push({
            itemId: item._id,
            queryText: item.queryText,
            quantity: item.quantity,
            offerId: null,
            offerName: null,
            unitPrice: null,
            memberPrice: null,
            lineTotal: null,
            available: false,
            condition: null,
          });
          continue;
        }
        const unit = rankingPrice(offer);
        const lineTotal = unit * item.quantity;
        total += lineTotal;
        lines.push({
          itemId: item._id,
          queryText: item.queryText,
          quantity: item.quantity,
          offerId: offer._id,
          offerName: offer.name,
          unitPrice: unit,
          memberPrice: offer.memberPrice ?? null,
          lineTotal,
          available: true,
          condition: publicCondition(offer),
        });
      }
      markets.push({
        supermarketId: net.supermarketId,
        supermarketName: net.storeLabel,
        total,
        missing,
        coverage: items.length - missing,
        complete: missing === 0,
        lines,
      });
    }

    const complete = markets.filter((m) => m.complete);
    const ranked = [...(complete.length ? complete : markets)].sort((a, b) => {
      if (a.missing !== b.missing) return a.missing - b.missing;
      return a.total - b.total;
    });
    const bestSingle = ranked[0] ?? null;
    const worstComplete = complete.length
      ? [...complete].sort((a, b) => b.total - a.total)[0]
      : null;
    const savingsVsWorst =
      bestSingle && worstComplete && bestSingle.complete
        ? Math.max(0, worstComplete.total - bestSingle.total)
        : 0;

    type SplitAssign = {
      itemId: Id<"shoppingListItems">;
      queryText: string;
      quantity: number;
      supermarketId: Id<"supermarkets">;
      supermarketName: string;
      offerId: Id<"offers">;
      offerName: string;
      unitPrice: number;
      lineTotal: number;
    };
    const assignments: SplitAssign[] = [];
    const netList = [...networks.values()];
    for (const item of items) {
      let best: SplitAssign | null = null;
      for (const net of netList) {
        const offer = findBestOfferForItem(
          item,
          net.supermarketId,
          validated,
          canonicalNames,
        );
        if (!offer) continue;
        const unit = rankingPrice(offer);
        const lineTotal = unit * item.quantity;
        if (!best || lineTotal < best.lineTotal) {
          best = {
            itemId: item._id,
            queryText: item.queryText,
            quantity: item.quantity,
            supermarketId: net.supermarketId,
            supermarketName: net.storeLabel,
            offerId: offer._id,
            offerName: offer.name,
            unitPrice: unit,
            lineTotal,
          };
        }
      }
      if (best) assignments.push(best);
    }

    const byStore = new Map<string, SplitAssign[]>();
    for (const a of assignments) {
      const key = a.supermarketId as string;
      const arr = byStore.get(key) ?? [];
      arr.push(a);
      byStore.set(key, arr);
    }

    let storeEntries = [...byStore.entries()].map(([id, lines]) => ({
      supermarketId: id as Id<"supermarkets">,
      supermarketName: lines[0]!.supermarketName,
      itemCount: lines.length,
      total: lines.reduce((s, l) => s + l.lineTotal, 0),
      lines,
    }));

    if (storeEntries.length > 2) {
      storeEntries.sort((a, b) => b.itemCount - a.itemCount);
      const keep = storeEntries.slice(0, 2);
      const drop = storeEntries.slice(2);
      const keepIds = new Set(keep.map((k) => k.supermarketId as string));
      for (const d of drop) {
        for (const line of d.lines) {
          let bestKeep: SplitAssign | null = null;
          for (const kid of keepIds) {
            const offer = findBestOfferForItem(
              items.find((i) => i._id === line.itemId)!,
              kid as Id<"supermarkets">,
              validated,
              canonicalNames,
            );
            if (!offer) continue;
            const net = networks.get(kid)!;
            const unit = rankingPrice(offer);
            const cand: SplitAssign = {
              itemId: line.itemId,
              queryText: line.queryText,
              quantity: line.quantity,
              supermarketId: net.supermarketId,
              supermarketName: net.storeLabel,
              offerId: offer._id,
              offerName: offer.name,
              unitPrice: unit,
              lineTotal: unit * line.quantity,
            };
            if (!bestKeep || cand.lineTotal < bestKeep.lineTotal) {
              bestKeep = cand;
            }
          }
          if (bestKeep) {
            const bucket = keep.find(
              (k) => k.supermarketId === bestKeep!.supermarketId,
            )!;
            bucket.lines.push(bestKeep);
            bucket.itemCount = bucket.lines.length;
            bucket.total = bucket.lines.reduce((s, l) => s + l.lineTotal, 0);
          }
        }
      }
      storeEntries = keep;
    }

    const splitTotal = storeEntries.reduce((s, e) => s + e.total, 0);
    const splitCoverage = assignments.length;
    const split =
      storeEntries.length >= 1 && splitCoverage === items.length
        ? {
            stores: storeEntries,
            total: splitTotal,
            savingsVsBestSingle:
              bestSingle?.complete && bestSingle.total > splitTotal
                ? bestSingle.total - splitTotal
                : 0,
          }
        : null;

    return {
      error: null,
      itemCount: items.length,
      location: { city: loc.city, state: loc.state },
      markets: ranked,
      bestSingle: bestSingle ? { ...bestSingle, savingsVsWorst } : null,
      split,
      disclaimer,
    };
  },
});
