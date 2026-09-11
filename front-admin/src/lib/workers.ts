import type { adminApi } from "./api";

export const DAY_MS = 24 * 60 * 60 * 1000;
export type OpsStatus = "running" | "ok" | "queue" | "review" | "fail";

export function ms(value: string | Date | null | undefined) {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isNaN(n) ? null : n;
}

export function workerSlug(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);
  return slug.startsWith("wrk_") ? slug : `wrk_${slug || "flow"}`;
}

export function opsStatus(flowStatus: string, lastStatus: string | undefined, jobs24h: number): OpsStatus {
  const flow = (flowStatus ?? "").toUpperCase();
  const last = (lastStatus ?? "").toUpperCase();
  if (flow === "ERROR") return "fail";
  if (last === "CANCELLED") return "queue";
  if (last === "DUPLICATE") return "review";
  if (last === "FAILED") return "fail";
  if (last === "RUNNING") return "running";
  if (last === "SUCCESS") return "ok";
  if (last === "PARTIAL" || flow === "TESTING") return "review";
  if (flow === "ACTIVE" && jobs24h > 0) return "running";
  return "queue";
}

export function sourceKind(url: string) {
  return /\.pdf($|\?)/i.test(url) ? "pdf" : "html";
}

export function sourceKindLabel(url: string) {
  return sourceKind(url) === "pdf" ? "PDF encarte" : "HTML encarte";
}

export type FleetWorker = {
  id: string;
  slug: string;
  supermarketId: string;
  supermarketName: string;
  jobs24h: number;
  taxa: number | null;
  status: OpsStatus;
  lastRunAt: number | null;
  sourceKinds: string[];
};

export type WorkerHeatmap = {
  rangeStart: number;
  days: Array<{ date: number; count: number; running: number; workers: string[] }>;
  totals: { runs: number; daysActive: number; runningNow: number };
};

export type FleetSnapshot = {
  workers: FleetWorker[];
  heatmap: WorkerHeatmap;
  workersActive: number;
  workersDelta: number;
  extractingNow: number;
};

export function composeFleet(
  flows: Awaited<ReturnType<typeof adminApi.scraperFlows>>,
  runs: Awaited<ReturnType<typeof adminApi.scraperRuns>>,
  now = Date.now(),
): FleetSnapshot {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const today = startToday.getTime();
  const runsByFlow = new Map<string, typeof runs>();
  for (const run of runs) {
    const list = runsByFlow.get(run.flow.id) ?? [];
    list.push(run);
    runsByFlow.set(run.flow.id, list);
  }

  const workers: FleetWorker[] = flows.map((flow) => {
    const flowRuns = (runsByFlow.get(flow.id) ?? [])
      .slice()
      .sort((a, b) => (ms(b.startedAt) ?? 0) - (ms(a.startedAt) ?? 0));
    const last = flowRuns[0] ?? flow.latestRun;
    const last24 = flowRuns.filter((run) => (ms(run.startedAt) ?? 0) >= now - DAY_MS);
    const ok = last24.filter((run) => {
      const status = (run.status ?? "").toUpperCase();
      return status === "SUCCESS" || status === "DUPLICATE";
    }).length;
    return {
      id: flow.id,
      slug: workerSlug(flow.name),
      supermarketId: flow.supermarket.id,
      supermarketName: flow.supermarket.name,
      jobs24h: last24.length,
      taxa: last24.length ? ok / last24.length : null,
      status: opsStatus(flow.status, last?.status, last24.length),
      lastRunAt: ms(flow.lastRunAt) ?? ms(last?.finishedAt) ?? ms(last?.startedAt),
      sourceKinds: [sourceKind(flow.startUrl)],
    };
  });

  const slugByFlow = new Map(flows.map((flow) => [flow.id, workerSlug(flow.name)]));
  const rangeStart = (() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - 11, 1);
    return d.getTime();
  })();
  type DayAgg = { date: number; count: number; running: number; workers: Set<string> };
  const byDay = new Map<string, DayAgg>();
  for (const run of runs) {
    const started = ms(run.startedAt);
    if (started == null || started < rangeStart) continue;
    const start = new Date(started);
    start.setHours(0, 0, 0, 0);
    const key = String(start.getTime());
    let agg = byDay.get(key);
    if (!agg) {
      agg = { date: start.getTime(), count: 0, running: 0, workers: new Set() };
      byDay.set(key, agg);
    }
    agg.count += 1;
    if ((run.status ?? "").toUpperCase() === "RUNNING") agg.running += 1;
    const slug = slugByFlow.get(run.flow.id);
    if (slug) agg.workers.add(slug);
  }

  const days = [...byDay.values()]
    .sort((a, b) => a.date - b.date)
    .map((day) => ({
      date: day.date,
      count: day.count,
      running: day.running,
      workers: [...day.workers].sort(),
    }));

  return {
    workers,
    heatmap: {
      rangeStart,
      days,
      totals: {
        runs: days.reduce((n, day) => n + day.count, 0),
        daysActive: days.filter((day) => day.count > 0).length,
        runningNow: runs.filter((run) => (run.status ?? "").toUpperCase() === "RUNNING").length,
      },
    },
    workersActive: flows.filter((flow) => (flow.status ?? "").toUpperCase() !== "DISABLED").length,
    workersDelta: flows.filter((flow) => (ms(flow.lastRunAt) ?? 0) >= today).length,
    extractingNow: runs.filter((run) => (run.status ?? "").toUpperCase() === "RUNNING").length,
  };
}

export function clock(ts: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
}

export function compactDuration(durationMs: number) {
  if (durationMs < 0) return "—";
  const s = Math.floor(durationMs / 1000);
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, "0")}s`;
}

export function estadoLabel(status: string) {
  const value = status.toUpperCase();
  if (value === "ACTIVE") return { title: "Ativo", hint: "estável", color: "var(--ds-color-success)" };
  if (value === "TESTING") return { title: "Teste", hint: "review", color: "var(--ds-color-buoy)" };
  if (value === "DISABLED") return { title: "Pausado", hint: "fila", color: "var(--ds-color-muted-foreground)" };
  if (value === "ERROR") return { title: "Erro", hint: "falha", color: "var(--ds-color-danger)" };
  return { title: "Rascunho", hint: "setup", color: "var(--ds-color-muted-foreground)" };
}

export function nextCheckLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (start(d) - start(now)) / 86400000;
  const t = clock(ts);
  if (diff === 0) return `hoje ${t}`;
  if (diff === 1) return `amanhã ${t}`;
  if (diff === -1) return `ontem ${t}`;
  return `${d.getDate()} ${d.toLocaleDateString("pt-BR", { month: "short" })} ${t}`;
}

export function nextCheckHint(ts: number, now = Date.now()) {
  const m = Math.round((ts - now) / 60_000);
  if (m <= 0) return "agora";
  if (m < 60) return `em ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `em ${h}h`;
  return `em ${Math.floor(h / 24)}d`;
}

export function whenLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (start(now) - start(d)) / 86400000;
  const t = clock(ts);
  if (diff === 0) return `hoje ${t}`;
  if (diff === 1) return `ontem ${t}`;
  return `${d.getDate()} ${d.toLocaleDateString("pt-BR", { month: "short" })} ${t}`;
}

type StepKind = "done" | "now" | "review" | "wait" | "fail";

export const STEP_BAR: Record<StepKind, string> = {
  done: "var(--ds-color-success)",
  now: "var(--ds-color-harbor)",
  review: "var(--ds-color-buoy)",
  wait: "var(--ds-color-mist)",
  fail: "var(--ds-color-danger)",
};

export type PipelineRun = {
  id: string;
  status: string;
  startedAt: number;
  finishedAt?: number | null;
  error?: string | null;
  log?: string | null;
  stepsExecuted: number;
  flyersFound: number;
};

function offersFromLog(log?: string | null) {
  if (!log) return null;
  const match = log.match(/(\d+)\s+ofertas?\s+salvas/i);
  return match ? Number(match[1]) : null;
}

export function jobPipeline(run: PipelineRun | undefined, runningNow: boolean) {
  const labels = ["Fonte", "Baixa", "Parse", "Revisão", "Ofertas"] as const;
  const t = run ? clock(run.startedAt) : "";
  const status = (run?.status ?? "").toUpperCase();
  const live = runningNow || status === "RUNNING";
  const flyers = run?.flyersFound ?? 0;
  const offers = offersFromLog(run?.log);
  const baixaFoot = flyers > 0 ? `${flyers}/${flyers} · ${t}` : t ? `ok · ${t}` : "—";
  const cancelled = status === "CANCELLED" || run?.error === "cancelled";
  const duplicate = status === "DUPLICATE" || run?.error === "duplicate";

  let kinds: StepKind[] = ["wait", "wait", "wait", "wait", "wait"];
  let caption = "ainda não";
  let statusLabel = "—";
  let statusColor = "var(--ds-color-muted-foreground)";
  let foots = ["—", "—", "—", "—", "—"];

  if (status === "SUCCESS") {
    kinds = ["done", "done", "done", "done", "done"];
    caption = "último run completo";
    statusLabel = "ok";
    statusColor = "var(--ds-color-success)";
    foots = [`ok · ${t}`, baixaFoot, `ok · ${t}`, "ok", offers != null ? `${offers} salvas` : "ok"];
  } else if (run && cancelled) {
    kinds = ["done", "wait", "wait", "wait", "wait"];
    caption = "cancelado";
    statusLabel = "parado";
    statusColor = "var(--ds-color-buoy)";
    foots = [`ok · ${t}`, "parado", "—", "—", "—"];
  } else if (run && duplicate) {
    kinds = ["done", "done", "wait", "wait", "wait"];
    caption = "duplicata";
    statusLabel = "duplicata";
    statusColor = "var(--ds-color-buoy)";
    foots = [`ok · ${t}`, "já existia", "—", "—", "—"];
  } else if (status === "FAILED") {
    kinds = ["done", "done", "fail", "wait", "wait"];
    caption = "falha no parse";
    statusLabel = "falha";
    statusColor = "var(--ds-color-danger)";
    foots = [`ok · ${t}`, baixaFoot, "falhou", "—", "—"];
  } else if (status === "PARTIAL") {
    kinds = ["done", "done", "review", "done", "done"];
    caption = "último run completo";
    statusLabel = "parcial";
    statusColor = "var(--ds-color-buoy)";
    foots = [`ok · ${t}`, baixaFoot, "parcial", "ok", offers != null ? `${offers} salvas` : "ok"];
  } else if (live) {
    const blob = (run?.log ?? "").toUpperCase();
    const n = run?.stepsExecuted ?? 0;
    const hasBaixa = /\[DOWNLOAD\]|\[FLYER\]|DOWNLOAD-FLYERS/.test(blob) || n >= 2;
    const hasParse = /\[EXTRACT\]|EXTRACT-OFFERS|MIMO/.test(blob);
    statusLabel = "ao vivo";
    statusColor = "var(--ds-color-harbor)";
    if (hasParse) {
      kinds = ["done", "done", "now", "wait", "wait"];
      caption = "parse em andamento";
      foots = [`ok · ${t}`, flyers > 0 ? `${flyers}/${flyers} · ${t}` : `ok · ${t}`, "agora", "fila", offers != null ? `${offers} salvas` : `${n} steps`];
    } else if (hasBaixa) {
      kinds = ["done", "now", "wait", "wait", "wait"];
      caption = "baixa em andamento";
      foots = [`ok · ${t}`, "agora", "fila", "fila", flyers > 0 ? `${flyers} flyers` : `${n} steps`];
    } else {
      kinds = ["now", "wait", "wait", "wait", "wait"];
      caption = "fonte em andamento";
      foots = ["agora", "fila", "fila", "fila", `${n} steps`];
    }
  }

  return {
    caption,
    statusLabel,
    statusColor,
    items: labels.map((label, i) => ({ label, foot: foots[i]!, kind: kinds[i]! })),
  };
}

export function runStatusLabel(run: PipelineRun) {
  const status = (run.status ?? "").toUpperCase();
  if (status === "CANCELLED" || run.error === "cancelled") return "parado";
  if (status === "DUPLICATE" || run.error === "duplicate") return "duplicata";
  if (status === "SUCCESS") return "ok";
  if (status === "RUNNING") return "rodando";
  if (status === "PARTIAL") return "parcial";
  return "falha";
}

export function fmtElapsed(durationMs: number) {
  if (durationMs <= 0) return "00:00";
  const s = Math.floor(durationMs / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function eventLine(type: string, payload: unknown) {
  if (type === "worker.log" && payload && typeof payload === "object" && "line" in payload) {
    return String((payload as { line: unknown }).line);
  }
  return `${type} ${typeof payload === "string" ? payload : JSON.stringify(payload ?? {})}`;
}

export type ExtractionQueue = "fila" | "review" | "blocked" | "done";

export function extractionQueue(status: string): ExtractionQueue {
  const value = status.toUpperCase();
  if (value === "FAILED") return "blocked";
  if (value === "PARTIAL" || value === "DUPLICATE") return "review";
  if (value === "SUCCESS" || value === "CANCELLED") return "done";
  return "fila";
}

export function flyersForRun(
  flyers: Awaited<ReturnType<typeof adminApi.flyers>>,
  supermarketId: string | undefined,
  startedAt: string,
  finishedAt: string | null,
) {
  if (!supermarketId) return [];
  const from = ms(startedAt) ?? 0;
  const to = (ms(finishedAt) ?? Date.now()) + 120_000;
  return flyers.filter((flyer) => {
    if (flyer.supermarket.id !== supermarketId) return false;
    const created = ms(flyer.createdAt) ?? 0;
    return created >= from && created <= to;
  });
}

export function isVigenteFlyer(
  flyer: { status: string; validFrom: string | null; validUntil: string | null },
  now = Date.now(),
) {
  const status = flyer.status.toUpperCase();
  if (status === "EXPIRED" || status === "FAILED") return false;
  const from = ms(flyer.validFrom);
  const until = ms(flyer.validUntil);
  if (from != null && from > now) return false;
  if (until != null && until < now) return false;
  return true;
}

export function isExpiringFlyer(
  flyer: { status: string; validFrom: string | null; validUntil: string | null },
  now = Date.now(),
) {
  if (!isVigenteFlyer(flyer, now)) return false;
  const until = ms(flyer.validUntil);
  return until != null && until < now + 2 * DAY_MS;
}

export function flyerDisplayStatus(status: string, validatedOfferCount = 0) {
  const value = status.toLowerCase();
  if (
    validatedOfferCount > 0 &&
    (value === "processed" || value === "partially_processed")
  ) {
    return "published";
  }
  return value;
}

export function isNoParseFlyer(status: string) {
  const value = status.toUpperCase();
  return (
    value === "FAILED" ||
    value === "DISCOVERED" ||
    value === "DOWNLOADING" ||
    value === "DOWNLOADED" ||
    value === "PROCESSING" ||
    value === "PARTIALLY_PROCESSED"
  );
}
