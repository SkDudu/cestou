import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const start = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    type: v.string(),
    query: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("scrapingJobs", {
      supermarketId: args.supermarketId,
      type: args.type,
      status: "running",
      query: args.query,
      startedAt: Date.now(),
    });
  },
});

export const finish = mutation({
  args: {
    jobId: v.id("scrapingJobs"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    productsFound: v.optional(v.number()),
    productsSaved: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    await ctx.db.patch(args.jobId, {
      status: args.status,
      finishedAt: Date.now(),
      productsFound: args.productsFound,
      productsSaved: args.productsSaved,
      error: args.error,
    });

    if (args.status === "failed" && job && args.error) {
      await ctx.db.insert("scrapeErrors", {
        scrapingJobId: args.jobId,
        supermarketId: job.supermarketId,
        query: job.query,
        type: "ScrapeError",
        message: args.error,
        status: "open",
        createdAt: Date.now(),
      });
    }
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    supermarketId: v.optional(v.id("supermarkets")),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    query: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("scrapingJobs")
      .withIndex("by_startedAt")
      .order("desc")
      .paginate(args.paginationOpts);

    let page = result.page;
    if (args.supermarketId) {
      page = page.filter((j) => j.supermarketId === args.supermarketId);
    }
    if (args.status) {
      page = page.filter((j) => j.status === args.status);
    }
    if (args.query) {
      const term = args.query.toLowerCase();
      page = page.filter((j) => j.query?.toLowerCase().includes(term));
    }

    const enriched = await Promise.all(
      page.map(async (job) => {
        const supermarket = await ctx.db.get(job.supermarketId);
        const duration =
          job.finishedAt && job.startedAt
            ? job.finishedAt - job.startedAt
            : null;
        const productsFailed =
          job.productsFound !== undefined && job.productsSaved !== undefined
            ? Math.max(0, job.productsFound - job.productsSaved)
            : 0;

        return {
          ...job,
          supermarketName: (supermarket as { name: string } | null)?.name ?? "—",
          duration,
          productsFailed,
        };
      }),
    );

    return { ...result, page: enriched };
  },
});

export const get = query({
  args: { id: v.id("scrapingJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) return null;

    const supermarket = await ctx.db.get(job.supermarketId);
    const duration =
      job.finishedAt && job.startedAt
        ? job.finishedAt - job.startedAt
        : null;
    const productsFailed =
      job.productsFound !== undefined && job.productsSaved !== undefined
        ? Math.max(0, job.productsFound - job.productsSaved)
        : 0;

    const errors = await ctx.db
      .query("scrapeErrors")
      .withIndex("by_job", (q) => q.eq("scrapingJobId", args.id))
      .collect();

    const rawFromJob = await ctx.db
      .query("rawProducts")
      .withIndex("by_job", (q) => q.eq("scrapingJobId", args.id))
      .take(50);

    return {
      ...job,
      supermarket,
      duration,
      productsFailed,
      errors,
      sampleProducts: rawFromJob,
    };
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const jobs = await ctx.db
      .query("scrapingJobs")
      .withIndex("by_startedAt")
      .order("desc")
      .take(limit);

    return await Promise.all(
      jobs.map(async (job) => {
        const supermarket = await ctx.db.get(job.supermarketId);
        const productsFailed =
          job.productsFound !== undefined && job.productsSaved !== undefined
            ? Math.max(0, job.productsFound - job.productsSaved)
            : 0;
        return {
          ...job,
          supermarketName: (supermarket as { name: string } | null)?.name ?? "—",
          productsFailed,
        };
      }),
    );
  },
});
