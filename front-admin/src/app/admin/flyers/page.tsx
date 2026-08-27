"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatNumber, formatOpsStamp, formatRange } from "@/lib/format";

const DAY = 24 * 60 * 60 * 1000;

export default function FlyersPage() {
  const flyers = useQuery(api.flyers.list, {});
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
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
      if (!needle) return true;
      return (
        (f.title ?? "").toLowerCase().includes(needle) ||
        f.supermarketName.toLowerCase().includes(needle)
      );
    });
  }, [rowsAll, tab, q, vigente, expiring, noParse]);

  if (flyers === undefined) return <p className="ds-meta">Carregando…</p>;

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
        {rows.map((f) => {
          const near =
            f.validUntil !== undefined &&
            f.validUntil > now &&
            f.validUntil < now + 2 * DAY;
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
                {near && f.status === "processed" ? (
                  <span className="ds-pill ds-pill--review">Expira em 2d</span>
                ) : (
                  <StatusBadge status={f.status} />
                )}
              </span>
            </Link>
          );
        })}
        {!rows.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum encarte.
          </p>
        ) : null}
      </section>
    </div>
  );
}
