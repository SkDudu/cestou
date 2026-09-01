import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  eligibilityEvidence,
  eligibilityStatus,
  eligibilityType,
  offerCondition,
  publicCondition,
} from "./offerEligibility";

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
        cashPrice: v.optional(v.number()),
        installmentCount: v.optional(v.number()),
        installmentAmount: v.optional(v.number()),
        installmentInterestFree: v.optional(v.boolean()),
        discountPercentage: v.optional(v.number()),
        pageNumber: v.optional(v.number()),
        rawText: v.optional(v.string()),
        extractionConfidence: v.optional(v.number()),
        eligibility: v.optional(eligibilityType),
        conditions: v.optional(v.array(offerCondition)),
        eligibilityConfidence: v.optional(v.number()),
        eligibilityEvidence: v.optional(eligibilityEvidence),
        eligibilityStatus: v.optional(eligibilityStatus),
      }),
    ),
    /** Replace existing offers for this flyer (re-extract). */
    replace: v.optional(v.boolean()),
    /** Replace only these page numbers (partial retry). */
    replacePageNumbers: v.optional(v.array(v.number())),
    /** Only delete offers in these validation statuses (reanalyze lock). */
    replaceStatuses: v.optional(v.array(validationStatus)),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("offers")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.flyerId))
      .collect();

    const pages = args.replacePageNumbers;
    const pageDrop = pages?.length ? new Set(pages) : null;
    const statuses = args.replaceStatuses
      ? new Set(args.replaceStatuses)
      : null;
    const hasScope = Boolean(args.replace || pageDrop || statuses);
    if (existing.length > 0 && !hasScope) {
      return { inserted: 0, skipped: true, deleted: 0 };
    }

    let deleted = 0;
    for (const row of existing) {
      if (pageDrop) {
        if (row.pageNumber === undefined || !pageDrop.has(row.pageNumber)) {
          continue;
        }
      } else if (!args.replace && !statuses) {
        continue;
      }
      if (statuses && !statuses.has(row.validationStatus)) continue;
      await ctx.db.delete(row._id);
      deleted++;
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
        cashPrice: o.cashPrice,
        installmentCount: o.installmentCount,
        installmentAmount: o.installmentAmount,
        installmentInterestFree: o.installmentInterestFree,
        discountPercentage: o.discountPercentage,
        pageNumber: o.pageNumber,
        rawText: o.rawText,
        extractionConfidence: o.extractionConfidence,
        eligibility: o.eligibility,
        conditions: o.conditions,
        eligibilityConfidence: o.eligibilityConfidence,
        eligibilityEvidence: o.eligibilityEvidence,
        eligibilityStatus: o.eligibilityStatus,
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

const PACK_UNITS = new Set([
  "kg",
  "g",
  "l",
  "ml",
  "un",
  "cx",
  "pct",
  "pack",
  "fd",
]);

export const patchFields = mutation({
  args: {
    id: v.id("offers"),
    name: v.optional(v.string()),
    price: v.optional(v.number()),
    originalPrice: v.optional(v.union(v.number(), v.null())),
    quantity: v.optional(v.union(v.string(), v.null())),
    unit: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const offer = await ctx.db.get(args.id);
    if (!offer) throw new Error("Offer not found");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.price !== undefined) patch.price = args.price;
    if (args.originalPrice !== undefined) {
      patch.originalPrice =
        args.originalPrice === null ? undefined : args.originalPrice;
    }
    if (args.quantity !== undefined) {
      const q = args.quantity?.trim();
      patch.quantity = q || undefined;
    }
    if (args.unit !== undefined) {
      const u = args.unit?.trim().toLowerCase();
      patch.unit = u && PACK_UNITS.has(u) ? u : undefined;
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const setEligibility = mutation({
  args: {
    id: v.id("offers"),
    eligibility: eligibilityType,
    programName: v.optional(v.string()),
    description: v.optional(v.string()),
    requirement: v.optional(v.string()),
    conditions: v.optional(v.array(offerCondition)),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const offer = await ctx.db.get(args.id);
    if (!offer) throw new Error("Offer not found");
    const name = args.programName?.trim();
    const description = args.description?.trim();
    const requirement = args.requirement?.trim();
    const conditions =
      args.eligibility === "ALL_CUSTOMERS" || args.eligibility === "UNKNOWN"
        ? []
        : args.conditions?.length
          ? args.conditions.map((c) => ({
              type: c.type,
              name: c.name?.trim() || undefined,
              description: c.description?.trim() || undefined,
              requirement: c.requirement?.trim() || undefined,
            }))
          : [
              {
                type: args.eligibility,
                name: name || undefined,
                description: description || undefined,
                requirement: requirement || undefined,
              },
            ];
    await ctx.db.insert("offerEligibilityHistory", {
      offerId: args.id,
      previousEligibility: offer.eligibility,
      newEligibility: args.eligibility,
      previousConfidence: offer.eligibilityConfidence,
      newConfidence: 1,
      source: "human",
      reason: args.reason?.trim() || undefined,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.id, {
      eligibility: args.eligibility,
      conditions,
      eligibilityConfidence: 1,
      eligibilityStatus: "human_validated",
      updatedAt: Date.now(),
    });
  },
});

export const listEligibilityHistory = query({
  args: { offerId: v.id("offers") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("offerEligibilityHistory")
      .withIndex("by_offer", (q) => q.eq("offerId", args.offerId))
      .collect();
    return [...rows].sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listEligibilityReview = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const rows = await ctx.db
      .query("offers")
      .withIndex("by_eligibilityStatus", (q) =>
        q.eq("eligibilityStatus", "review_required"),
      )
      .collect();
    const sorted = [...rows].sort(
      (a, b) => (a.eligibilityConfidence ?? 1) - (b.eligibilityConfidence ?? 1),
    );
    const slice = sorted.slice(0, limit);
    return await Promise.all(
      slice.map(async (o) => {
        const supermarket = await ctx.db.get(o.supermarketId);
        return {
          ...o,
          supermarketName: supermarket?.name ?? "—",
          condition: publicCondition(o),
        };
      }),
    );
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
    eligibility: v.optional(eligibilityType),
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
    if (args.eligibility) {
      base = base.filter((o) => (o.eligibility ?? "ALL_CUSTOMERS") === args.eligibility);
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
          condition: publicCondition(o),
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
          condition: publicCondition(o),
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
      condition: publicCondition(offer),
    };
  },
});
