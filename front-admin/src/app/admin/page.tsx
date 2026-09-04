"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { JobsChart } from "@/components/admin/JobsChart";
import { OpsHeader, OpsKpi } from "@/components/admin/ops";
import { OpsStatusPill } from "@/components/admin/OpsStatusPill";
import { ParseGauge } from "@/components/admin/ParseGauge";
import {
  formatOpsStamp,
  formatPercent,
  formatRelative,
} from "@/lib/format";

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const ATTENTION_LIMIT = 8;

type Severity = "fail" | "warn" | "info";

type AttentionItem = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
};

const severityRank: Record<Severity, number> = {
  fail: 0,
  warn: 1,
  info: 2,
};

const statusRank: Record<"fail" | "review" | "running" | "queue", number> = {
  fail: 0,
  review: 1,
  running: 2,
  queue: 3,
};

function SeverityDot({ severity }: { severity: Severity }) {
  const color =
    severity === "fail"
      ? "var(--ds-color-danger)"
      : severity === "warn"
        ? "var(--ds-color-buoy)"
        : "var(--ds-color-harbor)";
  return (
    <span
      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}

export default function AdminOverviewPage() {
  const overview = useQuery(api.dashboard.overview);
  const automation = useQuery(api.dashboard.automation);
  const metrics = useQuery(api.dashboard.metrics);
  const health = useQuery(api.catalog.healthSummary);
  const stamp = formatOpsStamp(Date.now());

  const attention = useMemo(() => {
    if (!overview || !automation || !metrics) return [] as AttentionItem[];
    const now = Date.now();
    const items: AttentionItem[] = [];

    for (const flow of automation.flows) {
      if (flow.status === "error" || flow.lastError) {
        items.push({
          id: `flow-error-${flow._id}`,
          severity: "fail",
          title: `Flow ${flow.supermarketName}`,
          detail: flow.lastError ?? "Flow com erro",
          href: `/admin/scraper/${flow._id}`,
        });
      } else if (
        flow.status === "active" &&
        (!flow.lastRunAt || now - flow.lastRunAt > STALE_MS)
      ) {
        items.push({
          id: `flow-stale-${flow._id}`,
          severity: "warn",
          title: `Rede ${flow.supermarketName}`,
          detail: flow.lastRunAt
            ? `Último run ${formatRelative(flow.lastRunAt)}`
            : "Nunca rodou",
          href: `/admin/supermarkets/${flow.supermarketId}`,
        });
      } else if (flow.status === "active" && !flow.currentFlyerTitle) {
        items.push({
          id: `flow-novigente-${flow._id}`,
          severity: "warn",
          title: `Rede ${flow.supermarketName}`,
          detail: "Sem encarte vigente",
          href: `/admin/supermarkets/${flow.supermarketId}`,
        });
      }
    }

    if (metrics.extractionErrors > 0) {
      items.push({
        id: "extraction-errors",
        severity: "fail",
        title: `${metrics.extractionErrors} erros de extração abertos`,
        detail: "Requer intervenção na fila de extração",
        href: "/admin/extraction",
      });
    }

    if (automation.pendingExtract > 0) {
      items.push({
        id: "pending-extract",
        severity: "warn",
        title: `${automation.pendingExtract} encartes aguardando extração`,
        detail: "Downloaded / parcial sem processar",
        href: "/admin/flyers",
      });
    }

    if (automation.pendingDownload > 0) {
      items.push({
        id: "pending-download",
        severity: "warn",
        title: `${automation.pendingDownload} encartes aguardando download`,
        detail: "Status discovered",
        href: "/admin/flyers",
      });
    }

    if (metrics.offersPending > 0) {
      items.push({
        id: "offers-pending",
        severity: "warn",
        title: `${metrics.offersPending} ofertas pendentes de validação`,
        detail:
          metrics.offersSuspicious > 0
            ? `${metrics.offersSuspicious} suspeitas`
            : "Menor confiança primeiro",
        href: "/admin/validation",
      });
    }

    if (health && health.kpis.withoutBrandCount > 0) {
      items.push({
        id: "health-brand",
        severity: "info",
        title: `${health.kpis.withoutBrandCount} ofertas sem marca`,
        detail: "Fila de qualidade do matching",
        href: "/admin/catalog/health",
      });
    }

    if (health && health.kpis.extremeSpreadCount > 0) {
      items.push({
        id: "health-spread",
        severity: "info",
        title: `${health.kpis.extremeSpreadCount} canônicos com spread extremo`,
        detail: "Possível match errado (>40%)",
        href: "/admin/catalog/health",
      });
    }

    return items
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .slice(0, ATTENTION_LIMIT);
  }, [overview, automation, metrics, health]);

  const networksAtRisk = useMemo(() => {
    if (!automation) return 0;
    const now = Date.now();
    const seen = new Set<string>();
    for (const flow of automation.flows) {
      const stale =
        flow.status === "active" &&
        (!flow.lastRunAt || now - flow.lastRunAt > STALE_MS);
      const noFlyer = flow.status === "active" && !flow.currentFlyerTitle;
      if (flow.status === "error" || stale || noFlyer) {
        seen.add(flow.supermarketId);
      }
    }
    return seen.size;
  }, [automation]);

  const workerRows = useMemo(() => {
    if (!overview || !automation) return [];
    const byFlow = new Map(automation.flows.map((f) => [f._id, f]));
    return [...overview.workers]
      .map((w) => {
        const flow = byFlow.get(w._id);
        return {
          ...w,
          currentFlyerTitle: flow?.currentFlyerTitle,
          currentValidUntil: flow?.currentValidUntil,
          lastError: flow?.lastError,
        };
      })
      .sort((a, b) => {
        const sr = statusRank[a.status] - statusRank[b.status];
        if (sr !== 0) return sr;
        const aTs = a.lastRunAt ?? 0;
        const bTs = b.lastRunAt ?? 0;
        return aTs - bTs;
      });
  }, [overview, automation]);

  if (
    overview === undefined ||
    automation === undefined ||
    metrics === undefined
  ) {
    return <p className="ds-meta">Carregando…</p>;
  }

  const incomplete =
    automation.pendingDownload + automation.pendingExtract;

  return (
    <div>
      <OpsHeader
        title="Visão geral"
        subtitle="Sala de controle — saúde do pipeline, fila de atenção e redes."
        stamp={`Atualizado ${stamp}`}
      />

      {/* A. Estado geral */}
      <section className="flex flex-wrap gap-4 pb-4">
        <Link href="/admin/flyers" className="min-w-[180px] flex-1">
          <OpsKpi
            label="Encartes vigentes"
            value={automation.flyersVigente}
            hint={
              incomplete > 0 ? (
                <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-buoy)]">
                  {incomplete} incompletos
                </p>
              ) : (
                <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-success)]">
                  ok
                </p>
              )
            }
            foot={`${metrics.processedFlyers} processados · ${metrics.partialFlyers} parciais`}
            danger={incomplete > 0 && automation.flyersVigente === 0}
            icon={<FlyerIcon />}
          />
        </Link>

        <Link href="/admin/validation" className="min-w-[180px] flex-1">
          <OpsKpi
            label="Validação pendente"
            value={metrics.offersPending}
            hint={
              metrics.offersSuspicious > 0 ? (
                <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-buoy)]">
                  {metrics.offersSuspicious} suspeitas
                </p>
              ) : undefined
            }
            foot={`${metrics.offersValidated} validadas · ${metrics.offersRejected} rejeitadas`}
            danger={metrics.offersPending > 0}
            icon={<OfferIcon />}
          />
        </Link>

        <Link href="/admin/extraction" className="min-w-[180px] flex-1">
          <OpsKpi
            label="Falhas abertas"
            value={metrics.extractionErrors}
            hint={
              automation.flowsError > 0 ? (
                <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-danger)]">
                  {automation.flowsError} flows
                </p>
              ) : undefined
            }
            foot={
              overview.extractingNow
                ? `${overview.extractingNow} em extração agora`
                : `${automation.flowsActive} flows ativos`
            }
            danger={
              metrics.extractionErrors > 0 || automation.flowsError > 0
            }
            icon={<FailIcon />}
          />
        </Link>

        <Link href="/admin/supermarkets" className="min-w-[180px] flex-1">
          <OpsKpi
            label="Redes em atenção"
            value={networksAtRisk}
            hint={
              health ? (
                <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-muted-foreground)]">
                  {health.kpis.pctWithCanonical}% match
                </p>
              ) : undefined
            }
            foot="Erro, sem vigente ou run > 7d"
            danger={networksAtRisk > 0}
            icon={<StoreIcon />}
          />
        </Link>
      </section>

      {/* B. Fila de atenção */}
      <section className="mb-4 overflow-hidden rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)]">
        <div className="flex items-center justify-between px-[18px] py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">Fila de atenção</h2>
            <p className="text-xs text-[var(--ds-color-muted-foreground)]">
              Só o que exige intervenção humana agora
            </p>
          </div>
          {attention.length ? (
            <span className="font-mono text-[13px] text-[var(--ds-color-muted-foreground)]">
              {attention.length}
            </span>
          ) : null}
        </div>
        {attention.length ? (
          <div>
            {attention.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-start gap-3 border-t border-[var(--ds-color-border)] px-[18px] py-3 text-[13px] transition-colors hover:bg-[var(--ds-color-muted)]"
              >
                <SeverityDot severity={item.severity} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.title}</span>
                  <span className="mt-0.5 block truncate text-[var(--ds-color-muted-foreground)]">
                    {item.detail}
                  </span>
                </span>
                <span className="shrink-0 text-[var(--ds-color-muted-foreground)]">
                  Abrir →
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="border-t border-[var(--ds-color-border)] px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nada crítico. Pipeline estável.
          </p>
        )}
      </section>

      {/* C. Tendências */}
      <section className="flex flex-wrap gap-4 pb-4">
        <div className="min-w-0 flex-[1.7] rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 pb-3 pt-4">
          <JobsChart points={overview.chart} />
        </div>
        <div
          className="flex w-full shrink-0 flex-col rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 py-4 sm:w-[300px]"
          style={{ minHeight: 280 }}
        >
          <ParseGauge
            pieData={[
              {
                label: "Parse",
                value: overview.parseCounts.parsed,
                color: "var(--ds-color-harbor)",
              },
              {
                label: "Revisão",
                value: overview.parseCounts.review,
                color: "var(--ds-color-buoy)",
              },
              {
                label: "Falha",
                value: overview.parseCounts.failed,
                color: "var(--ds-color-rust)",
              },
            ]}
            caption={`encartes desta semana · ${formatPercent(overview.parseRate)} parse`}
          />
        </div>
      </section>

      {/* D. Redes / workers por risco */}
      <section className="overflow-hidden rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)]">
        <div className="flex items-center justify-between px-[18px] py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold leading-5">
              Redes e workers
            </h2>
            <p className="text-xs text-[var(--ds-color-muted-foreground)]">
              Ordenado por risco — falha e dado velho primeiro
            </p>
          </div>
          <Link href="/admin/scraper" className="ds-btn ds-btn--outline">
            Flow Builder
          </Link>
        </div>
        <div className="flex h-8 items-center border-y border-[var(--ds-color-border)] px-[18px]">
          <span className="ds-label-caps min-w-0 flex-[2]">Worker</span>
          <span className="ds-label-caps min-w-0 flex-[1.4]">Rede</span>
          <span className="ds-label-caps hidden min-w-0 flex-[1.6] md:block">
            Vigente
          </span>
          <span className="ds-label-caps w-[100px] shrink-0">Último run</span>
          <span className="ds-label-caps w-[72px] shrink-0">Taxa</span>
          <span className="ds-label-caps w-[96px] shrink-0">Status</span>
        </div>
        {workerRows.map((w) => (
          <Link
            key={w._id}
            href={`/admin/scraper/${w._id}`}
            className="flex min-h-12 items-center border-b border-[var(--ds-color-border)] px-[18px] text-[13px] last:border-b-0 hover:bg-[var(--ds-color-muted)]"
          >
            <span className="flex min-w-0 flex-[2] items-center gap-2 font-mono text-sm">
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
              <span className="truncate">{w.slug}</span>
            </span>
            <span className="min-w-0 flex-[1.4] truncate">
              {w.supermarketName}
            </span>
            <span className="hidden min-w-0 flex-[1.6] truncate text-[var(--ds-color-muted-foreground)] md:block">
              {w.currentFlyerTitle ?? "—"}
            </span>
            <span className="w-[100px] shrink-0 text-[var(--ds-color-muted-foreground)]">
              {formatRelative(w.lastRunAt)}
            </span>
            <span className="w-[72px] shrink-0 font-mono">
              {w.taxa === null ? "—" : formatPercent(w.taxa)}
            </span>
            <span className="w-[96px] shrink-0">
              <OpsStatusPill status={w.status} />
            </span>
          </Link>
        ))}
        {!workerRows.length ? (
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

function FlyerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="3"
        y="2.5"
        width="10"
        height="11"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5.5 6h5M5.5 8.5h5M5.5 11h3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OfferIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8.5l5-5 5 5-5 5-5-5z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="8.5" r="1" fill="currentColor" />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 5.2v3.2M8 10.8h.01"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 13V7l5.5-4 5.5 4v6H9.5V9H6.5v4H2.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
