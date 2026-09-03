import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const sourceType = v.union(
  v.literal("pdf"),
  v.literal("image"),
  v.literal("web"),
  v.literal("dynamic"),
  v.literal("manual"),
);

const sourceScope = v.union(v.literal("supermarket"), v.literal("store"));

const operationalStatus = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("error"),
  v.literal("not_configured"),
);

type OpStatus = "active" | "inactive" | "error" | "not_configured";

function resolveOpStatus(s: {
  active: boolean;
  operationalStatus?: OpStatus;
  flowId?: Id<"scraperFlows">;
  type: string;
}): OpStatus {
  if (s.operationalStatus) return s.operationalStatus;
  if (!s.active) return "inactive";
  if (s.type !== "manual" && !s.flowId) return "not_configured";
  return "active";
}

function activeFromOp(op: OpStatus) {
  return op === "active";
}

export async function resolveSourceStoreIds(
  ctx: QueryCtx | MutationCtx,
  sourceId: Id<"flyerSources">,
): Promise<Id<"stores">[] | undefined> {
  const source = await ctx.db.get(sourceId);
  if (!source || source.scope !== "store") return undefined;
  const links = await ctx.db
    .query("flyerSourceStores")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .collect();
  return links.map((l) => l.storeId);
}

async function setSourceStores(
  ctx: MutationCtx,
  sourceId: Id<"flyerSources">,
  storeIds: Id<"stores">[],
) {
  const existing = await ctx.db
    .query("flyerSourceStores")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .collect();
  for (const row of existing) await ctx.db.delete(row._id);
  const now = Date.now();
  for (const storeId of storeIds) {
    await ctx.db.insert("flyerSourceStores", {
      sourceId,
      storeId,
      createdAt: now,
    });
  }
}

function enrichSource<T extends {
  _id: Id<"flyerSources">;
  active: boolean;
  operationalStatus?: OpStatus;
  flowId?: Id<"scraperFlows">;
  type: string;
}>(s: T, storeIds: Id<"stores">[]) {
  const op = resolveOpStatus(s);
  return { ...s, storeIds, operationalStatus: op };
}

export const ensure = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    type: sourceType,
    url: v.string(),
    active: v.optional(v.boolean()),
    name: v.optional(v.string()),
    scope: v.optional(sourceScope),
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
        name: args.name ?? match.name,
        scope: args.scope ?? match.scope,
        updatedAt: now,
      });
      return match._id;
    }
    const active = args.active ?? true;
    return await ctx.db.insert("flyerSources", {
      supermarketId: args.supermarketId,
      name: args.name,
      type: args.type,
      url: args.url,
      scope: args.scope ?? "supermarket",
      operationalStatus: active ? "not_configured" : "inactive",
      active,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const create = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    name: v.optional(v.string()),
    type: sourceType,
    url: v.string(),
    scope: v.optional(sourceScope),
    active: v.optional(v.boolean()),
    operationalStatus: v.optional(operationalStatus),
    flowId: v.optional(v.id("scraperFlows")),
    storeIds: v.optional(v.array(v.id("stores"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const scope = args.scope ?? "supermarket";
    let op: OpStatus =
      args.operationalStatus ??
      (args.active === false
        ? "inactive"
        : args.flowId || args.type === "manual"
          ? "active"
          : "not_configured");
    if (args.flowId) {
      const flow = await ctx.db.get(args.flowId);
      if (!flow || flow.supermarketId !== args.supermarketId) {
        throw new Error("Worker inválido para esta rede");
      }
    }
    const id = await ctx.db.insert("flyerSources", {
      supermarketId: args.supermarketId,
      name: args.name?.trim() || undefined,
      type: args.type,
      url: args.url.trim(),
      scope,
      operationalStatus: op,
      flowId: args.flowId,
      active: activeFromOp(op),
      createdAt: now,
      updatedAt: now,
    });
    if (scope === "store" && args.storeIds?.length) {
      await setSourceStores(ctx, id, args.storeIds);
    }
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("flyerSources"),
    name: v.optional(v.string()),
    type: v.optional(sourceType),
    url: v.optional(v.string()),
    scope: v.optional(sourceScope),
    active: v.optional(v.boolean()),
    operationalStatus: v.optional(operationalStatus),
    flowId: v.optional(v.id("scraperFlows")),
    clearFlowId: v.optional(v.boolean()),
    storeIds: v.optional(v.array(v.id("stores"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Flyer source not found");

    let nextFlowId = existing.flowId;
    if (args.clearFlowId) nextFlowId = undefined;
    else if (args.flowId !== undefined) {
      const flow = await ctx.db.get(args.flowId);
      if (!flow || flow.supermarketId !== existing.supermarketId) {
        throw new Error("Worker inválido para esta rede");
      }
      nextFlowId = args.flowId;
    }

    let op = existing.operationalStatus ?? resolveOpStatus(existing);
    if (args.operationalStatus) op = args.operationalStatus;
    else if (args.active !== undefined) op = args.active ? "active" : "inactive";

    const scope = args.scope ?? existing.scope ?? "supermarket";
    await ctx.db.replace(args.id, {
      supermarketId: existing.supermarketId,
      name:
        args.name !== undefined
          ? args.name.trim() || undefined
          : existing.name,
      type: args.type ?? existing.type,
      url: args.url !== undefined ? args.url.trim() : existing.url,
      scope,
      operationalStatus: op,
      flowId: nextFlowId,
      active: activeFromOp(op),
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    });

    if (args.storeIds !== undefined) {
      if (scope === "store") await setSourceStores(ctx, args.id, args.storeIds);
      else await setSourceStores(ctx, args.id, []);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("flyerSources") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("flyerSourceStores")
      .withIndex("by_source", (q) => q.eq("sourceId", args.id))
      .collect();
    for (const link of links) await ctx.db.delete(link._id);
    await ctx.db.delete(args.id);
  },
});

export const listBySupermarket = query({
  args: { supermarketId: v.id("supermarkets") },
  handler: async (ctx, args) => {
    const sources = await ctx.db
      .query("flyerSources")
      .withIndex("by_supermarket", (q) =>
        q.eq("supermarketId", args.supermarketId),
      )
      .collect();
    return await Promise.all(
      sources.map(async (s) => {
        const links = await ctx.db
          .query("flyerSourceStores")
          .withIndex("by_source", (q) => q.eq("sourceId", s._id))
          .collect();
        return enrichSource(s, links.map((l) => l.storeId));
      }),
    );
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("flyerSources").collect();
    return all.filter((s) => resolveOpStatus(s) === "active");
  },
});

export const get = query({
  args: { id: v.id("flyerSources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.id);
    if (!source) return null;
    const storeIds = (await resolveSourceStoreIds(ctx, args.id)) ?? [];
    return enrichSource(source, storeIds);
  },
});

export const getStoreIds = query({
  args: { id: v.id("flyerSources") },
  handler: async (ctx, args) => resolveSourceStoreIds(ctx, args.id),
});
