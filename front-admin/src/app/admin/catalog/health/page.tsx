"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { OpsHeader, OpsKpi, OpsTabs } from "@/components/admin/ops";
import { MatchingHealthChart } from "@/components/admin/MatchingHealthChart";
import { SpreadGauge } from "@/components/admin/SpreadGauge";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { ApiError, adminApi, loadOfferPages, type OfferListItem } from "@/lib/api";
import { needsBrandFix } from "@/lib/commodity";
import { formatCurrency, formatNumber } from "@/lib/format";
import { DAY_MS, ms } from "@/lib/workers";

type Product = Awaited<ReturnType<typeof adminApi.products>>[number];
type Compare = Awaited<ReturnType<typeof adminApi.priceComparison>>[number];
type Health = Awaited<ReturnType<typeof adminApi.catalogHealth>>;

type OfferRow = {
  id: string;
  name: string;
  brand: string | null;
  unit: string | null;
  price: number;
};

type SingleRow = {
  id: string;
  canonicalName: string;
  brandName: string | null;
  supermarketName: string;
};

type DivergentRow = {
  id: string;
  canonicalName: string;
  sampleNames: string[];
  marketCount: number;
};

type SpreadRow = {
  id: string;
  canonicalName: string;
  minPrice: number;
  maxPrice: number;
  spreadPct: number;
};

function money(value: string | number | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function spreadPct(min: number, max: number) {
  if (min <= 0) return 0;
  return Math.round(((max - min) / min) * 1000) / 10;
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameDivergence(canonical: string, source: string) {
  const a = normalize(canonical).split(" ").filter(Boolean);
  const b = normalize(source).split(" ").filter(Boolean);
  if (!a.length || !b.length) return false;
  const setA = new Set(a);
  const overlap = b.filter((t) => setA.has(t)).length;
  return overlap / Math.max(a.length, b.length) < 0.35;
}

function needsBrand(o: OfferListItem) {
  return needsBrandFix(o);
}

function needsQty(o: OfferListItem) {
  return !o.quantity && o.quantityValue == null;
}

function needsUnit(o: OfferListItem) {
  return Boolean(o.unit) && !o.unitNormalized && o.quantityValue == null;
}

function offerRow(o: OfferListItem): OfferRow {
  return {
    id: o.id,
    name: o.name,
    brand: o.brand,
    unit: o.unit,
    price: money(o.price) ?? 0,
  };
}

function matchingTimeseries(offers: OfferListItem[], days = 30) {
  const now = Date.now();
  const start = now - (days - 1) * DAY_MS;
  const dayStart = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const origin = dayStart(start);
  const points = Array.from({ length: days }, (_, i) => ({
    date: origin + i * DAY_MS,
    matched: 0,
    unmatched: 0,
  }));
  for (const o of offers) {
    const t = ms(o.createdAt) ?? 0;
    const idx = Math.floor((dayStart(t) - origin) / DAY_MS);
    if (idx < 0 || idx >= days) continue;
    if (o.canonicalProductId) points[idx]!.matched += 1;
    else points[idx]!.unmatched += 1;
  }
  const matched = points.reduce((n, p) => n + p.matched, 0);
  const unmatched = points.reduce((n, p) => n + p.unmatched, 0);
  const total = matched + unmatched;
  const last7 = points.slice(-7);
  const prev7 = points.slice(-14, -7);
  const sum = (rows: typeof points, key: "matched" | "unmatched") =>
    rows.reduce((n, p) => n + p[key], 0);
  return {
    days,
    points,
    totals: {
      matched,
      unmatched,
      matchRate: total ? Math.round((matched / total) * 1000) / 10 : 0,
    },
    week: {
      matched: sum(last7, "matched"),
      unmatched: sum(last7, "unmatched"),
      prevMatched: sum(prev7, "matched"),
      prevUnmatched: sum(prev7, "unmatched"),
    },
  };
}

function buildQueues(
  offers: OfferListItem[],
  products: Product[],
  compare: Compare[],
) {
  const withoutBrand = offers.filter(needsBrand).map(offerRow);
  const withoutQty = offers.filter(needsQty).map(offerRow);
  const invalidUnit = offers.filter(needsUnit).map(offerRow);

  const byCanonical = new Map<string, OfferListItem[]>();
  for (const o of offers) {
    if (!o.canonicalProductId) continue;
    const list = byCanonical.get(o.canonicalProductId) ?? [];
    list.push(o);
    byCanonical.set(o.canonicalProductId, list);
  }

  const singleMarket: SingleRow[] = [];
  const divergentNames: DivergentRow[] = [];
  for (const p of products) {
    const linked = byCanonical.get(p.id) ?? [];
    const markets = new Map<string, string>();
    for (const o of linked) markets.set(o.supermarket.id, o.supermarket.name);
    const marketCount = markets.size || (p._count.offers > 0 ? 1 : 0);
    if (marketCount === 1) {
      singleMarket.push({
        id: p.id,
        canonicalName: p.canonicalName,
        brandName: p.brand?.name ?? null,
        supermarketName: [...markets.values()][0] ?? "—",
      });
    }
    const sourceNames = [...new Set(linked.map((o) => o.name))];
    const divergent = sourceNames.filter((n) => nameDivergence(p.canonicalName, n));
    if (divergent.length >= 2 || (sourceNames.length >= 3 && divergent.length >= 1)) {
      divergentNames.push({
        id: p.id,
        canonicalName: p.canonicalName,
        sampleNames: sourceNames.slice(0, 5),
        marketCount,
      });
    }
  }

  const extremeSpread: SpreadRow[] = compare
    .map((row) => ({
      id: row.productId,
      canonicalName: row.productName,
      minPrice: row.minPrice,
      maxPrice: row.maxPrice,
      spreadPct: spreadPct(row.minPrice, row.maxPrice),
    }))
    .filter((row) => row.spreadPct > 40)
    .sort((a, b) => b.spreadPct - a.spreadPct);

  singleMarket.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, "pt-BR"));
  divergentNames.sort((a, b) => b.sampleNames.length - a.sampleNames.length);

  return {
    totalCanonical: products.length,
    withoutBrand,
    withoutQty,
    invalidUnit,
    singleMarket,
    divergentNames,
    extremeSpread,
  };
}

export default function CatalogHealthPage() {
  const [tab, setTab] = useState("brand");
  const [health, setHealth] = useState<Health>();
  const [queues, setQueues] = useState<ReturnType<typeof buildQueues>>();
  const [chart, setChart] = useState<ReturnType<typeof matchingTimeseries>>();
  const [error, setError] = useState<string>();
  const [page, setPage] = useTablePage(tab);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      adminApi.catalogHealth(),
      loadOfferPages(),
      adminApi.products(),
      adminApi.priceComparison(),
    ]).then(
      ([summary, offers, products, compare]) => {
        if (!alive) return;
        setHealth(summary);
        setQueues(buildQueues(offers, products, compare));
        setChart(matchingTimeseries(offers));
      },
      (cause: unknown) => {
        if (!alive) return;
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar a saúde do catálogo.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const counts = {
    brand: queues?.withoutBrand.length ?? 0,
    qty: queues?.withoutQty.length ?? 0,
    unit: queues?.invalidUnit.length ?? 0,
    single: queues?.singleMarket.length ?? 0,
    divergent: queues?.divergentNames.length ?? 0,
    spread: queues?.extremeSpread.length ?? 0,
  };

  const activeQueue = useMemo(() => {
    if (!queues) return [];
    if (tab === "brand") return queues.withoutBrand;
    if (tab === "qty") return queues.withoutQty;
    if (tab === "unit") return queues.invalidUnit;
    if (tab === "single") return queues.singleMarket;
    if (tab === "divergent") return queues.divergentNames;
    return queues.extremeSpread;
  }, [queues, tab]);

  const pageRows = slicePage(activeQueue, page);

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Saúde"
        title="Saúde do matching"
        stamp="Indicadores: todo o catálogo"
      />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ds-color-danger)]">
          {error}
        </p>
      ) : null}

      <section className="flex flex-wrap gap-4 pb-4">
        <OpsKpi
          label="% com marca"
          value={health ? `${health.pctWithBrand}%` : "…"}
          foot={`todo o catálogo · ${formatNumber(health?.totalOffers ?? 0)} ofertas`}
        />
        <OpsKpi
          label="% com canônico"
          value={health ? `${health.pctWithCanonical}%` : "…"}
          foot={`todo o catálogo · ${formatNumber(queues?.totalCanonical ?? 0)} canônicos`}
        />
        <OpsKpi
          label="1 mercado"
          value={health ? health.singleMarketProducts : "…"}
          foot="todo o catálogo · match fraco ou raro"
        />
      </section>

      <section className="flex gap-4 pb-4">
        <div className="min-w-0 flex-[1.7]">
          <MatchingHealthChart data={chart} />
        </div>
        <div
          className="flex w-[300px] shrink-0 flex-col rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 py-4"
          style={{ minHeight: 280 }}
        >
          <SpreadGauge
            extremeCount={counts.spread}
            totalCanonical={queues?.totalCanonical ?? 0}
          />
        </div>
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "brand", label: "Sem marca", count: counts.brand },
          { id: "qty", label: "Sem qtd", count: counts.qty },
          { id: "unit", label: "Unidade inválida", count: counts.unit },
          { id: "single", label: "1 mercado", count: counts.single },
          { id: "divergent", label: "Nomes divergentes", count: counts.divergent },
          { id: "spread", label: "Spread extremo", count: counts.spread },
        ]}
      />

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Fila de correção</h2>
        </div>

        {tab === "brand" || tab === "qty" || tab === "unit" ? (
          <>
            <div className="ds-table-cols">
              <span className="ds-label-caps min-w-0 flex-[2]">Oferta</span>
              <span className="ds-label-caps w-[120px] shrink-0">Detalhe</span>
              <span className="ds-label-caps w-[88px] shrink-0">Preço</span>
            </div>
            {(pageRows as OfferRow[]).map((o) => (
              <Link
                key={o.id}
                href={`/admin/catalog/health/fix/${o.id}?fix=${tab}`}
                className="ds-table-row"
              >
                <span className="min-w-0 flex-[2] truncate font-medium">{o.name}</span>
                <span className="w-[120px] shrink-0 truncate text-[12px] text-[var(--ds-color-muted-foreground)]">
                  {tab === "brand" ? (o.brand ?? "—") : (o.unit ?? "—")}
                </span>
                <span className="w-[88px] shrink-0 font-mono">{formatCurrency(o.price)}</span>
              </Link>
            ))}
          </>
        ) : null}

        {tab === "single" ? (
          <>
            <div className="ds-table-cols">
              <span className="ds-label-caps min-w-0 flex-[2]">Canônico</span>
              <span className="ds-label-caps w-[120px] shrink-0">Marca</span>
              <span className="ds-label-caps w-[140px] shrink-0">Rede</span>
            </div>
            {(pageRows as SingleRow[]).map((p) => (
              <Link key={p.id} href={`/admin/products/${p.id}`} className="ds-table-row">
                <span className="min-w-0 flex-[2] truncate font-medium">{p.canonicalName}</span>
                <span className="w-[120px] shrink-0 truncate">{p.brandName ?? "—"}</span>
                <span className="w-[140px] shrink-0 truncate">{p.supermarketName}</span>
              </Link>
            ))}
          </>
        ) : null}

        {tab === "divergent" ? (
          <>
            <div className="ds-table-cols">
              <span className="ds-label-caps min-w-0 flex-1">Canônico</span>
              <span className="ds-label-caps min-w-0 flex-[2]">Nomes fonte</span>
              <span className="ds-label-caps w-[64px] shrink-0">N</span>
            </div>
            {(pageRows as DivergentRow[]).map((p) => (
              <Link key={p.id} href={`/admin/products/${p.id}`} className="ds-table-row">
                <span className="min-w-0 flex-1 truncate font-medium">{p.canonicalName}</span>
                <span className="min-w-0 flex-[2] truncate text-[12px] text-[var(--ds-color-muted-foreground)]">
                  {p.sampleNames.join(" · ")}
                </span>
                <span className="w-[64px] shrink-0 font-mono">{p.marketCount}</span>
              </Link>
            ))}
          </>
        ) : null}

        {tab === "spread" ? (
          <>
            <div className="ds-table-cols">
              <span className="ds-label-caps min-w-0 flex-[2]">Canônico</span>
              <span className="ds-label-caps w-[88px] shrink-0">Min</span>
              <span className="ds-label-caps w-[88px] shrink-0">Max</span>
              <span className="ds-label-caps w-[72px] shrink-0">Spread</span>
            </div>
            {(pageRows as SpreadRow[]).map((p) => (
              <Link key={p.id} href={`/admin/products/${p.id}`} className="ds-table-row">
                <span className="min-w-0 flex-[2] truncate font-medium">{p.canonicalName}</span>
                <span className="w-[88px] shrink-0 font-mono">{formatCurrency(p.minPrice)}</span>
                <span className="w-[88px] shrink-0 font-mono">{formatCurrency(p.maxPrice)}</span>
                <span className="w-[72px] shrink-0">
                  <span className="ds-pill ds-pill--fail">{p.spreadPct}%</span>
                </span>
              </Link>
            ))}
          </>
        ) : null}

        {queues === undefined && !error ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Carregando…
          </p>
        ) : queues && !activeQueue.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Fila vazia — {health?.pctWithCanonical ?? 0}% das ofertas já têm canônico.
          </p>
        ) : null}
        <TablePagination page={page} total={activeQueue.length} onPageChange={setPage} />
      </section>
    </div>
  );
}
