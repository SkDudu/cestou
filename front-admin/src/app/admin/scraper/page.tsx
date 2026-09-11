"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { OpsStatusPill } from "@/components/admin/OpsStatusPill";
import { WorkerStartButton } from "@/components/admin/WorkerStartButton";
import {
  WorkerFilterPopover,
  countWorkerFilter,
  emptyWorkerFilter,
  matchWorkerFilter,
} from "@/components/admin/WorkerFilterModal";
import { WorkerHeatmapChart } from "@/components/admin/WorkerHeatmapChart";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { ApiError, adminApi } from "@/lib/api";
import { checkWorkerHealth } from "@/lib/browser-session";
import { formatOpsStamp, formatPercent } from "@/lib/format";
import { composeFleet } from "@/lib/workers";

export default function ScraperFlowsPage() {
  return (
    <Suspense fallback={<p className="ds-meta">Carregando…</p>}>
      <WorkersPage />
    </Suspense>
  );
}

function WorkersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetSupermarketId = searchParams.get("supermarketId") ?? "";
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState(emptyWorkerFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string>();
  const [fleet, setFleet] = useState<ReturnType<typeof composeFleet>>();
  const [markets, setMarkets] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (presetSupermarketId) {
      router.replace(`/admin/scraper/new?supermarketId=${presetSupermarketId}`);
    }
  }, [presetSupermarketId, router]);

  useEffect(() => {
    let alive = true;
    void Promise.all([adminApi.scraperFlows(), adminApi.scraperRuns(), adminApi.supermarkets()]).then(
      ([flows, runs, stores]) => {
        if (!alive) return;
        setFleet(composeFleet(flows, runs));
        setMarkets(stores.map((store) => ({ id: store.id, name: store.name })));
      },
      (cause: unknown) => {
        if (!alive) return;
        setError(cause instanceof ApiError && cause.status === 401 ? "Sua sessão expirou." : "Não foi possível carregar os workers.");
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const ok = await checkWorkerHealth();
      if (alive) setWorkerOnline(ok);
    };
    void tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const workers = fleet?.workers ?? [];
  const fail = workers.filter((w) => w.status === "fail");
  const counts = {
    all: workers.length,
    running: workers.filter((w) => w.status === "running").length,
    queue: workers.filter((w) => w.status === "queue").length,
    fail: fail.length,
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return workers.filter((w) => {
      if (tab !== "all" && w.status !== tab) return false;
      if (!matchWorkerFilter(w, filters)) return false;
      if (!needle) return true;
      return w.slug.includes(needle) || w.supermarketName.toLowerCase().includes(needle);
    });
  }, [workers, tab, q, filters]);

  const filterCount = countWorkerFilter(filters);
  const [page, setPage] = useTablePage(`${tab}|${q}|${filterCount}`);
  const pageRows = slicePage(rows, page);

  if (error) return <p role="alert" className="ds-meta text-[var(--ds-color-danger)]">{error}</p>;
  if (!fleet) return <p className="ds-meta">Carregando…</p>;

  const failHint = fail[0];

  return (
    <div>
      <OpsHeader
        title="Workers"
        stamp={`Atualizado ${formatOpsStamp(Date.now())}`}
        filter={
          <WorkerFilterPopover
            open={filterOpen}
            workers={workers}
            markets={markets}
            value={filters}
            filterCount={filterCount}
            onOpenChange={setFilterOpen}
            onApply={(next) => {
              setFilters(next);
              setFilterOpen(false);
            }}
          />
        }
        primary={
          <>
            <span
              className="text-[13px]"
              style={{ color: workerOnline ? "var(--ds-color-success)" : "var(--ds-color-danger)" }}
            >
              {workerOnline === null ? "…" : workerOnline ? "Worker online" : "Worker offline"}
            </span>
            <WorkerStartButton
              online={workerOnline}
              onStarted={() => setWorkerOnline(true)}
              onStopped={() => setWorkerOnline(false)}
            />
            <Link href="/admin/scraper/new" className="ds-btn ds-btn--primary">
              Novo worker
            </Link>
          </>
        }
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Workers ativos"
          value={fleet.workersActive}
          hint={
            fleet.workersDelta > 0 ? (
              <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-success)]">
                rodaram hoje
              </p>
            ) : undefined
          }
          foot={`${fleet.extractingNow} em extração agora`}
        />
        <OpsKpi
          label="Falhas"
          value={fail.length}
          danger={fail.length > 0}
          hint={
            failHint ? (
              <p className="pb-1 font-mono text-[13px] text-[var(--ds-color-muted-foreground)]">
                {failHint.slug}
              </p>
            ) : undefined
          }
          foot={failHint ? failHint.supermarketName : "Nenhuma falha na frota"}
        />
      </section>

      <section className="pb-4">
        <WorkerHeatmapChart data={fleet.heatmap} />
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "Todos", count: counts.all },
          { id: "running", label: "Rodando", count: counts.running },
          { id: "queue", label: "Fila", count: counts.queue },
          { id: "fail", label: "Falha", count: counts.fail, warn: true },
        ]}
      />

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Frota</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar worker"
            className="ds-search"
          />
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-[3.1]">Id</span>
          <span className="ds-label-caps w-[200px] shrink-0">Loja</span>
          <span className="ds-label-caps w-[88px] shrink-0">Jobs 24h</span>
          <span className="ds-label-caps w-[72px] shrink-0">Parse</span>
          <span className="ds-label-caps w-[96px] shrink-0">Status</span>
        </div>
        {pageRows.map((w) => (
          <Link key={w.id} href={`/admin/scraper/${w.id}`} className="ds-table-row">
            <span className="flex min-w-0 flex-[3.1] items-center gap-2 font-mono text-sm">
              <span className="ds-dot" style={{ background: statusDot(w.status) }} />
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
        ))}
        {!rows.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum worker neste filtro.
          </p>
        ) : null}
        <TablePagination page={page} total={rows.length} onPageChange={setPage} />
      </section>
    </div>
  );
}
