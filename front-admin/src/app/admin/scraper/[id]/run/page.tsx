"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useFlowRun } from "@/components/admin/FlowRunPanel";
import { formatOpsStamp, isLiveScraperRun, isRunCancelled, isRunDuplicate } from "@/lib/format";

export default function WorkerRunPage() {
  return (
    <Suspense fallback={<p className="ds-meta">Carregando…</p>}>
      <WorkerRunInner />
    </Suspense>
  );
}

function WorkerRunInner() {
  const params = useParams();
  const id = params.id as Id<"scraperFlows">;
  const router = useRouter();
  const search = useSearchParams();
  const data = useQuery(api.scraperFlows.get, { id });
  const updateFlow = useMutation(api.scraperFlows.update);
  const cancelRun = useMutation(api.scraperRuns.cancel);
  const navAfterRun = useRef(false);
  const run = useFlowRun(id, (ev) => {
    if (navAfterRun.current) return;
    if (!ev.runId) return;
    if (ev.error === "cancelled" || (!ev.ok && ev.error !== "duplicate")) return;
    navAfterRun.current = true;
    router.push(`/admin/extraction/${ev.runId}`);
  });
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(Date.now());
  const boot = useRef(false);
  const tailRef = useRef<HTMLDivElement>(null);
  const jobParam = search.get("job");
  const liveHist = data?.recentRuns?.find((r) => isLiveScraperRun(r));
  const hist =
    (jobParam
      ? data?.recentRuns?.find((r) => r._id === jobParam)
      : undefined) ?? liveHist;
  // SSE wins while this tab owns the run; else Convex log (live or replay)
  const fromDb = Boolean(hist) && !(run.running && run.lines.length > 0);
  const lines = fromDb && hist ? histLines(hist) : run.lines;
  const watchingLive =
    run.running || (hist ? isLiveScraperRun(hist) : false) || Boolean(liveHist);

  useEffect(() => {
    if (boot.current) return;
    if (search.get("go") !== "1") return;
    if (search.get("job")) return;
    // Already a run in flight — attach to Convex log, don't start another
    if (liveHist) {
      boot.current = true;
      router.replace(`/admin/scraper/${id}/run?job=${liveHist._id}`);
      return;
    }
    boot.current = true;
    const stamp = Number(sessionStorage.getItem("cestou-run-boot") ?? 0);
    if (Date.now() - stamp < 800) {
      router.replace(`/admin/scraper/${id}/run`);
      return;
    }
    sessionStorage.setItem("cestou-run-boot", String(Date.now()));
    router.replace(`/admin/scraper/${id}/run`);
    void run.onRun();
  }, [id, search, router, run, liveHist]);

  useEffect(() => {
    if (!watchingLive) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [watchingLive]);

  useEffect(() => {
    if (follow) tailRef.current?.scrollIntoView({ block: "end" });
  }, [lines, follow]);

  const last = data?.recentRuns?.[0];
  const slug = data ? workerSlug(data.name) : "";
  const jobId = hist
    ? jobLabel(hist._id)
    : last
      ? jobLabel(last._id)
      : run.running
        ? jobLabel("live")
        : "job_live";
  const phase = fromDb && hist
    ? phaseFromHist(hist)
    : inferPhase(run.lines, run.running, run.result);
  const elapsedMs =
    hist
      ? (hist.finishedAt ?? now) - hist.startedAt
      : run.startedAt
        ? now - run.startedAt
        : 0;
  const elapsed = fmtElapsed(elapsedMs);
  const stats = useMemo(
    () =>
      fromDb && hist
        ? {
            skus: `${hist.flyersFound} flyers`,
            retries: "—",
            bytes: "—",
            progress: `${hist.storesFound} lojas · ${hist.stepsExecuted} steps`,
          }
        : parseStats(run.lines, run.result),
    [fromDb, hist, run.lines, run.result],
  );
  const etapas =
    fromDb && hist
      ? etapasFromHist(hist)
      : etapasFrom(run.lines, run.running, run.result, run.startedAt);

  if (data === undefined) return <p className="ds-meta">Carregando…</p>;
  if (data === null) {
    return (
      <p className="text-sm text-[var(--ds-color-danger)]">Fluxo não encontrado.</p>
    );
  }
  if (jobParam && !hist) {
    return (
      <p className="text-sm text-[var(--ds-color-danger)]">Job não encontrado.</p>
    );
  }

  const store = data.supermarket?.name ?? data.name;
  const live = watchingLive;
  const pill =
    hist
      ? pillFromStatus(hist)
      : live
        ? { label: "Rodando", bg: "#E4EDE8", color: "var(--ds-color-success)" }
        : run.result?.startsWith("✓")
          ? { label: "Ok", bg: "#E4EDE8", color: "var(--ds-color-success)" }
          : run.result?.includes("DUPLICATE")
            ? {
                label: "Duplicata",
                bg: "var(--ds-color-pill-review-bg)",
                color: "var(--ds-color-buoy)",
              }
            : run.result?.startsWith("■")
              ? { label: "Parado", bg: "var(--ds-color-pill-review-bg)", color: "var(--ds-color-buoy)" }
              : run.result
                ? { label: "Falha", bg: "var(--ds-color-pill-danger-bg)", color: "var(--ds-color-danger)" }
                : { label: "Fila", bg: "var(--ds-color-pill-queue-bg)", color: "var(--ds-color-harbor)" };

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/scraper" className="hover:underline">
          Workers
        </Link>
        {" / "}
        <Link href={`/admin/scraper/${id}`} className="hover:underline">
          {store}
        </Link>
        {" / "}
        Run
      </p>

      <header className="flex items-start justify-between gap-4 pb-[22px]">
        <div>
          <h1 className="text-[28px] font-bold leading-8 tracking-[-0.04em]">
            {store}
          </h1>
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
            className="ds-btn ds-btn--outline"
            disabled={!live && hist?.status !== "running"}
            onClick={() => void updateFlow({ id, status: "disabled" })}
          >
            Pausar
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--danger"
            disabled={!live && !run.stopping && hist?.status !== "running"}
            onClick={() => {
              void (async () => {
                if (hist?._id) {
                  await cancelRun({
                    id: hist._id as Id<"scraperRuns">,
                  });
                }
                await run.onStop();
              })();
            }}
          >
            {run.stopping ? "Parando…" : "Cancelar run"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-5">
        <aside className="flex w-[340px] shrink-0 flex-col gap-4">
          <div>
            <p className="ds-label-caps">Run manual</p>
            <p className="mt-1 text-[13px] text-[var(--ds-color-muted-foreground)]">
              Ops · {store}
            </p>
          </div>
          <div className="flex items-end gap-3">
            <p className="text-[44px] font-bold leading-[48px] tracking-[-0.04em]">
              {elapsed}
            </p>
            <div className="pb-1">
              <p className="ds-label-caps">{phase}</p>
              <p className="text-[13px] text-[var(--ds-color-muted-foreground)]">
                {stats.progress}
              </p>
            </div>
          </div>
          <dl className="flex flex-col gap-2 border-t border-[var(--ds-color-border)] pt-3 text-[13px]">
            <Meta
              k="Início"
              v={formatOpsStamp(
                hist?.startedAt ?? run.startedAt ?? data.updatedAt,
              )}
            />
            <Meta k="Trigger" v="Manual · Ops" />
            <Meta k="Fonte" v={sourceKind(data.startUrl)} />
            <Meta
              k="Loja"
              v={
                data.supermarket
                  ? `${data.supermarket.state} · ${data.supermarket.city} · ${data.supermarket.name}`
                  : "—"
              }
            />
            <Meta k="IDs" v={`${jobId} ${slug}`} />
          </dl>
          <div>
            <p className="ds-label-caps mb-1.5">Etapas</p>
            {etapas.map((e) => (
              <div key={e.label} className="flex h-7 items-center gap-2">
                <span className="ds-dot" style={{ background: e.dot }} />
                <span className="min-w-0 flex-1 text-[13px]">{e.label}</span>
                <span className="font-mono text-[11px] text-[var(--ds-color-muted-foreground)]">
                  {e.foot}
                </span>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex h-[72px] shrink-0 gap-3">
            <Metric k="Skus" v={stats.skus} grow />
            <Metric k="Retries" v={stats.retries} w="140px" />
            <Metric k="Bytes · fila" v={stats.bytes} w="168px" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] bg-[#1A2B3C]">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#334D5E] px-3.5">
              <p className="font-mono text-xs text-[#8FA3B3]">
                {jobId} · stdout
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[#8FA3B3]">
                <span
                  className="relative h-4 w-7 rounded-full"
                  style={{
                    background: follow ? "var(--ds-color-harbor)" : "#334D5E",
                  }}
                >
                  <span
                    className="absolute top-0.5 h-3 w-3 rounded-full bg-white"
                    style={{ left: follow ? 14 : 2 }}
                  />
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={follow}
                  onChange={(e) => setFollow(e.target.checked)}
                />
                Seguir cauda
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
              {fromDb && hist?.error && hist.status !== "running" ? (
                <p className="mb-2 font-mono text-xs text-[#C97A6C]">{hist.error}</p>
              ) : run.error ? (
                <p className="mb-2 font-mono text-xs text-[#C97A6C]">{run.error}</p>
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

function Metric({
  k,
  v,
  grow,
  w,
}: {
  k: string;
  v: string;
  grow?: boolean;
  w?: string;
}) {
  return (
    <div
      className="flex flex-col justify-center"
      style={{ flexGrow: grow ? 1 : undefined, width: w, flexShrink: 0 }}
    >
      <p className="ds-label-caps">{k}</p>
      <p className="text-[22px] font-semibold leading-7 tracking-[-0.03em]">{v}</p>
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  const ts = line.match(/^\[([^\]]+)\]\s*(.*)$/);
  const body = ts ? ts[2] : line;
  const time = ts ? `[${ts[1]}]` : "";
  const warn = /warn/i.test(body);
  const err = /error|✕|failed/i.test(body);
  const color = err ? "#C97A6C" : warn ? "#B8952C" : "#C5D4C8";
  return (
    <div className="flex gap-2 font-mono text-xs leading-5">
      {time ? (
        <span className="w-[78px] shrink-0 text-[#7BA8C4]">{time}</span>
      ) : null}
      <span className="min-w-0 whitespace-pre-wrap" style={{ color }}>
        {body}
      </span>
    </div>
  );
}

function inferPhase(lines: string[], running: boolean, result: string | null) {
  if (result?.startsWith("✓")) return "OFERTAS";
  if (result?.startsWith("✕")) return "FALHA";
  if (result?.includes("DUPLICATE")) return "DUPLICATA";
  if (result?.startsWith("■")) return "STOP";
  const blob = lines.slice(-8).join("\n").toUpperCase();
  if (blob.includes("[EXTRACT]") || blob.includes("PARSE") || blob.includes("MIMO"))
    return "PARSE";
  if (blob.includes("[DOWNLOAD]") || blob.includes("[FLYER]")) return "BAIXA";
  if (blob.includes("[DISCOVER]")) return "FONTE";
  return running ? "PARSE" : "—";
}

function parseStats(lines: string[], result: string | null) {
  const blob = `${lines.join("\n")}\n${result ?? ""}`;
  const offers = blob.match(/offers=(\d+)/);
  const flyers = blob.match(/flyers=(\d+)/);
  const errors = lines.filter((l) => /error|✕/i.test(l)).length;
  const retries = (blob.match(/retry/gi) ?? []).length;
  const mb = blob.match(/(\d+(?:\.\d+)?)\s*MB/i);
  const pct = blob.match(/(\d+(?:\.\d+)?)\s*%/);
  const skus = offers
    ? `${offers[1]} ok · ${errors} fail`
    : flyers
      ? `${flyers[1]} flyers`
      : "—";
  return {
    skus,
    retries: `${retries} / 3`,
    bytes: mb ? `${mb[1]} MB` : "—",
    progress: pct ? `${pct[1]}%` : skus === "—" ? "—" : skus,
  };
}

function etapasFrom(
  lines: string[],
  running: boolean,
  result: string | null,
  startedAt: number | null,
) {
  const blob = lines.join("\n").toUpperCase();
  const t = startedAt
    ? new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(startedAt)
    : "";
  const done = "var(--ds-color-success)";
  const now = "var(--ds-color-harbor)";
  const wait = "var(--ds-color-mist)";
  const fail = "var(--ds-color-danger)";
  const ok = result?.startsWith("✓");
  const bad = Boolean(result && !ok && !result.startsWith("■"));
  const baixaDone = ok || /\[DOWNLOAD\]|\[FLYER\]/.test(blob) || running;
  const parseNow = running && /\[EXTRACT\]|PARSE|MIMO/.test(blob);
  const parseDone = ok;
  return [
    {
      label: "Baixa",
      foot: baixaDone && t ? `ok ${t}` : running ? "agora" : "—",
      dot: baixaDone ? done : wait,
    },
    {
      label: "Parse",
      foot: parseDone ? `ok ${t}` : bad ? "falhou" : parseNow || running ? "agora" : "fila",
      dot: parseDone ? done : bad ? fail : parseNow || running ? now : wait,
    },
    {
      label: "Revisão",
      foot: ok ? "ok" : "fila",
      dot: ok ? done : wait,
    },
    {
      label: "Ofertas",
      foot: ok ? "ok" : "—",
      dot: ok ? done : wait,
    },
  ];
}

type HistRun = {
  _id: string;
  status: "running" | "success" | "partial" | "cancelled" | "duplicate" | "failed";
  startedAt: number;
  finishedAt?: number;
  error?: string;
  log?: string;
  stepsExecuted: number;
  flyersFound: number;
  storesFound: number;
};

function histLines(h: HistRun) {
  if (h.log?.trim()) return h.log.split("\n").filter(Boolean);
  const lines = [
    `status=${isRunCancelled(h) ? "cancelled" : isRunDuplicate(h) ? "duplicate" : h.status}`,
    `steps=${h.stepsExecuted} stores=${h.storesFound} flyers=${h.flyersFound}`,
  ];
  if (h.error && !isRunCancelled(h) && !isRunDuplicate(h) && h.status !== "running") {
    lines.push(`error: ${h.error}`);
  }
  lines.push(
    h.status === "running"
      ? "aguardando stdout…"
      : "(sem stdout — job antigo)",
  );
  return lines;
}

function phaseFromHist(h: HistRun) {
  if (isRunCancelled(h) || (h.status === "running" && !isLiveScraperRun(h)))
    return "STOP";
  if (isRunDuplicate(h)) return "DUPLICATA";
  if (h.status === "success") return "OFERTAS";
  if (h.status === "failed") return "FALHA";
  if (h.status === "partial") return "REVISÃO";
  if (h.status === "running") return "PARSE";
  return "—";
}

function pillFromStatus(h: HistRun) {
  if (isRunCancelled(h) || (h.status === "running" && !isLiveScraperRun(h)))
    return {
      label: "Parado",
      bg: "var(--ds-color-pill-review-bg)",
      color: "var(--ds-color-buoy)",
    };
  if (isRunDuplicate(h))
    return {
      label: "Duplicata",
      bg: "var(--ds-color-pill-review-bg)",
      color: "var(--ds-color-buoy)",
    };
  if (h.status === "success")
    return { label: "Ok", bg: "#E4EDE8", color: "var(--ds-color-success)" };
  if (h.status === "running")
    return { label: "Rodando", bg: "#E4EDE8", color: "var(--ds-color-success)" };
  if (h.status === "partial")
    return {
      label: "Parcial",
      bg: "var(--ds-color-pill-review-bg)",
      color: "var(--ds-color-buoy)",
    };
  return {
    label: "Falha",
    bg: "var(--ds-color-pill-danger-bg)",
    color: "var(--ds-color-danger)",
  };
}

function etapasFromHist(h: HistRun) {
  const done = "var(--ds-color-success)";
  const now = "var(--ds-color-harbor)";
  const wait = "var(--ds-color-mist)";
  const fail = "var(--ds-color-danger)";
  const t = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(h.startedAt);
  const stopped = isRunCancelled(h);
  const dup = isRunDuplicate(h);
  const ok = h.status === "success";
  const bad = h.status === "failed" && !stopped && !dup;
  const live = h.status === "running";
  const part = h.status === "partial";
  const blob = (h.log ?? "").toUpperCase();
  const stepN = h.stepsExecuted;
  const hasFonte =
    stepN > 0 || /DISCOVER|→ STEP/.test(blob) || /NAVIGATE/.test(blob);
  const hasBaixa =
    /\[DOWNLOAD\]|\[FLYER\]|DOWNLOAD-FLYERS/.test(blob) || stepN >= 2;
  const hasParse =
    /\[EXTRACT\]|EXTRACT-OFFERS|MIMO|PARSE/.test(blob) ||
    /✓ STEP \d+ EXTRACT/i.test(h.log ?? "");
  if (stopped) {
    return [
      { label: "Baixa", foot: hasBaixa ? `ok ${t}` : "parado", dot: hasBaixa ? done : wait },
      { label: "Parse", foot: "parado", dot: wait },
      { label: "Revisão", foot: "fila", dot: wait },
      { label: "Ofertas", foot: "—", dot: wait },
    ];
  }
  if (dup) {
    return [
      { label: "Baixa", foot: `ok ${t}`, dot: done },
      { label: "Parse", foot: "já existia", dot: wait },
      { label: "Revisão", foot: "fila", dot: wait },
      { label: "Ofertas", foot: "—", dot: wait },
    ];
  }
  if (live) {
    const baixaDone = hasBaixa || hasParse;
    const fonteNow = !hasFonte && !baixaDone;
    return [
      {
        label: "Baixa",
        foot: baixaDone ? `ok ${t}` : fonteNow || hasFonte ? "agora" : "—",
        dot: baixaDone ? done : hasFonte || fonteNow ? now : wait,
      },
      {
        label: "Parse",
        foot: hasParse ? "agora" : baixaDone ? "fila" : "—",
        dot: hasParse ? now : wait,
      },
      { label: "Revisão", foot: "fila", dot: wait },
      {
        label: "Ofertas",
        foot: stepN ? `${stepN} steps` : "—",
        dot: wait,
      },
    ];
  }
  return [
    {
      label: "Baixa",
      foot: ok || bad || part ? `ok ${t}` : "—",
      dot: ok || bad || part ? done : wait,
    },
    {
      label: "Parse",
      foot: ok ? `ok ${t}` : bad ? "falhou" : part ? "ok" : "fila",
      dot: ok || part ? done : bad ? fail : wait,
    },
    {
      label: "Revisão",
      foot: ok ? "ok" : part ? "agora" : "fila",
      dot: ok ? done : part ? now : wait,
    },
    {
      label: "Ofertas",
      foot: ok ? "ok" : "—",
      dot: ok ? done : wait,
    },
  ];
}

function fmtElapsed(ms: number) {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function workerSlug(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);
  return slug.startsWith("wrk_") ? slug : `wrk_${slug || "flow"}`;
}

function jobLabel(id: string) {
  return `job_${id.slice(-4)}`;
}

function sourceKind(url: string) {
  if (/\.pdf($|\?)/i.test(url)) return "PDF encarte";
  return "HTML encarte";
}
