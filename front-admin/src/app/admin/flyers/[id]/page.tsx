"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/format";

export default function FlyerDetailPage() {
  const params = useParams();
  const id = params.id as Id<"flyers">;
  const flyer = useQuery(api.flyers.get, { id });

  if (flyer === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }
  if (!flyer) {
    return <p className="text-sm text-[var(--ds-color-danger)]">Não encontrado</p>;
  }

  return (
    <div>
      <PageHeader
        title={flyer.title ?? "Encarte"}
        description={flyer.supermarket?.name}
      >
        <StatusBadge status={flyer.status} />
      </PageHeader>

      <dl className="mb-6 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Validade</dt>
          <dd>
            {formatDateTime(flyer.validFrom)} → {formatDateTime(flyer.validUntil)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">URL original</dt>
          <dd>
            <a
              href={flyer.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-[var(--ds-color-muted-foreground)] hover:underline"
            >
              {flyer.originalUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Hash</dt>
          <dd className="font-mono text-xs text-[var(--ds-color-muted-foreground)]">{flyer.fileHash ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Ofertas</dt>
          <dd>{flyer.offerCount}</dd>
        </div>
      </dl>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
        Páginas
      </h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {flyer.pages.map((p) => (
          <a
            key={p._id}
            href={p.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="block ds-table-card"
          >
            {p.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.url}
                alt={`Página ${p.pageNumber}`}
                className="aspect-[3/4] w-full object-cover object-top"
              />
            ) : null}
            <p className="px-2 py-1 text-xs text-[var(--ds-color-muted-foreground)]">Página {p.pageNumber}</p>
          </a>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
        Ofertas extraídas
      </h2>
      <div className="ds-table-card">
        <table className="w-full text-left text-sm">
          <thead className="ds-label-caps">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Preço</th>
              <th className="px-3 py-2">Pág</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {flyer.offers.map((o) => (
              <tr key={o._id} className="border-b border-[var(--ds-color-border)]">
                <td className="px-3 py-2">
                  <Link href={`/admin/offers/${o._id}`} className="hover:underline">
                    {o.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{formatCurrency(o.price)}</td>
                <td className="px-3 py-2">{o.pageNumber ?? "—"}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={o.validationStatus} />
                </td>
              </tr>
            ))}
            {!flyer.offers.length ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-[var(--ds-color-muted-foreground)]">
                  Sem ofertas
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
