import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const provider = v.union(
  v.literal("mimo-v2.5"),
  v.literal("tesseract-rules"),
);

const status = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
);

export const insert = mutation({
  args: {
    flyerId: v.id("flyers"),
    pageId: v.id("flyerPages"),
    pageNumber: v.number(),
    provider,
    model: v.string(),
    promptVersion: v.string(),
    status,
    rawResponse: v.optional(v.string()),
    offerCount: v.optional(v.number()),
    extractionConfidence: v.optional(v.number()),
    error: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("flyerExtractions", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const findCompleted = query({
  args: {
    pageId: v.id("flyerPages"),
    model: v.string(),
    promptVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("flyerExtractions")
      .withIndex("by_page_model_prompt", (q) =>
        q
          .eq("pageId", args.pageId)
          .eq("model", args.model)
          .eq("promptVersion", args.promptVersion),
      )
      .collect();
    return rows.find((r) => r.status === "completed") ?? null;
  },
});

export const getLatestByPage = query({
  args: {
    flyerId: v.id("flyers"),
    pageNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("flyerExtractions")
      .withIndex("by_flyer_page", (q) =>
        q.eq("flyerId", args.flyerId).eq("pageNumber", args.pageNumber),
      )
      .collect();
    return [...rows].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  },
});

export const listByFlyer = query({
  args: { flyerId: v.id("flyers") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("flyerExtractions")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.flyerId))
      .collect();
    return [...rows].sort(
      (a, b) => a.pageNumber - b.pageNumber || b.createdAt - a.createdAt,
    );
  },
});
