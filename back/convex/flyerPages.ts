import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertPage = mutation({
  args: {
    flyerId: v.id("flyers"),
    pageNumber: v.number(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("flyerPages")
      .withIndex("by_flyer_page", (q) =>
        q.eq("flyerId", args.flyerId).eq("pageNumber", args.pageNumber),
      )
      .unique();

    if (existing) {
      // Never replace stored page content on re-run
      return existing._id;
    }

    return await ctx.db.insert("flyerPages", {
      flyerId: args.flyerId,
      pageNumber: args.pageNumber,
      storageId: args.storageId,
      createdAt: Date.now(),
    });
  },
});

export const listByFlyer = query({
  args: { flyerId: v.id("flyers") },
  handler: async (ctx, args) => {
    const pages = await ctx.db
      .query("flyerPages")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.flyerId))
      .collect();
    return await Promise.all(
      [...pages]
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map(async (p) => ({
          ...p,
          url: await ctx.storage.getUrl(p.storageId),
        })),
    );
  },
});
