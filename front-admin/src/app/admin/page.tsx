"use client";

import Link from "next/link";
import { JobsChart } from "@/components/admin/JobsChart";
import { OpsHeader, OpsKpi } from "@/components/admin/ops";
import { OpsStatusPill } from "@/components/admin/OpsStatusPill";
import { ParseGauge } from "@/components/admin/ParseGauge";
import {
  formatOpsStamp,
  formatPercent,
  formatRelative,
} from "@/lib/format";
import { useAdminHome, type AttentionItem } from "@/lib/use-admin-overview";

function SeverityDot({ severity }: { severity: AttentionItem["severity"] }) {
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
  const { data, error, loading } = useAdminHome();
  const stamp = formatOpsStamp(Date.now());

  if (error) {
    return (
      <p role="alert" className="ds-meta text-[var(--ds-color-danger)]">
        Não foi possível carregar o painel.
      </p>
    );
  }

  if (loading || !data) {
    return <p className="ds-meta">Carregando…</p>;
  }

  return (
    <div>
      <OpsHeader
        title="Visão geral"
        subtitle="Sala de controle — saúde do pipeline, fila de atenção e redes."
        stamp={`Atualizado ${stamp}`}
      />

      <section className="flex flex-wrap gap-4 pb-4">
        <Link href="/admin/flyers" className="min-w-[180px] flex-1">
          <OpsKpi
            label="Encartes vigentes"
            value={data.flyersVigente}
            hint={
              data.incomplete > 0 ? (
                <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-buoy)]">
                  {data.incomplete} incompletos
                </p>
              ) : (
                <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-success)]">
                  ok
                </p>
              )
            }
            foot={`${data.processedFlyers} processados · ${data.partialFlyers} parciais`}
            danger={data.incomplete > 0 && data.flyersVigente === 0}
            icon={<FlyerIcon />}
          />
        </Link>

        <Link href="/admin/validation" className="min-w-[180px] flex-1">
          <OpsKpi
            label="Validação pendente"
            value={data.offersPending}
            hint={
              data.offersSuspicious > 0 ? (
                <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-buoy)]">
                  {data.offersSuspicious} suspeitas
                </p>
              ) : undefined
            }
            foot={data.offersFoot}
            danger={data.offersPending > 0}
            icon={<OfferIcon />}
          />
        </Link>

        <Link href="/admin/extraction" className="min-w-[180px] flex-1">
          <OpsKpi
            label="Falhas abertas"
            value={data.extractionErrors}
            hint={
              data.flowsError > 0 ? (
                <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-danger)]">
                  {data.flowsError} flows
                </p>
              ) : undefined
            }
            foot={
              data.extractingNow
                ? `${data.extractingNow} em extração agora`
                : `${data.flowsActive} flows ativos`
            }
            danger={data.extractionErrors > 0 || data.flowsError > 0}
            icon={<FailIcon />}
          />
        </Link>

        <Link href="/admin/supermarkets" className="min-w-[180px] flex-1">
          <OpsKpi
            label="Redes em atenção"
            value={data.networksAtRisk}
            hint={
              data.matchPct != null ? (
                <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-muted-foreground)]">
                  {data.matchPct}% match
                </p>
              ) : undefined
            }
            foot="Erro, sem vigente ou run > 7d"
            danger={data.networksAtRisk > 0}
            icon={<StoreIcon />}
          />
        </Link>
      </section>

      <section className="mb-4 overflow-hidden rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)]">
        <div className="flex items-center justify-between px-[18px] py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">Fila de atenção</h2>
            <p className="text-xs text-[var(--ds-color-muted-foreground)]">
              Só o que exige intervenção humana agora
            </p>
          </div>
          {data.attention.length ? (
            <span className="font-mono text-[13px] text-[var(--ds-color-muted-foreground)]">
              {data.attention.length}
            </span>
          ) : null}
        </div>
        {data.attention.length ? (
          <div>
            {data.attention.map((item) => (
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

      <section className="flex flex-wrap gap-4 pb-4">
        <div className="min-w-0 flex-[1.7] rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 pb-3 pt-4">
          <JobsChart points={data.chart} />
        </div>
        <div
          className="flex w-full shrink-0 flex-col rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 py-4 sm:w-[300px]"
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
            caption={`encartes desta semana · ${formatPercent(data.parseRate)} parse`}
          />
        </div>
      </section>

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
        {data.workers.map((w) => (
          <Link
            key={w.id}
            href={`/admin/scraper/${w.id}`}
            className="flex min-h-12 items-center border-b border-[var(--ds-color-border)] px-[18px] text-[13px] last:border-b-0 hover:bg-[var(--ds-color-muted)]"
          >
            <span className="flex min-w-0 flex-[2] items-center gap-2 font-mono text-sm">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background:
                    w.status === "fail"
                      ? "var(--ds-color-danger)"
                      : w.status === "review" || w.status === "duplicate"
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
        {!data.workers.length ? (
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
