"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { ApiError, adminApi } from "@/lib/api";
import { formatOpsStamp, jobLabel } from "@/lib/format";
import { extractionQueue } from "@/lib/workers";

type Run = Awaited<ReturnType<typeof adminApi.scraperRuns>>[number];
type Health = Awaited<ReturnType<typeof adminApi.catalogHealth>>;
type FlyerError = Awaited<ReturnType<typeof adminApi.extractionErrors>>[number];

type Row = Run & { queue: ReturnType<typeof extractionQueue> };

export default function ExtractionPage() {
  const [runs, setRuns] = useState<Row[]>();
  const [health, setHealth] = useState<Health>();
  const [errors, setErrors] = useState<FlyerError[]>([]);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void Promise.all([
        adminApi.scraperRuns(),
        adminApi.catalogHealth(),
        adminApi.extractionErrors(),
      ]).then(
        ([list, catalog, flyerErrors]) => {
          if (!alive) return;
          setRuns(list.map((run) => ({ ...run, queue: extractionQueue(run.status) })));
          setHealth(catalog);
          setErrors(flyerErrors.filter((item) => item.status === "open"));
        },
        (cause: unknown) => {
          if (!alive) return;
          setError(
            cause instanceof ApiError && cause.status === 401
              ? "Sua sessão expirou."
              : "Não foi possível carregar a extração.",
          );
        },
      );
    load();
    return () => {
      alive = false;
    };
  }, []);

  const hasRunning = useMemo(
    () => (runs ?? []).some((r) => (r.status ?? "").toUpperCase() === "RUNNING"),
    [runs],
  );

  useEffect(() => {
    if (!hasRunning) return;
    let alive = true;
    const id = setInterval(() => {
      void adminApi.scraperRuns().then(
        (list) => {
          if (!alive) return;
          setRuns(list.map((run) => ({ ...run, queue: extractionQueue(run.status) })));
        },
        () => undefined,
      );
    }, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [hasRunning]);

  const rows = useMemo(() => {
    const list = runs ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter((r) => {
      if (tab === "fila" && r.queue !== "fila") return false;
      if (tab === "review" && r.queue !== "review") return false;
      if (tab === "blocked" && r.queue !== "blocked") return false;
      if (!needle) return true;
      return (
        jobLabel(r.id).includes(needle) ||
        r.flow.supermarket.name.toLowerCase().includes(needle) ||
        r.flow.name.toLowerCase().includes(needle) ||
        r.status.toLowerCase().includes(needle)
      );
    });
  }, [runs, tab, q]);

  const [page, setPage] = useTablePage(`${tab}|${q}`);
  const pageRows = slicePage(rows, page);

  const fila = (runs ?? []).filter((r) => r.queue === "fila");
  const review = (runs ?? []).filter((r) => r.queue === "review");
  const blocked = (runs ?? []).filter((r) => r.queue === "blocked");
  const pendingSkus = health?.pendingValidation ?? 0;

  return (
    <div>
      <OpsHeader
        title="Extração"
        stamp={`Atualizado ${formatOpsStamp(Date.now())}`}
        filterTarget={() => searchRef.current?.focus()}
      />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ds-color-danger)]">
          {error}
        </p>
      ) : null}

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Na fila"
          value={fila.length}
          foot={
            pendingSkus > 0
              ? `${pendingSkus} ofertas pendentes`
              : "jobs com ofertas pendentes"
          }
        />
        <OpsKpi
          label="Bloqueados"
          value={blocked.length}
          danger={blocked.length > 0 || errors.length > 0}
          foot={
            errors.length > 0
              ? `${errors.length} erros abertos`
              : (blocked[0]?.flow.supermarket.name ?? "nenhum bloqueio")
          }
        />
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "Todos", count: runs?.length ?? 0 },
          { id: "fila", label: "Fila", count: fila.length },
          { id: "review", label: "Revisão", count: review.length },
          {
            id: "blocked",
            label: "Bloqueado",
            count: blocked.length,
            warn: true,
          },
        ]}
      />

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Fila</h2>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar job"
            className="ds-search"
          />
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-1">Job</span>
          <span className="ds-label-caps w-[200px] shrink-0">Loja</span>
          <span className="ds-label-caps w-[88px] shrink-0">SKUs</span>
          <span className="ds-label-caps w-[72px] shrink-0">Pend.</span>
          <span className="ds-label-caps w-[96px] shrink-0">Status</span>
        </div>
        {pageRows.map((r) => (
          <Link
            key={r.id}
            href={`/admin/extraction/${r.id}`}
            className="ds-table-row"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2 font-mono text-xs">
              <span
                className="ds-dot"
                style={{
                  background:
                    r.queue === "blocked"
                      ? statusDot("fail")
                      : r.queue === "review"
                        ? statusDot("review")
                        : r.queue === "fila"
                          ? statusDot("queue")
                          : statusDot("ok"),
                }}
              />
              {jobLabel(r.id)}
            </span>
            <span className="w-[200px] shrink-0 truncate">
              {r.flow.supermarket.name}
            </span>
            <span className="w-[88px] shrink-0 font-mono text-xs">
              {r.flyersFound}
            </span>
            <span className="w-[72px] shrink-0 font-mono text-xs">—</span>
            <span className="w-[96px] shrink-0">
              <StatusBadge status={r.queue === "done" ? r.status.toLowerCase() : r.queue} />
            </span>
          </Link>
        ))}
        {!rows.length && runs !== undefined ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum job nesta fila.
          </p>
        ) : null}
        <TablePagination
          page={page}
          total={rows.length}
          onPageChange={setPage}
        />
        {runs === undefined && !error ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Carregando…
          </p>
        ) : null}
      </section>

      {errors.length > 0 ? (
        <section className="ds-table-card mt-4">
          <div className="ds-table-head">
            <h2 className="text-[15px] font-semibold">Erros abertos</h2>
          </div>
          <div className="ds-table-cols">
            <span className="ds-label-caps min-w-0 flex-1">Estágio</span>
            <span className="ds-label-caps w-[200px] shrink-0">Loja</span>
            <span className="ds-label-caps min-w-0 flex-[1.4]">Mensagem</span>
            <span className="ds-label-caps w-[96px] shrink-0">Status</span>
          </div>
          {errors.map((item) => (
            <Link
              key={item.id}
              href={`/admin/extraction/errors/${item.id}`}
              className="ds-table-row"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
                <span className="ds-dot" style={{ background: statusDot("fail") }} />
                {item.stage}
              </span>
              <span className="w-[200px] shrink-0 truncate">{item.supermarket.name}</span>
              <span className="min-w-0 flex-[1.4] truncate text-[13px] text-[var(--ds-color-muted-foreground)]">
                {item.message}
              </span>
              <span className="w-[96px] shrink-0">
                <StatusBadge status={item.status} />
              </span>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
