"use client";

import { useEffect, useState } from "react";
import { ApiError, adminApi } from "./api";
import { formatRelative } from "./format";
import { DAY_MS, ms, opsStatus, workerSlug } from "./workers";

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const ATTENTION_LIMIT = 8;

type Severity = "fail" | "warn" | "info";
type OpsStatus = "running" | "ok" | "queue" | "review" | "duplicate" | "fail";

export type AttentionItem = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
};

export type HomeWorkerRow = {
  id: string;
  slug: string;
  supermarketName: string;
  currentFlyerTitle: string | null;
  lastRunAt: number | null;
  taxa: number | null;
  status: OpsStatus;
};

export type HomeDashboard = {
  flyersVigente: number;
  incomplete: number;
  processedFlyers: number;
  partialFlyers: number;
  offersPending: number;
  offersSuspicious: number;
  offersFoot: string;
  extractionErrors: number;
  flowsError: number;
  extractingNow: number;
  flowsActive: number;
  networksAtRisk: number;
  matchPct: number | null;
  attention: AttentionItem[];
  chart: { day: number; label: string; jobs: number; flyers: number }[];
  parseCounts: { parsed: number; review: number; failed: number };
  parseRate: number;
  workers: HomeWorkerRow[];
};

const severityRank: Record<Severity, number> = { fail: 0, warn: 1, info: 2 };
const statusRank: Record<OpsStatus, number> = {
  fail: 0,
  review: 1,
  duplicate: 2,
  running: 3,
  ok: 4,
  queue: 5,
};

export function useAdminOverview() {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.overview>>>();
  const [error, setError] = useState<ApiError>();

  useEffect(() => {
    let active = true;
    void adminApi.overview().then(
      (value) => active && setData(value),
      (cause: unknown) => active && setError(cause instanceof ApiError ? cause : new ApiError(500)),
    );
    return () => { active = false; };
  }, []);

  return { data, error, loading: !data && !error };
}

export function useAdminHome() {
  const [data, setData] = useState<HomeDashboard>();
  const [error, setError] = useState<ApiError>();

  useEffect(() => {
    let active = true;
    void Promise.all([
      adminApi.overview(),
      adminApi.scraperFlows(),
      adminApi.flyers(),
      adminApi.scraperRuns(),
      adminApi.catalogHealth(),
      adminApi.extractionErrors(),
    ]).then(
      (bundle) => active && setData(composeHome(...bundle)),
      (cause: unknown) => active && setError(cause instanceof ApiError ? cause : new ApiError(500)),
    );
    return () => { active = false; };
  }, []);

  return { data, error, loading: !data && !error };
}

function upper(value: string | null | undefined) {
  return (value ?? "").toUpperCase();
}

function isVigente(
  flyer: { status: string; validFrom: string | null; validUntil: string | null },
  now: number,
) {
  const status = upper(flyer.status);
  if (status === "EXPIRED" || status === "FAILED") return false;
  const from = ms(flyer.validFrom);
  const until = ms(flyer.validUntil);
  if (from != null && from > now) return false;
  if (until != null && until < now) return false;
  return true;
}

function composeHome(
  overview: Awaited<ReturnType<typeof adminApi.overview>>,
  flows: Awaited<ReturnType<typeof adminApi.scraperFlows>>,
  flyers: Awaited<ReturnType<typeof adminApi.flyers>>,
  runs: Awaited<ReturnType<typeof adminApi.scraperRuns>>,
  health: Awaited<ReturnType<typeof adminApi.catalogHealth>>,
  errors: Awaited<ReturnType<typeof adminApi.extractionErrors>>,
): HomeDashboard {
  const now = Date.now();
  const weekAgo = now - 7 * DAY_MS;
  const openErrors = errors.filter((item) => item.status === "open");
  const vigenteFlyers = flyers.filter((flyer) => isVigente(flyer, now));
  const pendingDownload = flyers.filter((flyer) => upper(flyer.status) === "DISCOVERED").length;
  const pendingExtract = flyers.filter((flyer) => {
    const status = upper(flyer.status);
    if (status !== "DOWNLOADED" && status !== "PARTIALLY_PROCESSED") return false;
    const from = ms(flyer.validFrom);
    return from == null || from <= now + DAY_MS;
  }).length;
  const processedFlyers = flyers.filter((flyer) => upper(flyer.status) === "PROCESSED").length;
  const partialFlyers = flyers.filter((flyer) => upper(flyer.status) === "PARTIALLY_PROCESSED").length;
  const flowsActive = flows.filter((flow) => upper(flow.status) !== "DISABLED").length;
  const flowsError = flows.filter((flow) => upper(flow.status) === "ERROR").length;

  const currentByMarket = new Map<string, (typeof flyers)[number]>();
  for (const flyer of vigenteFlyers) {
    const prev = currentByMarket.get(flyer.supermarket.id);
    const until = ms(flyer.validUntil) ?? 0;
    const prevUntil = prev ? ms(prev.validUntil) ?? 0 : -1;
    if (!prev || until > prevUntil) currentByMarket.set(flyer.supermarket.id, flyer);
  }

  const attention: AttentionItem[] = [];
  const atRisk = new Set<string>();

  for (const flow of flows) {
    const lastError = flow.latestRun?.error;
    const lastRunAt = ms(flow.lastRunAt) ?? ms(flow.latestRun?.startedAt);
    const current = currentByMarket.get(flow.supermarket.id);
    if (upper(flow.status) === "ERROR" || lastError) {
      atRisk.add(flow.supermarket.id);
      attention.push({
        id: `flow-error-${flow.id}`,
        severity: "fail",
        title: `Flow ${flow.supermarket.name}`,
        detail: lastError ?? "Flow com erro",
        href: `/admin/scraper/${flow.id}`,
      });
    } else if (upper(flow.status) === "ACTIVE" && (!lastRunAt || now - lastRunAt > STALE_MS)) {
      atRisk.add(flow.supermarket.id);
      attention.push({
        id: `flow-stale-${flow.id}`,
        severity: "warn",
        title: `Rede ${flow.supermarket.name}`,
        detail: lastRunAt ? `Último run ${formatRelative(lastRunAt)}` : "Nunca rodou",
        href: `/admin/supermarkets/${flow.supermarket.id}`,
      });
    } else if (upper(flow.status) === "ACTIVE" && !current) {
      atRisk.add(flow.supermarket.id);
      attention.push({
        id: `flow-novigente-${flow.id}`,
        severity: "warn",
        title: `Rede ${flow.supermarket.name}`,
        detail: "Sem encarte vigente",
        href: `/admin/supermarkets/${flow.supermarket.id}`,
      });
    }
  }

  if (openErrors.length > 0) {
    attention.push({
      id: "extraction-errors",
      severity: "fail",
      title: `${openErrors.length} erros de extração abertos`,
      detail: "Requer intervenção na fila de extração",
      href: "/admin/extraction",
    });
  }
  if (pendingExtract > 0) {
    attention.push({
      id: "pending-extract",
      severity: "warn",
      title: `${pendingExtract} encartes aguardando extração`,
      detail: "Downloaded / parcial sem processar",
      href: "/admin/flyers",
    });
  }
  if (pendingDownload > 0) {
    attention.push({
      id: "pending-download",
      severity: "warn",
      title: `${pendingDownload} encartes aguardando download`,
      detail: "Status discovered",
      href: "/admin/flyers",
    });
  }
  if (health.pendingValidation > 0) {
    attention.push({
      id: "offers-pending",
      severity: "warn",
      title: `${health.pendingValidation} ofertas pendentes de validação`,
      detail: health.suspicious > 0 ? `${health.suspicious} suspeitas` : "Menor confiança primeiro",
      href: "/admin/validation",
    });
  }

  const dayStart = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const chart: HomeDashboard["chart"] = [];
  for (let i = 6; i >= 0; i--) {
    const start = dayStart(now - i * DAY_MS);
    const end = start + DAY_MS;
    chart.push({
      day: start,
      label: String(new Date(start).getDate()),
      jobs: runs.filter((run) => {
        const started = ms(run.startedAt);
        return started != null && started >= start && started < end;
      }).length,
      flyers: flyers.filter((flyer) => {
        const created = ms(flyer.createdAt);
        return created != null && created >= start && created < end;
      }).length,
    });
  }

  const flyersWeek = flyers.filter((flyer) => (ms(flyer.createdAt) ?? 0) >= weekAgo);
  const parsed = flyersWeek.filter((flyer) => upper(flyer.status) === "PROCESSED").length;
  const review = flyersWeek.filter((flyer) => {
    const status = upper(flyer.status);
    return status === "PARTIALLY_PROCESSED" || status === "DOWNLOADED" || status === "PROCESSING";
  }).length;
  const failed = flyersWeek.filter((flyer) => upper(flyer.status) === "FAILED").length;
  const parseDenom = parsed + review + failed;

  const runsByFlow = new Map<string, typeof runs>();
  for (const run of runs) {
    const list = runsByFlow.get(run.flow.id) ?? [];
    list.push(run);
    runsByFlow.set(run.flow.id, list);
  }

  const workers: HomeWorkerRow[] = flows.map((flow) => {
    const flowRuns = (runsByFlow.get(flow.id) ?? []).slice().sort((a, b) => (ms(b.startedAt) ?? 0) - (ms(a.startedAt) ?? 0));
    const last = flowRuns[0] ?? flow.latestRun;
    const last24 = flowRuns.filter((run) => (ms(run.startedAt) ?? 0) >= now - DAY_MS);
    const ok = last24.filter((run) => {
      const status = upper(run.status);
      return status === "SUCCESS" || status === "DUPLICATE";
    }).length;
    return {
      id: flow.id,
      slug: workerSlug(flow.name),
      supermarketName: flow.supermarket.name,
      currentFlyerTitle: currentByMarket.get(flow.supermarket.id)?.title ?? null,
      lastRunAt: ms(flow.lastRunAt) ?? ms(last?.finishedAt) ?? ms(last?.startedAt),
      taxa: last24.length ? ok / last24.length : null,
      status: opsStatus(flow.status, last?.status, last24.length),
    };
  }).sort((a, b) => {
    const rank = statusRank[a.status] - statusRank[b.status];
    if (rank !== 0) return rank;
    return (a.lastRunAt ?? 0) - (b.lastRunAt ?? 0);
  });

  return {
    flyersVigente: vigenteFlyers.length,
    incomplete: pendingDownload + pendingExtract,
    processedFlyers,
    partialFlyers,
    offersPending: health.pendingValidation,
    offersSuspicious: health.suspicious,
    offersFoot: `${health.totalOffers} ofertas · ${health.pctWithBrand}% com marca`,
    extractionErrors: openErrors.length,
    flowsError,
    extractingNow: overview.runningRuns,
    flowsActive,
    networksAtRisk: atRisk.size,
    matchPct: health.pctWithCanonical,
    attention: attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]).slice(0, ATTENTION_LIMIT),
    chart,
    parseCounts: { parsed, review, failed },
    parseRate: parseDenom ? parsed / parseDenom : 0,
    workers,
  };
}
