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
    const setupEvents = await ctx.db
      .query("scraperSetupEvents")
      .withIndex("by_flow_order", (q) => q.eq("flowId", args.id))
      .collect();
    setupEvents.sort((a, b) => a.order - b.order);
    return {
      ...flow,
      steps,
      supermarket,
      recentRuns: runs.slice(0, 20),
      setupEvents: setupEvents.slice(-200),
    };
  },
});

export const create = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    name: v.string(),
    startUrl: v.optional(v.string()),
    config: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sm = await ctx.db.get(args.supermarketId);
    if (!sm) throw new Error("Supermarket not found");
    const startUrl = (args.startUrl?.trim() || sm.websiteUrl?.trim()) ?? "";
    if (!startUrl) {
      throw new Error("Supermarket has no website URL — set it on the market first");
    }
    const now = Date.now();
    const flowId = await ctx.db.insert("scraperFlows", {
      supermarketId: args.supermarketId,
      name: args.name,
      startUrl,
      status: "draft",
      version: 1,
      config: args.config,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("scraperSetupEvents", {
      flowId,
      order: 0,
      at: now,
      kind: "flow_created",
      label: `Worker criado: ${args.name}`,
      payload: JSON.stringify({
        startUrl,
        supermarketId: args.supermarketId,
      }),
    });
    return flowId;
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
    if (args.status === "active" && flow.status !== "active") {
      patch.discoveryAttempts = 0;
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
    const traces = await ctx.db
      .query("scraperSetupEvents")
      .withIndex("by_flow_order", (q) => q.eq("flowId", args.id))
      .collect();
    for (const t of traces) await ctx.db.delete(t._id);
    await ctx.db.delete(args.id);
  },
});

export const listDue = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const flows = await ctx.db
      .query("scraperFlows")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return flows.filter(
      (f) => f.nextRunAt !== undefined && f.nextRunAt <= now,
    );
  },
});

const HOUR = 60 * 60 * 1000;
const MAX_ATTEMPTS = 4;

export const scheduleNextCheck = mutation({
  args: { flowId: v.id("scraperFlows") },
  handler: async (ctx, args) => {
    const flow = await ctx.db.get(args.flowId);
    if (!flow) throw new Error("Flow not found");
    const now = Date.now();
    const flyers = await ctx.db
      .query("flyers")
      .withIndex("by_supermarket", (q) =>
        q.eq("supermarketId", flow.supermarketId),
      )
      .collect();
    let next: number | undefined;
    for (const f of flyers) {
      if (
        f.status === "expired" ||
        f.status === "failed" ||
        f.validUntil === undefined
      ) {
        continue;
      }
      next = next === undefined ? f.validUntil : Math.min(next, f.validUntil);
    }
    if (next === undefined) {
      await ctx.db.patch(flow._id, { lastRunAt: now, updatedAt: now });
      return { nextRunAt: flow.nextRunAt };
    }
    const nextRunAt = next <= now ? now : next;
    await ctx.db.patch(flow._id, {
      lastRunAt: now,
      discoveryAttempts: 0,
      nextRunAt,
      updatedAt: now,
    });
    return { nextRunAt };
  },
});

export const recordDiscoveryResult = mutation({
  args: {
    flowId: v.id("scraperFlows"),
    ok: v.boolean(),
    newFlyers: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const flow = await ctx.db.get(args.flowId);
    if (!flow) throw new Error("Flow not found");
    const now = Date.now();
    const scopeLost = (args.error ?? "").includes("SCOPE_NOT_FOUND");

    if (args.ok && args.newFlyers > 0) {
      await ctx.db.patch(flow._id, {
        lastRunAt: now,
        discoveryAttempts: 0,
        updatedAt: now,
      });
      return { status: flow.status, attempts: 0 };
    }

    if (scopeLost) {
      if (flow.status !== "error") {
        await ctx.db.insert("flyerErrors", {
          supermarketId: flow.supermarketId,
          stage: "DISCOVERY",
          message: args.error ?? "SCOPE_NOT_FOUND",
          status: "open",
          createdAt: now,
        });
      }
      await ctx.db.patch(flow._id, {
        lastRunAt: now,
        discoveryAttempts: MAX_ATTEMPTS,
        status: "error",
        updatedAt: now,
      });
      return { status: "error" as const, attempts: MAX_ATTEMPTS };
    }

    const attempts = (flow.discoveryAttempts ?? 0) + 1;
    const delay = Math.min(8 * HOUR, HOUR << (attempts - 1));
    const patch: Record<string, unknown> = {
      lastRunAt: now,
      discoveryAttempts: attempts,
      nextRunAt: now + delay,
      updatedAt: now,
    };
    if (attempts >= MAX_ATTEMPTS) {
      patch.status = "error";
      await ctx.db.insert("flyerErrors", {
        supermarketId: flow.supermarketId,
        stage: "DISCOVERY",
        message: args.error ?? `Discovery failed after ${attempts} attempts`,
        status: "open",
        createdAt: now,
      });
    }
    await ctx.db.patch(flow._id, patch);
    return { status: attempts >= MAX_ATTEMPTS ? "error" : flow.status, attempts };
  },
});
