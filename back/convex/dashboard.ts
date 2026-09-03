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

const DAY = 24 * 60 * 60 * 1000;

function workerSlug(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);
  return slug.startsWith("wrk_") ? slug : `wrk_${slug || "flow"}`;
}

function sourceKinds(startUrl: string, types: string[]): string[] {
  const kinds = new Set<string>();
  for (const t of types) {
    if (t === "dynamic") kinds.add("api");
    else if (t === "pdf") kinds.add("pdf");
    else kinds.add("html");
  }
  if (!kinds.size) {
    kinds.add(/\.pdf(\?|$)/i.test(startUrl) ? "pdf" : "html");
  }
  return [...kinds];
}

function opsStatus(
  flowStatus: string,
  lastStatus: string | undefined,
  jobs24h: number,
): "running" | "queue" | "review" | "fail" {
  if (flowStatus === "error") return "fail";
  if (lastStatus === "cancelled") return "queue";
  if (lastStatus === "duplicate") return "review";
  if (lastStatus === "failed") return "fail";
  if (lastStatus === "running") return "running";
  if (lastStatus === "partial" || flowStatus === "testing") return "review";
  if (flowStatus === "active" && jobs24h > 0) return "running";
  if (flowStatus === "active") return "queue";
  if (flowStatus === "disabled" || flowStatus === "draft") return "queue";
  return "queue";
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dayStart = (ts: number) => {
      const d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };

    const [flows, flyers, offers, runs, errors, sources] = await Promise.all([
      ctx.db.query("scraperFlows").collect(),
      ctx.db.query("flyers").collect(),
      ctx.db.query("offers").collect(),
      ctx.db.query("scraperRuns").collect(),
      ctx.db
        .query("flyerErrors")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .collect(),
      ctx.db.query("flyerSources").collect(),
    ]);
    const supermarkets = await ctx.db.query("supermarkets").collect();
    const names = new Map(supermarkets.map((s) => [s._id, s.name]));
    const sourcesByMarket = new Map<string, string[]>();
    for (const s of sources) {
      const list = sourcesByMarket.get(s.supermarketId) ?? [];
      list.push(s.type);
      sourcesByMarket.set(s.supermarketId, list);
    }

    const weekAgo = now - 7 * DAY;
    const twoWeeksAgo = now - 14 * DAY;
    const yesterday = now - DAY;

    const offersWeek = offers.filter((o) => o.createdAt >= weekAgo).length;
    const offersPrev = offers.filter(
      (o) => o.createdAt >= twoWeeksAgo && o.createdAt < weekAgo,
    ).length;
    const offersToday = offers.filter((o) => o.createdAt >= yesterday).length;

    const flyersWeek = flyers.filter((f) => f.createdAt >= weekAgo);
    const parsed = flyersWeek.filter((f) => f.status === "processed").length;
    const review = flyersWeek.filter(
      (f) =>
        f.status === "partially_processed" ||
        f.status === "downloaded" ||
        f.status === "processing",
    ).length;
    const failed = flyersWeek.filter((f) => f.status === "failed").length;
    const parseDenom = parsed + review + failed;
    const parseRate = parseDenom ? parsed / parseDenom : 0;

    const extractingNow = runs.filter((r) => r.status === "running").length;
    const flowsActive = flows.filter((f) => f.status === "active").length;
    const startToday = dayStart(now);
    const workersDelta = flows.filter(
      (f) => (f.lastRunAt ?? 0) >= startToday,
    ).length;

    const chart: { day: number; label: string; jobs: number; flyers: number }[] =
      [];
    for (let i = 6; i >= 0; i--) {
      const start = dayStart(now - i * DAY);
      const end = start + DAY;
      const jobs = runs.filter(
        (r) => r.startedAt >= start && r.startedAt < end,
      ).length;
      const flyerCount = flyers.filter(
        (f) => f.createdAt >= start && f.createdAt < end,
      ).length;
      chart.push({
        day: start,
        label: String(new Date(start).getDate()),
        jobs,
        flyers: flyerCount,
      });
    }

    const workerRows = flows.map((flow) => {
      const flowRuns = runs.filter((r) => r.flowId === flow._id);
      flowRuns.sort((a, b) => b.startedAt - a.startedAt);
      const last = flowRuns[0];
      const last24 = flowRuns.filter((r) => r.startedAt >= now - DAY);
      const ok = last24.filter(
        (r) => r.status === "success" || r.status === "duplicate",
      ).length;
      const taxa = last24.length ? ok / last24.length : null;
      return {
        _id: flow._id,
        slug: workerSlug(flow.name),
        supermarketId: flow.supermarketId,
        supermarketName: names.get(flow.supermarketId) ?? "—",
        jobs24h: last24.length,
        taxa,
        status: opsStatus(
          flow.status,
          last?.status === "failed" && last.error === "cancelled"
            ? "cancelled"
            : last?.error === "duplicate"
              ? "duplicate"
              : last?.status,
          last24.length,
        ),
        flowStatus: flow.status,
        startUrl: flow.startUrl,
        lastRunAt: flow.lastRunAt ?? last?.finishedAt ?? last?.startedAt,
        sourceKinds: sourceKinds(
          flow.startUrl,
          sourcesByMarket.get(flow.supermarketId) ?? [],
        ),
      };
    });
    workerRows.sort((a, b) => b.jobs24h - a.jobs24h);

    // Heatmap: runs por dia no último ano (calendário estilo contribuição)
    const heatmapRangeStart = (() => {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setMonth(d.getMonth() - 11, 1);
      return d.getTime();
    })();
    const flowSlug = new Map(
      flows.map((f) => [f._id, workerSlug(f.name)] as const),
    );
    type DayAgg = {
      date: number;
      count: number;
      running: number;
      workers: Set<string>;
    };
    const byDay = new Map<string, DayAgg>();
    for (const run of runs) {
      if (run.startedAt < heatmapRangeStart) continue;
      const start = dayStart(run.startedAt);
      const key = String(start);
      let agg = byDay.get(key);
      if (!agg) {
        agg = { date: start, count: 0, running: 0, workers: new Set() };
        byDay.set(key, agg);
      }
      agg.count += 1;
      if (run.status === "running") agg.running += 1;
      const slug = flowSlug.get(run.flowId);
      if (slug) agg.workers.add(slug);
    }
    const heatmapDays = [...byDay.values()]
      .sort((a, b) => a.date - b.date)
      .map((d) => ({
        date: d.date,
        count: d.count,
        running: d.running,
        workers: [...d.workers].sort(),
      }));

    return {
      workersActive: flowsActive,
      workersDelta,
      extractingNow,
      skusExtracted: offers.length,
      skusWeek: offersWeek,
      skusPrevWeek: offersPrev,
      skusToday: offersToday,
      parseRate,
      parseCounts: { parsed, review, failed },
      extractionErrors: errors.length,
      chart,
      workers: workerRows,
      heatmap: {
        rangeStart: heatmapRangeStart,
        days: heatmapDays,
        totals: {
          runs: heatmapDays.reduce((n, d) => n + d.count, 0),
          daysActive: heatmapDays.filter((d) => d.count > 0).length,
          runningNow: extractingNow,
        },
      },
    };
  },
});
