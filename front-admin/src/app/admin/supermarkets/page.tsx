"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  TablePagination,
  slicePage,
  useTablePage,
} from "@/components/admin/TablePagination";
import { StoreCreateModal } from "@/components/admin/StoreCreateModal";
import { ApiError, adminApi } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { composeFleet, isVigenteFlyer } from "@/lib/workers";

const NETWORK_TYPE_LABEL: Record<string, string> = {
  supermarket: "Supermercado",
  wholesale: "Atacarejo",
  distributor: "Distribuidora",
};

type Network = Awaited<ReturnType<typeof adminApi.supermarkets>>[number];
type Detail = Awaited<ReturnType<typeof adminApi.supermarket>>;

type Row = Network & {
  stores: Detail["stores"];
  flyerCount: number;
  offerCount: number;
};

function networkLabel(type: string | null) {
  if (!type) return "rede";
  return NETWORK_TYPE_LABEL[type.toLowerCase()] ?? "rede";
}

export default function SupermarketsPage() {
  return (
    <Suspense fallback={<p className="ds-meta">Carregando…</p>}>
      <StoresPage />
    </Suspense>
  );
}

function StoresPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [networks, setNetworks] = useState<Row[]>();
  const [failIds, setFailIds] = useState<Set<string>>(new Set());
  const [workersByNetwork, setWorkersByNetwork] = useState<Map<string, number>>(new Map());
  const [vigenteCount, setVigenteCount] = useState(0);
  const [error, setError] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const preset = searchParams.get("q");
    if (preset) setQ(preset);
  }, [searchParams]);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      adminApi.supermarkets(),
      adminApi.flyers(),
      adminApi.scraperFlows(),
      adminApi.scraperRuns(),
    ]).then(
      async ([list, flyers, flows, runs]) => {
        // ponytail: N detail GETs for branch rows; fold stores into list if this grows
        const details = await Promise.all(list.map((n) => adminApi.supermarket(n.id)));
        if (!alive) return;
        const byId = new Map(details.map((d) => [d.id, d]));
        const fleet = composeFleet(flows, runs);
        const fail = new Set(
          fleet.workers.filter((w) => w.status === "fail").map((w) => w.supermarketId),
        );
        const wrk = new Map<string, number>();
        for (const w of fleet.workers) wrk.set(w.supermarketId, (wrk.get(w.supermarketId) ?? 0) + 1);
        const vigente = new Set(
          flyers.filter((f) => isVigenteFlyer(f)).map((f) => f.supermarket.id),
        );
        setNetworks(
          list.map((n) => {
            const d = byId.get(n.id);
            return {
              ...n,
              stores: d?.stores ?? [],
              flyerCount: n._count.flyers,
              offerCount: n._count.offers,
            };
          }),
        );
        setFailIds(fail);
        setWorkersByNetwork(wrk);
        setVigenteCount(vigente.size);
      },
    ).catch((cause: unknown) => {
        if (!alive) return;
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar as lojas.",
        );
    });
    return () => {
      alive = false;
    };
  }, []);

  const rowsAll = networks ?? [];
  const withoutFlyer = rowsAll.filter((s) => s.flyerCount === 0);
  const failNetworks = rowsAll.filter((s) => failIds.has(s.id));
  const active = rowsAll.filter((s) => s.active);
  const totalBranches = rowsAll.reduce((n, s) => n + s.stores.length, 0);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rowsAll.filter((s) => {
      if (tab === "active" && !s.active) return false;
      if (tab === "noflyer" && s.flyerCount > 0) return false;
      if (tab === "fail" && !failIds.has(s.id)) return false;
      if (!needle) return true;
      if (
        s.name.toLowerCase().includes(needle) ||
        s.city.toLowerCase().includes(needle) ||
        s.slug.includes(needle)
      ) {
        return true;
      }
      return s.stores.some(
        (b) =>
          b.name.toLowerCase().includes(needle) ||
          (b.neighborhood?.toLowerCase().includes(needle) ?? false),
      );
    });
  }, [rowsAll, tab, q, failIds]);

  const [page, setPage] = useTablePage(`${tab}|${q}`);
  const pageRows = slicePage(rows, page);

  return (
    <div>
      <OpsHeader
        title="Lojas"
        stamp={`${totalBranches} filiais · ${rowsAll.length} redes`}
        filterTarget={() => searchRef.current?.focus()}
        primary={
          <button
            type="button"
            className="ds-btn ds-btn--primary"
            onClick={() => setCreateOpen(true)}
          >
            Novo supermercado
          </button>
        }
      />

      <StoreCreateModal
        open={createOpen}
        storeNames={rowsAll.map((s) => s.name)}
        onClose={() => setCreateOpen(false)}
      />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ds-color-danger)]">
          {error}
        </p>
      ) : null}

      <section className="flex gap-4 pb-4">
        <OpsKpi label="Redes" value={networks === undefined ? "…" : rowsAll.length} foot="cadastradas" />
        <OpsKpi
          label="Filiais"
          value={networks === undefined ? "…" : totalBranches}
          foot="lojas físicas"
        />
        <OpsKpi
          label="Encartes vigentes"
          value={networks === undefined ? "…" : formatNumber(vigenteCount)}
          foot="ciclos publicados agora"
        />
        <OpsKpi
          label="Workers em falha"
          value={networks === undefined ? "…" : failNetworks.length}
          danger={failNetworks.length > 0}
          foot={failNetworks[0]?.name ?? "nenhuma falha"}
        />
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "Todas", count: rowsAll.length },
          { id: "active", label: "Ativas", count: active.length },
          { id: "noflyer", label: "Sem encarte", count: withoutFlyer.length },
          { id: "fail", label: "Worker falha", count: failNetworks.length, warn: true },
        ]}
      />

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Redes e lojas</h2>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar rede ou loja"
            className="ds-search"
          />
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps w-[228px] shrink-0">Loja</span>
          <span className="ds-label-caps w-[160px] shrink-0">Local</span>
          <span className="ds-label-caps w-[92px] shrink-0">Status</span>
          <span className="ds-label-caps w-[80px] shrink-0">Workers</span>
          <span className="ds-label-caps w-[80px] shrink-0">Encartes</span>
          <span className="ds-label-caps w-[80px] shrink-0">Ofertas</span>
          <span className="ds-label-caps min-w-0 flex-1">Último ciclo</span>
        </div>
        {pageRows.map((s) => {
          const wrk = workersByNetwork.get(s.id) ?? 0;
          const branches = s.stores;
          return (
            <div key={s.id}>
              <Link
                href={`/admin/supermarkets/${s.id}`}
                className="ds-group-row"
                style={{ display: "flex", textDecoration: "none" }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="ds-dot"
                    style={{
                      background: failIds.has(s.id) ? statusDot("fail") : statusDot("ok"),
                    }}
                  />
                  {s.name}{" "}
                  <span className="font-normal text-[var(--ds-color-muted-foreground)]">
                    {networkLabel(s.networkType)}
                  </span>
                </span>
                <span className="font-normal text-[var(--ds-color-muted-foreground)]">
                  {branches.length} {branches.length === 1 ? "loja" : "lojas"} · {wrk} workers
                </span>
              </Link>
              {branches.length ? (
                branches.map((b) => (
                  <Link
                    key={b.id}
                    href={`/admin/supermarkets/${s.id}`}
                    className="ds-table-row"
                    style={{ height: 56 }}
                  >
                    <span className="flex w-[228px] shrink-0 items-center gap-2 pl-4">
                      <span
                        className="ds-dot"
                        style={{
                          background: b.active ? statusDot("ok") : statusDot("queue"),
                        }}
                      />
                      <span>
                        <span className="block font-medium">{b.name}</span>
                        <span className="font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                          {b.slug}
                        </span>
                      </span>
                    </span>
                    <span className="w-[160px] shrink-0">
                      {b.neighborhood ? `${b.neighborhood} · ${b.city}` : `${b.city} · ${b.state}`}
                    </span>
                    <span className="w-[92px] shrink-0">
                      <StatusBadge status={b.active ? "active" : "inactive"} />
                    </span>
                    <span className="w-[80px] shrink-0 font-mono text-[var(--ds-color-muted-foreground)]">
                      —
                    </span>
                    <span className="w-[80px] shrink-0 font-mono text-[var(--ds-color-muted-foreground)]">
                      —
                    </span>
                    <span className="w-[80px] shrink-0 font-mono text-[var(--ds-color-muted-foreground)]">
                      —
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[var(--ds-color-muted-foreground)]">
                      {b.externalId ? `#${b.externalId}` : "—"}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="ds-table-row" style={{ height: 56, opacity: 0.7 }}>
                  <span className="pl-4 text-sm text-[var(--ds-color-muted-foreground)]">
                    Nenhuma loja — abra a rede para cadastrar
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {networks === undefined && !error ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Carregando…
          </p>
        ) : !rows.length && networks !== undefined ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma rede.
          </p>
        ) : null}
        <TablePagination page={page} total={rows.length} onPageChange={setPage} />
      </section>
    </div>
  );
}
