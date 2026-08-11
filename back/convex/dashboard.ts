import { query } from "./_generated/server";

function isPromotion(price: number, originalPrice?: number) {
  return originalPrice !== undefined && originalPrice > price;
}

function isIncomplete(raw: {
  name: string;
  price: number;
  brand?: string;
  externalId?: string;
  imageUrl?: string;
  url?: string;
}) {
  return (
    !raw.imageUrl ||
    !raw.brand ||
    !raw.externalId ||
    raw.price <= 0 ||
    !raw.url ||
    raw.name.length < 3
  );
}

export const metrics = query({
  args: {},
  handler: async (ctx) => {
    const [
      products,
      rawProducts,
      prices,
      supermarkets,
      jobs,
      validations,
      errors,
    ] = await Promise.all([
      ctx.db.query("products").collect(),
      ctx.db.query("rawProducts").collect(),
      ctx.db.query("prices").collect(),
      ctx.db.query("supermarkets").collect(),
      ctx.db.query("scrapingJobs").collect(),
      ctx.db.query("productValidations").collect(),
      ctx.db.query("scrapeErrors").collect(),
    ]);

    const promotions = rawProducts.filter((r) =>
      isPromotion(r.price, r.originalPrice),
    ).length;
    const failedRuns = jobs.filter((j) => j.status === "failed").length;
    const runningJobs = jobs.filter((j) => j.status === "running").length;
    const invalidProducts = validations.filter((v) => v.status === "invalid").length;
    const suspiciousProducts = validations.filter(
      (v) => v.status === "suspicious",
    ).length;
    const validatedProducts = validations.filter(
      (v) => v.status === "validated",
    ).length;
    const incompleteProducts = rawProducts.filter(isIncomplete).length;
    const openErrors = errors.filter((e) => e.status === "open").length;

    const sortedJobs = [...jobs].sort((a, b) => b.startedAt - a.startedAt);
    const lastJob = sortedJobs[0] ?? null;

    const supermarketStats = await Promise.all(
      supermarkets.map(async (s) => {
        const smRaw = rawProducts.filter((r) => r.supermarketId === s._id);
        const smJobs = jobs.filter((j) => j.supermarketId === s._id);
        const lastSmJob = [...smJobs].sort((a, b) => b.startedAt - a.startedAt)[0];
        const completed = smJobs.filter((j) => j.status === "completed").length;
        const failed = smJobs.filter((j) => j.status === "failed").length;
        const health =
          smJobs.length === 0
            ? 0
            : Math.round(
                ((completed / smJobs.length) * 0.6 +
                  (smRaw.length > 0 ? 0.3 : 0) +
                  (failed === 0 ? 0.1 : 0)) *
                  100,
              );

        return {
          _id: s._id,
          name: s.name,
          slug: s.slug,
          active: s.active,
          productCount: smRaw.length,
          lastCollectedAt: lastSmJob?.finishedAt ?? lastSmJob?.startedAt ?? null,
          lastJobStatus: lastSmJob?.status ?? null,
          health,
          isOnline:
            lastSmJob?.status === "running" ||
            (lastSmJob?.finishedAt !== undefined &&
              Date.now() - lastSmJob.finishedAt < 24 * 60 * 60 * 1000),
        };
      }),
    );

    const pendingValidations = validations.filter(
      (v) => v.status === "pending",
    ).length;
    const validatedIds = new Set(validations.map((v) => v.rawProductId));
    const withoutValidation = rawProducts.filter(
      (r) => !validatedIds.has(r._id),
    ).length;

    const statusCounts = {
      validated: validatedProducts,
      pending: pendingValidations + withoutValidation,
      suspicious: suspiciousProducts,
      invalid: invalidProducts,
    };

    const runsByStatus = {
      completed: jobs.filter((j) => j.status === "completed").length,
      failed: failedRuns,
      running: runningJobs,
      pending: jobs.filter((j) => j.status === "pending").length,
    };

    return {
      totalProducts: products.length,
      totalRawProducts: rawProducts.length,
      totalPrices: prices.length,
      totalPromotions: promotions,
      totalSupermarkets: supermarkets.length,
      totalScrapeRuns: jobs.length,
      failedScrapeRuns: failedRuns,
      runningScrapeRuns: runningJobs,
      invalidProducts,
      suspiciousProducts,
      incompleteProducts,
      openErrors,
      lastJob,
      supermarketStats,
      statusCounts,
      runsByStatus,
      productsBySupermarket: supermarketStats.map((s) => ({
        name: s.name,
        count: s.productCount,
      })),
    };
  },
});
