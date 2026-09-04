"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { OpsHeader, OpsKpi, OpsTabs } from "@/components/admin/ops";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { formatCompact, formatCurrency, formatPack } from "@/lib/format";

export default function ProductsPage() {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [brandId, setBrandId] = useState<string>("");
  const searchRef = useRef<HTMLInputElement>(null);

  const brands = useQuery(api.brands.list);
  const products = useQuery(api.catalog.listProducts, {
    search: q.trim() || undefined,
    brandId: brandId ? (brandId as Id<"brands">) : undefined,
    minMarkets: tab === "multi" ? 2 : tab === "single" ? 1 : undefined,
    limit: 120,
  });

  const rows = useMemo(() => {
    if (!products) return [];
    if (tab === "single") return products.filter((p) => p.marketCount === 1);
    if (tab === "multi") return products.filter((p) => p.marketCount >= 2);
    if (tab === "spread")
      return products.filter((p) => p.spreadPct != null && p.spreadPct > 40);
    return products;
  }, [products, tab]);

  const [page, setPage] = useTablePage(`${tab}|${q}|${brandId}`);
  const pageRows = slicePage(rows, page);

  const counts = {
    all: products?.length ?? 0,
    multi: products?.filter((p) => p.marketCount >= 2).length ?? 0,
    single: products?.filter((p) => p.marketCount === 1).length ?? 0,
    spread:
      products?.filter((p) => p.spreadPct != null && p.spreadPct > 40).length ??
      0,
  };

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Produtos"
        title="Produtos canônicos"
        stamp="Match + cobertura por rede"
        filterTarget={() => searchRef.current?.focus()}
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Canônicos"
          value={formatCompact(counts.all)}
          foot="no filtro atual"
        />
        <OpsKpi
          label="Em 2+ mercados"
          value={counts.multi}
          foot="matching cruzado"
        />
        <OpsKpi
          label="1 mercado"
          value={counts.single}
          foot="raro ou match fraco"
        />
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "Todos", count: counts.all },
          { id: "multi", label: "2+ mercados", count: counts.multi },
          { id: "single", label: "1 mercado", count: counts.single },
          { id: "spread", label: "Spread alto", count: counts.spread },
        ]}
      />

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Catálogo</h2>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nome, matchKey…"
            className="ds-search"
          />
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="ds-search"
            aria-label="Marca"
          >
            <option value="">Marca: todas</option>
            {(brands ?? []).map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-[2]">Produto</span>
          <span className="ds-label-caps w-[120px] shrink-0">Marca</span>
          <span className="ds-label-caps w-[72px] shrink-0">Pack</span>
          <span className="ds-label-caps w-[72px] shrink-0">Mercados</span>
          <span className="ds-label-caps w-[88px] shrink-0">Min</span>
          <span className="ds-label-caps w-[72px] shrink-0">Spread</span>
        </div>
        {pageRows.map((p) => (
          <Link
            key={p._id}
            href={`/admin/products/${p._id}`}
            className="ds-table-row"
          >
            <span className="min-w-0 flex-[2] truncate font-medium">
              {p.canonicalName}
            </span>
            <span className="w-[120px] shrink-0 truncate text-[var(--ds-color-muted-foreground)]">
              {p.brandName ?? "—"}
            </span>
            <span className="w-[72px] shrink-0 truncate font-mono text-[12px]">
              {formatPack(p.quantity, p.unit) ?? "—"}
            </span>
            <span className="w-[72px] shrink-0 font-mono">
              {p.activeMarketCount}/{p.marketCount}
            </span>
            <span className="w-[88px] shrink-0 font-mono">
              {p.minPrice != null ? formatCurrency(p.minPrice) : "—"}
            </span>
            <span className="w-[72px] shrink-0">
              {p.spreadPct != null ? (
                <span
                  className={
                    p.spreadPct > 40
                      ? "ds-pill ds-pill--fail"
                      : "ds-pill ds-pill--queue"
                  }
                >
                  {p.spreadPct}%
                </span>
              ) : (
                "—"
              )}
            </span>
          </Link>
        ))}
        {products === undefined ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Carregando…
          </p>
        ) : !rows.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum produto canônico.
          </p>
        ) : null}
        <TablePagination
          page={page}
          total={rows.length}
          onPageChange={setPage}
        />
      </section>
    </div>
  );
}
