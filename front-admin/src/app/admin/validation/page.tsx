"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatCurrency } from "@/lib/format";

export default function ValidationPage() {
  const pending = useQuery(api.offers.listPendingValidation, { limit: 50 });
  const setStatus = useMutation(api.offers.setValidationStatus);

  return (
    <div>
      <PageHeader
        title="Validação"
        description="Fila pendente — menor confidence primeiro"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {(pending ?? []).map((o) => (
          <article
            key={o._id}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  href={`/admin/offers/${o._id}`}
                  className="font-medium text-zinc-100 hover:underline"
                >
                  {o.name}
                </Link>
                <p className="mt-1 text-sm text-zinc-400">
                  {formatCurrency(o.price)}
                  {o.originalPrice != null
                    ? ` · de ${formatCurrency(o.originalPrice)}`
                    : ""}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {o.supermarketName} · {o.supermarketCity}
                  {o.pageNumber != null ? ` · pág. ${o.pageNumber}` : ""}
                  {o.extractionConfidence != null
                    ? ` · ${Math.round(o.extractionConfidence * 100)}%`
                    : ""}
                </p>
              </div>
              <StatusBadge status={o.validationStatus} />
            </div>
            {o.pageUrl ? (
              <a
                href={o.pageUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={o.pageUrl}
                  alt="Encarte"
                  className="max-h-48 w-full rounded border border-zinc-800 object-contain object-top"
                />
              </a>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setStatus({ id: o._id, validationStatus: "validated" })
                }
                className="rounded-md border border-emerald-800 px-2 py-1 text-xs text-emerald-300"
              >
                Validar
              </button>
              <button
                type="button"
                onClick={() =>
                  setStatus({ id: o._id, validationStatus: "suspicious" })
                }
                className="rounded-md border border-amber-800 px-2 py-1 text-xs text-amber-300"
              >
                Suspeito
              </button>
              <button
                type="button"
                onClick={() =>
                  setStatus({ id: o._id, validationStatus: "rejected" })
                }
                className="rounded-md border border-rose-800 px-2 py-1 text-xs text-rose-300"
              >
                Rejeitar
              </button>
              <Link
                href={`/admin/flyers/${o.flyerId}`}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
              >
                Ver encarte
              </Link>
            </div>
          </article>
        ))}
        {pending?.length === 0 ? (
          <p className="text-sm text-zinc-500">Fila vazia.</p>
        ) : null}
      </div>
    </div>
  );
}
