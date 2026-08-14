import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const runStatus = v.union(
  v.literal("running"),
  v.literal("success"),
  v.literal("partial"),
  v.literal("failed"),
);

export const listByFlow = query({
  args: { flowId: v.id("scraperFlows"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("scraperRuns")
      .withIndex("by_flow", (q) => q.eq("flowId", args.flowId))
      .collect();
    runs.sort((a, b) => b.startedAt - a.startedAt);
    return runs.slice(0, args.limit ?? 20);
  },
});

export const start = mutation({
  args: { flowId: v.id("scraperFlows") },
  handler: async (ctx, args) => {
    const flow = await ctx.db.get(args.flowId);
    if (!flow) throw new Error("Flow not found");
    return ctx.db.insert("scraperRuns", {
      flowId: args.flowId,
      status: "running",
      startedAt: Date.now(),
      stepsExecuted: 0,
      flyersFound: 0,
      storesFound: 0,
    });
  },
});

export const finish = mutation({
  args: {
    id: v.id("scraperRuns"),
    status: runStatus,
    stepsExecuted: v.number(),
    flyersFound: v.number(),
    storesFound: v.number(),
    error: v.optional(v.string()),
    log: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    await ctx.db.patch(id, {
      ...rest,
      finishedAt: Date.now(),
    });
  },
});
