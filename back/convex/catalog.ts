/**
 * Fase 2.1 — Agregações do catálogo para o admin (board, comparador, saúde).
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isActivePrice(
  row: { validUntil?: number; validFrom?: number },
  now: number,
): boolean {
  if (row.validFrom != null && row.validFrom > now) return false;
  if (row.validUntil != null && row.validUntil < now) return false;
  return true;
}

function discountPct(
  price: number,
  originalPrice: number | undefined,
): number | undefined {
  if (originalPrice == null || originalPrice <= 0 || originalPrice <= price) {
    return undefined;
  }
  return Math.round(((originalPrice - price) / originalPrice) * 1000) / 10;
}

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-line-primary)",
];

/** Nome-fonte muito diferente do canônico (heurística simples). */
function nameDivergence(canonical: string, source: string): boolean {
  const a = normalize(canonical).split(" ").filter(Boolean);
  const b = normalize(source).split(" ").filter(Boolean);
  if (!a.length || !b.length) return false;
  const setA = new Set(a);
  const overlap = b.filter((t) => setA.has(t)).length;
  const ratio = overlap / Math.max(a.length, b.length);
  return ratio < 0.35;
}

/* ── Lista de canônicos com cobertura ─────────────────────── */

export const listProducts = query({
  args: {
    search: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    minMarkets: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let products = args.brandId
      ? await ctx.db
          .query("canonicalProducts")
          .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
          .collect()
      : await ctx.db.query("canonicalProducts").collect();

    if (args.search) {
      const s = normalize(args.search);
      products = products.filter(
        (p) =>
          normalize(p.canonicalName).includes(s) ||
          normalize(p.matchKey).includes(s) ||
          normalize(p.slug).includes(s),
      );
    }

    const limit = args.limit ?? 80;
    const now = Date.now();

    const enriched = await Promise.all(
      products.map(async (p) => {
        const brand = p.brandId ? await ctx.db.get(p.brandId) : null;
        const prices = await ctx.db
          .query("priceHistory")
          .withIndex("by_canonical", (q) => q.eq("canonicalProductId", p._id))
          .collect();
        const marketIds = new Set(prices.map((r) => r.supermarketId));
        const activePrices = prices.filter((r) => isActivePrice(r, now));
        const activeMarkets = new Set(activePrices.map((r) => r.supermarketId));
        const offers = await ctx.db
          .query("offers")
          .withIndex("by_canonical", (q) => q.eq("canonicalProductId", p._id))
          .collect();
        const priceValues = activePrices.map((r) => r.price);
        const minPrice = priceValues.length ? Math.min(...priceValues) : null;
        const maxPrice = priceValues.length ? Math.max(...priceValues) : null;
        return {
          ...p,
          brandName: brand?.name ?? null,
          marketCount: marketIds.size,
          activeMarketCount: activeMarkets.size,
          offerCount: offers.length,
          minPrice,
          maxPrice,
          spreadPct:
            minPrice != null && maxPrice != null && minPrice > 0
              ? Math.round(((maxPrice - minPrice) / minPrice) * 1000) / 10
              : null,
        };
      }),
    );

    let filtered = enriched;
    if (args.minMarkets != null) {
      filtered = filtered.filter((p) => p.marketCount >= args.minMarkets!);
    }

    return filtered
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  },
});

/* ── Hub: board de preços vigentes por mercado ────────────── */

export const getProductPriceBoard = query({
  args: { canonicalId: v.id("canonicalProducts") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.canonicalId);
    if (!product) return null;

    const brand = product.brandId ? await ctx.db.get(product.brandId) : null;
    const now = Date.now();

    const prices = await ctx.db
      .query("priceHistory")
      .withIndex("by_canonical", (q) =>
        q.eq("canonicalProductId", args.canonicalId),
      )
      .collect();

    // Último preço por supermercado (preferir vigentes)
    const byMarket = new Map<
      Id<"supermarkets">,
      (typeof prices)[number]
    >();
    const sorted = [...prices].sort((a, b) => b.createdAt - a.createdAt);
    for (const row of sorted) {
      const cur = byMarket.get(row.supermarketId);
      if (!cur) {
        byMarket.set(row.supermarketId, row);
        continue;
      }
      const curActive = isActivePrice(cur, now);
      const rowActive = isActivePrice(row, now);
      if (!curActive && rowActive) {
        byMarket.set(row.supermarketId, row);
      }
    }

    const board = await Promise.all(
      [...byMarket.entries()].map(async ([supermarketId, row]) => {
        const supermarket = await ctx.db.get(supermarketId);
        const offer = await ctx.db.get(row.offerId);
        return {
          supermarketId,
          supermarketName: supermarket?.name ?? "—",
          price: row.price,
          originalPrice: row.originalPrice,
          memberPrice: row.memberPrice,
          requiresMembership: row.requiresMembership ?? false,
          membershipName: row.membershipName,
          discountPercentage: discountPct(row.price, row.originalPrice),
          validFrom: row.validFrom,
          validUntil: row.validUntil,
          active: isActivePrice(row, now),
          offerId: row.offerId,
          offerName: offer?.name ?? null,
          priceHistoryId: row._id,
          createdAt: row.createdAt,
        };
      }),
    );

    board.sort((a, b) => a.price - b.price);

    const history = await Promise.all(
      sorted.slice(0, 200).map(async (row) => {
        const supermarket = await ctx.db.get(row.supermarketId);
        return {
          ...row,
          supermarketName: supermarket?.name ?? "—",
          active: isActivePrice(row, now),
        };
      }),
    );

    // Série 30d por rede (forward-fill) para AreaChart do hub
    const DAY = 24 * 60 * 60 * 1000;
    const days = 30;
    const windowStart = dayStartMs(now - (days - 1) * DAY);
    const marketMeta = new Map<
      string,
      { id: string; name: string; count: number }
    >();
    for (const row of prices) {
      const key = String(row.supermarketId);
      const cur = marketMeta.get(key);
      if (cur) cur.count += 1;
      else {
        const sm = await ctx.db.get(row.supermarketId);
        marketMeta.set(key, {
          id: key,
          name: sm?.name ?? "—",
          count: 1,
        });
      }
    }
    const seriesMarkets = [...marketMeta.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const seriesPoints: Array<Record<string, number>> = [];
    const lastByMarket = new Map<string, number>();
    // Seed with último preço anterior à janela (evita buraco no início)
    for (const m of seriesMarkets) {
      const prior = prices
        .filter(
          (r) => String(r.supermarketId) === m.id && r.createdAt < windowStart,
        )
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (prior) lastByMarket.set(m.id, prior.price);
    }
    for (let i = 0; i < days; i++) {
      const day = windowStart + i * DAY;
      const dayEnd = day + DAY;
      for (const m of seriesMarkets) {
        const obs = prices
          .filter(
            (r) =>
              String(r.supermarketId) === m.id &&
              r.createdAt >= day &&
              r.createdAt < dayEnd,
          )
          .sort((a, b) => b.createdAt - a.createdAt)[0];
        if (obs) lastByMarket.set(m.id, obs.price);
      }
      const point: Record<string, number> = { date: day };
      for (const m of seriesMarkets) {
        const v = lastByMarket.get(m.id);
        if (v != null) point[m.id] = v;
      }
      seriesPoints.push(point);
    }

    const linkedOffers = await ctx.db
      .query("offers")
      .withIndex("by_canonical", (q) =>
        q.eq("canonicalProductId", args.canonicalId),
      )
      .collect();

    const offers = await Promise.all(
      linkedOffers
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 80)
        .map(async (o) => {
          const supermarket = await ctx.db.get(o.supermarketId);
          return {
            _id: o._id,
            name: o.name,
            brand: o.brand,
            price: o.price,
            originalPrice: o.originalPrice,
            memberPrice: o.memberPrice,
            publicPrice: o.publicPrice,
            requiresMembership: o.requiresMembership,
            validationStatus: o.validationStatus,
            supermarketName: supermarket?.name ?? "—",
            validFrom: o.validFrom,
            validUntil: o.validUntil,
            createdAt: o.createdAt,
          };
        }),
    );

    const brands = await ctx.db.query("brands").collect();
    const brandOptions = [...brands]
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((b) => ({ _id: b._id, name: b.name }));

    return {
      product: { ...product, brand },
      board,
      history,
      offers,
      brandOptions,
      series30d: {
        days,
        markets: seriesMarkets.map((m, i) => ({
          key: m.id,
          name: m.name,
          color: SERIES_COLORS[i % SERIES_COLORS.length]!,
        })),
        points: seriesPoints,
      },
    };
  },
});

/* ── Comparador entre mercados ────────────────────────────── */

export const compareMarkets = query({
  args: {
    supermarketIds: v.optional(v.array(v.id("supermarkets"))),
    brandId: v.optional(v.id("brands")),
    onlyActive: v.optional(v.boolean()),
    onlyClub: v.optional(v.boolean()),
    coverage: v.optional(
      v.union(v.literal("any"), v.literal("single"), v.literal("multi")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const onlyActive = args.onlyActive ?? true;
    const coverage = args.coverage ?? "any";
    const filterMarkets = args.supermarketIds?.length
      ? new Set(args.supermarketIds)
      : null;

    let products = args.brandId
      ? await ctx.db
          .query("canonicalProducts")
          .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
          .collect()
      : await ctx.db.query("canonicalProducts").collect();

    const rows = [];
    for (const p of products) {
      const brand = p.brandId ? await ctx.db.get(p.brandId) : null;
      let prices = await ctx.db
        .query("priceHistory")
        .withIndex("by_canonical", (q) => q.eq("canonicalProductId", p._id))
        .collect();

      if (filterMarkets) {
        prices = prices.filter((r) => filterMarkets.has(r.supermarketId));
      }
      if (onlyActive) {
        prices = prices.filter((r) => isActivePrice(r, now));
      }
      if (args.onlyClub) {
        prices = prices.filter((r) => r.requiresMembership === true);
      }
      if (!prices.length) continue;

      // Melhor (mais recente) por mercado
      const latest = new Map<Id<"supermarkets">, (typeof prices)[number]>();
      for (const row of [...prices].sort((a, b) => b.createdAt - a.createdAt)) {
        if (!latest.has(row.supermarketId)) {
          latest.set(row.supermarketId, row);
        }
      }
      const marketCount = latest.size;
      if (coverage === "single" && marketCount !== 1) continue;
      if (coverage === "multi" && marketCount < 2) continue;

      const values = [...latest.values()].map((r) => r.price);
      const minPrice = Math.min(...values);
      const maxPrice = Math.max(...values);
      const cheapest = [...latest.entries()].find(([, r]) => r.price === minPrice);

      const bySupermarket = await Promise.all(
        [...latest.entries()].map(async ([id, r]) => {
          const sm = await ctx.db.get(id);
          return {
            supermarketId: id,
            supermarketName: sm?.name ?? "—",
            price: r.price,
            memberPrice: r.memberPrice,
            requiresMembership: r.requiresMembership ?? false,
            offerId: r.offerId,
          };
        }),
      );

      rows.push({
        canonicalId: p._id,
        canonicalName: p.canonicalName,
        brandName: brand?.name ?? null,
        quantity: p.quantity,
        unit: p.unit,
        marketCount,
        minPrice,
        maxPrice,
        spreadPct:
          minPrice > 0
            ? Math.round(((maxPrice - minPrice) / minPrice) * 1000) / 10
            : 0,
        cheapestSupermarketId: cheapest?.[0] ?? null,
        bySupermarket,
      });
    }

    rows.sort((a, b) => b.spreadPct - a.spreadPct);
    return rows.slice(0, args.limit ?? 100);
  },
});

/* ── Saúde do catálogo ────────────────────────────────────── */

export const healthSummary = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const offers = await ctx.db.query("offers").collect();
    const products = await ctx.db.query("canonicalProducts").collect();
    const totalOffers = offers.length || 1;

    const withBrand = offers.filter((o) => o.brandId).length;
    const withCanonical = offers.filter((o) => o.canonicalProductId).length;
    const withoutBrand = offers.filter((o) => !o.brandId && !o.brand);
    const withoutQty = offers.filter((o) => !o.quantity && !o.quantityValue);
    const invalidUnit = offers.filter(
      (o) => o.unit && !o.unitNormalized && !o.quantityValue,
    );

    const singleMarket: Array<{
      _id: Id<"canonicalProducts">;
      canonicalName: string;
      brandName: string | null;
      supermarketName: string;
    }> = [];
    const divergentNames: Array<{
      _id: Id<"canonicalProducts">;
      canonicalName: string;
      sampleNames: string[];
      marketCount: number;
    }> = [];
    const extremeSpread: Array<{
      _id: Id<"canonicalProducts">;
      canonicalName: string;
      minPrice: number;
      maxPrice: number;
      spreadPct: number;
      marketCount: number;
    }> = [];

    for (const p of products) {
      const brand = p.brandId ? await ctx.db.get(p.brandId) : null;
      const prices = await ctx.db
        .query("priceHistory")
        .withIndex("by_canonical", (q) => q.eq("canonicalProductId", p._id))
        .collect();
      const markets = new Set(prices.map((r) => r.supermarketId));

      if (markets.size === 1) {
        const only = [...markets][0]!;
        const sm = await ctx.db.get(only);
        singleMarket.push({
          _id: p._id,
          canonicalName: p.canonicalName,
          brandName: brand?.name ?? null,
          supermarketName: sm?.name ?? "—",
        });
      }

      const linked = await ctx.db
        .query("offers")
        .withIndex("by_canonical", (q) => q.eq("canonicalProductId", p._id))
        .collect();
      const sourceNames = [...new Set(linked.map((o) => o.name))];
      const divergent = sourceNames.filter((n) =>
        nameDivergence(p.canonicalName, n),
      );
      if (divergent.length >= 2 || (sourceNames.length >= 3 && divergent.length >= 1)) {
        divergentNames.push({
          _id: p._id,
          canonicalName: p.canonicalName,
          sampleNames: sourceNames.slice(0, 5),
          marketCount: markets.size,
        });
      }

      const active = prices.filter((r) => isActivePrice(r, now));
      const latest = new Map<Id<"supermarkets">, number>();
      for (const row of [...active].sort((a, b) => b.createdAt - a.createdAt)) {
        if (!latest.has(row.supermarketId)) {
          latest.set(row.supermarketId, row.price);
        }
      }
      if (latest.size >= 2) {
        const vals = [...latest.values()];
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const spread = min > 0 ? ((max - min) / min) * 100 : 0;
        if (spread > 40) {
          extremeSpread.push({
            _id: p._id,
            canonicalName: p.canonicalName,
            minPrice: min,
            maxPrice: max,
            spreadPct: Math.round(spread * 10) / 10,
            marketCount: latest.size,
          });
        }
      }
    }

    singleMarket.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, "pt-BR"));
    divergentNames.sort((a, b) => b.sampleNames.length - a.sampleNames.length);
    extremeSpread.sort((a, b) => b.spreadPct - a.spreadPct);

    return {
      kpis: {
        totalOffers: offers.length,
        totalCanonical: products.length,
        pctWithBrand: Math.round((withBrand / totalOffers) * 1000) / 10,
        pctWithCanonical: Math.round((withCanonical / totalOffers) * 1000) / 10,
        singleMarketCount: singleMarket.length,
        divergentCount: divergentNames.length,
        extremeSpreadCount: extremeSpread.length,
        withoutBrandCount: withoutBrand.length,
        withoutQtyCount: withoutQty.length,
        invalidUnitCount: invalidUnit.length,
      },
      queues: {
        withoutBrand: withoutBrand.slice(0, 40).map((o) => ({
          _id: o._id,
          name: o.name,
          brand: o.brand,
          price: o.price,
        })),
        withoutQty: withoutQty.slice(0, 40).map((o) => ({
          _id: o._id,
          name: o.name,
          unit: o.unit,
          price: o.price,
        })),
        invalidUnit: invalidUnit.slice(0, 40).map((o) => ({
          _id: o._id,
          name: o.name,
          unit: o.unit,
          price: o.price,
        })),
        singleMarket: singleMarket.slice(0, 40),
        divergentNames: divergentNames.slice(0, 40),
        extremeSpread: extremeSpread.slice(0, 40),
      },
    };
  },
});

/** Ofertas criadas por dia: matched (com canônico) vs unmatched (fila). */
export const healthTimeseries = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const days = Math.min(Math.max(args.days ?? 30, 7), 90);
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const start = dayStartMs(now - (days - 1) * DAY);

    const offers = await ctx.db.query("offers").collect();
    const inWindow = offers.filter((o) => o.createdAt >= start);

    const buckets = Array.from({ length: days }, (_, i) => {
      const day = start + i * DAY;
      return {
        date: day,
        matched: 0,
        unmatched: 0,
      };
    });

    for (const offer of inWindow) {
      const idx = Math.floor((offer.createdAt - start) / DAY);
      if (idx < 0 || idx >= days) continue;
      if (offer.canonicalProductId) buckets[idx]!.matched += 1;
      else buckets[idx]!.unmatched += 1;
    }

    const totalMatched = buckets.reduce((n, b) => n + b.matched, 0);
    const totalUnmatched = buckets.reduce((n, b) => n + b.unmatched, 0);
    const total = totalMatched + totalUnmatched;
    const last7 = buckets.slice(-7);
    const prev7 = buckets.slice(-14, -7);
    const sum = (rows: typeof buckets, key: "matched" | "unmatched") =>
      rows.reduce((n, b) => n + b[key], 0);

    return {
      days,
      points: buckets,
      totals: {
        matched: totalMatched,
        unmatched: totalUnmatched,
        matchRate:
          total > 0 ? Math.round((totalMatched / total) * 1000) / 10 : 0,
      },
      week: {
        matched: sum(last7, "matched"),
        unmatched: sum(last7, "unmatched"),
        prevMatched: sum(prev7, "matched"),
        prevUnmatched: sum(prev7, "unmatched"),
      },
    };
  },
});

/**
 * Séries de preço para /admin/prices (últimos N dias):
 * - spread: médio / mediana entre canônicos multi-mercado
 * - club: preço público médio vs preço clube médio
 */
export const priceTimeseries = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const days = Math.min(Math.max(args.days ?? 30, 7), 90);
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const start = dayStartMs(now - (days - 1) * DAY);

    const history = await ctx.db.query("priceHistory").collect();
    const inWindow = history.filter((r) => r.createdAt >= start);

    type DayAgg = {
      date: number;
      spreads: number[];
      multi: Set<string>;
      byCanonical: Map<string, Map<string, number>>;
      publicPrices: number[];
      clubPrices: number[];
    };

    const buckets: DayAgg[] = Array.from({ length: days }, (_, i) => ({
      date: start + i * DAY,
      spreads: [],
      multi: new Set(),
      byCanonical: new Map(),
      publicPrices: [],
      clubPrices: [],
    }));

    for (const row of inWindow) {
      const idx = Math.floor((row.createdAt - start) / DAY);
      if (idx < 0 || idx >= days) continue;
      const b = buckets[idx]!;
      const cid = String(row.canonicalProductId);
      const sid = String(row.supermarketId);

      let markets = b.byCanonical.get(cid);
      if (!markets) {
        markets = new Map();
        b.byCanonical.set(cid, markets);
      }
      // keep latest price of the day per market
      markets.set(sid, row.price);

      if (row.memberPrice != null) {
        b.clubPrices.push(row.memberPrice);
        b.publicPrices.push(row.originalPrice ?? row.price);
      } else {
        b.publicPrices.push(row.price);
      }
    }

    for (const b of buckets) {
      for (const [cid, markets] of b.byCanonical) {
        if (markets.size < 2) continue;
        b.multi.add(cid);
        const vals = [...markets.values()];
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        if (min > 0) {
          b.spreads.push(((max - min) / min) * 100);
        }
      }
    }

    const median = (vals: number[]) => {
      if (!vals.length) return 0;
      const s = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
    };
    const avg = (vals: number[]) =>
      vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const spreadPoints = buckets.map((b) => ({
      date: b.date,
      spreadMedio: round1(avg(b.spreads)),
      spreadMediana: round1(median(b.spreads)),
      multiCount: b.multi.size,
    }));

    const clubPoints = buckets.map((b) => ({
      date: b.date,
      publico: round2(avg(b.publicPrices)),
      clube: round2(avg(b.clubPrices)),
      clubSamples: b.clubPrices.length,
      publicSamples: b.publicPrices.length,
    }));

    const lastSpreads = spreadPoints.filter((p) => p.multiCount > 0);
    const lastClub = clubPoints.filter((p) => p.clubSamples > 0);

    return {
      days,
      spread: {
        points: spreadPoints,
        avg30d: round1(avg(lastSpreads.map((p) => p.spreadMedio))),
      },
      club: {
        points: clubPoints,
        avgPublico30d: round2(avg(lastClub.map((p) => p.publico))),
        avgClube30d: round2(avg(lastClub.map((p) => p.clube))),
      },
    };
  },
});

function dayStartMs(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* ── Mutations de correção ────────────────────────────────── */

export const setCanonicalBrand = mutation({
  args: {
    canonicalId: v.id("canonicalProducts"),
    brandId: v.union(v.id("brands"), v.null()),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.canonicalId);
    if (!product) throw new Error("Produto canônico não encontrado");
    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand) throw new Error("Marca não encontrada");
    }
    await ctx.db.patch(args.canonicalId, {
      brandId: args.brandId ?? undefined,
      updatedAt: Date.now(),
    });
  },
});

export const unlinkOffer = mutation({
  args: { offerId: v.id("offers") },
  handler: async (ctx, args) => {
    const offer = await ctx.db.get(args.offerId);
    if (!offer) throw new Error("Oferta não encontrada");
    await ctx.db.patch(args.offerId, {
      canonicalProductId: undefined,
      updatedAt: Date.now(),
    });
    const price = await ctx.db
      .query("priceHistory")
      .withIndex("by_offer", (q) => q.eq("offerId", args.offerId))
      .unique();
    if (price) await ctx.db.delete(price._id);
  },
});

/** Merge source canônico into target; reassign offers + priceHistory. */
export const mergeCanonical = mutation({
  args: {
    sourceId: v.id("canonicalProducts"),
    targetId: v.id("canonicalProducts"),
  },
  handler: async (ctx, args) => {
    if (args.sourceId === args.targetId) {
      throw new Error("Origem e destino são o mesmo produto");
    }
    const source = await ctx.db.get(args.sourceId);
    const target = await ctx.db.get(args.targetId);
    if (!source || !target) throw new Error("Produto canônico não encontrado");

    const now = Date.now();
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_canonical", (q) => q.eq("canonicalProductId", args.sourceId))
      .collect();
    for (const offer of offers) {
      await ctx.db.patch(offer._id, {
        canonicalProductId: args.targetId,
        brandId: offer.brandId ?? target.brandId,
        updatedAt: now,
      });
    }

    const prices = await ctx.db
      .query("priceHistory")
      .withIndex("by_canonical", (q) => q.eq("canonicalProductId", args.sourceId))
      .collect();
    for (const row of prices) {
      await ctx.db.patch(row._id, { canonicalProductId: args.targetId });
    }

    await ctx.db.delete(args.sourceId);
    await ctx.db.patch(args.targetId, { updatedAt: now });
    return {
      offersReassigned: offers.length,
      pricesReassigned: prices.length,
    };
  },
});
