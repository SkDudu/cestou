import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const flowStatus = v.union(
  v.literal("draft"),
  v.literal("testing"),
  v.literal("active"),
  v.literal("disabled"),
  v.literal("error"),
);

export const list = query({
  args: { supermarketId: v.optional(v.id("supermarkets")) },
  handler: async (ctx, args) => {
    if (args.supermarketId) {
      return ctx.db
        .query("scraperFlows")
        .withIndex("by_supermarket", (q) =>
          q.eq("supermarketId", args.supermarketId!),
        )
        .collect();
    }
    return ctx.db.query("scraperFlows").collect();
  },
});

export const get = query({
  args: { id: v.id("scraperFlows") },
  handler: async (ctx, args) => {
    const flow = await ctx.db.get(args.id);
    if (!flow) return null;
    const steps = await ctx.db
      .query("scraperSteps")
      .withIndex("by_flow_order", (q) => q.eq("flowId", args.id))
      .collect();
    steps.sort((a, b) => a.order - b.order);
    const supermarket = await ctx.db.get(flow.supermarketId);
    const runs = await ctx.db
      .query("scraperRuns")
      .withIndex("by_flow", (q) => q.eq("flowId", args.id))
      .collect();
    runs.sort((a, b) => b.startedAt - a.startedAt);
    return {
      ...flow,
      steps,
      supermarket,
      recentRuns: runs.slice(0, 20),
    };
  },
});

export const create = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    name: v.string(),
    startUrl: v.string(),
    config: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("scraperFlows", {
      supermarketId: args.supermarketId,
      name: args.name,
      startUrl: args.startUrl,
      status: "draft",
      version: 1,
      config: args.config,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("scraperFlows"),
    name: v.optional(v.string()),
    startUrl: v.optional(v.string()),
    status: v.optional(flowStatus),
    config: v.optional(v.string()),
    schedule: v.optional(v.string()),
    nextRunAt: v.optional(v.number()),
    bumpVersion: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const flow = await ctx.db.get(args.id);
    if (!flow) throw new Error("Flow not found");
    const { id, bumpVersion, ...rest } = args;
    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    if (bumpVersion) patch.version = flow.version + 1;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("scraperFlows") },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query("scraperSteps")
      .withIndex("by_flow_order", (q) => q.eq("flowId", args.id))
      .collect();
    for (const s of steps) await ctx.db.delete(s._id);
    const runs = await ctx.db
      .query("scraperRuns")
      .withIndex("by_flow", (q) => q.eq("flowId", args.id))
      .collect();
    for (const r of runs) await ctx.db.delete(r._id);
    await ctx.db.delete(args.id);
  },
});
