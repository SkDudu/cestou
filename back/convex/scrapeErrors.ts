import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const insert = mutation({
  args: {
    scrapingJobId: v.optional(v.id("scrapingJobs")),
    supermarketId: v.id("supermarkets"),
    query: v.optional(v.string()),
    type: v.string(),
    message: v.string(),
    stack: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("scrapeErrors", {
      ...args,
      status: "open",
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    supermarketId: v.optional(v.id("supermarkets")),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("scrapeErrors")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);

    const page = result.page.filter((error) => {
      if (args.supermarketId && error.supermarketId !== args.supermarketId) {
        return false;
      }
      if (args.status && error.status !== args.status) {
        return false;
      }
      return true;
    });

    const enriched = await Promise.all(
      page.map(async (error) => {
        const supermarket = await ctx.db.get(error.supermarketId);
        return { ...error, supermarketName: supermarket?.name ?? "—" };
      }),
    );

    return { ...result, page: enriched };
  },
});

export const get = query({
  args: { id: v.id("scrapeErrors") },
  handler: async (ctx, args) => {
    const error = await ctx.db.get(args.id);
    if (!error) return null;

    const supermarket = await ctx.db.get(error.supermarketId);
    const job = error.scrapingJobId
      ? await ctx.db.get(error.scrapingJobId)
      : null;

    return { ...error, supermarket, job };
  },
});

export const resolve = mutation({
  args: { id: v.id("scrapeErrors") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "resolved" });
  },
});
