"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { OpsHeader, OpsKpi, OpsTabs } from "@/components/admin/ops";
import { PriceSpreadChart } from "@/components/admin/PriceSpreadChart";
import { PriceClubChart } from "@/components/admin/PriceClubChart";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { formatCurrency, formatPack } from "@/lib/format";

export default function PricesComparePage() {
  const [coverage, setCoverage] = useState<"any" | "single" | "multi">("multi");
  const [brandId, setBrandId] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [onlyClub, setOnlyClub] = useState(false);
  const [marketA, setMarketA] = useState("");
  const [marketB, setMarketB] = useState("");
  const [marketC, setMarketC] = useState("");

  const brands = useQuery(api.brands.list);
  const markets = useQuery(api.supermarkets.listNames);

  const supermarketIds = useMemo(() => {
    const ids = [marketA, marketB, marketC].filter(Boolean) as Id<"supermarkets">[];
    return ids.length ? ids : undefined;
  }, [marketA, marketB, marketC]);

  const rows = useQuery(api.catalog.compareMarkets, {
    supermarketIds,
    brandId: brandId ? (brandId as Id<"brands">) : undefined,
    onlyActive,
    onlyClub: onlyClub || undefined,
    coverage,
    limit: 120,
  });
  const timeseries = useQuery(api.catalog.priceTimeseries, { days: 30 });

  const list = rows ?? [];
  const [page, setPage] = useTablePage(
    `${coverage}|${brandId}|${onlyActive}|${onlyClub}|${marketA}|${marketB}|${marketC}`,
  );
  const pageRows = slicePage(list, page);

  const counts = {
    any: list.length,
    multi: list.filter((r) => r.marketCount >= 2).length,
    single: list.filter((r) => r.marketCount === 1).length,
  };

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Preços"
        title="Comparador"
        stamp="Gráficos: últimos 30 dias"
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Produtos"
          value={rows?.length ?? "…"}
          foot="agora · no ranking filtrado"
        />
      </section>

      <section className="grid gap-4 pb-4 lg:grid-cols-2">
        <PriceSpreadChart data={timeseries?.spread} />
        <PriceClubChart data={timeseries?.club} />
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
          <select
            className="ds-search"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
          >
            <option value="">Marca: todas</option>
            {(brands ?? []).map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            className="ds-search"
            value={marketA}
            onChange={(e) => setMarketA(e.target.value)}
          >
            <option value="">Mercado A</option>
            {(markets ?? []).map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            className="ds-search"
            value={marketB}
            onChange={(e) => setMarketB(e.target.value)}
          >
            <option value="">Mercado B</option>
            {(markets ?? []).map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            className="ds-search"
            value={marketC}
            onChange={(e) => setMarketC(e.target.value)}
          >
            <option value="">Mercado C</option>
            {(markets ?? []).map((m) => (
              <option key={m._id} value={m._id}>
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
                {[r.brandName, formatPack(r.quantity, r.unit)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="w-[56px] shrink-0 font-mono">{r.marketCount}</span>
            <span className="w-[88px] shrink-0 font-mono">
              {formatCurrency(r.minPrice)}
            </span>
            <span className="w-[88px] shrink-0 font-mono">
              {formatCurrency(r.maxPrice)}
            </span>
            <span className="w-[72px] shrink-0">
              <span
                className={
                  r.spreadPct > 40
                    ? "ds-pill ds-pill--fail"
                    : "ds-pill ds-pill--queue"
                }
              >
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
        {rows === undefined ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Carregando…
          </p>
        ) : !list.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum produto no comparador.
          </p>
        ) : null}
        <TablePagination
          page={page}
          total={list.length}
          onPageChange={setPage}
        />
      </section>
    </div>
  );
}
