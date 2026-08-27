"use client";

import { useMemo, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatOpsStamp } from "@/lib/format";

export default function ErrorsPage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.flyerErrors.list,
    {},
    { initialNumItems: 40 },
  );
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const open = results.filter((e) => e.status === "open");
  const blocked = results.filter(
    (e) => e.status === "open" && /fail|block|timeout/i.test(e.message),
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return results.filter((e) => {
      if (tab === "open" && e.status !== "open") return false;
      if (tab === "blocked" && !blocked.includes(e)) return false;
      if (tab === "review" && e.status !== "open") return false;
      if (!needle) return true;
      return (
        e.message.toLowerCase().includes(needle) ||
        e.stage.toLowerCase().includes(needle) ||
        (e.supermarketName ?? "").toLowerCase().includes(needle)
      );
    });
  }, [results, tab, q, blocked]);

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
          value={open.length}
          foot="jobs com erro aberto"
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
          { id: "all", label: "Todos", count: results.length },
          { id: "open", label: "Fila", count: open.length },
          { id: "review", label: "Revisão", count: open.length },
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
          <span className="ds-label-caps w-[160px] shrink-0">Job</span>
          <span className="ds-label-caps w-[200px] shrink-0">Loja</span>
          <span className="ds-label-caps min-w-0 flex-1">Mensagem</span>
          <span className="ds-label-caps w-[96px] shrink-0">Status</span>
        </div>
        {rows.map((e) => (
          <Link key={e._id} href={`/admin/errors/${e._id}`} className="ds-table-row">
            <span className="flex w-[160px] shrink-0 items-center gap-2 font-mono text-xs">
              <span
                className="ds-dot"
                style={{
                  background:
                    e.status === "open" ? statusDot("review") : statusDot("queue"),
                }}
              />
              {e.stage}
            </span>
            <span className="w-[200px] shrink-0 truncate">
              {e.supermarketName ?? "—"}
            </span>
            <span className="min-w-0 flex-1 truncate">{e.message}</span>
            <span className="w-[96px] shrink-0">
              <StatusBadge status={e.status} />
            </span>
          </Link>
        ))}
        {!rows.length && status !== "LoadingFirstPage" ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Fila vazia.
          </p>
        ) : null}
      </section>
      {status === "CanLoadMore" ? (
        <button type="button" onClick={() => loadMore(30)} className="ds-btn ds-btn--outline mt-4">
          Carregar mais
        </button>
      ) : null}
    </div>
  );
}
