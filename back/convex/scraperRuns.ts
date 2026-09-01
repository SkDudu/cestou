import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const runStatus = v.union(
  v.literal("running"),
  v.literal("success"),
  v.literal("partial"),
  v.literal("cancelled"),
  v.literal("duplicate"),
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

export const get = query({
  args: { id: v.id("scraperRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) return null;
    const flow = await ctx.db.get(run.flowId);
    const supermarket = flow
      ? await ctx.db.get(flow.supermarketId)
      : null;
    return { ...run, flow, supermarket };
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 40;
    const runs = await ctx.db.query("scraperRuns").collect();
    runs.sort((a, b) => b.startedAt - a.startedAt);
    const slice = runs.slice(0, limit);
    return await Promise.all(
      slice.map(async (run) => {
        const flow = await ctx.db.get(run.flowId);
        const supermarket = flow
          ? await ctx.db.get(flow.supermarketId)
          : null;
        const from = run.startedAt;
        const to = (run.finishedAt ?? Date.now()) + 120_000;
        let offerCount = 0;
        let pendingCount = 0;
        let suspiciousCount = 0;
        if (flow) {
          const offers = await ctx.db
            .query("offers")
            .withIndex("by_supermarket", (q) =>
              q.eq("supermarketId", flow.supermarketId),
            )
            .collect();
          const inWindow = offers.filter(
            (o) => o.createdAt >= from && o.createdAt <= to,
          );
          offerCount = inWindow.length;
          pendingCount = inWindow.filter(
            (o) => o.validationStatus === "pending",
          ).length;
          suspiciousCount = inWindow.filter(
            (o) => o.validationStatus === "suspicious",
          ).length;
        }
        const queue: "fila" | "review" | "blocked" | "done" =
          run.status === "failed"
            ? "blocked"
            : suspiciousCount > 0 || run.status === "partial"
              ? "review"
              : pendingCount > 0
                ? "fila"
                : "done";
        return {
          ...run,
          flowName: flow?.name ?? "—",
          supermarketName: supermarket?.name ?? "—",
          offerCount,
          pendingCount,
          queue,
        };
      }),
    );
  },
});

/** Flyers + offers + page images for a finished run (review UI). */
export const review = query({
  args: { runId: v.id("scraperRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const flow = await ctx.db.get(run.flowId);
    if (!flow) return null;
    const supermarket = await ctx.db.get(flow.supermarketId);
    const from = run.startedAt;
    const to = (run.finishedAt ?? Date.now()) + 120_000;

    const marketFlyers = await ctx.db
      .query("flyers")
      .withIndex("by_supermarket", (q) =>
        q.eq("supermarketId", flow.supermarketId),
      )
      .collect();

    let flyers = marketFlyers.filter(
      (f) =>
        (f.createdAt >= from && f.createdAt <= to) ||
        (f.updatedAt >= from && f.updatedAt <= to),
    );
    if (!flyers.length) {
      // fall back: flyers that got offers during the run window
      const offers = await ctx.db
        .query("offers")
        .withIndex("by_supermarket", (q) =>
          q.eq("supermarketId", flow.supermarketId),
        )
        .collect();
      const flyerIds = new Set(
        offers
          .filter((o) => o.createdAt >= from && o.createdAt <= to)
          .map((o) => o.flyerId),
      );
      flyers = marketFlyers.filter((f) => flyerIds.has(f._id));
    }

    flyers.sort((a, b) => b.updatedAt - a.updatedAt);

    const flyersOut = await Promise.all(
      flyers.map(async (f) => {
        const pages = await ctx.db
          .query("flyerPages")
          .withIndex("by_flyer", (q) => q.eq("flyerId", f._id))
          .collect();
        pages.sort((a, b) => a.pageNumber - b.pageNumber);
        const pageRows = await Promise.all(
          pages.map(async (p) => ({
            pageNumber: p.pageNumber,
            url: await ctx.storage.getUrl(p.storageId),
          })),
        );
        const coverUrl = f.storageId
          ? await ctx.storage.getUrl(f.storageId)
          : pageRows[0]?.url ?? null;
        const offers = await ctx.db
          .query("offers")
          .withIndex("by_flyer", (q) => q.eq("flyerId", f._id))
          .collect();
        offers.sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
        return {
          _id: f._id,
          title: f.title ?? f.originalUrl,
          status: f.status,
          originalUrl: f.originalUrl,
          coverUrl,
          pages: pageRows.filter((p) => p.url),
          offers,
        };
      }),
    );

    const pending = flyersOut.reduce(
      (n, f) =>
        n + f.offers.filter((o) => o.validationStatus === "pending").length,
      0,
    );
    const totalOffers = flyersOut.reduce((n, f) => n + f.offers.length, 0);

    return {
      run,
      flow: { _id: flow._id, name: flow.name, startUrl: flow.startUrl },
      supermarket: supermarket
        ? { _id: supermarket._id, name: supermarket.name }
        : null,
      flyers: flyersOut,
      pending,
      totalOffers,
    };
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

/** Mid-run stdout / counters — UI keeps following without SSE. */
export const progress = mutation({
  args: {
    id: v.id("scraperRuns"),
    stepsExecuted: v.optional(v.number()),
    flyersFound: v.optional(v.number()),
    storesFound: v.optional(v.number()),
    log: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run || run.status !== "running") return;
    const patch: Record<string, unknown> = {};
    if (args.stepsExecuted !== undefined) {
      patch.stepsExecuted = args.stepsExecuted;
    }
    if (args.flyersFound !== undefined) patch.flyersFound = args.flyersFound;
    if (args.storesFound !== undefined) patch.storesFound = args.storesFound;
    if (args.log !== undefined) patch.log = args.log;
    if (Object.keys(patch).length) await ctx.db.patch(args.id, patch);
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
