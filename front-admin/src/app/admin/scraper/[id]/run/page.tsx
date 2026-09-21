"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ApiError, adminApi } from "@/lib/api";
import { formatOpsStamp, isLiveScraperRun, jobLabel } from "@/lib/format";
import { useScraperRunLog } from "@/lib/use-scraper-run-events";
import {
  eventLine,
  fmtElapsed,
  ms,
  sourceKindLabel,
  workerSlug,
} from "@/lib/workers";

type Flow = Awaited<ReturnType<typeof adminApi.scraperFlows>>[number];
type Run = Awaited<ReturnType<typeof adminApi.scraperRun>>;
type Market = Awaited<ReturnType<typeof adminApi.supermarkets>>[number];

export default function WorkerRunPage() {
  return (
    <Suspense fallback={<p className="ds-meta">Carregando…</p>}>
      <WorkerRunInner />
    </Suspense>
  );
}

function WorkerRunInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const jobParam = search.get("job");
  const go = search.get("go") === "1";
  const [flow, setFlow] = useState<Flow | null>();
  const [market, setMarket] = useState<Market>();
  const [hist, setHist] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [follow, setFollow] = useState(true);
  const boot = useRef(false);
  const sawLive = useRef(false);
  const tailRef = useRef<HTMLDivElement>(null);
  const liveLog = useScraperRunLog(jobParam ?? undefined);

  useEffect(() => {
    let alive = true;
    void Promise.all([adminApi.scraperFlows(), adminApi.supermarkets()]).then(
      ([flows, markets]) => {
        if (!alive) return;
        const found = flows.find((item) => item.id === id) ?? null;
        setFlow(found);
        setMarket(markets.find((item) => item.id === found?.supermarket.id));
      },
      () => alive && setFlow(null),
    );
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!jobParam) return;
    let alive = true;
    void adminApi.scraperRun(jobParam).then(
      (run) => alive && setHist(run),
      (cause: unknown) => {
        if (!alive) return;
        setError(cause instanceof ApiError && cause.status === 404 ? "Job não encontrado." : "Não foi possível carregar o job.");
      },
    );
    return () => {
      alive = false;
    };
  }, [jobParam]);

  useEffect(() => {
    if (!jobParam || !hist) return;
    const live =
      isLiveScraperRun({ status: hist.status, startedAt: ms(hist.startedAt) ?? 0 }) &&
      !liveLog.done;
    if (!live) return;
    let alive = true;
    const tick = () => {
      void adminApi.scraperRun(jobParam).then(
        (run) => alive && setHist(run),
        () => undefined,
      );
    };
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [jobParam, hist?.status, hist?.startedAt, liveLog.done]);

  useEffect(() => {
    if (boot.current || !go || jobParam) return;
    boot.current = true;
    void adminApi.startScraperRun(id).then(
      (created) => router.replace(`/admin/scraper/${id}/run?job=${created.id}`),
      () => setError("Não foi possível iniciar o worker. A fila pode estar indisponível."),
    );
  }, [go, jobParam, id, router]);

  const startedAt = hist ? ms(hist.startedAt) ?? 0 : 0;
  const finishedAt = hist ? ms(hist.finishedAt) : null;
  const watchingLive = Boolean(hist && isLiveScraperRun({ status: hist.status, startedAt }) && !liveLog.done);
  if (watchingLive) sawLive.current = true;

  useEffect(() => {
    if (!sawLive.current || !liveLog.done || !jobParam) return;
    if ((hist?.status ?? "").toUpperCase() === "CANCELLED") return;
    router.push(`/admin/validation?run=${jobParam}`);
  }, [liveLog.done, jobParam, hist?.status, router]);

  useEffect(() => {
    if (!watchingLive) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [watchingLive]);

  const histLines = useMemo(() => {
    if (!hist) return [];
    if (hist.events.length) return hist.events.map((event) => eventLine(event.type, event.payload));
    if (hist.log?.trim()) return hist.log.split("\n").filter(Boolean);
    return [`status=${hist.status}`, `steps=${hist.stepsExecuted} stores=${hist.storesFound} flyers=${hist.flyersFound}`];
  }, [hist]);

  const lines = liveLog.lines.length ? liveLog.lines : histLines;

  useEffect(() => {
    if (follow) tailRef.current?.scrollIntoView({ block: "end" });
  }, [lines, follow]);

  if (error) return <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>;
  if (flow === undefined || (go && !jobParam && !error)) return <p className="ds-meta">Carregando…</p>;
  if (flow === null) return <p className="text-sm text-[var(--ds-color-danger)]">Fluxo não encontrado.</p>;
  if (jobParam && !hist && !error) return <p className="ds-meta">Carregando…</p>;

  const store = flow.supermarket.name;
  const slug = workerSlug(flow.name);
  const jobId = hist ? jobLabel(hist.id) : "job_live";
  const elapsed = fmtElapsed(hist ? (finishedAt ?? now) - startedAt : 0);
  const phase = phaseFromStatus(hist?.status, watchingLive);
  const pill = pillFromStatus(hist?.status, watchingLive);
  const stats = {
    skus: hist ? `${hist.flyersFound} flyers` : "—",
    retries: "—",
    bytes: "—",
    progress: hist ? `${hist.storesFound} lojas · ${hist.stepsExecuted} steps` : "—",
  };

  async function cancel() {
    if (!hist) return;
    setCancelling(true);
    try {
      await adminApi.cancelScraperRun(hist.id);
      setHist(await adminApi.scraperRun(hist.id));
    } catch {
      setError("Não foi possível cancelar o run.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/scraper" className="hover:underline">Workers</Link>
        {" / "}
        <Link href={`/admin/scraper/${id}`} className="hover:underline">{store}</Link>
        {" / "}
        Run
      </p>

      <header className="flex items-start justify-between gap-4 pb-[22px]">
        <div>
          <h1 className="text-[28px] font-bold leading-8 tracking-[-0.04em]">{store}</h1>
          <p className="mt-1 text-sm text-[var(--ds-color-muted-foreground)]">
            {jobId} · {slug} · {phase}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 pt-1">
          <span
            className="inline-flex h-7 items-center gap-2 rounded-full pl-2.5 pr-3 text-[13px] font-medium"
            style={{ background: pill.bg, color: pill.color }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: pill.color }} />
            {pill.label}
          </span>
          <button
            type="button"
            className="ds-btn ds-btn--danger"
            disabled={!watchingLive || cancelling}
            onClick={() => void cancel()}
          >
            {cancelling ? "Parando…" : "Cancelar run"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-5">
        <aside className="flex w-[340px] shrink-0 flex-col gap-4">
          <div>
            <p className="ds-label-caps">Run manual</p>
            <p className="mt-1 text-[13px] text-[var(--ds-color-muted-foreground)]">Ops · {store}</p>
          </div>
          <div className="flex items-end gap-3">
            <p className="text-[44px] font-bold leading-[48px] tracking-[-0.04em]">{elapsed}</p>
            <div className="pb-1">
              <p className="ds-label-caps">{phase}</p>
              <p className="text-[13px] text-[var(--ds-color-muted-foreground)]">{stats.progress}</p>
            </div>
          </div>
          <dl className="flex flex-col gap-2 border-t border-[var(--ds-color-border)] pt-3 text-[13px]">
            <Meta k="Início" v={startedAt ? formatOpsStamp(startedAt) : "—"} />
            <Meta k="Trigger" v="Manual · Ops" />
            <Meta k="Fonte" v={sourceKindLabel(flow.startUrl)} />
            <Meta k="Loja" v={market ? `${market.state} · ${market.city} · ${market.name}` : store} />
            <Meta k="IDs" v={`${jobId} ${slug}`} />
          </dl>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex h-[72px] shrink-0 gap-3">
            <Metric k="Skus" v={stats.skus} grow />
            <Metric k="Retries" v={stats.retries} w="140px" />
            <Metric k="Bytes · fila" v={stats.bytes} w="168px" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] bg-[#1A2B3C]">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#334D5E] px-3.5">
              <p className="font-mono text-[12px] text-[#7BA8C4]">stdout</p>
              <button
                type="button"
                className="text-[12px] text-[#7BA8C4]"
                onClick={() => setFollow((value) => !value)}
              >
                {follow ? "seguindo" : "pausado"}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
              {hist?.error && (hist.status ?? "").toUpperCase() !== "RUNNING" ? (
                <p className="mb-2 font-mono text-xs text-[#C97A6C]">{hist.error}</p>
              ) : null}
              {(lines.length ? lines : ["aguardando stdout…"]).map((line, i) => (
                <LogLine key={`${i}-${line.slice(0, 48)}`} line={line} />
              ))}
              <div ref={tailRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[92px] shrink-0 text-[var(--ds-color-muted-foreground)]">{k}</dt>
      <dd className="min-w-0 truncate">{v}</dd>
    </div>
  );
}

function Metric({ k, v, grow, w }: { k: string; v: string; grow?: boolean; w?: string }) {
  return (
    <div className="flex flex-col justify-center" style={{ flexGrow: grow ? 1 : undefined, width: w, flexShrink: 0 }}>
      <p className="ds-label-caps">{k}</p>
      <p className="text-[22px] font-semibold leading-7 tracking-[-0.03em]">{v}</p>
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  const ts = line.match(/^\[([^\]]+)\]\s*(.*)$/);
  const body = ts ? ts[2] : line;
  const time = ts ? `[${ts[1]}]` : "";
  const err = /error|✕|failed/i.test(body);
  const warn = /warn/i.test(body);
  const color = err ? "#C97A6C" : warn ? "#B8952C" : "#C5D4C8";
  return (
    <div className="flex gap-2 font-mono text-xs leading-5">
      {time ? <span className="w-[78px] shrink-0 text-[#7BA8C4]">{time}</span> : null}
      <span className="min-w-0 whitespace-pre-wrap" style={{ color }}>{body}</span>
    </div>
  );
}

function phaseFromStatus(status: string | undefined, live: boolean) {
  const value = (status ?? "").toUpperCase();
  if (value === "SUCCESS") return "OFERTAS";
  if (value === "FAILED") return "FALHA";
  if (value === "DUPLICATE") return "DUPLICATA";
  if (value === "CANCELLED") return "STOP";
  if (value === "PARTIAL") return "REVISÃO";
  if (live || value === "RUNNING") return "PARSE";
  return "—";
}

function pillFromStatus(status: string | undefined, live: boolean) {
  const value = (status ?? "").toUpperCase();
  if (live || value === "RUNNING") return { label: "Rodando", bg: "#E4EDE8", color: "var(--ds-color-success)" };
  if (value === "SUCCESS") return { label: "Ok", bg: "#E4EDE8", color: "var(--ds-color-success)" };
  if (value === "DUPLICATE") return { label: "Duplicata", bg: "var(--ds-color-pill-review-bg)", color: "var(--ds-color-buoy)" };
  if (value === "CANCELLED") return { label: "Parado", bg: "var(--ds-color-pill-review-bg)", color: "var(--ds-color-buoy)" };
  if (value === "PARTIAL") return { label: "Parcial", bg: "var(--ds-color-pill-review-bg)", color: "var(--ds-color-buoy)" };
  if (value === "FAILED") return { label: "Falha", bg: "var(--ds-color-pill-danger-bg)", color: "var(--ds-color-danger)" };
  return { label: "Fila", bg: "var(--ds-color-pill-queue-bg)", color: "var(--ds-color-harbor)" };
}