"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { OpsHeader, OpsKpi, OpsTabs } from "@/components/admin/ops";
import { OffersSkuChart } from "@/components/admin/OffersSkuChart";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { ApiError, loadOfferPages, type OfferListItem } from "@/lib/api";
import { ELIGIBILITY_OPTIONS, offerCondition } from "@/lib/eligibility";
import {
  formatCompact,
  formatCurrency,
  formatInstallment,
  formatPercent,
} from "@/lib/format";
import { DAY_MS, ms } from "@/lib/workers";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function money(value: string | number | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function installmentOf(o: OfferListItem) {
  return formatInstallment({
    installmentCount: o.installmentCount,
    installmentAmount: money(o.installmentAmount),
    installmentInterestFree: o.installmentInterestFree,
  });
}

function skuTimeseries(offers: OfferListItem[], days = 30) {
  const now = Date.now();
  const dayStart = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const start = dayStart(now) - (days - 1) * DAY_MS;
  const marketsMap = new Map<string, { key: string; name: string; total: number }>();
  const byDay = new Map<number, Map<string, number>>();
  for (let i = 0; i < days; i++) byDay.set(start + i * DAY_MS, new Map());
  for (const o of offers) {
    const t = ms(o.createdAt) ?? 0;
    if (t < start) continue;
    const key = o.supermarket.id;
    const row = marketsMap.get(key) ?? { key, name: o.supermarket.name, total: 0 };
    row.total += 1;
    marketsMap.set(key, row);
    const bucket = byDay.get(dayStart(t));
    if (bucket) bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }
  const markets = [...marketsMap.values()]
    .sort((a, b) => b.total - a.total)
    .map((m, i) => ({ ...m, color: CHART_COLORS[i % CHART_COLORS.length]! }));
  const points = [...byDay.keys()].sort((a, b) => a - b).map((day) => {
    const row: Record<string, number> = { date: day };
    const bucket = byDay.get(day)!;
    for (const m of markets) row[m.key] = bucket.get(m.key) ?? 0;
    return row;
  });
  return {
    days,
    markets,
    points,
    totals: { skus: markets.reduce((n, m) => n + m.total, 0), markets: markets.length },
  };
}

function matchesElig(o: OfferListItem, elig: string) {
  if (elig === "all") return true;
  const value = (o.eligibility ?? "ALL_CUSTOMERS").toUpperCase();
  if (elig === "LOYALTY_PROGRAM") return value === "LOYALTY_PROGRAM" || value === "MEMBERS_ONLY";
  return value === elig;
}

export default function OffersPage() {
  const [tab, setTab] = useState("all");
  const [elig, setElig] = useState("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<OfferListItem[]>();
  const [error, setError] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void loadOfferPages().then(
      (rows) => alive && setItems(rows),
      (cause: unknown) => {
        if (!alive) return;
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar as ofertas.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const results = items ?? [];
  const counts = {
    all: results.length,
    active: results.filter((o) => o.validationStatus.toUpperCase() === "VALIDATED").length,
    drop: results.filter((o) => {
      const price = money(o.price);
      const original = money(o.originalPrice);
      return original != null && price != null && original > price;
    }).length,
    novo: results.filter((o) => money(o.originalPrice) == null).length,
    expired: results.filter((o) => o.validationStatus.toUpperCase() === "REJECTED").length,
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return results.filter((o) => {
      const price = money(o.price);
      const original = money(o.originalPrice);
      if (tab === "active" && o.validationStatus.toUpperCase() !== "VALIDATED") return false;
      if (tab === "drop" && !(original != null && price != null && original > price)) return false;
      if (tab === "novo" && original != null) return false;
      if (tab === "expired" && o.validationStatus.toUpperCase() !== "REJECTED") return false;
      if (!matchesElig(o, elig)) return false;
      if (!needle) return true;
      return (
        o.name.toLowerCase().includes(needle) ||
        o.supermarket.name.toLowerCase().includes(needle)
      );
    });
  }, [results, tab, q, elig]);

  const [page, setPage] = useTablePage(`${tab}|${elig}|${q}`);
  const pageRows = slicePage(rows, page);
  const chart = items ? skuTimeseries(items) : undefined;

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Ofertas"
        title="Ofertas"
        stamp="Filtro: rede, loja, encarte"
        filterTarget={() => searchRef.current?.focus()}
      />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ds-color-danger)]">
          {error}
        </p>
      ) : null}

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Ativas"
          value={
            <>
              {formatCompact(counts.active)}{" "}
              <span className="text-[18px] font-medium">SKU</span>
            </>
          }
          foot="publicadas neste ciclo"
        />
        <OpsKpi
          label="Queda vs encarte"
          value={counts.drop}
          foot="com preço anterior maior"
        />
        <OpsKpi
          label="Sem histórico"
          value={
            <>
              {counts.novo} <span className="text-[18px] font-medium">SKU</span>
            </>
          }
          foot="primeira aparição no catálogo"
        />
      </section>

      <section className="pb-4">
        <OffersSkuChart data={chart} />
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "Todas", count: counts.all },
          { id: "active", label: "Ativas", count: counts.active },
          { id: "drop", label: "Queda", count: counts.drop },
          { id: "novo", label: "Sem hist.", count: counts.novo },
          { id: "expired", label: "Expiradas", count: counts.expired },
        ]}
      />

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Ofertas publicadas</h2>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar SKU, marca ou loja"
            className="ds-search"
          />
          <select
            value={elig}
            onChange={(e) => setElig(e.target.value)}
            className="ds-search"
            aria-label="Condição da oferta"
          >
            <option value="all">Condição: todas</option>
            {ELIGIBILITY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-[2]">Produto</span>
          <span className="ds-label-caps w-[140px] shrink-0">Loja</span>
          <span className="ds-label-caps w-[88px] shrink-0">Preço</span>
          <span className="ds-label-caps w-[88px] shrink-0">Antes</span>
          <span className="ds-label-caps w-[72px] shrink-0">Δ</span>
          <span className="ds-label-caps w-[100px] shrink-0">Condição</span>
          <span className="ds-label-caps w-[72px] shrink-0">Match</span>
        </div>
        {pageRows.map((o) => {
          const price = money(o.price) ?? 0;
          const original = money(o.originalPrice);
          const drop = original != null && original > 0 ? (price - original) / original : null;
          const installment = installmentOf(o);
          const condition = offerCondition(o);
          const rejected = o.validationStatus.toUpperCase() === "REJECTED";
          return (
            <Link key={o.id} href={`/admin/offers/${o.id}`} className="ds-table-row">
              <span className="min-w-0 flex-[2] truncate font-medium">{o.name}</span>
              <span className="w-[140px] shrink-0 truncate">{o.supermarket.name}</span>
              <span className="w-[88px] shrink-0 font-mono">
                {formatCurrency(price)}
                {installment ? (
                  <span className="mt-0.5 block text-[11px] font-sans text-[var(--ds-color-muted-foreground)]">
                    {installment}
                  </span>
                ) : null}
              </span>
              <span className="w-[88px] shrink-0 font-mono text-[var(--ds-color-muted-foreground)]">
                {original != null ? formatCurrency(original) : "—"}
              </span>
              <span className="w-[72px] shrink-0">
                {rejected ? (
                  <span className="ds-pill ds-pill--fail">Expirada</span>
                ) : drop == null ? (
                  <span className="ds-pill ds-pill--queue">novo</span>
                ) : (
                  <span className="ds-pill ds-pill--queue">{formatPercent(drop)}</span>
                )}
              </span>
              <span className="w-[100px] shrink-0">
                <span
                  className={
                    "block truncate " +
                    (condition.kind === "unknown"
                      ? "ds-pill ds-pill--fail"
                      : condition.kind === "ok"
                        ? "ds-pill ds-pill--review"
                        : "ds-pill ds-pill--queue")
                  }
                >
                  {condition.text}
                </span>
              </span>
              <span className="w-[72px] shrink-0">
                {o.canonicalProductId ? (
                  <span className="ds-pill ds-pill--review">hub</span>
                ) : (
                  <span className="ds-pill ds-pill--fail">—</span>
                )}
              </span>
            </Link>
          );
        })}
        {!rows.length && items !== undefined ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma oferta.
          </p>
        ) : null}
        {items === undefined && !error ? (
          <p className="px-[18px] py-3 text-center text-[12px] text-[var(--ds-color-muted-foreground)]">
            Carregando ofertas…
          </p>
        ) : null}
        <TablePagination page={page} total={rows.length} onPageChange={setPage} />
      </section>
    </div>
  );
}
