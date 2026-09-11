"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { OpsHeader, OpsKpi } from "@/components/admin/ops";
import { OpsStatusPill } from "@/components/admin/OpsStatusPill";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { WorkerEditStepsModal } from "@/components/admin/WorkerEditStepsModal";
import { adminApi } from "@/lib/api";
import { formatOpsStamp, isLiveScraperRun, jobLabel } from "@/lib/format";
import {
  STEP_BAR,
  clock,
  compactDuration,
  estadoLabel,
  jobPipeline,
  ms,
  nextCheckHint,
  nextCheckLabel,
  runStatusLabel,
  sourceKindLabel,
  workerSlug,
} from "@/lib/workers";

type Flow = Awaited<ReturnType<typeof adminApi.scraperFlows>>[number];
type Run = Awaited<ReturnType<typeof adminApi.scraperRuns>>[number];
type Market = Awaited<ReturnType<typeof adminApi.supermarkets>>[number];

export default function ScraperFlowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [flow, setFlow] = useState<Flow | null>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [market, setMarket] = useState<Market>();
  const [q, setQ] = useState("");
  const [starting, setStarting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    void Promise.all([adminApi.scraperFlows(), adminApi.scraperRuns(), adminApi.supermarkets()]).then(
      ([flows, allRuns, markets]) => {
        if (!alive) return;
        const found = flows.find((item) => item.id === id) ?? null;
        setFlow(found);
        setRuns(allRuns.filter((run) => run.flow.id === id));
        setMarket(markets.find((item) => item.id === found?.supermarket.id));
      },
      () => alive && setFlow(null),
    );
    return () => {
      alive = false;
    };
  }, [id, reload]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return runs.filter(
      (run) => !needle || jobLabel(run.id).includes(needle) || run.status.toLowerCase().includes(needle),
    );
  }, [runs, q]);
  const [page, setPage] = useTablePage(q);
  const pageRows = slicePage(rows, page);

  if (flow === undefined) return <p className="ds-meta">Carregando…</p>;
  if (flow === null) {
    return <p className="text-sm text-[var(--ds-color-danger)]">Fluxo não encontrado.</p>;
  }

  const slug = workerSlug(flow.name);
  const last = runs[0] ?? flow.latestRun;
  const lastStarted = last ? ms(last.startedAt) ?? 0 : 0;
  const lastFinished = last ? ms(last.finishedAt) : null;
  const pipelineRun = last
    ? {
        id: last.id,
        status: last.status,
        startedAt: lastStarted,
        finishedAt: lastFinished,
        error: last.error,
        log: "log" in last ? last.log : null,
        stepsExecuted: last.stepsExecuted,
        flyersFound: last.flyersFound,
      }
    : undefined;
  const runningNow = Boolean(pipelineRun && isLiveScraperRun({ status: pipelineRun.status, startedAt: pipelineRun.startedAt }));
  const steps = jobPipeline(pipelineRun, runningNow);
  const estado = estadoLabel(flow.status);
  const nextAt = ms(flow.nextRunAt);
  const nextDue = Boolean(nextAt && nextAt <= Date.now());
  const fonte = sourceKindLabel(flow.startUrl);
  const lastDur = last ? compactDuration((lastFinished ?? Date.now()) - lastStarted) : "—";
  const lastClock = lastStarted ? clock(lastStarted) : "—";
  const store = flow.supermarket.name;
  const hasSteps = (flow.stepCount ?? 0) > 0;

  async function runNow() {
    setStarting(true);
    try {
      const created = await adminApi.startScraperRun(flow.id);
      router.push(`/admin/scraper/${flow.id}/run?job=${created.id}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/scraper" className="hover:underline">Workers</Link>
        {" / "}
        {store}
      </p>
      <OpsHeader
        title={store}
        subtitle={`${slug} · ${fonte} · ${nextAt ? `próximo ${nextCheckLabel(nextAt)}` : "sem agendamento"}`}
        stamp={`Atualizado ${formatOpsStamp(ms(flow.updatedAt) ?? Date.now())}`}
        primary={
          hasSteps ? (
            <button type="button" className="ds-btn ds-btn--primary" disabled={starting} onClick={() => void runNow()}>
              {starting ? "Iniciando…" : "Rodar agora"}
            </button>
          ) : (
            <button type="button" className="ds-btn ds-btn--primary" onClick={() => setRecording(true)}>
              Gravar passos
            </button>
          )
        }
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Estado"
          value={estado.title}
          hint={<p className="pb-1 text-[13px] font-medium" style={{ color: estado.color }}>{estado.hint}</p>}
          foot={flow.lastRunAt ? `heartbeat ${clock(ms(flow.lastRunAt) ?? 0)}` : "sem heartbeat"}
        />
        <OpsKpi
          label="Último job"
          value={lastClock}
          hint={<p className="pb-1 text-[13px] font-medium text-[var(--ds-color-muted-foreground)]">{lastDur}</p>}
          foot={last ? `${last.flyersFound} flyers · ${runStatusLabel(pipelineRun!)}` : "Nenhum job ainda"}
        />
        <OpsKpi
          label="Próximo check"
          value={nextAt ? clock(nextAt) : "—"}
          hint={
            <p className="pb-1 text-[13px] font-medium" style={{ color: nextDue ? "var(--ds-color-buoy)" : "var(--ds-color-muted-foreground)" }}>
              {nextAt ? nextCheckHint(nextAt) : "não agendado"}
            </p>
          }
          foot={(flow.status ?? "").toUpperCase() === "DISABLED" ? "pausado — não dispara" : nextDue ? "due — worker pega no poll" : "site + validade · teto 6h"}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 pb-4">
        <span className="ds-chip">{store}</span>
        <span className="ds-chip">{market ? `${market.state} · ${market.city}` : "—"}</span>
        <span className="ds-chip font-mono">{nextAt ? nextCheckLabel(nextAt) : "sem cron"}</span>
        <span className="ds-chip ds-chip--outline">{fonte}</span>
      </div>

      <section className="mb-4 rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 py-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold leading-5">Fluxo do job</h2>
            <p className="mt-0.5 text-xs text-[var(--ds-color-muted-foreground)]">
              {pipelineRun ? `${jobLabel(pipelineRun.id)} · ${steps.caption}` : "Nenhum job ainda"}
            </p>
          </div>
          <span className="shrink-0 text-[13px] font-medium" style={{ color: steps.statusColor }}>
            {steps.statusLabel}
          </span>
        </div>
        <div className="flex gap-2">
          {steps.items.map((step) => (
            <div key={step.label} className="min-w-0 flex-1">
              <div className="h-2.5 w-full rounded-[3px]" style={{ background: STEP_BAR[step.kind] }} aria-hidden />
              <p className="mt-3 text-sm font-semibold leading-5">{step.label}</p>
              <p className="mt-0.5 text-xs leading-4 text-[var(--ds-color-muted-foreground)]">{step.foot}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Jobs recentes</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar job" className="ds-search" />
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-[1.4]">Job</span>
          <span className="ds-label-caps w-[120px] shrink-0">Início</span>
          <span className="ds-label-caps w-[88px] shrink-0">Flyers</span>
          <span className="ds-label-caps w-[96px] shrink-0">Status</span>
        </div>
        {pageRows.map((run) => {
          const started = ms(run.startedAt) ?? 0;
          const ops = runStatusToOps(run.status);
          return (
            <Link key={run.id} href={`/admin/scraper/${id}/run?job=${run.id}`} className="ds-table-row">
              <span className="min-w-0 flex-[1.4] font-mono text-sm">{jobLabel(run.id)}</span>
              <span className="w-[120px] shrink-0 text-[var(--ds-color-muted-foreground)]">{started ? clock(started) : "—"}</span>
              <span className="w-[88px] shrink-0 font-mono">{run.flyersFound}</span>
              <span className="w-[96px] shrink-0"><OpsStatusPill status={ops} /></span>
            </Link>
          );
        })}
        {!rows.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum job ainda.
          </p>
        ) : null}
        <TablePagination page={page} total={rows.length} onPageChange={setPage} />
      </section>

      <WorkerEditStepsModal
        open={recording}
        flowId={flow.id}
        startUrl={flow.startUrl}
        flowVersion={flow.version}
        flowSlug={slug}
        onClose={() => setRecording(false)}
        onSaved={(stepCount) => {
          setRecording(false);
          setFlow((current) => current ? { ...current, stepCount } : current);
          setReload((n) => n + 1);
        }}
      />
    </div>
  );
}

function runStatusToOps(status: string): "running" | "ok" | "queue" | "review" | "fail" {
  const value = status.toUpperCase();
  if (value === "RUNNING") return "running";
  if (value === "SUCCESS") return "ok";
  if (value === "FAILED") return "fail";
  if (value === "PARTIAL" || value === "DUPLICATE") return "review";
  return "queue";
}
