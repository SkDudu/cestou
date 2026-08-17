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

export const automation = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const flows = await ctx.db.query("scraperFlows").collect();
    const flyers = await ctx.db.query("flyers").collect();
    const supermarkets = await ctx.db.query("supermarkets").collect();
    const names = new Map(supermarkets.map((s) => [s._id, s.name]));

    const vigente = (f: (typeof flyers)[number]) =>
      f.status !== "expired" &&
      f.status !== "failed" &&
      (f.validFrom === undefined || f.validFrom <= now) &&
      (f.validUntil === undefined || f.validUntil >= now);

    const rows = await Promise.all(
      [...flows]
        .sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity))
        .map(async (flow) => {
          const runs = await ctx.db
            .query("scraperRuns")
            .withIndex("by_flow", (q) => q.eq("flowId", flow._id))
            .collect();
          runs.sort((a, b) => b.startedAt - a.startedAt);
          const last = runs[0];
          const marketFlyers = flyers.filter(
            (f) => f.supermarketId === flow.supermarketId,
          );
          const current = marketFlyers
            .filter(vigente)
            .sort((a, b) => (b.validUntil ?? 0) - (a.validUntil ?? 0))[0];
          return {
            _id: flow._id,
            name: flow.name,
            supermarketId: flow.supermarketId,
            supermarketName: names.get(flow.supermarketId) ?? "—",
            status: flow.status,
            lastRunAt: flow.lastRunAt ?? last?.startedAt,
            nextRunAt: flow.nextRunAt,
            discoveryAttempts: flow.discoveryAttempts ?? 0,
            lastError: last?.error,
            currentFlyerTitle: current?.title,
            currentValidFrom: current?.validFrom,
            currentValidUntil: current?.validUntil,
          };
        }),
    );

    return {
      flowsActive: flows.filter((f) => f.status === "active").length,
      flowsError: flows.filter((f) => f.status === "error").length,
      flyersVigente: flyers.filter(vigente).length,
      flyersExpired: flyers.filter((f) => f.status === "expired").length,
      pendingDownload: flyers.filter((f) => f.status === "discovered").length,
      pendingExtract: flyers.filter(
        (f) =>
          (f.status === "downloaded" || f.status === "partially_processed") &&
          (f.validFrom === undefined ||
            f.validFrom <= now + 24 * 60 * 60 * 1000),
      ).length,
      flows: rows,
    };
  },
});
