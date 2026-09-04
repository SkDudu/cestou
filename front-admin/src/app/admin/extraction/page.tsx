"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { formatOpsStamp, jobLabel } from "@/lib/format";

export default function ExtractionPage() {
  const runs = useQuery(api.scraperRuns.listRecent, { limit: 60 });
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const list = runs ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter((r) => {
      if (tab === "fila" && r.queue !== "fila") return false;
      if (tab === "review" && r.queue !== "review") return false;
      if (tab === "blocked" && r.queue !== "blocked") return false;
      if (!needle) return true;
      return (
        jobLabel(r._id).includes(needle) ||
        r.supermarketName.toLowerCase().includes(needle) ||
        r.flowName.toLowerCase().includes(needle) ||
        r.status.toLowerCase().includes(needle)
      );
    });
  }, [runs, tab, q]);

  const [page, setPage] = useTablePage(`${tab}|${q}`);
  const pageRows = slicePage(rows, page);

  const fila = (runs ?? []).filter((r) => r.queue === "fila");
  const review = (runs ?? []).filter((r) => r.queue === "review");
  const blocked = (runs ?? []).filter((r) => r.queue === "blocked");
  const pendingSkus = fila.reduce((n, r) => n + r.pendingCount, 0);

  return (
    <div>
      <OpsHeader
        title="Extração"
        stamp={`Atualizado ${formatOpsStamp(Date.now())}`}
        filterTarget={() => searchRef.current?.focus()}
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Na fila"
          value={fila.length}
          foot={
            pendingSkus > 0
              ? `${pendingSkus} ofertas pendentes`
              : "jobs com ofertas pendentes"
          }
        />
        <OpsKpi
          label="Bloqueados"
          value={blocked.length}
          danger={blocked.length > 0}
          foot={blocked[0]?.supermarketName ?? "nenhum bloqueio"}
        />
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "Todos", count: runs?.length ?? 0 },
          { id: "fila", label: "Fila", count: fila.length },
          { id: "review", label: "Revisão", count: review.length },
          {
            id: "blocked",
            label: "Bloqueado",
            count: blocked.length,
            warn: true,
          },
        ]}
      />

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Fila</h2>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar job"
            className="ds-search"
          />
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-1">Job</span>
          <span className="ds-label-caps w-[200px] shrink-0">Loja</span>
          <span className="ds-label-caps w-[88px] shrink-0">SKUs</span>
          <span className="ds-label-caps w-[72px] shrink-0">Pend.</span>
          <span className="ds-label-caps w-[96px] shrink-0">Status</span>
        </div>
        {pageRows.map((r) => (
          <Link
            key={r._id}
            href={`/admin/extraction/${r._id}`}
            className="ds-table-row"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2 font-mono text-xs">
              <span
                className="ds-dot"
                style={{
                  background:
                    r.queue === "blocked"
                      ? statusDot("fail")
                      : r.queue === "review"
                        ? statusDot("review")
                        : r.queue === "fila"
                          ? statusDot("queue")
                          : statusDot("ok"),
                }}
              />
              {jobLabel(r._id)}
            </span>
            <span className="w-[200px] shrink-0 truncate">
              {r.supermarketName}
            </span>
            <span className="w-[88px] shrink-0 font-mono text-xs">
              {r.offerCount}
            </span>
            <span className="w-[72px] shrink-0 font-mono text-xs">
              {r.pendingCount}
            </span>
            <span className="w-[96px] shrink-0">
              <StatusBadge status={r.queue === "done" ? r.status : r.queue} />
            </span>
          </Link>
        ))}
        {!rows.length && runs !== undefined ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum job nesta fila.
          </p>
        ) : null}
        <TablePagination
          page={page}
          total={rows.length}
          onPageChange={setPage}
        />
        {runs === undefined ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Carregando…
          </p>
        ) : null}
      </section>
    </div>
  );
}
