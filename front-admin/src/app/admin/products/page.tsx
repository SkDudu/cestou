"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { OpsHeader, OpsKpi, OpsTabs } from "@/components/admin/ops";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { ApiError, adminApi } from "@/lib/api";
import { formatCompact, formatCurrency, formatPack } from "@/lib/format";

type Product = Awaited<ReturnType<typeof adminApi.products>>[number];
type Compare = Awaited<ReturnType<typeof adminApi.priceComparison>>[number];
type Brand = Awaited<ReturnType<typeof adminApi.brands>>[number];

function spreadPct(min: number, max: number) {
  if (min <= 0) return null;
  return Math.round(((max - min) / min) * 100);
}

export default function ProductsPage() {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [brandId, setBrandId] = useState("");
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<Product[]>();
  const [compare, setCompare] = useState<Map<string, Compare>>(new Map());
  const [brands, setBrands] = useState<Brand[]>([]);
  const [error, setError] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([adminApi.products(), adminApi.brands(), adminApi.priceComparison()]).then(
      ([list, brandRows, rows]) => {
        if (!alive) return;
        setProducts(list);
        setBrands(brandRows);
        setCompare(new Map(rows.map((row) => [row.productId, row])));
      },
      (cause: unknown) => {
        if (!alive) return;
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar os produtos.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const rowsAll = useMemo(() => {
    return (products ?? []).map((p) => {
      const stats = compare.get(p.id);
      const markets = stats?.marketCount ?? (p._count.offers > 0 ? 1 : 0);
      const spread = stats ? spreadPct(stats.minPrice, stats.maxPrice) : null;
      return { ...p, markets, minPrice: stats?.minPrice ?? null, spread };
    });
  }, [products, compare]);

  const counts = {
    all: rowsAll.length,
    multi: rowsAll.filter((p) => p.markets >= 2).length,
    single: rowsAll.filter((p) => p.markets === 1).length,
    spread: rowsAll.filter((p) => p.spread != null && p.spread > 40).length,
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rowsAll.filter((p) => {
      if (tab === "single" && p.markets !== 1) return false;
      if (tab === "multi" && p.markets < 2) return false;
      if (tab === "spread" && !(p.spread != null && p.spread > 40)) return false;
      if (brandId && p.brandId !== brandId && p.brand?.id !== brandId) return false;
      if (category === "none" && p.category) return false;
      if (category && category !== "none" && p.category !== category) return false;
      if (!needle) return true;
      return (
        p.canonicalName.toLowerCase().includes(needle) ||
        p.matchKey.toLowerCase().includes(needle) ||
        (p.brand?.name ?? "").toLowerCase().includes(needle) ||
        (p.category ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rowsAll, tab, q, brandId, category]);

  const [page, setPage] = useTablePage(`${tab}|${q}|${brandId}|${category}`);
  const pageRows = slicePage(rows, page);

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Produtos"
        title="Produtos canônicos"
        stamp="Match + cobertura por rede"
        filterTarget={() => searchRef.current?.focus()}
      />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ds-color-danger)]">
          {error}
        </p>
      ) : null}

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
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="ds-search"
            aria-label="Categoria"
          >
            <option value="">Categoria: todas</option>
            <option value="hortifruti">hortifruti</option>
            <option value="acougue">acougue</option>
            <option value="none">sem categoria</option>
          </select>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-[2]">Produto</span>
          <span className="ds-label-caps w-[100px] shrink-0">Categoria</span>
          <span className="ds-label-caps w-[120px] shrink-0">Marca</span>
          <span className="ds-label-caps w-[72px] shrink-0">Pack</span>
          <span className="ds-label-caps w-[72px] shrink-0">Mercados</span>
          <span className="ds-label-caps w-[88px] shrink-0">Min</span>
          <span className="ds-label-caps w-[72px] shrink-0">Spread</span>
        </div>
        {pageRows.map((p) => (
          <Link key={p.id} href={`/admin/products/${p.id}`} className="ds-table-row">
            <span className="min-w-0 flex-[2] truncate font-medium">{p.canonicalName}</span>
            <span className="w-[100px] shrink-0 truncate text-[var(--ds-color-muted-foreground)]">
              {p.category ?? "—"}
            </span>
            <span className="w-[120px] shrink-0 truncate text-[var(--ds-color-muted-foreground)]">
              {p.brand?.name ?? "—"}
            </span>
            <span className="w-[72px] shrink-0 truncate font-mono text-[12px]">
              {formatPack(p.quantity, p.unit) ?? "—"}
            </span>
            <span className="w-[72px] shrink-0 font-mono">{p.markets || "—"}</span>
            <span className="w-[88px] shrink-0 font-mono">
              {p.minPrice != null ? formatCurrency(p.minPrice) : "—"}
            </span>
            <span className="w-[72px] shrink-0">
              {p.spread != null ? (
                <span className={p.spread > 40 ? "ds-pill ds-pill--fail" : "ds-pill ds-pill--queue"}>
                  {p.spread}%
                </span>
              ) : (
                "—"
              )}
            </span>
          </Link>
        ))}
        {products === undefined && !error ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Carregando…
          </p>
        ) : !rows.length && products !== undefined ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum produto canônico.
          </p>
        ) : null}
        <TablePagination page={page} total={rows.length} onPageChange={setPage} />
      </section>
    </div>
  );
}
