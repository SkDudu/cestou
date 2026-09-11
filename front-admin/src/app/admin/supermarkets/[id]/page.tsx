"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { OpsHeader, OpsKpi } from "@/components/admin/ops";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ApiError, adminApi } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { composeFleet, flyerDisplayStatus, ms } from "@/lib/workers";

const NETWORK_TYPE_LABEL: Record<string, string> = {
  supermarket: "Supermercado",
  wholesale: "Atacarejo",
  distributor: "Distribuidora",
};

type Market = Awaited<ReturnType<typeof adminApi.supermarket>>;
type Flyer = Awaited<ReturnType<typeof adminApi.flyers>>[number];
type FleetWorker = ReturnType<typeof composeFleet>["workers"][number];

export default function SupermarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [market, setMarket] = useState<Market | null>();
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [workers, setWorkers] = useState<FleetWorker[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    void Promise.all([
      adminApi.supermarket(id),
      adminApi.flyers(),
      adminApi.scraperFlows(),
      adminApi.scraperRuns(),
    ]).then(
      ([row, flyerRows, flows, runs]) => {
        if (!alive) return;
        setMarket(row);
        setFlyers(flyerRows.filter((f) => f.supermarket.id === id));
        setWorkers(composeFleet(flows, runs).workers.filter((w) => w.supermarketId === id));
      },
      (cause: unknown) => {
        if (!alive) return;
        setMarket(null);
        setError(
          cause instanceof ApiError && cause.status === 404
            ? "Não encontrado"
            : cause instanceof ApiError && cause.status === 401
              ? "Sua sessão expirou."
              : "Não foi possível carregar a rede.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  const recentFlyers = useMemo(() => {
    return [...flyers]
      .sort((a, b) => (ms(b.createdAt) ?? 0) - (ms(a.createdAt) ?? 0))
      .slice(0, 12);
  }, [flyers]);

  const flowName = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of market?.scraperFlows ?? []) map.set(f.id, f.name);
    return map;
  }, [market?.scraperFlows]);

  if (error) {
    return <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>;
  }
  if (!market) {
    return <p className="ds-meta">Carregando…</p>;
  }

  const stores = market.stores;
  const sources = market.flyerSources;
  const failWorkers = workers.filter((w) => w.status === "fail").length;
  const typeKey = market.networkType?.toLowerCase() ?? "";
  const host = market.websiteUrl?.replace(/^https?:\/\//, "") ?? "";

  return (
    <div>
      <OpsHeader
        crumb={
          <>
            <Link href="/admin/supermarkets">Lojas</Link>
            <span className="ds-crumb-sep">/</span>
            <span className="ds-crumb-current">{market.name}</span>
          </>
        }
        title={
          <span className="flex items-center gap-3">
            {market.name}
            {market.networkType ? (
              <span className="rounded-full bg-[var(--ds-color-surface)] px-2 py-0.5 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
                {NETWORK_TYPE_LABEL[typeKey] ?? market.networkType}
              </span>
            ) : null}
          </span>
        }
        subtitle={`rede · ${market.city}, ${market.state} · ${market.slug}${host ? ` · ${host}` : ""}`}
        primary={
          <>
            <Link
              href={`/admin/extraction?supermarketId=${id}`}
              className="ds-btn ds-btn--outline"
            >
              Abrir extração
            </Link>
            <Link href={`/admin/flyers?supermarketId=${id}`} className="ds-btn ds-btn--outline">
              Novo encarte
            </Link>
            {workers.length ? (
              <Link href={`/admin/scraper/${workers[0]!.id}/run`} className="ds-btn ds-btn--primary">
                Rodar worker
              </Link>
            ) : (
              <Link
                href={`/admin/scraper/new?supermarketId=${id}`}
                className="ds-btn ds-btn--primary"
              >
                Novo worker
              </Link>
            )}
          </>
        }
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Filiais"
          value={stores.length}
          foot={`${stores.filter((s) => s.active).length} ativas`}
        />
        <OpsKpi
          label="Fontes"
          value={sources.filter((s) => s.active).length}
          foot={`${sources.length} cadastradas`}
        />
        <OpsKpi
          label="Workers"
          value={workers.length}
          danger={failWorkers > 0}
          foot={failWorkers ? `${failWorkers} em falha` : "scrapers"}
        />
        <OpsKpi
          label="Encartes"
          value={formatNumber(market._count.flyers)}
          foot="ciclos desta rede"
        />
      </section>

      <section className="ds-table-card mb-4">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Filiais</h2>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-1">Nome</span>
          <span className="ds-label-caps w-[160px] shrink-0">Bairro</span>
          <span className="ds-label-caps w-[80px] shrink-0">Status</span>
        </div>
        {stores.map((s) => (
          <div key={s.id} className="ds-table-row">
            <span className="min-w-0 flex-1 truncate">
              {s.name}
              {s.externalId ? (
                <span className="ml-2 font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                  #{s.externalId}
                </span>
              ) : null}
            </span>
            <span className="w-[160px] shrink-0 truncate text-[var(--ds-color-muted-foreground)]">
              {s.neighborhood ?? "—"} · {s.city}
            </span>
            <span className="w-[80px] shrink-0">
              <StatusBadge status={s.active ? "active" : "inactive"} />
            </span>
          </div>
        ))}
        {!stores.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma filial — cadastre mesmo sem fonte
          </p>
        ) : null}
      </section>

      <section className="ds-table-card mb-4">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Fontes de ofertas</h2>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-1">Fonte</span>
          <span className="ds-label-caps w-[80px] shrink-0">Tipo</span>
          <span className="ds-label-caps w-[120px] shrink-0">Escopo</span>
          <span className="ds-label-caps w-[120px] shrink-0">Worker</span>
          <span className="ds-label-caps w-[100px] shrink-0">Status</span>
        </div>
        {sources.map((s) => (
          <div key={s.id} className="ds-table-row">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{s.name ?? "Sem nome"}</span>
              <span className="ml-2 font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                {s.url.replace(/^https?:\/\//, "")}
              </span>
            </span>
            <span className="w-[80px] shrink-0 font-mono text-xs">{s.type.toLowerCase()}</span>
            <span className="w-[120px] shrink-0 truncate text-[13px] text-[var(--ds-color-muted-foreground)]">
              {(s.scope ?? "").toUpperCase() === "STORE" ? "filiais" : "toda a rede"}
            </span>
            <span className="w-[120px] shrink-0 truncate text-[13px]">
              {s.flowId ? (
                <Link href={`/admin/scraper/${s.flowId}`} className="text-[var(--ds-color-harbor)]">
                  {flowName.get(s.flowId) ?? "worker"}
                </Link>
              ) : (
                <span className="text-[var(--ds-color-muted-foreground)]">—</span>
              )}
            </span>
            <span className="w-[100px] shrink-0">
              <StatusBadge
                status={(s.operationalStatus ?? (s.active ? "active" : "inactive")).toLowerCase()}
              />
            </span>
          </div>
        ))}
        {!sources.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma fonte configurada
          </p>
        ) : null}
      </section>

      {workers.length ? (
        <section className="ds-table-card mb-4">
          <div className="ds-table-head">
            <h2 className="text-[15px] font-semibold">Workers</h2>
            <Link href="/admin/scraper" className="text-[13px] font-medium text-[var(--ds-color-harbor)]">
              Ver todos
            </Link>
          </div>
          {workers.map((w) => (
            <Link key={w.id} href={`/admin/scraper/${w.id}`} className="ds-table-row">
              <span className="flex min-w-0 flex-1 items-center gap-2 font-mono text-sm">
                <span
                  className="ds-dot"
                  style={{
                    background:
                      w.status === "fail"
                        ? "var(--ds-color-danger)"
                        : w.status === "running"
                          ? "var(--ds-color-success)"
                          : "var(--ds-color-harbor)",
                  }}
                />
                {w.slug}
              </span>
              <span className="w-[96px] shrink-0">
                <StatusBadge status={w.status === "fail" ? "failed" : w.status} />
              </span>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Encartes recentes</h2>
          <Link href="/admin/flyers" className="text-[13px] font-medium text-[var(--ds-color-harbor)]">
            Ver todos
          </Link>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-1">Título</span>
          <span className="ds-label-caps w-[120px] shrink-0">Status</span>
          <span className="ds-label-caps w-[220px] shrink-0">Validade</span>
        </div>
        {recentFlyers.map((f) => (
          <Link key={f.id} href={`/admin/flyers/${f.id}`} className="ds-table-row">
            <span className="min-w-0 flex-1 truncate">{f.title ?? f.id}</span>
            <span className="w-[120px] shrink-0">
              <StatusBadge status={flyerDisplayStatus(f.status, f.validatedOfferCount)} />
            </span>
            <span className="w-[220px] shrink-0 text-[var(--ds-color-muted-foreground)]">
              {formatDateTime(ms(f.validFrom))} → {formatDateTime(ms(f.validUntil))}
            </span>
          </Link>
        ))}
        {!recentFlyers.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Sem encartes
          </p>
        ) : null}
      </section>
    </div>
  );
}
