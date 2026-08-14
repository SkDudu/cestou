import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

const validationStatus = v.union(
  v.literal("pending"),
  v.literal("validated"),
  v.literal("rejected"),
  v.literal("suspicious"),
);

export const insertBatch = mutation({
  args: {
    flyerId: v.id("flyers"),
    supermarketId: v.id("supermarkets"),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    offers: v.array(
      v.object({
        name: v.string(),
        brand: v.optional(v.string()),
        quantity: v.optional(v.string()),
        unit: v.optional(v.string()),
        price: v.number(),
        originalPrice: v.optional(v.number()),
        discountPercentage: v.optional(v.number()),
        pageNumber: v.optional(v.number()),
        rawText: v.optional(v.string()),
        extractionConfidence: v.optional(v.number()),
      }),
    ),
    /** Replace existing offers for this flyer (re-extract). */
    replace: v.optional(v.boolean()),
    /** Replace only these page numbers (partial retry). */
    replacePageNumbers: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("offers")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.flyerId))
      .collect();

    const pages = args.replacePageNumbers;
    if (existing.length > 0 && !args.replace && !pages?.length) {
      return { inserted: 0, skipped: true, deleted: 0 };
    }

    let deleted = 0;
    if (args.replace) {
      for (const row of existing) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    } else if (pages?.length) {
      const drop = new Set(pages);
      for (const row of existing) {
        if (row.pageNumber !== undefined && drop.has(row.pageNumber)) {
          await ctx.db.delete(row._id);
          deleted++;
        }
      }
    }

    const now = Date.now();
    let inserted = 0;
    for (const o of args.offers) {
      await ctx.db.insert("offers", {
        flyerId: args.flyerId,
        supermarketId: args.supermarketId,
        name: o.name,
        brand: o.brand,
        quantity: o.quantity,
        unit: o.unit,
        price: o.price,
        originalPrice: o.originalPrice,
        discountPercentage: o.discountPercentage,
        pageNumber: o.pageNumber,
        rawText: o.rawText,
        extractionConfidence: o.extractionConfidence,
        sourceType: "flyer",
        validationStatus: "pending",
        validFrom: args.validFrom,
        validUntil: args.validUntil,
        createdAt: now,
        updatedAt: now,
      });
      inserted++;
    }
    return { inserted, skipped: false, deleted };
  },
});

export const setValidationStatus = mutation({
  args: {
    id: v.id("offers"),
    validationStatus: validationStatus,
  },
  handler: async (ctx, args) => {
    const offer = await ctx.db.get(args.id);
    if (!offer) throw new Error("Offer not found");
    await ctx.db.patch(args.id, {
      validationStatus: args.validationStatus,
      updatedAt: Date.now(),
    });
  },
});

/** Mark all pending offers as validated (optional supermarket filter). */
export const validateAllPending = mutation({
  args: {
    supermarketId: v.optional(v.id("supermarkets")),
  },
  handler: async (ctx, args) => {
    const pending = args.supermarketId
      ? await ctx.db
          .query("offers")
          .withIndex("by_supermarket_status", (q) =>
            q
              .eq("supermarketId", args.supermarketId!)
              .eq("validationStatus", "pending"),
          )
          .collect()
      : await ctx.db
          .query("offers")
          .withIndex("by_validationStatus", (q) =>
            q.eq("validationStatus", "pending"),
          )
          .collect();

    const now = Date.now();
    for (const offer of pending) {
      await ctx.db.patch(offer._id, {
        validationStatus: "validated",
        updatedAt: now,
      });
    }
    return { updated: pending.length };
  },
});

export const list = query({
  args: {
    supermarketId: v.optional(v.id("supermarkets")),
    flyerId: v.optional(v.id("flyers")),
    validationStatus: v.optional(validationStatus),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Convex pagination needs a single index query; filter in-memory for combined filters.
    let base;
    if (args.flyerId) {
      base = await ctx.db
        .query("offers")
        .withIndex("by_flyer", (q) => q.eq("flyerId", args.flyerId!))
        .collect();
    } else if (args.supermarketId && args.validationStatus) {
      base = await ctx.db
        .query("offers")
        .withIndex("by_supermarket_status", (q) =>
          q
            .eq("supermarketId", args.supermarketId!)
            .eq("validationStatus", args.validationStatus!),
        )
        .collect();
    } else if (args.supermarketId) {
      base = await ctx.db
        .query("offers")
        .withIndex("by_supermarket", (q) =>
          q.eq("supermarketId", args.supermarketId!),
        )
        .collect();
    } else if (args.validationStatus) {
      base = await ctx.db
        .query("offers")
        .withIndex("by_validationStatus", (q) =>
          q.eq("validationStatus", args.validationStatus!),
        )
        .collect();
    } else {
      base = await ctx.db.query("offers").collect();
    }

    if (args.validationStatus && args.flyerId) {
      base = base.filter((o) => o.validationStatus === args.validationStatus);
    }

    const sorted = [...base].sort((a, b) => b.createdAt - a.createdAt);
    const numItems = args.paginationOpts.numItems;
    const cursor = args.paginationOpts.cursor;
    const start = cursor ? Number(cursor) : 0;
    const slice = sorted.slice(start, start + numItems);
    const next = start + numItems;
    const isDone = next >= sorted.length;

    const page = await Promise.all(
      slice.map(async (o) => {
        const supermarket = await ctx.db.get(o.supermarketId);
        return {
          ...o,
          supermarketName: supermarket?.name ?? "—",
        };
      }),
    );

    return {
      page,
      isDone,
      continueCursor: isDone ? "" : String(next),
    };
  },
});

export const listPendingValidation = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const pending = await ctx.db
      .query("offers")
      .withIndex("by_validationStatus", (q) => q.eq("validationStatus", "pending"))
      .collect();
    const sorted = [...pending].sort(
      (a, b) => (a.extractionConfidence ?? 1) - (b.extractionConfidence ?? 1),
    );
    const slice = sorted.slice(0, limit);
    return await Promise.all(
      slice.map(async (o) => {
        const supermarket = await ctx.db.get(o.supermarketId);
        const flyer = await ctx.db.get(o.flyerId);
        let pageUrl: string | null = null;
        if (o.pageNumber !== undefined) {
          const page = await ctx.db
            .query("flyerPages")
            .withIndex("by_flyer_page", (q) =>
              q.eq("flyerId", o.flyerId).eq("pageNumber", o.pageNumber!),
            )
            .unique();
          if (page) pageUrl = await ctx.storage.getUrl(page.storageId);
        }
        return {
          ...o,
          supermarketName: supermarket?.name ?? "—",
          supermarketCity: supermarket?.city ?? "—",
          flyerTitle: flyer?.title,
          pageUrl,
        };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("offers") },
  handler: async (ctx, args) => {
    const offer = await ctx.db.get(args.id);
    if (!offer) return null;
    const supermarket = await ctx.db.get(offer.supermarketId);
    const flyer = await ctx.db.get(offer.flyerId);
    let pageUrl: string | null = null;
    if (offer.pageNumber !== undefined) {
      const page = await ctx.db
        .query("flyerPages")
        .withIndex("by_flyer_page", (q) =>
          q.eq("flyerId", offer.flyerId).eq("pageNumber", offer.pageNumber!),
        )
        .unique();
      if (page) pageUrl = await ctx.storage.getUrl(page.storageId);
    }
    let extraction = null;
    if (offer.pageNumber !== undefined) {
      const rows = await ctx.db
        .query("flyerExtractions")
        .withIndex("by_flyer_page", (q) =>
          q.eq("flyerId", offer.flyerId).eq("pageNumber", offer.pageNumber!),
        )
        .collect();
      extraction =
        [...rows].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    }
    return {
      ...offer,
      supermarket,
      flyer,
      pageUrl,
      extraction,
    };
  },
});
