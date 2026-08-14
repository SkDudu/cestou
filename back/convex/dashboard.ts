import { query } from "./_generated/server";

export const metrics = query({
  args: {},
  handler: async (ctx) => {
    const supermarkets = await ctx.db.query("supermarkets").collect();
    const flyers = await ctx.db.query("flyers").collect();
    const offers = await ctx.db.query("offers").collect();
    const errors = await ctx.db
      .query("flyerErrors")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const extractions = await ctx.db.query("flyerExtractions").collect();
    const mimoPages = extractions.filter(
      (e) => e.provider === "mimo-v2.5" && e.status === "completed",
    );
    const tesseractPages = extractions.filter(
      (e) => e.provider === "tesseract-rules",
    );
    const aiFailures = extractions.filter((e) => e.status === "failed");
    const withLatency = extractions.filter((e) => (e.durationMs ?? 0) > 0);
    const avgLatencyMs = withLatency.length
      ? Math.round(
          withLatency.reduce((s, e) => s + (e.durationMs ?? 0), 0) /
            withLatency.length,
        )
      : 0;

    const now = Date.now();
    const activeFlyers = flyers.filter(
      (f) =>
        f.status !== "expired" &&
        f.status !== "failed" &&
        (f.validUntil === undefined || f.validUntil >= now),
    );

    return {
      supermarkets: supermarkets.length,
      activeSupermarkets: supermarkets.filter((s) => s.active).length,
      activeFlyers: activeFlyers.length,
      processedFlyers: flyers.filter((f) => f.status === "processed").length,
      partialFlyers: flyers.filter((f) => f.status === "partially_processed")
        .length,
      expiredFlyers: flyers.filter((f) => f.status === "expired").length,
      failedFlyers: flyers.filter((f) => f.status === "failed").length,
      offersExtracted: offers.length,
      offersValidated: offers.filter((o) => o.validationStatus === "validated")
        .length,
      offersPending: offers.filter((o) => o.validationStatus === "pending")
        .length,
      offersRejected: offers.filter((o) => o.validationStatus === "rejected")
        .length,
      offersSuspicious: offers.filter(
        (o) => o.validationStatus === "suspicious",
      ).length,
      extractionErrors: errors.length,
      offersMimoPages: mimoPages.length,
      offersTesseractPages: tesseractPages.length,
      aiFailures: aiFailures.length,
      avgExtractionLatencyMs: avgLatencyMs,
      recentFlyers: [...flyers]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 8)
        .map((f) => ({
          _id: f._id,
          title: f.title,
          status: f.status,
          validFrom: f.validFrom,
          validUntil: f.validUntil,
          supermarketId: f.supermarketId,
          createdAt: f.createdAt,
        })),
    };
  },
});
