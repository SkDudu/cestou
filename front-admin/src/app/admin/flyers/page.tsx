"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { ApiError, adminApi } from "@/lib/api";
import {
  calendarDaysUntil,
  formatExpiryPill,
  formatNumber,
  formatOpsStamp,
  formatRange,
} from "@/lib/format";
import {
  flyerDisplayStatus,
  isExpiringFlyer,
  isNoParseFlyer,
  isVigenteFlyer,
  ms,
} from "@/lib/workers";

type Flyer = Awaited<ReturnType<typeof adminApi.flyers>>[number];
type Market = Awaited<ReturnType<typeof adminApi.supermarkets>>[number];

const FLYER_STATUSES = [
  "discovered",
  "downloaded",
  "processing",
  "processed",
  "partially_processed",
  "expired",
  "duplicate",
  "failed",
];

export default function FlyersPage() {
  const [flyers, setFlyers] = useState<Flyer[]>();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [supermarketId, setSupermarketId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [missingValidityOnly, setMissingValidityOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = Date.now();

  useEffect(() => {
    let alive = true;
    void Promise.all([adminApi.flyers(), adminApi.supermarkets()]).then(
      ([list, stores]) => {
        if (!alive) return;
        setFlyers(list);
        setMarkets(stores);
      },
      (cause: unknown) => {
        if (!alive) return;
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar os encartes.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const rowsAll = flyers ?? [];
  const vigente = rowsAll.filter((f) => isVigenteFlyer(f, now));
  const expiring = rowsAll.filter((f) => isExpiringFlyer(f, now));
  const noParse = rowsAll.filter((f) => isNoParseFlyer(f.status));
  const sources = useMemo(() => {
    const map = new Map<string, string>();
    for (const flyer of rowsAll) {
      if (!map.has(flyer.source.id)) map.set(flyer.source.id, flyer.source.type);
    }
    return [...map.entries()].map(([id, type]) => ({ id, type }));
  }, [rowsAll]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : null;
    const untilTs = until ? new Date(until).getTime() : null;
    return rowsAll.filter((f) => {
      if (tab === "vigente" && !isVigenteFlyer(f, now)) return false;
      if (tab === "expiring" && !isExpiringFlyer(f, now)) return false;
      if (tab === "noparse" && !isNoParseFlyer(f.status)) return false;
      if (supermarketId && f.supermarket.id !== supermarketId) return false;
      if (sourceId && f.source.id !== sourceId) return false;
      if (status && f.status.toLowerCase() !== status) return false;
      if (duplicatesOnly && f.status.toUpperCase() !== "DUPLICATE") return false;
      if (missingValidityOnly && f.validUntil) return false;
      const validFrom = ms(f.validFrom);
      const validUntil = ms(f.validUntil);
      if (fromTs != null && (validFrom == null || validFrom < fromTs)) return false;
      if (untilTs != null && (validUntil == null || validUntil > untilTs)) return false;
      if (!needle) return true;
      return (
        (f.title ?? "").toLowerCase().includes(needle) ||
        f.supermarket.name.toLowerCase().includes(needle)
      );
    });
  }, [
    rowsAll,
    tab,
    q,
    supermarketId,
    sourceId,
    status,
    duplicatesOnly,
    missingValidityOnly,
    from,
    until,
    now,
  ]);

  const [page, setPage] = useTablePage(
    `${tab}|${q}|${supermarketId}|${sourceId}|${status}|${from}|${until}|${duplicatesOnly}|${missingValidityOnly}`,
  );
  const pageRows = slicePage(rows, page);

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Encartes"
        title="Encartes"
        stamp={`Atualizado ${formatOpsStamp(Date.now())}`}
        filterTarget={() => searchRef.current?.focus()}
      />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ds-color-danger)]">
          {error}
        </p>
      ) : null}

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Vigentes"
          value={
            <>
              {vigente.length}{" "}
              <span className="text-[18px] font-medium">ciclo</span>
            </>
          }
          foot={`${formatNumber(vigente.length)} vigentes nesta semana`}
        />
        <OpsKpi
          label="Expirando"
          value={
            <>
              {expiring.length}{" "}
              <span className="text-[18px] font-medium">48h</span>
            </>
          }
          foot={expiring[0]?.supermarket.name ?? "nenhum encarte nas próximas 48h"}
        />
        <OpsKpi
          label="Sem parse"
          value={
            <>
              {noParse.length}{" "}
              <span className="text-[18px] font-medium">fila</span>
            </>
          }
          foot={noParse[0]?.supermarket.name ?? "fila de parse vazia"}
        />
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "Todos", count: rowsAll.length },
          { id: "vigente", label: "Vigentes", count: vigente.length },
          { id: "expiring", label: "Expirando", count: expiring.length },
          { id: "noparse", label: "Sem parse", count: noParse.length, warn: true },
        ]}
      />

      <section className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select
          className="ds-search"
          value={supermarketId}
          onChange={(e) => setSupermarketId(e.target.value)}
        >
          <option value="">Todos os supermercados</option>
          {markets.map((market) => (
            <option key={market.id} value={market.id}>
              {market.name}
            </option>
          ))}
        </select>
        <select className="ds-search" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="">Todas as fontes</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.type}
            </option>
          ))}
        </select>
        <select className="ds-search" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {FLYER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={duplicatesOnly}
            onChange={(e) => setDuplicatesOnly(e.target.checked)}
          />
          Apenas duplicados
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={missingValidityOnly}
            onChange={(e) => setMissingValidityOnly(e.target.checked)}
          />
          Sem validade
        </label>
        <label className="text-xs text-[var(--ds-color-muted-foreground)]">
          Vigência a partir de
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="ds-search mt-1 w-full"
          />
        </label>
        <label className="text-xs text-[var(--ds-color-muted-foreground)]">
          Vigência até
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="ds-search mt-1 w-full"
          />
        </label>
      </section>

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Documentos</h2>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar loja ou PDF"
            className="ds-search"
          />
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-[2]">Loja</span>
          <span className="ds-label-caps w-[140px] shrink-0">Vigência</span>
          <span className="ds-label-caps w-[56px] shrink-0">Págs</span>
          <span className="ds-label-caps w-[64px] shrink-0">SKUs</span>
          <span className="ds-label-caps w-[88px] shrink-0">Fonte</span>
          <span className="ds-label-caps w-[120px] shrink-0">Status</span>
        </div>
        {pageRows.map((f) => {
          const untilTs = ms(f.validUntil);
          const daysLeft = untilTs != null && untilTs > now ? calendarDaysUntil(untilTs, now) : null;
          const near = daysLeft !== null && daysLeft <= 1;
          const expiryLabel = untilTs != null ? formatExpiryPill(untilTs, now) : null;
          const failed = f.status.toUpperCase() === "FAILED";
          return (
            <Link key={f.id} href={`/admin/flyers/${f.id}`} className="ds-table-row">
              <span className="flex min-w-0 flex-[2] items-center gap-2">
                <span
                  className="ds-dot"
                  style={{
                    background: failed
                      ? statusDot("fail")
                      : near
                        ? statusDot("review")
                        : statusDot("ok"),
                  }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{f.supermarket.name}</span>
                  <span className="block truncate font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                    {f.title ?? f.id}
                  </span>
                </span>
              </span>
              <span className="w-[140px] shrink-0">
                {formatRange(ms(f.validFrom), untilTs)}
              </span>
              <span className="w-[56px] shrink-0 font-mono">—</span>
              <span className="w-[64px] shrink-0 font-mono">—</span>
              <span className="w-[88px] shrink-0 text-[var(--ds-color-muted-foreground)]">
                {f.source.type}
              </span>
              <span className="w-[120px] shrink-0">
                {near && f.status.toUpperCase() === "PROCESSED" && expiryLabel ? (
                  <span className="ds-pill ds-pill--review">{expiryLabel}</span>
                ) : (
                  <StatusBadge status={flyerDisplayStatus(f.status, f.validatedOfferCount)} />
                )}
              </span>
            </Link>
          );
        })}
        {!rows.length && flyers !== undefined ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum encarte.
          </p>
        ) : null}
        <TablePagination page={page} total={rows.length} onPageChange={setPage} />
        {flyers === undefined && !error ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Carregando…
          </p>
        ) : null}
      </section>
    </div>
  );
}
