import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

const stage = v.union(
  v.literal("DISCOVERY"),
  v.literal("DOWNLOAD"),
  v.literal("STORAGE"),
  v.literal("OCR"),
  v.literal("PARSER"),
  v.literal("VALIDATION"),
  v.literal("AI_VISION"),
);

export const insert = mutation({
  args: {
    flyerId: v.optional(v.id("flyers")),
    supermarketId: v.id("supermarkets"),
    stage,
    message: v.string(),
    stack: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    ctx.db.insert("flyerErrors", {
      flyerId: args.flyerId,
      supermarketId: args.supermarketId,
      stage: args.stage,
      message: args.message,
      stack: args.stack,
      status: "open",
      createdAt: Date.now(),
    }),
});

export const resolve = mutation({
  args: { id: v.id("flyerErrors") },
  handler: async (ctx, args) => {
    const err = await ctx.db.get(args.id);
    if (!err) throw new Error("Error not found");
    await ctx.db.patch(args.id, { status: "resolved" });
  },
});

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const status = args.status ?? "open";
    const result = await ctx.db
      .query("flyerErrors")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (e) => {
        const supermarket = await ctx.db.get(e.supermarketId);
        return {
          ...e,
          supermarketName: supermarket?.name ?? "—",
        };
      }),
    );

    return { ...result, page };
  },
});

export const get = query({
  args: { id: v.id("flyerErrors") },
  handler: async (ctx, args) => {
    const err = await ctx.db.get(args.id);
    if (!err) return null;
    const supermarket = await ctx.db.get(err.supermarketId);
    const flyer = err.flyerId ? await ctx.db.get(err.flyerId) : null;
    return { ...err, supermarket, flyer };
  },
});
