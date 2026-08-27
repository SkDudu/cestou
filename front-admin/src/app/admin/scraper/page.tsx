"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { OpsStatusPill } from "@/components/admin/OpsStatusPill";
import { WorkerStartButton } from "@/components/admin/WorkerStartButton";
import { checkWorkerHealth } from "@/lib/browser-session";
import { formatOpsStamp, formatPercent } from "@/lib/format";

export default function ScraperFlowsPage() {
  return (
    <Suspense fallback={<p className="ds-meta">Carregando…</p>}>
      <WorkersPage />
    </Suspense>
  );
}

function WorkersPage() {
  const searchParams = useSearchParams();
  const presetSupermarketId = searchParams.get("supermarketId") ?? "";
  const overview = useQuery(api.dashboard.overview);
  const markets = useQuery(api.supermarkets.listNames);
  const create = useMutation(api.scraperFlows.create);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(Boolean(presetSupermarketId));
  const [error, setError] = useState<string | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (presetSupermarketId) setOpen(true);
  }, [presetSupermarketId]);

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

  const workers = overview?.workers ?? [];
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
      if (!needle) return true;
      return (
        w.slug.includes(needle) ||
        w.supermarketName.toLowerCase().includes(needle)
      );
    });
  }, [workers, tab, q]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const id = await create({
        supermarketId: String(fd.get("supermarketId")) as Id<"supermarkets">,
        name: String(fd.get("name") ?? ""),
      });
      window.location.href = `/admin/scraper/${id}`;
    } catch (err) {
      setError(String(err));
    }
  }

  if (overview === undefined) return <p className="ds-meta">Carregando…</p>;

  const failHint = fail[0];

  return (
    <div>
      <OpsHeader
        title="Workers"
        stamp={`Atualizado ${formatOpsStamp(Date.now())}`}
        filterTarget={() => searchRef.current?.focus()}
        primary={
          <>
            <span
              className="text-[13px]"
              style={{
                color: workerOnline
                  ? "var(--ds-color-success)"
                  : "var(--ds-color-danger)",
              }}
            >
              {workerOnline === null
                ? "…"
                : workerOnline
                  ? "Worker online"
                  : "Worker offline"}
            </span>
            <WorkerStartButton
              online={workerOnline}
              onStarted={() => setWorkerOnline(true)}
              onStopped={() => setWorkerOnline(false)}
            />
            <button
              type="button"
              className="ds-btn ds-btn--primary"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Fechar" : "Novo worker"}
            </button>
          </>
        }
      />

      {open ? (
        <form onSubmit={onSubmit} className="ds-form ds-form-2">
          <select
            name="supermarketId"
            required
            className="ds-input"
            defaultValue={presetSupermarketId}
          >
            <option value="">Loja</option>
            {(markets ?? []).map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>
          <input name="name" required placeholder="Nome do worker" className="ds-input" />
          {error ? (
            <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>
          ) : null}
          <button type="submit" className="ds-btn ds-btn--primary ds-btn--lg">
            Criar
          </button>
        </form>
      ) : null}

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Workers ativos"
          value={overview.workersActive}
          hint={
            overview.workersDelta > 0 ? (
              <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-success)]">
                rodaram hoje
              </p>
            ) : undefined
          }
          foot={`${overview.extractingNow} em extração agora`}
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
            ref={searchRef}
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
        {rows.map((w) => (
          <Link key={w._id} href={`/admin/scraper/${w._id}`} className="ds-table-row">
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
      </section>
    </div>
  );
}
