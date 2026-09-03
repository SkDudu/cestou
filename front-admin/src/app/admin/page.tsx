"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { JobsChart } from "@/components/admin/JobsChart";
import { OpsStatusPill } from "@/components/admin/OpsStatusPill";
import { ParseGauge } from "@/components/admin/ParseGauge";
import {
  formatCompact,
  formatDateTime,
  formatOpsStamp,
  formatPercent,
} from "@/lib/format";

export default function AdminOverviewPage() {
  const data = useQuery(api.dashboard.overview);
  const automation = useQuery(api.dashboard.automation);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const stamp = formatOpsStamp(Date.now());

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.workers.filter(
      (w) =>
        !needle ||
        w.slug.includes(needle) ||
        w.supermarketName.toLowerCase().includes(needle),
    );
  }, [data, q]);

  function exportCsv() {
    const header = "worker,loja,jobs_24h,taxa,status";
    const body = rows
      .map((w) =>
        [w.slug, w.supermarketName, w.jobs24h, w.taxa ?? "", w.status].join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cestou-ops-workers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (data === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }

  const skuDelta =
    data.skusPrevWeek === 0
      ? null
      : (data.skusWeek - data.skusPrevWeek) / data.skusPrevWeek;
  const activeId = selected ?? rows[0]?._id;

  return (
    <div>
      <header className="flex items-start justify-between pb-[22px]">
        <div>
          <h1 className="text-[28px] font-bold leading-8 tracking-[-0.04em]">
            Visão geral
          </h1>
          <p className="mt-1 text-sm leading-5 text-[var(--ds-color-muted-foreground)]">
            Extração, workers e ofertas detectadas nesta semana.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <span className="flex items-center gap-2 text-[13px] text-[var(--ds-color-muted-foreground)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ds-color-success)]" />
            Atualizado {stamp}
          </span>
          <button
            type="button"
            className="ds-btn ds-btn--outline"
            onClick={() => searchRef.current?.focus()}
          >
            <FilterIcon />
            Filtrar
          </button>
          <button type="button" className="ds-btn ds-btn--primary" onClick={exportCsv}>
            <ExportIcon />
            Exportar
          </button>
        </div>
      </header>

      <section className="flex gap-4 pb-4">
        <article className="ds-card min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-[var(--ds-color-muted-foreground)]">
              Workers ativos
            </p>
            <KpiIcon>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 5v3.2l2 1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </KpiIcon>
          </div>
          <div className="flex items-end gap-2">
            <p className="ds-kpi-value">{data.workersActive}</p>
            {data.workersDelta > 0 ? (
              <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-success)]">
              rodaram hoje
              </p>
            ) : null}
          </div>
          <p className="text-xs text-[var(--ds-color-muted-foreground)]">
            {data.extractingNow} em extração agora
          </p>
        </article>

        <article className="ds-card min-w-0" style={{ flex: 1.25 }}>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-[var(--ds-color-muted-foreground)]">
              SKUs extraídos
            </p>
            <KpiIcon>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 12l3-3 2.5 2 4-5 2.5 3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </KpiIcon>
          </div>
          <div className="flex items-end gap-2">
            <p className="ds-kpi-value">{formatCompact(data.skusExtracted)}</p>
            <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-muted-foreground)]">
              {formatPercent(data.parseRate)} parse
            </p>
          </div>
          <p className="text-xs text-[var(--ds-color-muted-foreground)]">
            {data.skusPrevWeek
              ? `vs ${formatCompact(data.skusPrevWeek)} na semana anterior`
              : `${formatCompact(data.skusWeek)} nesta semana`}
          </p>
        </article>
      </section>

      <section className="mb-4 overflow-hidden rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)]">
        <div className="flex items-center justify-between px-[18px] py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">Automação de encartes</h2>
            <p className="text-xs text-[var(--ds-color-muted-foreground)]">
              {automation
                ? `${automation.flowsActive} ativos · ${automation.flowsError} com erro · ${automation.pendingDownload} aguardando download`
                : "Carregando automação…"}
            </p>
          </div>
          <Link href="/admin/scraper" className="ds-btn ds-btn--outline">
            Ver flows
          </Link>
        </div>
        {automation?.flows.length ? (
          <div>
            <div className="flex h-8 items-center border-y border-[var(--ds-color-border)] px-[18px]">
              <span className="ds-label-caps min-w-0 flex-[1.5]">Supermercado</span>
              <span className="ds-label-caps w-[170px] shrink-0">Última execução</span>
              <span className="ds-label-caps w-[170px] shrink-0">Próximo discovery</span>
              <span className="ds-label-caps min-w-0 flex-1">Erro</span>
            </div>
            {automation.flows.slice(0, 6).map((flow) => (
              <Link
                key={flow._id}
                href={`/admin/scraper/${flow._id}`}
                className="flex min-h-12 items-center border-b border-[var(--ds-color-border)] px-[18px] text-[13px] last:border-b-0"
              >
                <span className="min-w-0 flex-[1.5] truncate">
                  {flow.supermarketName}
                </span>
                <span className="w-[170px] shrink-0 text-[var(--ds-color-muted-foreground)]">
                  {formatDateTime(flow.lastRunAt)}
                </span>
                <span className="w-[170px] shrink-0 text-[var(--ds-color-muted-foreground)]">
                  {formatDateTime(flow.nextRunAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--ds-color-danger)]">
                  {flow.lastError ?? (flow.status === "error" ? "Flow com erro" : "—")}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-[18px] py-6 text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum flow configurado.
          </p>
        )}
      </section>

      <section className="flex gap-4 pb-4">
        <div
          className="min-w-0 flex-[1.7] rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 pb-3 pt-4"
        >
          <JobsChart points={data.chart} />
        </div>
        <div
          className="flex w-[300px] shrink-0 flex-col rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 py-4"
          style={{ minHeight: 280 }}
        >
          <ParseGauge
            pieData={[
              {
                label: "Parse",
                value: data.parseCounts.parsed,
                color: "var(--ds-color-harbor)",
              },
              {
                label: "Revisão",
                value: data.parseCounts.review,
                color: "var(--ds-color-buoy)",
              },
              {
                label: "Falha",
                value: data.parseCounts.failed,
                color: "var(--ds-color-rust)",
              },
            ]}
            caption="encartes desta semana"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)]">
        <div className="flex items-center justify-between px-[18px] py-3.5">
          <h2 className="text-[15px] font-semibold leading-5">
            Workers e desempenho
          </h2>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar worker"
            className="h-8 w-[220px] rounded-[6px] border border-[var(--ds-color-border)] px-3 text-[13px] outline-none placeholder:text-[var(--ds-color-muted-foreground)] focus:border-2 focus:border-[var(--ds-color-focus)]"
          />
        </div>
        <div className="flex h-8 items-center px-[18px]">
          <span className="ds-label-caps min-w-0 flex-[3.1]">Worker</span>
          <span className="ds-label-caps w-[200px] shrink-0">Loja</span>
          <span className="ds-label-caps w-[88px] shrink-0">Jobs 24h</span>
          <span className="ds-label-caps w-[72px] shrink-0">Taxa</span>
          <span className="ds-label-caps w-[96px] shrink-0">Status</span>
        </div>
        {rows.map((w) => {
          const on = w._id === activeId;
          return (
            <Link
              key={w._id}
              href={`/admin/scraper/${w._id}`}
              onClick={() => setSelected(w._id)}
              className={`flex h-12 items-center px-[18px] text-[13px] ${
                on
                  ? "border-l-2 border-[var(--ds-color-harbor)] bg-[var(--ds-color-muted)]"
                  : "border-b border-[var(--ds-color-border)]"
              }`}
            >
              <span className="flex min-w-0 flex-[3.1] items-center gap-2 font-mono text-sm">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background:
                      w.status === "fail"
                        ? "var(--ds-color-danger)"
                        : w.status === "review"
                          ? "var(--ds-color-buoy)"
                          : w.status === "running"
                            ? "var(--ds-color-success)"
                            : "var(--ds-color-harbor)",
                  }}
                />
                {w.slug}
              </span>
              <span className="w-[200px] shrink-0 truncate">{w.supermarketName}</span>
              <span className="w-[88px] shrink-0 font-mono">{w.jobs24h}</span>
              <span className="w-[72px] shrink-0 font-mono">
                {w.taxa === null ? "—" : formatPercent(w.taxa)}
              </span>
              <span className="w-[96px] shrink-0">
                <OpsStatusPill status={w.status} />
              </span>
            </Link>
          );
        })}
        {!rows.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum worker. Configure no{" "}
            <Link href="/admin/scraper" className="underline">
              Flow Builder
            </Link>
            .
          </p>
        ) : null}
      </section>
    </div>
  );
}

function KpiIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ds-color-muted)] text-[var(--ds-color-foreground)]">
      {children}
    </span>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 3h10L8.2 7.6V11l-2.4 1.2V7.6L2 3z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 2v7M4.5 6.5L7 9l2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M2.5 11.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
