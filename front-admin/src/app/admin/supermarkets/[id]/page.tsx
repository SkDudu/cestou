"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { OpsHeader, OpsKpi } from "@/components/admin/ops";
import { WorkerSetupModal } from "@/components/admin/WorkerSetupModal";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, formatNumber } from "@/lib/format";

function redeOf(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export default function SupermarketDetailPage() {
  const params = useParams();
  const id = params.id as Id<"supermarkets">;
  const data = useQuery(api.supermarkets.get, { id });
  const overview = useQuery(api.dashboard.overview);
  const [setupOpen, setSetupOpen] = useState(false);

  const storeWorkers = useMemo(
    () => (overview?.workers ?? []).filter((w) => w.supermarketId === id),
    [overview?.workers, id],
  );
  const failWorkers = storeWorkers.filter((w) => w.status === "fail").length;

  if (data === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-[var(--ds-color-danger)]">Não encontrado</p>
    );
  }

  const rede = redeOf(data.name);

  return (
    <div>
      <OpsHeader
        crumb={
          <>
            <Link href="/admin/supermarkets">Lojas</Link>
            <span className="ds-crumb-sep">/</span>
            <Link href={`/admin/supermarkets?q=${encodeURIComponent(rede)}`}>
              {rede}
            </Link>
            <span className="ds-crumb-sep">/</span>
            <span className="ds-crumb-current">{data.name}</span>
          </>
        }
        title={data.name}
        subtitle={`${rede} · rede · ${data.city}, ${data.state} · ${data.slug}${
          data.websiteUrl
            ? ` · ${data.websiteUrl.replace(/^https?:\/\//, "")}`
            : ""
        }`}
        primary={
          <>
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

      <WorkerSetupModal
        open={setupOpen}
        presetSupermarketId={id}
        onClose={() => setSetupOpen(false)}
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Workers"
          value={storeWorkers.length}
          danger={failWorkers > 0}
          foot={
            failWorkers
              ? `${failWorkers} em falha`
              : "scrapers desta filial"
          }
        />
        <OpsKpi
          label="Encartes"
          value={formatNumber(data.flyerCount)}
          foot="ciclos desta filial"
        />
        <OpsKpi
          label="Fontes"
          value={data.sources.filter((s) => s.active).length}
          foot={`${data.sources.length} cadastradas`}
        />
        <OpsKpi
          label="Status"
          value={data.active ? "Ativa" : "Pausada"}
          danger={!data.active}
          foot="cadastro no ops"
        />
      </section>

      {storeWorkers.length ? (
        <section className="ds-table-card mb-4">
          <div className="ds-table-head">
            <h2 className="text-[15px] font-semibold">Workers desta filial</h2>
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
          <h2 className="text-[15px] font-semibold">Encartes desta filial</h2>
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
