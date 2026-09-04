"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import {
  calendarDaysUntil,
  formatDateTime,
  formatExpiryPill,
  formatNumber,
  formatOpsStamp,
  formatRange,
} from "@/lib/format";

const DAY = 24 * 60 * 60 * 1000;

export default function FlyersPage() {
  const flyers = useQuery(api.flyers.list, {});
  const supermarkets = useQuery(api.supermarkets.listNames);
  const sources = useQuery(api.flyerSources.list);
  const purgeExpiredEvidence = useMutation(api.flyers.purgeExpiredEvidence);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [supermarketId, setSupermarketId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [missingValidityOnly, setMissingValidityOnly] = useState(false);
  const [purging, setPurging] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = Date.now();

  const rowsAll = flyers ?? [];
  const vigente = rowsAll.filter(
    (f) =>
      f.status !== "expired" &&
      f.status !== "failed" &&
      (f.validUntil === undefined || f.validUntil >= now),
  );
  const expiring = vigente.filter(
    (f) => f.validUntil !== undefined && f.validUntil < now + 2 * DAY,
  );
  const noParse = rowsAll.filter(
    (f) =>
      f.status === "failed" ||
      f.status === "discovered" ||
      (f.status === "downloaded" && f.offerCount === 0),
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rowsAll.filter((f) => {
      if (tab === "vigente" && !vigente.includes(f)) return false;
      if (tab === "expiring" && !expiring.includes(f)) return false;
      if (tab === "noparse" && !noParse.includes(f)) return false;
      if (supermarketId && f.supermarketId !== supermarketId) return false;
      if (sourceId && f.sourceId !== sourceId) return false;
      if (status && f.status !== status) return false;
      if (duplicatesOnly && f.status !== "duplicate") return false;
      if (missingValidityOnly && f.validUntil !== undefined) return false;
      if (from && (f.validFrom === undefined || f.validFrom < new Date(from).getTime())) {
        return false;
      }
      if (until && (f.validUntil === undefined || f.validUntil > new Date(until).getTime())) {
        return false;
      }
      if (!needle) return true;
      return (
        (f.title ?? "").toLowerCase().includes(needle) ||
        f.supermarketName.toLowerCase().includes(needle)
      );
    });
  }, [
    rowsAll, tab, q, vigente, expiring, noParse, supermarketId, sourceId,
    status, duplicatesOnly, missingValidityOnly, from, until,
  ]);

  const [page, setPage] = useTablePage(
    `${tab}|${q}|${supermarketId}|${sourceId}|${status}|${from}|${until}|${duplicatesOnly}|${missingValidityOnly}`,
  );
  const pageRows = slicePage(rows, page);

  if (flyers === undefined) return <p className="ds-meta">Carregando…</p>;

  const eligibleForPurge = rowsAll.filter(
    (f) => f.retentionAt !== undefined && f.retentionAt <= now,
  );

  async function purgeExpired() {
    if (
      !window.confirm(
        `Limpar ${eligibleForPurge.length} encarte(s) expirado(s)? PDFs, páginas, extrações e erros serão removidos; as ofertas extraídas serão preservadas.`,
      )
    ) {
      return;
    }
    setPurging(true);
    try {
      await purgeExpiredEvidence({ limit: 100 });
    } finally {
      setPurging(false);
    }
  }

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Encartes"
        title="Encartes"
        stamp={`Atualizado ${formatOpsStamp(Date.now())}`}
        filterTarget={() => searchRef.current?.focus()}
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Vigentes"
          value={
            <>
              {vigente.length}{" "}
              <span className="text-[18px] font-medium">ciclo</span>
            </>
          }
          foot={`${formatNumber(vigente.length)} publicadas nesta semana`}
        />
        <OpsKpi
          label="Expirando"
          value={
            <>
              {expiring.length}{" "}
              <span className="text-[18px] font-medium">48h</span>
            </>
          }
          foot={expiring[0]?.supermarketName ?? "nenhum encarte nas próximas 48h"}
        />
        <OpsKpi
          label="Sem parse"
          value={
            <>
              {noParse.length}{" "}
              <span className="text-[18px] font-medium">fila</span>
            </>
          }
          foot={noParse[0]?.supermarketName ?? "fila de parse vazia"}
        />
      </section>

      {eligibleForPurge.length ? (
        <section className="mb-4 flex items-center justify-between gap-3 rounded-[8px] border border-[var(--ds-color-border)] bg-[var(--ds-color-muted)] px-4 py-3">
          <p className="text-sm">
            <strong>{eligibleForPurge.length}</strong> encarte(s) expirado(s) elegível(is)
            para limpeza. As ofertas históricas serão preservadas.
          </p>
          <button
            type="button"
            className="ds-btn ds-btn--outline shrink-0"
            disabled={purging}
            onClick={() => void purgeExpired()}
          >
            {purging ? "Limpando…" : "Limpar agora"}
          </button>
        </section>
      ) : null}

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
        <select className="ds-search" value={supermarketId} onChange={(e) => setSupermarketId(e.target.value)}>
          <option value="">Todos os supermercados</option>
          {supermarkets?.map((market) => <option key={market._id} value={market._id}>{market.name}</option>)}
        </select>
        <select className="ds-search" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="">Todas as fontes</option>
          {sources?.map((source) => <option key={source._id} value={source._id}>{source.name ?? source.type}</option>)}
        </select>
        <select className="ds-search" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {["discovered", "downloaded", "processing", "processed", "expired", "duplicate", "failed"].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={duplicatesOnly} onChange={(e) => setDuplicatesOnly(e.target.checked)} />
          Apenas duplicados
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={missingValidityOnly} onChange={(e) => setMissingValidityOnly(e.target.checked)} />
          Sem validade
        </label>
        <label className="text-xs text-[var(--ds-color-muted-foreground)]">Vigência a partir de
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ds-search mt-1 w-full" />
        </label>
        <label className="text-xs text-[var(--ds-color-muted-foreground)]">Vigência até
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="ds-search mt-1 w-full" />
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
          <span className="ds-label-caps w-[110px] shrink-0">Limpeza</span>
        </div>
        {pageRows.map((f) => {
          const daysLeft =
            f.validUntil !== undefined && f.validUntil > now
              ? calendarDaysUntil(f.validUntil, now)
              : null;
          const near = daysLeft !== null && daysLeft <= 1;
          const expiryLabel =
            f.validUntil !== undefined
              ? formatExpiryPill(f.validUntil, now)
              : null;
          return (
            <Link key={f._id} href={`/admin/flyers/${f._id}`} className="ds-table-row">
              <span className="flex min-w-0 flex-[2] items-center gap-2">
                <span
                  className="ds-dot"
                  style={{
                    background:
                      f.status === "failed"
                        ? statusDot("fail")
                        : near
                          ? statusDot("review")
                          : statusDot("ok"),
                  }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {f.supermarketName}
                  </span>
                  <span className="block truncate font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                    {f.title ?? f._id}
                  </span>
                </span>
              </span>
              <span className="w-[140px] shrink-0">
                {formatRange(f.validFrom, f.validUntil)}
              </span>
              <span className="w-[56px] shrink-0 font-mono">{f.pageCount}</span>
              <span className="w-[64px] shrink-0 font-mono">{f.offerCount}</span>
              <span className="w-[88px] shrink-0 text-[var(--ds-color-muted-foreground)]">
                Worker
              </span>
              <span className="w-[120px] shrink-0">
                {near && f.status === "processed" && expiryLabel ? (
                  <span className="ds-pill ds-pill--review">{expiryLabel}</span>
                ) : (
                  <StatusBadge status={f.status} />
                )}
              </span>
              <span className="w-[110px] shrink-0 text-xs text-[var(--ds-color-muted-foreground)]">
                {f.retentionAt !== undefined
                  ? f.retentionAt <= now
                    ? "Disponível"
                    : formatDateTime(f.retentionAt)
                  : "—"}
              </span>
            </Link>
          );
        })}
        {!rows.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum encarte.
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
