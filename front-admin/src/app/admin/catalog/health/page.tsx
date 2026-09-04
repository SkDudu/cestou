"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OpsHeader, OpsKpi, OpsTabs } from "@/components/admin/ops";
import { MatchingHealthChart } from "@/components/admin/MatchingHealthChart";
import { SpreadGauge } from "@/components/admin/SpreadGauge";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { formatCurrency, formatNumber } from "@/lib/format";

export default function CatalogHealthPage() {
  const health = useQuery(api.catalog.healthSummary);
  const timeseries = useQuery(api.catalog.healthTimeseries, { days: 30 });
  const [tab, setTab] = useState("brand");
  const [page, setPage] = useTablePage(tab);

  if (health === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }

  const { kpis, queues } = health;

  const activeQueue: unknown[] =
    tab === "brand"
      ? queues.withoutBrand
      : tab === "qty"
        ? queues.withoutQty
        : tab === "unit"
          ? queues.invalidUnit
          : tab === "single"
            ? queues.singleMarket
            : tab === "divergent"
              ? queues.divergentNames
              : queues.extremeSpread;
  const pageRows = slicePage(activeQueue, page);

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Saúde"
        title="Saúde do matching"
        stamp="Indicadores: todo o catálogo"
      />

      <section className="flex flex-wrap gap-4 pb-4">
        <OpsKpi
          label="% com marca"
          value={`${kpis.pctWithBrand}%`}
          foot={`todo o catálogo · ${formatNumber(kpis.totalOffers)} ofertas`}
        />
        <OpsKpi
          label="% com canônico"
          value={`${kpis.pctWithCanonical}%`}
          foot={`todo o catálogo · ${formatNumber(kpis.totalCanonical)} canônicos`}
        />
        <OpsKpi
          label="1 mercado"
          value={kpis.singleMarketCount}
          foot="todo o catálogo · match fraco ou raro"
        />
      </section>

      <section className="flex gap-4 pb-4">
        <div className="min-w-0 flex-[1.7]">
          <MatchingHealthChart data={timeseries} />
        </div>
        <div
          className="flex w-[300px] shrink-0 flex-col rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 py-4"
          style={{ minHeight: 280 }}
        >
          <SpreadGauge
            extremeCount={kpis.extremeSpreadCount}
            totalCanonical={kpis.totalCanonical}
          />
        </div>
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          {
            id: "brand",
            label: "Sem marca",
            count: kpis.withoutBrandCount,
          },
          {
            id: "qty",
            label: "Sem qtd",
            count: kpis.withoutQtyCount,
          },
          {
            id: "unit",
            label: "Unidade inválida",
            count: kpis.invalidUnitCount,
          },
          {
            id: "single",
            label: "1 mercado",
            count: kpis.singleMarketCount,
          },
          {
            id: "divergent",
            label: "Nomes divergentes",
            count: kpis.divergentCount,
          },
          {
            id: "spread",
            label: "Spread extremo",
            count: kpis.extremeSpreadCount,
          },
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
            {(
              pageRows as
                | typeof queues.withoutBrand
                | typeof queues.withoutQty
                | typeof queues.invalidUnit
            ).map((o) => (
              <Link
                key={o._id}
                href={`/admin/catalog/health/fix/${o._id}?fix=${tab}`}
                className="ds-table-row"
              >
                <span className="min-w-0 flex-[2] truncate font-medium">
                  {o.name}
                </span>
                <span className="w-[120px] shrink-0 truncate text-[12px] text-[var(--ds-color-muted-foreground)]">
                  {"brand" in o
                    ? (o.brand ?? "—")
                    : "unit" in o
                      ? (o.unit ?? "—")
                      : "—"}
                </span>
                <span className="w-[88px] shrink-0 font-mono">
                  {formatCurrency(o.price)}
                </span>
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
            {(pageRows as typeof queues.singleMarket).map((p) => (
              <Link
                key={p._id}
                href={`/admin/products/${p._id}`}
                className="ds-table-row"
              >
                <span className="min-w-0 flex-[2] truncate font-medium">
                  {p.canonicalName}
                </span>
                <span className="w-[120px] shrink-0 truncate">
                  {p.brandName ?? "—"}
                </span>
                <span className="w-[140px] shrink-0 truncate">
                  {p.supermarketName}
                </span>
              </Link>
            ))}
          </>
        ) : null}

        {tab === "divergent" ? (
          <>
            <div className="ds-table-cols">
              <span className="ds-label-caps min-w-0 flex-1">Canônico</span>
              <span className="ds-label-caps min-w-0 flex-[2]">
                Nomes fonte
              </span>
              <span className="ds-label-caps w-[64px] shrink-0">N</span>
            </div>
            {(pageRows as typeof queues.divergentNames).map((p) => (
              <Link
                key={p._id}
                href={`/admin/products/${p._id}`}
                className="ds-table-row"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.canonicalName}
                </span>
                <span className="min-w-0 flex-[2] truncate text-[12px] text-[var(--ds-color-muted-foreground)]">
                  {p.sampleNames.join(" · ")}
                </span>
                <span className="w-[64px] shrink-0 font-mono">
                  {p.marketCount}
                </span>
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
            {(pageRows as typeof queues.extremeSpread).map((p) => (
              <Link
                key={p._id}
                href={`/admin/products/${p._id}`}
                className="ds-table-row"
              >
                <span className="min-w-0 flex-[2] truncate font-medium">
                  {p.canonicalName}
                </span>
                <span className="w-[88px] shrink-0 font-mono">
                  {formatCurrency(p.minPrice)}
                </span>
                <span className="w-[88px] shrink-0 font-mono">
                  {formatCurrency(p.maxPrice)}
                </span>
                <span className="w-[72px] shrink-0">
                  <span className="ds-pill ds-pill--fail">{p.spreadPct}%</span>
                </span>
              </Link>
            ))}
          </>
        ) : null}

        {!activeQueue.length && (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Fila vazia — {kpis.pctWithCanonical}% das ofertas já têm canônico.
          </p>
        )}
        <TablePagination
          page={page}
          total={activeQueue.length}
          onPageChange={setPage}
        />
      </section>
    </div>
  );
}
