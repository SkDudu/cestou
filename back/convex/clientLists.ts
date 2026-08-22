import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  getDefaultLocation,
  isOfferValidNow,
  requireUser,
  resolveCompareStores,
  tokensMatch,
} from "./clientLib";

async function requireListOwner(
  ctx: QueryCtx,
  listId: Id<"shoppingLists">,
  userId: Id<"users">,
) {
  const list = await ctx.db.get(listId);
  if (!list || list.userId !== userId) throw new Error("List not found");
  return list;
}

async function findBestOfferForItem(
  ctx: QueryCtx,
  item: Doc<"shoppingListItems">,
  supermarketId: Id<"supermarkets">,
  validatedCache: Doc<"offers">[],
): Promise<Doc<"offers"> | null> {
  if (item.offerId) {
    const attached = await ctx.db.get(item.offerId);
    if (
      attached &&
      attached.supermarketId === supermarketId &&
      isOfferValidNow(attached)
    ) {
      return attached;
    }
  }

  const matches = validatedCache.filter(
    (o) =>
      o.supermarketId === supermarketId &&
      isOfferValidNow(o) &&
      tokensMatch(o.name, item.queryText),
  );
  if (!matches.length) return null;
  return matches.sort((a, b) => a.price - b.price)[0]!;
}

export const listMyShoppingLists = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    const lists = await ctx.db
      .query("shoppingLists")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
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
    userId: v.id("users"),
    listId: v.id("shoppingLists"),
  },
  handler: async (ctx, args) => {
    const list = await requireListOwner(ctx, args.listId, args.userId);
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
                price: offer.price,
                supermarketName: supermarket?.name ?? "—",
              }
            : null,
        };
      }),
    );

    return { ...list, items: enriched };
  },
});

export const getOrCreateDefaultList = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    const existing = await ctx.db
      .query("shoppingLists")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) return existing._id;

    const loc = await getDefaultLocation(ctx, args.userId);
    const now = Date.now();
    return await ctx.db.insert("shoppingLists", {
      userId: args.userId,
      name: "Compras da semana",
      locationId: loc?._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createShoppingList = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    const loc = await getDefaultLocation(ctx, args.userId);
    const now = Date.now();
    return await ctx.db.insert("shoppingLists", {
      userId: args.userId,
      name: args.name.trim() || "Minha lista",
      locationId: loc?._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const renameShoppingList = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("shoppingLists"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireListOwner(ctx, args.listId, args.userId);
    await ctx.db.patch(args.listId, {
      name: args.name.trim(),
      updatedAt: Date.now(),
    });
  },
});

export const deleteShoppingList = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("shoppingLists"),
  },
  handler: async (ctx, args) => {
    await requireListOwner(ctx, args.listId, args.userId);
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
    userId: v.id("users"),
    listId: v.id("shoppingLists"),
    queryText: v.string(),
    offerId: v.optional(v.id("offers")),
    quantity: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireListOwner(ctx, args.listId, args.userId);
    const text = args.queryText.trim();
    if (!text) throw new Error("queryText required");
    const now = Date.now();
    return await ctx.db.insert("shoppingListItems", {
      listId: args.listId,
      queryText: text,
      offerId: args.offerId,
      quantity: args.quantity ?? 1,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeListItem = mutation({
  args: {
    userId: v.id("users"),
    itemId: v.id("shoppingListItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    await requireListOwner(ctx, item.listId, args.userId);
    await ctx.db.delete(args.itemId);
    await ctx.db.patch(item.listId, { updatedAt: Date.now() });
  },
});

export const attachOfferToItem = mutation({
  args: {
    userId: v.id("users"),
    itemId: v.id("shoppingListItems"),
    offerId: v.id("offers"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    await requireListOwner(ctx, item.listId, args.userId);
    const offer = await ctx.db.get(args.offerId);
    if (!offer || offer.validationStatus !== "validated") {
      throw new Error("Offer not available");
    }
    await ctx.db.patch(args.itemId, {
      offerId: args.offerId,
      queryText: offer.name,
      updatedAt: Date.now(),
    });
  },
});

export const compareShoppingList = query({
  args: {
    userId: v.id("users"),
    listId: v.id("shoppingLists"),
  },
  handler: async (ctx, args) => {
    await requireListOwner(ctx, args.listId, args.userId);
    const loc = await getDefaultLocation(ctx, args.userId);
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
      args.userId,
      loc.city,
      loc.state,
    );
    const items = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .collect();

    if (!items.length) {
      return {
        error: null,
        markets: [],
        bestSingle: null,
        split: null,
        itemCount: 0,
        disclaimer:
          "Comparação baseada em ofertas de encarte validadas e vigentes.",
      };
    }

    const validated = await ctx.db
      .query("offers")
      .withIndex("by_validationStatus", (q) =>
        q.eq("validationStatus", "validated"),
      )
      .collect();

    type Line = {
      itemId: Id<"shoppingListItems">;
      queryText: string;
      quantity: number;
      offerId: Id<"offers"> | null;
      offerName: string | null;
      unitPrice: number | null;
      lineTotal: number | null;
      available: boolean;
    };

    const markets = [];
    for (const store of stores) {
      const lines: Line[] = [];
      let total = 0;
      let missing = 0;
      for (const item of items) {
        const offer = await findBestOfferForItem(
          ctx,
          item,
          store._id,
          validated,
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
            lineTotal: null,
            available: false,
          });
          continue;
        }
        const lineTotal = offer.price * item.quantity;
        total += lineTotal;
        lines.push({
          itemId: item._id,
          queryText: item.queryText,
          quantity: item.quantity,
          offerId: offer._id,
          offerName: offer.name,
          unitPrice: offer.price,
          lineTotal,
          available: true,
        });
      }
      markets.push({
        supermarketId: store._id,
        supermarketName: store.name,
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

    // P1 — split até 2 mercados (greedy no mais barato por item)
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
    for (const item of items) {
      let best: SplitAssign | null = null;
      for (const store of stores) {
        const offer = await findBestOfferForItem(
          ctx,
          item,
          store._id,
          validated,
        );
        if (!offer) continue;
        const lineTotal = offer.price * item.quantity;
        if (!best || lineTotal < best.lineTotal) {
          best = {
            itemId: item._id,
            queryText: item.queryText,
            quantity: item.quantity,
            supermarketId: store._id,
            supermarketName: store.name,
            offerId: offer._id,
            offerName: offer.name,
            unitPrice: offer.price,
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

    // Se >2 mercados, funde os menores no top-2 por total de itens
    if (storeEntries.length > 2) {
      storeEntries.sort((a, b) => b.itemCount - a.itemCount);
      const keep = storeEntries.slice(0, 2);
      const drop = storeEntries.slice(2);
      const keepIds = new Set(keep.map((k) => k.supermarketId as string));
      for (const d of drop) {
        for (const line of d.lines) {
          // Reassign cada item ao mais barato entre os 2 keep
          let bestKeep: SplitAssign | null = null;
          for (const kid of keepIds) {
            const offer = await findBestOfferForItem(
              ctx,
              items.find((i) => i._id === line.itemId)!,
              kid as Id<"supermarkets">,
              validated,
            );
            if (!offer) continue;
            const lineTotal = offer.price * line.quantity;
            const store = stores.find((s) => s._id === kid)!;
            const cand: SplitAssign = {
              itemId: line.itemId,
              queryText: line.queryText,
              quantity: line.quantity,
              supermarketId: store._id,
              supermarketName: store.name,
              offerId: offer._id,
              offerName: offer.name,
              unitPrice: offer.price,
              lineTotal,
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
      bestSingle: bestSingle
        ? { ...bestSingle, savingsVsWorst }
        : null,
      split,
      disclaimer:
        "Comparação baseada em ofertas de encarte validadas e vigentes — não é catálogo completo de prateleira.",
    };
  },
});
