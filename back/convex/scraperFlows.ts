import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

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
    scope: v.optional(v.union(v.literal("supermarket"), v.literal("store"))),
    storeId: v.optional(v.id("stores")),
  },
  handler: async (ctx, args) => {
    const sm = await ctx.db.get(args.supermarketId);
    if (!sm) throw new Error("Supermarket not found");
    const scope = args.scope ?? "supermarket";
    let storeId = args.storeId;
    let storeName: string | undefined;
    let storeUrl: string | undefined;
    if (scope === "store") {
      if (!storeId) throw new Error("Escolha uma filial");
      const store = await ctx.db.get(storeId);
      if (!store || store.supermarketId !== args.supermarketId) {
        throw new Error("Filial inválida");
      }
      storeName = store.name;
      storeUrl = store.url?.trim();
    } else {
      storeId = undefined;
    }
    const startUrl =
      (args.startUrl?.trim() || storeUrl || sm.websiteUrl?.trim()) ?? "";
    if (!startUrl) {
      throw new Error("Supermarket has no website URL — set it on the market first");
    }
    const name =
      scope === "store" && storeName
        ? `${args.name} — ${storeName}`
        : args.name;
    const now = Date.now();
    const flowId = await ctx.db.insert("scraperFlows", {
      supermarketId: args.supermarketId,
      scope,
      storeId,
      name,
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
      label: `Worker criado: ${name}`,
      payload: JSON.stringify({
        startUrl,
        supermarketId: args.supermarketId,
        scope,
        storeId,
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
    scope: v.optional(v.union(v.literal("supermarket"), v.literal("store"))),
    storeId: v.optional(v.id("stores")),
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
    if (args.scope === "supermarket") {
      patch.storeId = undefined;
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
/** Max gap between discovery checks while a flyer is still valid. */
export const DISCOVERY_MAX_INTERVAL_MS = 6 * HOUR;
const MAX_ATTEMPTS = 4;

function capNextRunAt(now: number, candidate: number) {
  return Math.min(Math.max(candidate, now), now + DISCOVERY_MAX_INTERVAL_MS);
}

/** Arm active flows for a supermarket without replacing an earlier due check. */
export async function armDiscoveryForSupermarket(
  ctx: Pick<MutationCtx, "db">,
  supermarketId: Id<"supermarkets">,
  nextRunAt: number,
) {
  const flows = await ctx.db
    .query("scraperFlows")
    .withIndex("by_supermarket", (q) => q.eq("supermarketId", supermarketId))
    .collect();
  const now = Date.now();
  for (const flow of flows) {
    if (flow.status !== "active") continue;
    await ctx.db.patch(flow._id, {
      nextRunAt: Math.min(flow.nextRunAt ?? nextRunAt, nextRunAt),
      updatedAt: now,
    });
  }
}

/** Ensure no active flow waits more than DISCOVERY_MAX_INTERVAL_MS since last run. */
export async function armPeriodicDiscovery(ctx: Pick<MutationCtx, "db">) {
  const now = Date.now();
  const flows = await ctx.db
    .query("scraperFlows")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  for (const flow of flows) {
    const dueBy =
      (flow.lastRunAt ?? now - DISCOVERY_MAX_INTERVAL_MS) +
      DISCOVERY_MAX_INTERVAL_MS;
    const nextRunAt = Math.min(flow.nextRunAt ?? dueBy, dueBy);
    if (flow.nextRunAt === nextRunAt) continue;
    await ctx.db.patch(flow._id, { nextRunAt, updatedAt: now });
  }
}

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
    const nextRunAt =
      next === undefined
        ? now + DISCOVERY_MAX_INTERVAL_MS
        : capNextRunAt(now, next);
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

    // Discovery ok but nothing new: keep flow healthy, recheck within max interval.
    if (args.ok) {
      const nextRunAt = now + DISCOVERY_MAX_INTERVAL_MS;
      await ctx.db.patch(flow._id, {
        lastRunAt: now,
        discoveryAttempts: 0,
        nextRunAt,
        updatedAt: now,
      });
      return { status: flow.status, attempts: 0, nextRunAt };
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
