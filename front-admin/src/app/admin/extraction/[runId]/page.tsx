"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ApiError, adminApi } from "@/lib/api";
import { formatOpsStamp, isLiveScraperRun, jobLabel } from "@/lib/format";
import { eventLine, extractionQueue, flyerDisplayStatus, flyersForRun, ms } from "@/lib/workers";

type Run = Awaited<ReturnType<typeof adminApi.scraperRun>>;
type Flyer = Awaited<ReturnType<typeof adminApi.flyers>>[number];

export default function ExtractionReviewPage() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<Run | null>();
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      adminApi.scraperRun(runId),
      adminApi.scraperFlows(),
      adminApi.flyers(),
    ]).then(
      ([job, flows, allFlyers]) => {
        if (!alive) return;
        const flow = flows.find((item) => item.id === job.flow.id);
        setRun(job);
        setFlyers(
          flyersForRun(
            allFlyers,
            flow?.supermarket.id,
            job.startedAt,
            job.finishedAt,
          ),
        );
      },
      (cause: unknown) => {
        if (!alive) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setRun(null);
          setError("Run não encontrada.");
          return;
        }
        setRun(null);
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar o job.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, [runId]);

  const lines = useMemo(() => {
    if (!run) return [];
    if (run.events.length) return run.events.map((event) => eventLine(event.type, event.payload));
    if (run.log?.trim()) return run.log.split("\n").filter(Boolean);
    return [];
  }, [run]);

  if (error) {
    return <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>;
  }
  if (!run) {
    return <p className="ds-meta">Carregando…</p>;
  }

  const store = run.flow.supermarket.name;
  const job = jobLabel(run.id);
  const startedAt = ms(run.startedAt) ?? 0;
  const live = isLiveScraperRun({ status: run.status, startedAt });
  const queue = extractionQueue(run.status);

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/extraction" className="hover:underline">
          Extração
        </Link>
        {" / "}
        Revisão
      </p>

      <header className="flex flex-wrap items-start justify-between gap-4 pb-3">
        <div>
          <h1 className="text-[28px] font-bold leading-8 tracking-[-0.04em]">
            Revisão
          </h1>
          <p className="mt-1 text-sm text-[var(--ds-color-muted-foreground)]">
            {run.flyersFound} SKUs
            {flyers.length ? ` · ${flyers.length} encartes` : ""}
            {" · "}
            {store}
            {" · "}
            {formatOpsStamp(startedAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 pt-1">
          <span className="inline-flex items-center gap-2 text-[13px] text-[var(--ds-color-muted-foreground)]">
            <span
              className="ds-dot"
              style={{ background: "var(--ds-color-success)" }}
            />
            {job} · {store}
          </span>
          <StatusBadge status={queue === "done" ? run.status.toLowerCase() : queue} />
          {live ? (
            <Link
              href={`/admin/scraper/${run.flow.id}/run?job=${run.id}`}
              className="ds-btn ds-btn--primary"
            >
              Ver stdout
            </Link>
          ) : (
            <>
              <Link
                href={`/admin/validation?run=${run.id}`}
                className="ds-btn ds-btn--primary"
              >
                Validar ofertas
              </Link>
              <Link
                href={`/admin/scraper/${run.flow.id}`}
                className="ds-btn ds-btn--outline"
              >
                Worker
              </Link>
            </>
          )}
        </div>
      </header>

      {run.error ? (
        <p className="mb-4 text-sm text-[var(--ds-color-danger)]">{run.error}</p>
      ) : null}

      {run.log?.trim() ? (
        <details className="mb-4 rounded-[10px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)]">
          <summary className="cursor-pointer px-3.5 py-2.5 text-[13px] font-medium">
            Log do job · {job}
            {run.stepsExecuted ? ` · ${run.stepsExecuted} steps` : ""}
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-[var(--ds-color-border)] bg-[#1A2B3C] px-3.5 py-3 font-mono text-[11px] leading-5 text-[#C5D4C8]">
            {run.log}
          </pre>
        </details>
      ) : live ? (
        <p className="mb-4 text-[13px] text-[var(--ds-color-muted-foreground)]">
          Job ainda rodando —{" "}
          <Link
            href={`/admin/scraper/${run.flow.id}/run?job=${run.id}`}
            className="text-[var(--ds-color-harbor)] hover:underline"
          >
            ver stdout ao vivo
          </Link>
        </p>
      ) : null}

      <section className="ds-table-card mb-4">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Encartes do job</h2>
        </div>
        {flyers.length ? (
          flyers.map((flyer) => (
            <Link
              key={flyer.id}
              href={`/admin/flyers/${flyer.id}`}
              className="ds-table-row"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {flyer.title ?? flyer.source.url}
              </span>
              <span className="w-[120px] shrink-0">
                <StatusBadge status={flyerDisplayStatus(flyer.status, flyer.validatedOfferCount)} />
              </span>
            </Link>
          ))
        ) : (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhum encarte neste intervalo. A revisão de SKU volta quando o job
            passar a expor ofertas por run.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-[10px] bg-[#1A2B3C]">
        <div className="flex h-10 items-center border-b border-[#334D5E] px-3.5">
          <p className="font-mono text-[12px] text-[#7BA8C4]">eventos</p>
        </div>
        <div className="max-h-[360px] overflow-y-auto px-3.5 py-3">
          {(lines.length ? lines : ["nenhum evento registrado"]).map((line, i) => (
            <p
              key={`${i}-${line.slice(0, 48)}`}
              className="font-mono text-xs leading-5 text-[#C5D4C8]"
            >
              {line}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
