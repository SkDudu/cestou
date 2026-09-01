"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OpsHeader } from "@/components/admin/ops";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatCurrency, formatInstallment, formatPack, formatPercent } from "@/lib/format";

export default function ValidationPage() {
  const pending = useQuery(api.offers.listPendingValidation, { limit: 50 });
  const eligReview = useQuery(api.offers.listEligibilityReview, { limit: 30 });
  const setStatus = useMutation(api.offers.setValidationStatus);

  return (
    <div>
      <OpsHeader
        title="Extração · Revisão"
        subtitle="Fila pendente — menor confiança primeiro"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {(pending ?? []).map((o) => (
          <article key={o._id} className="ds-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/admin/offers/${o._id}`} className="font-medium hover:underline">
                  {o.name}
                </Link>
                <p className="mt-1 font-mono text-sm">
                  {formatCurrency(o.price)}
                  {o.originalPrice != null
                    ? ` · de ${formatCurrency(o.originalPrice)}`
                    : ""}
                  {formatInstallment(o) ? ` · ${formatInstallment(o)}` : ""}
                  {formatPack(o.quantity, o.unit)
                    ? ` · ${formatPack(o.quantity, o.unit)}`
                    : ""}
                </p>
                <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                  {o.supermarketName}
                  {o.pageNumber != null ? ` · pág. ${o.pageNumber}` : ""}
                  {o.extractionConfidence != null
                    ? ` · ${formatPercent(o.extractionConfidence)}`
                    : ""}
                </p>
                {o.condition?.kind && o.condition.kind !== "none" ? (
                  <p className="mt-1 text-xs text-[var(--ds-color-foreground)]">
                    {o.condition.text}
                  </p>
                ) : null}
              </div>
              <StatusBadge status={o.validationStatus} />
            </div>
            {o.pageUrl ? (
              <a href={o.pageUrl} target="_blank" rel="noreferrer" className="mt-3 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={o.pageUrl}
                  alt=""
                  className="max-h-48 w-full rounded-[10px] border border-[var(--ds-color-border)] object-contain object-top"
                />
              </a>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                onClick={() => setStatus({ id: o._id, validationStatus: "validated" })}
              >
                Validar
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                onClick={() => setStatus({ id: o._id, validationStatus: "suspicious" })}
              >
                Revisão
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--danger"
                onClick={() => setStatus({ id: o._id, validationStatus: "rejected" })}
              >
                Rejeitar
              </button>
              <Link href={`/admin/flyers/${o.flyerId}`} className="ds-btn ds-btn--ghost">
                Ver encarte
              </Link>
            </div>
          </article>
        ))}
        {pending?.length === 0 ? (
          <p className="ds-meta">Fila vazia.</p>
        ) : null}
      </div>

      {(eligReview?.length ?? 0) > 0 ? (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
            Condição · revisão
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {eligReview?.map((o) => (
              <article key={o._id} className="ds-card">
                <Link href={`/admin/offers/${o._id}`} className="font-medium hover:underline">
                  {o.name}
                </Link>
                <p className="mt-1 font-mono text-sm">
                  {formatCurrency(o.price)}
                  {formatInstallment(o) ? ` · ${formatInstallment(o)}` : ""}
                </p>
                <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                  {o.supermarketName}
                  {o.eligibilityConfidence != null
                    ? ` · ${formatPercent(o.eligibilityConfidence)}`
                    : ""}
                </p>
                {o.condition ? (
                  <p className="mt-1 text-xs text-[var(--ds-color-foreground)]">
                    {o.condition.text}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
