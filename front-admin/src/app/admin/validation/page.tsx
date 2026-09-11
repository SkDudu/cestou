"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { OpsHeader } from "@/components/admin/ops";
import { ApiError, loadOfferPages, adminApi, type OfferListItem } from "@/lib/api";
import { offerCondition } from "@/lib/eligibility";
import { formatCurrency, formatPack } from "@/lib/format";
import { flyersForRun } from "@/lib/workers";

function money(value: string | number | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export default function ValidationPage() {
  return (
    <Suspense fallback={<p className="ds-meta">Carregando…</p>}>
      <ValidationInner />
    </Suspense>
  );
}

function ValidationInner() {
  const search = useSearchParams();
  const runId = search.get("run") ?? "";
  const [items, setItems] = useState<OfferListItem[]>();
  const [error, setError] = useState<string>();
  const [busyFlyer, setBusyFlyer] = useState<string>();

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const pending = await loadOfferPages("PENDING");
        if (!runId) {
          if (alive) setItems(pending);
          return;
        }
        const [job, flows, flyers] = await Promise.all([
          adminApi.scraperRun(runId),
          adminApi.scraperFlows(),
          adminApi.flyers(),
        ]);
        const flow = flows.find((item) => item.id === job.flow.id);
        const inRun = new Set(
          flyersForRun(flyers, flow?.supermarket.id, job.startedAt, job.finishedAt).map((f) => f.id),
        );
        if (alive) setItems(pending.filter((o) => o.flyer?.id && inRun.has(o.flyer.id)));
      } catch (cause: unknown) {
        if (!alive) return;
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar a fila.",
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [runId]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { flyerId: string; title: string; supermarket: string; offers: OfferListItem[] }
    >();
    for (const o of items ?? []) {
      const flyerId = o.flyer?.id ?? "none";
      const row = map.get(flyerId) ?? {
        flyerId,
        title: o.flyer?.title ?? "Encarte",
        supermarket: o.supermarket.name,
        offers: [],
      };
      row.offers.push(o);
      map.set(flyerId, row);
    }
    return [...map.values()].map((g) => ({
      ...g,
      offers: g.offers.slice().sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0) || a.name.localeCompare(b.name)),
    }));
  }, [items]);

  async function validateFlyer(flyerId: string) {
    if (flyerId === "none") return;
    setBusyFlyer(flyerId);
    try {
      await adminApi.bulkValidateFlyer(flyerId, "VALIDATED");
      setItems((current) => current?.filter((o) => o.flyer?.id !== flyerId));
    } finally {
      setBusyFlyer(undefined);
    }
  }

  return (
    <div>
      <OpsHeader
        title="Validação"
        subtitle={
          runId
            ? "Ofertas extraídas neste job — Validar tudo por encarte"
            : "Fila dos workers — volte quando quiser continuar"
        }
      />
      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ds-color-danger)]">
          {error}
        </p>
      ) : null}

      {groups.map((g) => (
        <section key={g.flyerId} className="ds-table-card mb-4">
          <div className="ds-table-head">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold">{g.title}</h2>
              <p className="ds-meta">
                {g.supermarket} · {g.offers.length === 1 ? "1 pendente" : `${g.offers.length} pendentes`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {g.flyerId !== "none" ? (
                <Link href={`/admin/flyers/${g.flyerId}`} className="ds-btn ds-btn--ghost">
                  Encarte
                </Link>
              ) : null}
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                disabled={busyFlyer === g.flyerId || g.flyerId === "none"}
                onClick={() => void validateFlyer(g.flyerId)}
              >
                {busyFlyer === g.flyerId ? "Validando…" : "Validar tudo"}
              </button>
            </div>
          </div>
          <div className="ds-table-cols">
            <span className="ds-label-caps min-w-0 flex-[2]">Produto</span>
            <span className="ds-label-caps w-[88px] shrink-0">Preço</span>
            <span className="ds-label-caps w-[72px] shrink-0">Pág</span>
            <span className="ds-label-caps w-[140px] shrink-0">Condição</span>
          </div>
          {g.offers.map((o) => {
            const condition = offerCondition(o);
            const pack = formatPack(o.quantity, o.unit);
            return (
              <Link key={o.id} href={`/admin/offers/${o.id}`} className="ds-table-row">
                <span className="min-w-0 flex-[2] truncate font-medium">
                  {o.name}
                  {pack ? (
                    <span className="ml-1 font-normal text-[var(--ds-color-muted-foreground)]">
                      · {pack}
                    </span>
                  ) : null}
                </span>
                <span className="w-[88px] shrink-0 font-mono">{formatCurrency(money(o.price) ?? 0)}</span>
                <span className="w-[72px] shrink-0 font-mono">{o.pageNumber ?? "—"}</span>
                <span className="w-[140px] shrink-0 truncate text-[13px] text-[var(--ds-color-muted-foreground)]">
                  {condition.kind === "none" ? "Todos" : condition.text}
                </span>
              </Link>
            );
          })}
        </section>
      ))}

      {items !== undefined && groups.length === 0 ? (
        <p className="ds-meta">Fila vazia — nada pendente dos workers.</p>
      ) : null}
      {items === undefined && !error ? <p className="ds-meta">Carregando…</p> : null}
    </div>
  );
}
