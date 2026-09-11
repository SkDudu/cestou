"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { OpsHeader, OpsKpi, OpsTabs } from "@/components/admin/ops";
import { PriceSpreadChart } from "@/components/admin/PriceSpreadChart";
import { PriceClubChart } from "@/components/admin/PriceClubChart";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { ApiError, adminApi, loadOfferPages, type OfferListItem } from "@/lib/api";
import { formatCurrency, formatPack } from "@/lib/format";
import { DAY_MS, ms } from "@/lib/workers";

type Product = Awaited<ReturnType<typeof adminApi.products>>[number];
type Brand = Awaited<ReturnType<typeof adminApi.brands>>[number];
type Market = Awaited<ReturnType<typeof adminApi.supermarkets>>[number];
type Compare = Awaited<ReturnType<typeof adminApi.priceComparison>>[number];

type RankRow = {
  canonicalId: string;
  canonicalName: string;
  brandId: string | null;
  brandName: string | null;
  quantity: string | null;
  unit: string | null;
  marketCount: number;
  minPrice: number;
  maxPrice: number;
  spreadPct: number;
  bySupermarket: Array<{
    supermarketId: string;
    supermarketName: string;
    price: number;
    memberPrice: number | null;
    requiresMembership: boolean;
    validUntil: number | null;
  }>;
};

function money(value: string | number | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function spreadPct(min: number, max: number) {
  if (min <= 0) return 0;
  return Math.round(((max - min) / min) * 100);
}

function isClub(o: OfferListItem) {
  return (
    Boolean(o.requiresMembership) ||
    money(o.memberPrice) != null ||
    (o.eligibility ?? "").toUpperCase() === "MEMBERS_ONLY"
  );
}

function isVigente(until: number | null, now: number) {
  return until == null || until >= now;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function rankFromOffers(
  offers: OfferListItem[],
  products: Product[],
  compare: Compare[],
) {
  const productById = new Map(products.map((p) => [p.id, p]));
  const nameById = new Map(compare.map((row) => [row.productId, row.productName]));
  const groups = new Map<string, OfferListItem[]>();
  for (const o of offers) {
    if (!o.canonicalProductId) continue;
    if (o.validationStatus.toUpperCase() !== "VALIDATED") continue;
    const list = groups.get(o.canonicalProductId) ?? [];
    list.push(o);
    groups.set(o.canonicalProductId, list);
  }
  return [...groups.entries()]
    .map(([id, rows]) => {
      const byMarket = new Map<string, RankRow["bySupermarket"][number]>();
      for (const o of rows) {
        if (byMarket.has(o.supermarket.id)) continue;
        byMarket.set(o.supermarket.id, {
          supermarketId: o.supermarket.id,
          supermarketName: o.supermarket.name,
          price: money(o.price) ?? 0,
          memberPrice: money(o.memberPrice),
          requiresMembership: isClub(o),
          validUntil: ms(o.validUntil),
        });
      }
      const markets = [...byMarket.values()];
      const prices = markets.map((m) => m.memberPrice ?? m.price);
      const min = prices.length ? Math.min(...prices) : 0;
      const max = prices.length ? Math.max(...prices) : 0;
      const product = productById.get(id);
      return {
        canonicalId: id,
        canonicalName: product?.canonicalName ?? nameById.get(id) ?? "Canônico",
        brandId: product?.brandId ?? product?.brand?.id ?? null,
        brandName: product?.brand?.name ?? null,
        quantity: product?.quantity ?? null,
        unit: product?.unit ?? null,
        marketCount: markets.length,
        minPrice: min,
        maxPrice: max,
        spreadPct: spreadPct(min, max),
        bySupermarket: markets,
      };
    })
    .sort((a, b) => b.maxPrice - b.minPrice - (a.maxPrice - a.minPrice));
}

function timeseries(offers: OfferListItem[], days = 30) {
  const now = Date.now();
  const start = now - days * DAY_MS;
  const dayStart = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const spreadPoints = [];
  const clubPoints = [];
  const spreads: number[] = [];
  const publicos: number[] = [];
  const clubes: number[] = [];
  for (let i = 0; i < days; i++) {
    const day = dayStart(start + i * DAY_MS);
    const end = day + DAY_MS;
    const ofDay = offers.filter((o) => {
      const t = ms(o.createdAt) ?? 0;
      return t >= day && t < end && o.canonicalProductId && o.validationStatus.toUpperCase() === "VALIDATED";
    });
    const byProduct = new Map<string, number[]>();
    let publicoSum = 0;
    let publicoN = 0;
    let clubeSum = 0;
    let clubeN = 0;
    for (const o of ofDay) {
      const price = money(o.price);
      const member = money(o.memberPrice);
      if (price != null) {
        publicoSum += price;
        publicoN += 1;
        const list = byProduct.get(o.canonicalProductId!) ?? [];
        list.push(member ?? price);
        byProduct.set(o.canonicalProductId!, list);
      }
      if (member != null) {
        clubeSum += member;
        clubeN += 1;
      }
    }
    const daySpreads = [...byProduct.values()]
      .filter((prices) => prices.length >= 2)
      .map((prices) => spreadPct(Math.min(...prices), Math.max(...prices)));
    const medio = daySpreads.length ? daySpreads.reduce((n, v) => n + v, 0) / daySpreads.length : 0;
    const mediana = median(daySpreads);
    spreadPoints.push({
      date: day,
      spreadMedio: Math.round(medio),
      spreadMediana: Math.round(mediana),
      multiCount: daySpreads.length,
    });
    const publico = publicoN ? publicoSum / publicoN : 0;
    const clube = clubeN ? clubeSum / clubeN : 0;
    clubPoints.push({
      date: day,
      publico,
      clube,
      clubSamples: clubeN,
      publicSamples: publicoN,
    });
    if (daySpreads.length) spreads.push(medio);
    if (publicoN) publicos.push(publico);
    if (clubeN) clubes.push(clube);
  }
  const avg = (values: number[]) =>
    values.length ? values.reduce((n, v) => n + v, 0) / values.length : 0;
  return {
    spread: {
      points: spreadPoints,
      avg30d: Math.round(avg(spreads)),
    },
    club: {
      points: clubPoints,
      avgPublico30d: avg(publicos),
      avgClube30d: avg(clubes),
    },
  };
}

export default function PricesComparePage() {
  const [coverage, setCoverage] = useState<"any" | "single" | "multi">("multi");
  const [brandId, setBrandId] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [onlyClub, setOnlyClub] = useState(false);
  const [marketA, setMarketA] = useState("");
  const [marketB, setMarketB] = useState("");
  const [marketC, setMarketC] = useState("");
  const [rows, setRows] = useState<RankRow[]>();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [chart, setChart] = useState<ReturnType<typeof timeseries>>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    void Promise.all([
      loadOfferPages(),
      adminApi.products(),
      adminApi.brands(),
      adminApi.supermarkets(),
      adminApi.priceComparison(),
    ]).then(
      ([offers, products, brandRows, stores, compare]) => {
        if (!alive) return;
        setRows(rankFromOffers(offers, products, compare));
        setBrands(brandRows);
        setMarkets(stores);
        setChart(timeseries(offers));
      },
      (cause: unknown) => {
        if (!alive) return;
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar os preços.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const scoped = useMemo(() => {
    const now = Date.now();
    const wanted = [marketA, marketB, marketC].filter(Boolean);
    return (rows ?? []).flatMap((row) => {
      let marketsOf = row.bySupermarket;
      if (onlyActive) marketsOf = marketsOf.filter((m) => isVigente(m.validUntil, now));
      if (onlyClub) {
        marketsOf = marketsOf
          .filter((m) => m.requiresMembership || m.memberPrice != null)
          .map((m) => ({ ...m, price: m.memberPrice ?? m.price }));
      }
      if (wanted.length && !wanted.every((id) => marketsOf.some((m) => m.supermarketId === id))) {
        return [];
      }
      if (brandId && row.brandId !== brandId) return [];
      const prices = marketsOf.map((m) => m.price);
      const min = prices.length ? Math.min(...prices) : 0;
      const max = prices.length ? Math.max(...prices) : 0;
      const next = {
        ...row,
        bySupermarket: marketsOf,
        marketCount: marketsOf.length,
        minPrice: min,
        maxPrice: max,
        spreadPct: spreadPct(min, max),
      };
      return next.marketCount ? [next] : [];
    });
  }, [rows, brandId, onlyActive, onlyClub, marketA, marketB, marketC]);

  const list = useMemo(() => {
    return scoped.filter((row) => {
      if (coverage === "multi") return row.marketCount >= 2;
      if (coverage === "single") return row.marketCount === 1;
      return true;
    });
  }, [scoped, coverage]);

  const [page, setPage] = useTablePage(
    `${coverage}|${brandId}|${onlyActive}|${onlyClub}|${marketA}|${marketB}|${marketC}`,
  );
  const pageRows = slicePage(list, page);
  const counts = {
    any: scoped.length,
    multi: scoped.filter((r) => r.marketCount >= 2).length,
    single: scoped.filter((r) => r.marketCount === 1).length,
  };

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Preços"
        title="Comparador"
        stamp="Gráficos: últimos 30 dias"
      />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ds-color-danger)]">
          {error}
        </p>
      ) : null}

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Produtos"
          value={rows === undefined ? "…" : list.length}
          foot="agora · no ranking filtrado"
        />
      </section>

      <section className="grid gap-4 pb-4 lg:grid-cols-2">
        <PriceSpreadChart data={chart?.spread} />
        <PriceClubChart data={chart?.club} />
      </section>

      <OpsTabs
        value={coverage}
        onChange={(v) => setCoverage(v as typeof coverage)}
        items={[
          { id: "multi", label: "2+ mercados", count: counts.multi },
          { id: "single", label: "Só 1 mercado", count: counts.single },
          { id: "any", label: "Todos", count: counts.any },
        ]}
      />

      <section className="ds-table-card">
        <div className="ds-table-head flex-wrap gap-2">
          <h2 className="text-[15px] font-semibold">Ranking</h2>
          <select className="ds-search" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Marca: todas</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select className="ds-search" value={marketA} onChange={(e) => setMarketA(e.target.value)}>
            <option value="">Mercado A</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select className="ds-search" value={marketB} onChange={(e) => setMarketB(e.target.value)}>
            <option value="">Mercado B</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select className="ds-search" value={marketC} onChange={(e) => setMarketC(e.target.value)}>
            <option value="">Mercado C</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
            />
            Só vigentes
          </label>
          <label className="flex items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              checked={onlyClub}
              onChange={(e) => setOnlyClub(e.target.checked)}
            />
            Só clube
          </label>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-[2]">Produto</span>
          <span className="ds-label-caps w-[56px] shrink-0">N</span>
          <span className="ds-label-caps w-[88px] shrink-0">Min</span>
          <span className="ds-label-caps w-[88px] shrink-0">Max</span>
          <span className="ds-label-caps w-[72px] shrink-0">Spread</span>
          <span className="ds-label-caps min-w-0 flex-1">Por rede</span>
        </div>
        {pageRows.map((r) => (
          <Link
            key={r.canonicalId}
            href={`/admin/products/${r.canonicalId}`}
            className="ds-table-row"
          >
            <span className="min-w-0 flex-[2] truncate">
              <span className="font-medium">{r.canonicalName}</span>
              <span className="mt-0.5 block text-[11px] text-[var(--ds-color-muted-foreground)]">
                {[r.brandName, formatPack(r.quantity, r.unit)].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="w-[56px] shrink-0 font-mono">{r.marketCount}</span>
            <span className="w-[88px] shrink-0 font-mono">{formatCurrency(r.minPrice)}</span>
            <span className="w-[88px] shrink-0 font-mono">{formatCurrency(r.maxPrice)}</span>
            <span className="w-[72px] shrink-0">
              <span className={r.spreadPct > 40 ? "ds-pill ds-pill--fail" : "ds-pill ds-pill--queue"}>
                {r.spreadPct}%
              </span>
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ds-color-muted-foreground)]">
              {r.bySupermarket
                .map((s) => `${s.supermarketName} ${formatCurrency(s.price)}`)
                .join(" · ")}
            </span>
          </Link>
        ))}
        {rows === undefined && !error ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Carregando…
          </p>
        ) : !list.length && rows !== undefined ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum produto no comparador.
          </p>
        ) : null}
        <TablePagination page={page} total={list.length} onPageChange={setPage} />
      </section>
    </div>
  );
}
