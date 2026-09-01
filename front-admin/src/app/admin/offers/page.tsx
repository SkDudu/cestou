"use client";

import { useMemo, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OpsHeader, OpsKpi, OpsTabs } from "@/components/admin/ops";
import {
  formatCompact,
  formatCurrency,
  formatInstallment,
  formatPercent,
} from "@/lib/format";
import { ELIGIBILITY_OPTIONS } from "@/lib/eligibility";

export default function OffersPage() {
  const [tab, setTab] = useState("all");
  const [elig, setElig] = useState("all");
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.offers.list,
    {},
    { initialNumItems: 60 },
  );

  const counts = {
    all: results.length,
    active: results.filter((o) => o.validationStatus === "validated").length,
    drop: results.filter(
      (o) => o.originalPrice != null && o.originalPrice > o.price,
    ).length,
    novo: results.filter((o) => o.originalPrice == null).length,
    expired: results.filter((o) => o.validationStatus === "rejected").length,
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return results.filter((o) => {
      if (tab === "active" && o.validationStatus !== "validated") return false;
      if (tab === "drop" && !(o.originalPrice != null && o.originalPrice > o.price))
        return false;
      if (tab === "novo" && o.originalPrice != null) return false;
      if (tab === "expired" && o.validationStatus !== "rejected") return false;
      if (
        elig !== "all" &&
        (o.eligibility ?? "ALL_CUSTOMERS") !== elig
      ) {
        return false;
      }
      if (!needle) return true;
      return (
        o.name.toLowerCase().includes(needle) ||
        o.supermarketName.toLowerCase().includes(needle)
      );
    });
  }, [results, tab, q, elig]);

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Ofertas"
        title="Ofertas"
        stamp="Filtro: rede, loja, encarte"
        filterTarget={() => searchRef.current?.focus()}
      />

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
          <span className="ds-label-caps w-[160px] shrink-0">Loja</span>
          <span className="ds-label-caps w-[88px] shrink-0">Preço</span>
          <span className="ds-label-caps w-[88px] shrink-0">Antes</span>
          <span className="ds-label-caps w-[88px] shrink-0">Δ</span>
          <span className="ds-label-caps w-[120px] shrink-0">Condição</span>
        </div>
        {rows.map((o) => {
          const drop =
            o.originalPrice != null && o.originalPrice > 0
              ? (o.price - o.originalPrice) / o.originalPrice
              : null;
          return (
            <Link key={o._id} href={`/admin/offers/${o._id}`} className="ds-table-row">
              <span className="min-w-0 flex-[2] truncate font-medium">{o.name}</span>
              <span className="w-[160px] shrink-0 truncate">{o.supermarketName}</span>
              <span className="w-[88px] shrink-0 font-mono">
                {formatCurrency(o.price)}
                {formatInstallment(o) ? (
                  <span className="mt-0.5 block text-[11px] font-sans text-[var(--ds-color-muted-foreground)]">
                    {formatInstallment(o)}
                  </span>
                ) : null}
              </span>
              <span className="w-[88px] shrink-0 font-mono text-[var(--ds-color-muted-foreground)]">
                {o.originalPrice != null ? formatCurrency(o.originalPrice) : "—"}
              </span>
              <span className="w-[88px] shrink-0">
                {o.validationStatus === "rejected" ? (
                  <span className="ds-pill ds-pill--fail">Expirada</span>
                ) : drop == null ? (
                  <span className="ds-pill ds-pill--queue">novo</span>
                ) : (
                  <span className="ds-pill ds-pill--queue">{formatPercent(drop)}</span>
                )}
              </span>
              <span className="w-[120px] shrink-0">
                <span
                  title={o.condition?.text}
                  className={
                    "block truncate " +
                    (o.condition?.kind === "unknown"
                      ? "ds-pill ds-pill--fail"
                      : o.condition?.kind === "ok"
                        ? "ds-pill ds-pill--review"
                        : "ds-pill ds-pill--queue")
                  }
                >
                  {o.condition?.text ?? "Todos"}
                </span>
              </span>
            </Link>
          );
        })}
        {!rows.length && status !== "LoadingFirstPage" ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma oferta.
          </p>
        ) : null}
      </section>
      {status === "CanLoadMore" ? (
        <button
          type="button"
          onClick={() => loadMore(40)}
          className="ds-btn ds-btn--outline mt-4"
        >
          Carregar mais
        </button>
      ) : null}
    </div>
  );
}
