"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { StoreCreateModal } from "@/components/admin/StoreCreateModal";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatNumber } from "@/lib/format";

const NETWORK_TYPE_LABEL: Record<string, string> = {
  supermarket: "Supermercado",
  wholesale: "Atacarejo",
  distributor: "Distribuidora",
};

export default function SupermarketsPage() {
  return (
    <Suspense fallback={<p className="ds-meta">Carregando…</p>}>
      <StoresPage />
    </Suspense>
  );
}

function StoresPage() {
  const searchParams = useSearchParams();
  const list = useQuery(api.supermarkets.list);
  const overview = useQuery(api.dashboard.overview);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const preset = searchParams.get("q");
    if (preset) setQ(preset);
  }, [searchParams]);

  const networks = list ?? [];
  const workers = overview?.workers ?? [];
  const withoutFlyer = networks.filter((s) => s.flyerCount === 0);
  const workerFail = new Set(
    workers.filter((w) => w.status === "fail").map((w) => w.supermarketId),
  );
  const workersByNetwork = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of workers) {
      map.set(w.supermarketId, (map.get(w.supermarketId) ?? 0) + 1);
    }
    return map;
  }, [workers]);
  const failNetworks = networks.filter((s) => workerFail.has(s._id));
  const active = networks.filter((s) => s.active);
  const totalBranches = networks.reduce((n, s) => n + s.storeCount, 0);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return networks.filter((s) => {
      if (tab === "active" && !s.active) return false;
      if (tab === "noflyer" && s.flyerCount > 0) return false;
      if (tab === "fail" && !workerFail.has(s._id)) return false;
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
  }, [networks, tab, q, workerFail]);

  if (list === undefined) return <p className="ds-meta">Carregando…</p>;

  return (
    <div>
      <OpsHeader
        title="Lojas"
        stamp={`${totalBranches} filiais · ${networks.length} redes`}
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
        storeNames={networks.map((s) => s.name)}
        onClose={() => setCreateOpen(false)}
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi label="Redes" value={networks.length} foot="cadastradas" />
        <OpsKpi
          label="Filiais"
          value={totalBranches}
          foot="lojas físicas"
        />
        <OpsKpi
          label="Encartes vigentes"
          value={formatNumber(
            networks.reduce((n, s) => n + (s.activeFlyer ? 1 : 0), 0),
          )}
          foot="ciclos publicados agora"
        />
        <OpsKpi
          label="Workers em falha"
          value={failNetworks.length}
          danger={failNetworks.length > 0}
          foot={failNetworks[0]?.name ?? "nenhuma falha"}
        />
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "Todas", count: networks.length },
          { id: "active", label: "Ativas", count: active.length },
          { id: "noflyer", label: "Sem encarte", count: withoutFlyer.length },
          {
            id: "fail",
            label: "Worker falha",
            count: failNetworks.length,
            warn: true,
          },
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
        {rows.map((s) => {
          const wrk = workersByNetwork.get(s._id) ?? 0;
          const branches = s.stores;
          return (
            <div key={s._id}>
              <Link
                href={`/admin/supermarkets/${s._id}`}
                className="ds-group-row"
                style={{ display: "flex", textDecoration: "none" }}
              >
                <span className="flex items-center gap-2">
                  {s.logoUrl ? (
                    <img
                      src={s.logoUrl}
                      alt=""
                      className="h-6 w-6 rounded border border-[var(--ds-color-border)] object-contain"
                    />
                  ) : (
                    <span
                      className="ds-dot"
                      style={{
                        background: workerFail.has(s._id)
                          ? statusDot("fail")
                          : statusDot("ok"),
                      }}
                    />
                  )}
                  {s.name}{" "}
                  <span className="font-normal text-[var(--ds-color-muted-foreground)]">
                    {s.networkType
                      ? NETWORK_TYPE_LABEL[s.networkType] ?? "rede"
                      : "rede"}
                  </span>
                </span>
                <span className="font-normal text-[var(--ds-color-muted-foreground)]">
                  {branches.length}{" "}
                  {branches.length === 1 ? "loja" : "lojas"} · {wrk} workers
                </span>
              </Link>
              {branches.length ? (
                branches.map((b) => (
                  <Link
                    key={b._id}
                    href={`/admin/supermarkets/${s._id}`}
                    className="ds-table-row"
                    style={{ height: 56 }}
                  >
                    <span className="flex w-[228px] shrink-0 items-center gap-2 pl-4">
                      <span
                        className="ds-dot"
                        style={{
                          background: b.active
                            ? statusDot("ok")
                            : statusDot("queue"),
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
                      {b.neighborhood
                        ? `${b.neighborhood} · ${b.city}`
                        : `${b.city} · ${b.state}`}
                    </span>
                    <span className="w-[92px] shrink-0">
                      <StatusBadge
                        status={b.active ? "active" : "inactive"}
                      />
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
                <div
                  className="ds-table-row"
                  style={{ height: 56, opacity: 0.7 }}
                >
                  <span className="pl-4 text-sm text-[var(--ds-color-muted-foreground)]">
                    Nenhuma loja — abra a rede para cadastrar
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {!rows.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma rede.
          </p>
        ) : null}
      </section>
    </div>
  );
}
