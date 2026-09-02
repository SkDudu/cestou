import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const setupEventKind = v.union(
  v.literal("flow_created"),
  v.literal("session_start"),
  v.literal("session_close"),
  v.literal("navigation"),
  v.literal("click"),
  v.literal("input"),
  v.literal("scroll"),
  v.literal("scope"),
  v.literal("locate"),
  v.literal("analyze"),
  v.literal("confirm_scope"),
  v.literal("preview"),
  v.literal("save"),
  v.literal("skip_flyer"),
  v.literal("remove_action"),
  v.literal("status"),
);

export const listByFlow = query({
  args: {
    flowId: v.id("scraperFlows"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 500, 1000);
    const rows = await ctx.db
      .query("scraperSetupEvents")
      .withIndex("by_flow_order", (q) => q.eq("flowId", args.flowId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    return rows.slice(-limit);
  },
});

export const append = mutation({
  args: {
    flowId: v.id("scraperFlows"),
    sessionId: v.optional(v.string()),
    kind: setupEventKind,
    label: v.string(),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const flow = await ctx.db.get(args.flowId);
    if (!flow) throw new Error("Flow not found");
    const last = await ctx.db
      .query("scraperSetupEvents")
      .withIndex("by_flow_order", (q) => q.eq("flowId", args.flowId))
      .order("desc")
      .first();
    const order = (last?.order ?? -1) + 1;
    return ctx.db.insert("scraperSetupEvents", {
      flowId: args.flowId,
      sessionId: args.sessionId,
      order,
      at: Date.now(),
      kind: args.kind,
      label: args.label,
      payload: args.payload,
    });
  },
});

export const removeByFlow = mutation({
  args: { flowId: v.id("scraperFlows") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("scraperSetupEvents")
      .withIndex("by_flow_order", (q) => q.eq("flowId", args.flowId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
