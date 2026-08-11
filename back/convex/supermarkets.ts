import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const ensure = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("supermarkets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("supermarkets", {
      name: args.name,
      slug: args.slug,
      website: args.website,
      active: true,
      createdAt: Date.now(),
    });
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("supermarkets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const supermarkets = await ctx.db.query("supermarkets").collect();

    return await Promise.all(
      supermarkets.map(async (s) => {
        const rawProducts = await ctx.db
          .query("rawProducts")
          .withIndex("by_supermarket_collectedAt", (q) =>
            q.eq("supermarketId", s._id),
          )
          .collect();

        const jobs = await ctx.db
          .query("scrapingJobs")
          .withIndex("by_supermarket", (q) => q.eq("supermarketId", s._id))
          .collect();

        const validations = await ctx.db
          .query("productValidations")
          .collect();

        const rawIds = new Set(rawProducts.map((r) => r._id));
        const smValidations = validations.filter((v) =>
          rawIds.has(v.rawProductId),
        );

        const lastJob = [...jobs].sort((a, b) => b.startedAt - a.startedAt)[0];
        const completed = jobs.filter((j) => j.status === "completed").length;
        const failed = jobs.filter((j) => j.status === "failed").length;
        const promotions = rawProducts.filter(
          (r) => r.originalPrice !== undefined && r.originalPrice > r.price,
        ).length;

        return {
          ...s,
          productCount: rawProducts.length,
          promotionCount: promotions,
          validCount: smValidations.filter((v) => v.status === "validated").length,
          invalidCount: smValidations.filter((v) => v.status === "invalid").length,
          lastCollectedAt: lastJob?.finishedAt ?? lastJob?.startedAt ?? null,
          lastJobStatus: lastJob?.status ?? null,
          successRate:
            jobs.length === 0 ? 0 : Math.round((completed / jobs.length) * 100),
          failedJobs: failed,
          isOnline:
            lastJob?.status === "running" ||
            (lastJob?.finishedAt !== undefined &&
              Date.now() - lastJob.finishedAt < 24 * 60 * 60 * 1000),
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

    const rawProducts = await ctx.db
      .query("rawProducts")
      .withIndex("by_supermarket_collectedAt", (q) =>
        q.eq("supermarketId", args.id),
      )
      .collect();

    const jobs = await ctx.db
      .query("scrapingJobs")
      .withIndex("by_supermarket", (q) => q.eq("supermarketId", args.id))
      .collect();

    const validations = await ctx.db.query("productValidations").collect();
    const rawIds = new Set(rawProducts.map((r) => r._id));
    const smValidations = validations.filter((v) => rawIds.has(v.rawProductId));

    const lastJob = [...jobs].sort((a, b) => b.startedAt - a.startedAt)[0];
    const completed = jobs.filter((j) => j.status === "completed").length;
    const promotions = rawProducts.filter(
      (r) => r.originalPrice !== undefined && r.originalPrice > r.price,
    ).length;

    const recentJobs = [...jobs]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 20);

    return {
      ...supermarket,
      productCount: rawProducts.length,
      promotionCount: promotions,
      validCount: smValidations.filter((v) => v.status === "validated").length,
      invalidCount: smValidations.filter((v) => v.status === "invalid").length,
      suspiciousCount: smValidations.filter((v) => v.status === "suspicious")
        .length,
      lastCollectedAt: lastJob?.finishedAt ?? lastJob?.startedAt ?? null,
      lastJobStatus: lastJob?.status ?? null,
      successRate:
        jobs.length === 0 ? 0 : Math.round((completed / jobs.length) * 100),
      recentJobs,
    };
  },
});
