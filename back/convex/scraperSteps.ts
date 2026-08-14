import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const stepType = v.union(
  v.literal("navigate"),
  v.literal("click"),
  v.literal("select"),
  v.literal("input"),
  v.literal("wait"),
  v.literal("scroll"),
  v.literal("discover-store"),
  v.literal("discover-flyer"),
  v.literal("capture-network"),
  v.literal("download-flyers"),
  v.literal("extract-offers"),
  v.literal("select-scope"),
);

export const listByFlow = query({
  args: { flowId: v.id("scraperFlows") },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query("scraperSteps")
      .withIndex("by_flow_order", (q) => q.eq("flowId", args.flowId))
      .collect();
    return steps.sort((a, b) => a.order - b.order);
  },
});

export const add = mutation({
  args: {
    flowId: v.id("scraperFlows"),
    type: stepType,
    config: v.string(),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("scraperSteps")
      .withIndex("by_flow_order", (q) => q.eq("flowId", args.flowId))
      .collect();
    const order =
      args.order ??
      (existing.length
        ? Math.max(...existing.map((s) => s.order)) + 1
        : 0);
    const now = Date.now();
    const id = await ctx.db.insert("scraperSteps", {
      flowId: args.flowId,
      order,
      type: args.type,
      config: args.config,
      createdAt: now,
      updatedAt: now,
    });
    const flow = await ctx.db.get(args.flowId);
    if (flow) {
      await ctx.db.patch(args.flowId, {
        version: flow.version + 1,
        updatedAt: now,
      });
    }
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("scraperSteps"),
    type: v.optional(stepType),
    config: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const step = await ctx.db.get(args.id);
    if (!step) throw new Error("Step not found");
    const { id, ...rest } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(id, patch);
    const flow = await ctx.db.get(step.flowId);
    if (flow) {
      await ctx.db.patch(step.flowId, {
        version: flow.version + 1,
        updatedAt: Date.now(),
      });
    }
  },
});

export const remove = mutation({
  args: { id: v.id("scraperSteps") },
  handler: async (ctx, args) => {
    const step = await ctx.db.get(args.id);
    if (!step) return;
    await ctx.db.delete(args.id);
    const flow = await ctx.db.get(step.flowId);
    if (flow) {
      await ctx.db.patch(step.flowId, {
        version: flow.version + 1,
        updatedAt: Date.now(),
      });
    }
  },
});

/** Replace all steps (recorder save). Bumps flow version once. */
export const replaceAll = mutation({
  args: {
    flowId: v.id("scraperFlows"),
    steps: v.array(
      v.object({
        type: stepType,
        config: v.string(),
        order: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("scraperSteps")
      .withIndex("by_flow_order", (q) => q.eq("flowId", args.flowId))
      .collect();
    for (const s of old) await ctx.db.delete(s._id);
    const now = Date.now();
    for (const s of args.steps) {
      await ctx.db.insert("scraperSteps", {
        flowId: args.flowId,
        order: s.order,
        type: s.type,
        config: s.config,
        createdAt: now,
        updatedAt: now,
      });
    }
    const flow = await ctx.db.get(args.flowId);
    if (flow) {
      await ctx.db.patch(args.flowId, {
        version: flow.version + 1,
        updatedAt: now,
        status: flow.status === "active" ? "testing" : flow.status,
      });
    }
  },
});
