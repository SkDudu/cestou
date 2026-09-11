"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { OpsHeader, OpsKpi } from "@/components/admin/ops";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { ApiError, adminApi } from "@/lib/api";
import { formatCompact, formatNumber } from "@/lib/format";

type Brand = Awaited<ReturnType<typeof adminApi.brands>>[number];
type Product = Awaited<ReturnType<typeof adminApi.products>>[number];

export default function BrandsPage() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([adminApi.brands(), adminApi.products()]).then(
      ([list, catalog]) => {
        if (!alive) return;
        setBrands(list);
        setProducts(catalog);
      },
      (cause: unknown) => {
        if (!alive) return;
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar as marcas.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = brands ?? [];
    if (!needle) return rows;
    return rows.filter(
      (b) =>
        b.name.toLowerCase().includes(needle) ||
        b.slug.toLowerCase().includes(needle) ||
        b.aliases.some((alias) => alias.toLowerCase().includes(needle)),
    );
  }, [brands, q]);

  const [page, setPage] = useTablePage(q);
  const pageRows = slicePage(list, page);
  const totalOffers = list.reduce((n, b) => n + b._count.offers, 0);
  const detail = (brands ?? []).find((b) => b.id === selected) ?? null;
  const detailProducts = products.filter(
    (p) => p.brandId === selected || p.brand?.id === selected,
  );

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Marcas"
        title="Marcas"
        stamp="Aliases + canônicos"
        filterTarget={() => searchRef.current?.focus()}
      />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ds-color-danger)]">
          {error}
        </p>
      ) : null}

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Marcas"
          value={formatCompact(list.length)}
          foot="no filtro"
        />
        <OpsKpi
          label="Ofertas ligadas"
          value={formatNumber(totalOffers)}
          foot="soma das contagens"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="ds-table-card">
          <div className="ds-table-head">
            <h2 className="text-[15px] font-semibold">Lista</h2>
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar marca ou alias"
              className="ds-search"
            />
          </div>
          <div className="ds-table-cols">
            <span className="ds-label-caps min-w-0 flex-1">Nome</span>
            <span className="ds-label-caps w-[72px] shrink-0">Canônicos</span>
            <span className="ds-label-caps w-[72px] shrink-0">Ofertas</span>
          </div>
          {pageRows.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelected(b.id)}
              className={`ds-table-row w-full text-left ${
                selected === b.id ? "bg-[var(--ds-color-muted)]" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {b.name}
                {b.aliases.length ? (
                  <span className="ml-2 text-[11px] font-normal text-[var(--ds-color-muted-foreground)]">
                    +{b.aliases.length} alias
                  </span>
                ) : null}
              </span>
              <span className="w-[72px] shrink-0 font-mono">{b._count.products}</span>
              <span className="w-[72px] shrink-0 font-mono">{b._count.offers}</span>
            </button>
          ))}
          {brands === undefined && !error ? (
            <p className="px-[18px] py-6 text-sm text-[var(--ds-color-muted-foreground)]">
              Carregando…
            </p>
          ) : !list.length && brands !== undefined ? (
            <p className="px-[18px] py-6 text-sm text-[var(--ds-color-muted-foreground)]">
              Nenhuma marca.
            </p>
          ) : null}
          <TablePagination page={page} total={list.length} onPageChange={setPage} />
        </section>

        <div className="space-y-4">
          {detail ? (
            <section className="ds-card space-y-3 p-4">
              <h2 className="text-[15px] font-semibold">{detail.name}</h2>
              <p className="text-[12px] text-[var(--ds-color-muted-foreground)]">
                slug {detail.slug} · {detail._count.products} canônicos · {detail._count.offers}{" "}
                ofertas
              </p>
              <p className="ds-label-caps">Aliases</p>
              <p className="text-sm">
                {detail.aliases.length ? detail.aliases.join(", ") : "Nenhum alias"}
              </p>
              {detailProducts.length ? (
                <div className="pt-2">
                  <p className="ds-label-caps mb-2">Canônicos</p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                    {detailProducts.map((p) => (
                      <li key={p.id}>
                        <Link href={`/admin/products/${p.id}`} className="hover:underline">
                          {p.canonicalName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-[var(--ds-color-muted-foreground)]">
                  Nenhum canônico nesta amostra.
                </p>
              )}
            </section>
          ) : (
            <section className="ds-card p-4">
              <p className="text-sm text-[var(--ds-color-muted-foreground)]">
                Selecione uma marca para ver aliases e canônicos.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
