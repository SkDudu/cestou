import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const sourceType = v.union(
  v.literal("pdf"),
  v.literal("image"),
  v.literal("web"),
  v.literal("dynamic"),
);

export const ensure = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    type: sourceType,
    url: v.string(),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("flyerSources")
      .withIndex("by_supermarket", (q) =>
        q.eq("supermarketId", args.supermarketId),
      )
      .collect();
    const match = existing.find((s) => s.url === args.url);
    if (match) {
      await ctx.db.patch(match._id, {
        type: args.type,
        active: args.active ?? match.active,
        updatedAt: now,
      });
      return match._id;
    }
    return await ctx.db.insert("flyerSources", {
      supermarketId: args.supermarketId,
      type: args.type,
      url: args.url,
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const create = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    type: sourceType,
    url: v.string(),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("flyerSources", {
      supermarketId: args.supermarketId,
      type: args.type,
      url: args.url,
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("flyerSources"),
    type: v.optional(sourceType),
    url: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Flyer source not found");
    await ctx.db.patch(id, {
      ...Object.fromEntries(
        Object.entries(patch).filter(([, val]) => val !== undefined),
      ),
      updatedAt: Date.now(),
    });
  },
});

export const listBySupermarket = query({
  args: { supermarketId: v.id("supermarkets") },
  handler: async (ctx, args) =>
    ctx.db
      .query("flyerSources")
      .withIndex("by_supermarket", (q) =>
        q.eq("supermarketId", args.supermarketId),
      )
      .collect(),
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("flyerSources").collect();
    return all.filter((s) => s.active);
  },
});

export const get = query({
  args: { id: v.id("flyerSources") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});
