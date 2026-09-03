"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { OpsHeader, OpsKpi } from "@/components/admin/ops";
import { WorkerSetupModal } from "@/components/admin/WorkerSetupModal";
import { StoreBranchModal } from "@/components/admin/StoreBranchModal";
import { FlyerSourceModal } from "@/components/admin/FlyerSourceModal";
import { NetworkEditModal } from "@/components/admin/NetworkEditModal";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, formatNumber } from "@/lib/format";

const NETWORK_TYPE_LABEL: Record<string, string> = {
  supermarket: "Supermercado",
  wholesale: "Atacarejo",
  distributor: "Distribuidora",
};

type StoreRow = {
  _id: Id<"stores">;
  name: string;
  address?: string;
  number?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  url?: string;
  externalId?: string;
  active: boolean;
};

type SourceRow = {
  _id: Id<"flyerSources">;
  name?: string;
  type: "pdf" | "image" | "web" | "dynamic" | "manual";
  url: string;
  scope?: "supermarket" | "store";
  active: boolean;
  operationalStatus?: "active" | "inactive" | "error" | "not_configured";
  flowId?: Id<"scraperFlows">;
  storeIds: Id<"stores">[];
};

export default function SupermarketDetailPage() {
  const params = useParams();
  const id = params.id as Id<"supermarkets">;
  const data = useQuery(api.supermarkets.get, { id });
  const overview = useQuery(api.dashboard.overview);
  const removeStore = useMutation(api.stores.remove);
  const removeSource = useMutation(api.flyerSources.remove);
  const [setupOpen, setSetupOpen] = useState(false);
  const [editNetworkOpen, setEditNetworkOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchEdit, setBranchEdit] = useState<StoreRow | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceEdit, setSourceEdit] = useState<SourceRow | null>(null);

  const storeWorkers = useMemo(
    () => (overview?.workers ?? []).filter((w) => w.supermarketId === id),
    [overview?.workers, id],
  );
  const failWorkers = storeWorkers.filter((w) => w.status === "fail").length;

  const storeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of data?.stores ?? []) map.set(s._id, s.name);
    return map;
  }, [data?.stores]);

  const flowName = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of data?.flows ?? []) map.set(f._id, f.name);
    return map;
  }, [data?.flows]);

  if (data === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-[var(--ds-color-danger)]">Não encontrado</p>
    );
  }

  const stores = data.stores as StoreRow[];
  const sources = data.sources as SourceRow[];
  const flows = data.flows ?? [];

  return (
    <div>
      <OpsHeader
        crumb={
          <>
            <Link href="/admin/supermarkets">Lojas</Link>
            <span className="ds-crumb-sep">/</span>
            <span className="ds-crumb-current">{data.name}</span>
          </>
        }
        title={
          <span className="flex items-center gap-3">
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt={`${data.name} logo`}
                className="h-8 w-8 rounded-md border border-[var(--ds-color-border)] object-contain"
              />
            ) : null}
            {data.name}
            {data.networkType ? (
              <span className="rounded-full bg-[var(--ds-color-surface)] px-2 py-0.5 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
                {NETWORK_TYPE_LABEL[data.networkType] ?? data.networkType}
              </span>
            ) : null}
          </span>
        }
        subtitle={`rede · ${data.city}, ${data.state} · ${data.slug}${
          data.websiteUrl
            ? ` · ${data.websiteUrl.replace(/^https?:\/\//, "")}`
            : ""
        }`}
        primary={
          <>
            <button
              type="button"
              className="ds-btn ds-btn--outline"
              onClick={() => setEditNetworkOpen(true)}
            >
              Editar rede
            </button>
            <Link
              href={`/admin/extraction?supermarketId=${id}`}
              className="ds-btn ds-btn--outline"
            >
              Abrir extração
            </Link>
            <Link
              href={`/admin/flyers?supermarketId=${id}`}
              className="ds-btn ds-btn--outline"
            >
              Novo encarte
            </Link>
            {storeWorkers.length ? (
              <Link
                href={`/admin/scraper/${storeWorkers[0]._id}/run?go=1`}
                className="ds-btn ds-btn--primary"
              >
                Rodar worker
              </Link>
            ) : (
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                onClick={() => setSetupOpen(true)}
              >
                Novo worker
              </button>
            )}
          </>
        }
      />

      <NetworkEditModal
        open={editNetworkOpen}
        initial={{
          id,
          name: data.name,
          websiteUrl: data.websiteUrl,
          city: data.city,
          state: data.state,
          active: data.active,
          networkType: data.networkType as
            | "supermarket"
            | "wholesale"
            | "distributor"
            | undefined,
          logoUrl: data.logoUrl,
          logoStorageId: data.logoStorageId,
        }}
        onClose={() => setEditNetworkOpen(false)}
      />

      <WorkerSetupModal
        open={setupOpen}
        presetSupermarketId={id}
        onClose={() => setSetupOpen(false)}
      />

      <StoreBranchModal
        open={branchOpen}
        supermarketId={id}
        defaultCity={data.city}
        defaultState={data.state}
        initial={
          branchEdit
            ? {
                id: branchEdit._id,
                name: branchEdit.name,
                address: branchEdit.address,
                number: branchEdit.number,
                neighborhood: branchEdit.neighborhood,
                city: branchEdit.city,
                state: branchEdit.state,
                zipCode: branchEdit.zipCode,
                url: branchEdit.url,
                active: branchEdit.active,
              }
            : null
        }
        onClose={() => {
          setBranchOpen(false);
          setBranchEdit(null);
        }}
      />

      <FlyerSourceModal
        open={sourceOpen}
        supermarketId={id}
        stores={stores.map((s) => ({ _id: s._id, name: s.name }))}
        flows={flows.map((f) => ({
          _id: f._id,
          name: f.name,
          status: f.status,
        }))}
        initial={
          sourceEdit
            ? {
                id: sourceEdit._id,
                name: sourceEdit.name,
                type: sourceEdit.type,
                url: sourceEdit.url,
                scope: sourceEdit.scope,
                active: sourceEdit.active,
                operationalStatus: sourceEdit.operationalStatus,
                flowId: sourceEdit.flowId,
                storeIds: sourceEdit.storeIds,
              }
            : null
        }
        onClose={() => {
          setSourceOpen(false);
          setSourceEdit(null);
        }}
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
          value={storeWorkers.length}
          danger={failWorkers > 0}
          foot={failWorkers ? `${failWorkers} em falha` : "scrapers"}
        />
        <OpsKpi
          label="Encartes"
          value={formatNumber(data.flyerCount)}
          foot="ciclos desta rede"
        />
      </section>

      <section className="ds-table-card mb-4">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Filiais</h2>
          <button
            type="button"
            className="text-[13px] font-medium text-[var(--ds-color-harbor)]"
            onClick={() => {
              setBranchEdit(null);
              setBranchOpen(true);
            }}
          >
            + Nova filial
          </button>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-1">Nome</span>
          <span className="ds-label-caps w-[160px] shrink-0">Bairro</span>
          <span className="ds-label-caps w-[80px] shrink-0">Status</span>
          <span className="ds-label-caps w-[120px] shrink-0">Ações</span>
        </div>
        {stores.map((s) => (
          <div key={s._id} className="ds-table-row">
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
            <span className="flex w-[120px] shrink-0 gap-2">
              <button
                type="button"
                className="text-[13px] text-[var(--ds-color-harbor)]"
                onClick={() => {
                  setBranchEdit(s);
                  setBranchOpen(true);
                }}
              >
                Editar
              </button>
              <button
                type="button"
                className="text-[13px] text-[var(--ds-color-danger)]"
                onClick={() => {
                  if (confirm(`Remover filial ${s.name}?`)) {
                    void removeStore({ id: s._id });
                  }
                }}
              >
                Excluir
              </button>
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
          <button
            type="button"
            className="text-[13px] font-medium text-[var(--ds-color-harbor)]"
            onClick={() => {
              setSourceEdit(null);
              setSourceOpen(true);
            }}
          >
            + Nova fonte
          </button>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-1">Fonte</span>
          <span className="ds-label-caps w-[80px] shrink-0">Tipo</span>
          <span className="ds-label-caps w-[120px] shrink-0">Escopo</span>
          <span className="ds-label-caps w-[120px] shrink-0">Worker</span>
          <span className="ds-label-caps w-[100px] shrink-0">Status</span>
          <span className="ds-label-caps w-[120px] shrink-0">Ações</span>
        </div>
        {sources.map((s) => (
          <div key={s._id} className="ds-table-row">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{s.name ?? "Sem nome"}</span>
              <span className="ml-2 font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                {s.url.replace(/^https?:\/\//, "")}
              </span>
            </span>
            <span className="w-[80px] shrink-0 font-mono text-xs">{s.type}</span>
            <span className="w-[120px] shrink-0 truncate text-[13px] text-[var(--ds-color-muted-foreground)]">
              {s.scope === "store"
                ? s.storeIds.map((sid) => storeName.get(sid) ?? "?").join(", ") ||
                  "filiais"
                : "toda a rede"}
            </span>
            <span className="w-[120px] shrink-0 truncate text-[13px]">
              {s.flowId ? (
                <Link
                  href={`/admin/scraper/${s.flowId}`}
                  className="text-[var(--ds-color-harbor)]"
                >
                  {flowName.get(s.flowId) ?? "worker"}
                </Link>
              ) : (
                <span className="text-[var(--ds-color-muted-foreground)]">—</span>
              )}
            </span>
            <span className="w-[100px] shrink-0">
              <StatusBadge
                status={s.operationalStatus ?? (s.active ? "active" : "inactive")}
              />
            </span>
            <span className="flex w-[120px] shrink-0 gap-2">
              <button
                type="button"
                className="text-[13px] text-[var(--ds-color-harbor)]"
                onClick={() => {
                  setSourceEdit(s);
                  setSourceOpen(true);
                }}
              >
                Editar
              </button>
              <button
                type="button"
                className="text-[13px] text-[var(--ds-color-danger)]"
                onClick={() => {
                  if (confirm("Remover esta fonte?")) {
                    void removeSource({ id: s._id });
                  }
                }}
              >
                Excluir
              </button>
            </span>
          </div>
        ))}
        {!sources.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma fonte configurada
          </p>
        ) : null}
      </section>

      {storeWorkers.length ? (
        <section className="ds-table-card mb-4">
          <div className="ds-table-head">
            <h2 className="text-[15px] font-semibold">Workers</h2>
            <Link
              href="/admin/scraper"
              className="text-[13px] font-medium text-[var(--ds-color-harbor)]"
            >
              Ver todos
            </Link>
          </div>
          {storeWorkers.map((w) => (
            <Link
              key={w._id}
              href={`/admin/scraper/${w._id}`}
              className="ds-table-row"
            >
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
                <StatusBadge status={w.status} />
              </span>
            </Link>
          ))}
        </section>
      ) : null}

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Encartes recentes</h2>
          <Link
            href="/admin/flyers"
            className="text-[13px] font-medium text-[var(--ds-color-harbor)]"
          >
            Ver todos
          </Link>
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-1">Título</span>
          <span className="ds-label-caps w-[120px] shrink-0">Status</span>
          <span className="ds-label-caps w-[220px] shrink-0">Validade</span>
        </div>
        {data.recentFlyers.map((f) => (
          <Link
            key={f._id}
            href={`/admin/flyers/${f._id}`}
            className="ds-table-row"
          >
            <span className="min-w-0 flex-1 truncate">
              {f.title ?? f._id}
            </span>
            <span className="w-[120px] shrink-0">
              <StatusBadge status={f.status} />
            </span>
            <span className="w-[220px] shrink-0 text-[var(--ds-color-muted-foreground)]">
              {formatDateTime(f.validFrom)} → {formatDateTime(f.validUntil)}
            </span>
          </Link>
        ))}
        {!data.recentFlyers.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Sem encartes
          </p>
        ) : null}
      </section>
    </div>
  );
}
