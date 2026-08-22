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
  return base || "market";
}

async function uniqueSlug(ctx: MutationCtx, base: string) {
  let slug = base;
  let n = 0;
  for (;;) {
    const hit = await ctx.db
      .query("supermarkets")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!hit) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export const ensure = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    country: v.string(),
    websiteUrl: v.optional(v.string()),
    active: v.optional(v.boolean()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const slug = args.slug?.trim()
      ? args.slug.trim()
      : await uniqueSlug(ctx, slugify(args.name));
    const existing = await ctx.db
      .query("supermarkets")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        city: args.city,
        state: args.state,
        country: args.country,
        websiteUrl: args.websiteUrl,
        active: args.active ?? existing.active,
        timezone: args.timezone ?? existing.timezone,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("supermarkets", {
      name: args.name,
      slug,
      city: args.city,
      state: args.state,
      country: args.country,
      websiteUrl: args.websiteUrl,
      active: args.active ?? true,
      timezone: args.timezone,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    city: v.string(),
    state: v.string(),
    country: v.string(),
    websiteUrl: v.optional(v.string()),
    active: v.optional(v.boolean()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = await uniqueSlug(ctx, slugify(args.name));
    const now = Date.now();
    return await ctx.db.insert("supermarkets", {
      name: args.name,
      slug,
      city: args.city,
      state: args.state,
      country: args.country,
      websiteUrl: args.websiteUrl,
      active: args.active ?? true,
      timezone: args.timezone,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("supermarkets"),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    active: v.optional(v.boolean()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Supermarket not found");
    await ctx.db.patch(id, {
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ),
      updatedAt: Date.now(),
    });
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("supermarkets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique(),
});

export const listNames = query({
  args: {},
  handler: async (ctx) => ctx.db.query("supermarkets").collect(),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const supermarkets = await ctx.db.query("supermarkets").collect();
    return await Promise.all(
      supermarkets.map(async (s) => {
        const sources = await ctx.db
          .query("flyerSources")
          .withIndex("by_supermarket", (q) => q.eq("supermarketId", s._id))
          .collect();
        const flyers = await ctx.db
          .query("flyers")
          .withIndex("by_supermarket", (q) => q.eq("supermarketId", s._id))
          .collect();
        const activeFlyer = flyers
          .filter(
            (f) =>
              f.status === "processed" ||
              f.status === "downloaded" ||
              f.status === "processing",
          )
          .sort((a, b) => (b.validUntil ?? 0) - (a.validUntil ?? 0))[0];
        const offerCount = (
          await ctx.db
            .query("offers")
            .withIndex("by_supermarket", (q) => q.eq("supermarketId", s._id))
            .collect()
        ).length;

        return {
          ...s,
          sourceCount: sources.length,
          activeSourceCount: sources.filter((x) => x.active).length,
          flyerCount: flyers.length,
          offerCount,
          activeFlyer,
        };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("supermarkets") },
  handler: async (ctx, args) => {
    const supermarket = await ctx.db.get(args.id);
    if (!supermarket) return null;

    const sources = await ctx.db
      .query("flyerSources")
      .withIndex("by_supermarket", (q) => q.eq("supermarketId", args.id))
      .collect();
    const flyers = await ctx.db
      .query("flyers")
      .withIndex("by_supermarket", (q) => q.eq("supermarketId", args.id))
      .collect();
    const recentFlyers = [...flyers]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);

    return {
      ...supermarket,
      sources,
      recentFlyers,
      flyerCount: flyers.length,
    };
  },
});
