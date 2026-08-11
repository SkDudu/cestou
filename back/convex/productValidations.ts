import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const validationStatus = v.union(
  v.literal("pending"),
  v.literal("validated"),
  v.literal("suspicious"),
  v.literal("invalid"),
);

const validationIssue = v.object({
  ruleId: v.string(),
  severity: v.union(
    v.literal("info"),
    v.literal("warning"),
    v.literal("error"),
  ),
  code: v.string(),
  message: v.string(),
  field: v.optional(v.string()),
  value: v.optional(v.any()),
});

/** Human override from dashboard. */
export const set = mutation({
  args: {
    rawProductId: v.id("rawProducts"),
    status: validationStatus,
    reason: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("productValidations")
      .withIndex("by_rawProduct", (q) => q.eq("rawProductId", args.rawProductId))
      .unique();

    const automatedStatus =
      existing?.automatedStatus ??
      (existing?.source === "rules" ? existing.status : existing?.automatedStatus);

    const payload = {
      rawProductId: args.rawProductId,
      status: args.status,
      source: "human" as const,
      automatedStatus,
      score: existing?.score,
      issues: existing?.issues,
      rulesVersion: existing?.rulesVersion,
      reason: args.reason,
      notes: args.notes,
      validatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("productValidations", payload);
  },
});

/**
 * Deterministic rules result (scrape / npm run validate).
 * Skips overwrite when human locked, unless force=true.
 */
export const setFromRules = mutation({
  args: {
    rawProductId: v.id("rawProducts"),
    status: validationStatus,
    score: v.number(),
    issues: v.array(validationIssue),
    rulesVersion: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("productValidations")
      .withIndex("by_rawProduct", (q) => q.eq("rawProductId", args.rawProductId))
      .unique();

    if (existing?.source === "human" && !args.force) {
      // keep human decision; refresh automated snapshot only
      await ctx.db.patch(existing._id, {
        automatedStatus: args.status,
        score: args.score,
        issues: args.issues,
        rulesVersion: args.rulesVersion,
      });
      return { id: existing._id, skipped: true };
    }

    const payload = {
      rawProductId: args.rawProductId,
      status: args.status,
      source: "rules" as const,
      automatedStatus: args.status,
      score: args.score,
      issues: args.issues,
      rulesVersion: args.rulesVersion,
      reason: undefined,
      notes: undefined,
      validatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { id: existing._id, skipped: false };
    }

    const id = await ctx.db.insert("productValidations", payload);
    return { id, skipped: false };
  },
});

export const getByRawProduct = query({
  args: { rawProductId: v.id("rawProducts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productValidations")
      .withIndex("by_rawProduct", (q) => q.eq("rawProductId", args.rawProductId))
      .unique();
  },
});

export const listByStatus = query({
  args: {
    status: validationStatus,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("productValidations")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .take(limit);
  },
});
