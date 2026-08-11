import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsert = mutation({
  args: {
    name: v.string(),
    normalizedName: v.string(),
    brand: v.optional(v.string()),
    brandSource: v.optional(v.string()),
    brandConfidence: v.optional(v.number()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    barcode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // ponytail: don't wipe existing brand with undefined
    const patch = Object.fromEntries(
      Object.entries({ ...args, updatedAt: now }).filter(
        ([, val]) => val !== undefined,
      ),
    );

    if (args.barcode) {
      const byBarcode = await ctx.db
        .query("products")
        .withIndex("by_barcode", (q) => q.eq("barcode", args.barcode))
        .unique();
      if (byBarcode) {
        await ctx.db.patch(byBarcode._id, patch);
        return byBarcode._id;
      }
    }

    const existing = await ctx.db
      .query("products")
      .withIndex("by_normalizedName", (q) =>
        q.eq("normalizedName", args.normalizedName),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("products", {
      name: args.name,
      normalizedName: args.normalizedName,
      brand: args.brand,
      brandSource: args.brandSource,
      brandConfidence: args.brandConfidence,
      quantity: args.quantity,
      unit: args.unit,
      imageUrl: args.imageUrl,
      barcode: args.barcode,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getByNormalizedName = query({
  args: { normalizedName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_normalizedName", (q) =>
        q.eq("normalizedName", args.normalizedName),
      )
      .first();
  },
});
