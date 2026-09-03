import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Lookup or create brand by name; returns id. */
export async function ensureBrand(
  ctx: Pick<MutationCtx, "db">,
  name: string,
): Promise<Id<"brands">> {
  const slug = slugify(name);
  const existing = await ctx.db
    .query("brands")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (existing) return existing._id;

  // Check aliases on all brands
  const all = await ctx.db.query("brands").collect();
  const norm = name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  for (const b of all) {
    if (
      b.aliases?.some(
        (a) => a.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "") === norm,
      )
    ) {
      return b._id;
    }
  }

  const now = Date.now();
  return await ctx.db.insert("brands", {
    name,
    slug,
    createdAt: now,
    updatedAt: now,
  });
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const brands = await ctx.db.query("brands").collect();
    return [...brands].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },
});

/** Lista com contagens de ofertas e canônicos (admin). */
export const listWithCounts = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let brands = await ctx.db.query("brands").collect();
    if (args.search) {
      const s = args.search
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase();
      brands = brands.filter((b) => {
        const name = b.name
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .toLowerCase();
        const aliases = (b.aliases ?? []).some((a) =>
          a
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLowerCase()
            .includes(s),
        );
        return name.includes(s) || aliases || b.slug.includes(s);
      });
    }

    const enriched = await Promise.all(
      brands.map(async (b) => {
        const offers = await ctx.db
          .query("offers")
          .withIndex("by_brand", (q) => q.eq("brandId", b._id))
          .collect();
        const products = await ctx.db
          .query("canonicalProducts")
          .withIndex("by_brand", (q) => q.eq("brandId", b._id))
          .collect();
        return {
          ...b,
          offerCount: offers.length,
          canonicalCount: products.length,
        };
      }),
    );

    return enriched.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },
});

export const get = query({
  args: { id: v.id("brands") },
  handler: async (ctx, args) => {
    const brand = await ctx.db.get(args.id);
    if (!brand) return null;
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_brand", (q) => q.eq("brandId", args.id))
      .collect();
    const products = await ctx.db
      .query("canonicalProducts")
      .withIndex("by_brand", (q) => q.eq("brandId", args.id))
      .collect();
    return {
      ...brand,
      offerCount: offers.length,
      canonicalCount: products.length,
      products: products
        .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, "pt-BR"))
        .slice(0, 50)
        .map((p) => ({
          _id: p._id,
          canonicalName: p.canonicalName,
          quantity: p.quantity,
          unit: p.unit,
        })),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    aliases: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Nome obrigatório");
    const slug = slugify(name);
    const existing = await ctx.db
      .query("brands")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error(`Marca "${existing.name}" já existe`);
    const now = Date.now();
    return await ctx.db.insert("brands", {
      name,
      slug,
      aliases: args.aliases?.map((a) => a.trim()).filter(Boolean),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("brands"),
    name: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const brand = await ctx.db.get(args.id);
    if (!brand) throw new Error("Marca não encontrada");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name = args.name.trim();
      patch.slug = slugify(args.name);
    }
    if (args.aliases !== undefined) {
      patch.aliases = args.aliases.map((a) => a.trim()).filter(Boolean);
    }
    await ctx.db.patch(args.id, patch);
  },
});

/** Merge source brand into target; reassign all offers. */
export const merge = mutation({
  args: {
    sourceId: v.id("brands"),
    targetId: v.id("brands"),
  },
  handler: async (ctx, args) => {
    if (args.sourceId === args.targetId) {
      throw new Error("Origem e destino são a mesma marca");
    }
    const source = await ctx.db.get(args.sourceId);
    const target = await ctx.db.get(args.targetId);
    if (!source || !target) throw new Error("Marca não encontrada");

    const offers = await ctx.db
      .query("offers")
      .withIndex("by_brand", (q) => q.eq("brandId", args.sourceId))
      .collect();
    const now = Date.now();
    for (const offer of offers) {
      await ctx.db.patch(offer._id, {
        brandId: args.targetId,
        normalizedBrand: target.name,
        updatedAt: now,
      });
    }

    const products = await ctx.db
      .query("canonicalProducts")
      .withIndex("by_brand", (q) => q.eq("brandId", args.sourceId))
      .collect();
    for (const product of products) {
      await ctx.db.patch(product._id, {
        brandId: args.targetId,
        updatedAt: now,
      });
    }

    const aliases = new Set([
      ...(target.aliases ?? []),
      source.name,
      ...(source.aliases ?? []),
    ]);
    await ctx.db.patch(args.targetId, {
      aliases: [...aliases],
      updatedAt: now,
    });
    await ctx.db.delete(args.sourceId);
    return {
      offersReassigned: offers.length,
      productsReassigned: products.length,
    };
  },
});

/** Seed brands in bulk (idempotent). */
export const seed = mutation({
  args: { names: v.array(v.string()) },
  handler: async (ctx, args) => {
    let created = 0;
    for (const name of args.names) {
      const slug = slugify(name);
      const existing = await ctx.db
        .query("brands")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (existing) continue;
      const now = Date.now();
      await ctx.db.insert("brands", {
        name: name.trim(),
        slug,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
    return { created };
  },
});
