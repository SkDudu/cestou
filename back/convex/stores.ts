import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "loja";
}

async function uniqueSlug(
  ctx: MutationCtx,
  supermarketId: string,
  base: string,
  excludeId?: string,
) {
  let slug = base;
  let n = 0;
  for (;;) {
    const hit = await ctx.db
      .query("stores")
      .withIndex("by_supermarket_slug", (q) =>
        q.eq("supermarketId", supermarketId as never).eq("slug", slug),
      )
      .unique();
    if (!hit || hit._id === excludeId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export const listBySupermarket = query({
  args: { supermarketId: v.id("supermarkets") },
  handler: async (ctx, args) =>
    ctx.db
      .query("stores")
      .withIndex("by_supermarket", (q) =>
        q.eq("supermarketId", args.supermarketId),
      )
      .collect(),
});

export const get = query({
  args: { id: v.id("stores") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const create = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    name: v.string(),
    address: v.optional(v.string()),
    number: v.optional(v.string()),
    neighborhood: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    zipCode: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    phone: v.optional(v.string()),
    url: v.optional(v.string()),
    externalId: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const sm = await ctx.db.get(args.supermarketId);
    if (!sm) throw new Error("Supermarket not found");
    const slug = await uniqueSlug(
      ctx,
      args.supermarketId,
      slugify(args.name),
    );
    const now = Date.now();
    return await ctx.db.insert("stores", {
      supermarketId: args.supermarketId,
      name: args.name.trim(),
      slug,
      address: args.address?.trim() || undefined,
      number: args.number?.trim() || undefined,
      neighborhood: args.neighborhood?.trim() || undefined,
      city: args.city.trim(),
      state: args.state.trim().toUpperCase(),
      zipCode: args.zipCode?.trim() || undefined,
      latitude: args.latitude,
      longitude: args.longitude,
      phone: args.phone?.trim() || undefined,
      url: args.url?.trim() || undefined,
      externalId: args.externalId?.trim() || undefined,
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Cria 1 filial ativa por rede que ainda não tem loja (necessário pro client). */
export const ensureDefaultsForNetworks = mutation({
  args: {},
  handler: async (ctx) => {
    const supers = await ctx.db.query("supermarkets").collect();
    const created: string[] = [];
    const now = Date.now();
    for (const sm of supers) {
      if (!sm.active) continue;
      const existing = await ctx.db
        .query("stores")
        .withIndex("by_supermarket", (q) => q.eq("supermarketId", sm._id))
        .first();
      if (existing) continue;
      const name = `${sm.name} — ${sm.city}`;
      const slug = await uniqueSlug(ctx, sm._id, slugify(name));
      await ctx.db.insert("stores", {
        supermarketId: sm._id,
        name,
        slug,
        city: sm.city,
        state: sm.state.trim().toUpperCase(),
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      created.push(sm.name);
    }
    return { createdCount: created.length, created };
  },
});

export const update = mutation({
  args: {
    id: v.id("stores"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    number: v.optional(v.string()),
    neighborhood: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    phone: v.optional(v.string()),
    url: v.optional(v.string()),
    externalId: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Store not found");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) {
      if (val === undefined) continue;
      if (typeof val === "string") {
        const t = val.trim();
        patch[k] = k === "state" ? t.toUpperCase() : t || undefined;
      } else {
        patch[k] = val;
      }
    }
    if (typeof rest.name === "string" && rest.name.trim()) {
      patch.slug = await uniqueSlug(
        ctx,
        existing.supermarketId,
        slugify(rest.name),
        id,
      );
    }
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("stores") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("flyerSourceStores")
      .withIndex("by_store", (q) => q.eq("storeId", args.id))
      .collect();
    for (const link of links) await ctx.db.delete(link._id);
    await ctx.db.delete(args.id);
  },
});
