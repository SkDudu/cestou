"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConditionFields } from "@/components/admin/ConditionFields";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  draftsFromOffer,
  primaryEligibility,
  type ConditionDraft,
} from "@/lib/eligibility";
import { formatCurrency, formatDateTime, formatInstallment, formatPack, formatPercent } from "@/lib/format";

export default function OfferDetailPage() {
  const params = useParams();
  const id = params.id as Id<"offers">;
  const offer = useQuery(api.offers.get, { id });
  const history = useQuery(api.offers.listEligibilityHistory, { offerId: id });
  const setStatus = useMutation(api.offers.setValidationStatus);
  const setEligibility = useMutation(api.offers.setEligibility);
  const [drafts, setDrafts] = useState<ConditionDraft[]>([]);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!offer) return;
    setDrafts(draftsFromOffer(offer));
  }, [offer]);

  if (offer === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }
  if (!offer) {
    return <p className="text-sm text-[var(--ds-color-danger)]">Não encontrado</p>;
  }

  const conf = offer.eligibilityConfidence;

  return (
    <div>
      <PageHeader title={offer.name} description={offer.supermarket?.name}>
        <StatusBadge status={offer.validationStatus} />
        {offer.eligibilityStatus ? (
          <StatusBadge status={offer.eligibilityStatus} />
        ) : null}
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        {(["validated", "suspicious", "rejected"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus({ id, validationStatus: s })}
            className="rounded-md border border-[var(--ds-color-border)] px-3 py-1.5 text-sm "
          >
            {s}
          </button>
        ))}
      </div>

      <dl className="mb-6 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Preço</dt>
          <dd className="text-lg font-medium">{formatCurrency(offer.price)}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">À vista</dt>
          <dd>
            {offer.cashPrice != null ? formatCurrency(offer.cashPrice) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Parcelas</dt>
          <dd>{formatInstallment(offer) ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">De</dt>
          <dd>
            {offer.originalPrice != null
              ? formatCurrency(offer.originalPrice)
              : "—"}
            {offer.discountPercentage != null
              ? ` (${offer.discountPercentage}% OFF)`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Quantidade</dt>
          <dd>{formatPack(offer.quantity, offer.unit) ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Página</dt>
          <dd>{offer.pageNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Validade</dt>
          <dd>
            {formatDateTime(offer.validFrom)} → {formatDateTime(offer.validUntil)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Encarte</dt>
          <dd>
            {offer.flyer ? (
              <Link href={`/admin/flyers/${offer.flyerId}`} className="hover:underline">
                {offer.flyer.title ?? offer.flyerId}
              </Link>
            ) : (
              <span>
                {offer.sourceFlyerTitle ?? "Evidência removida pela retenção"}
                {offer.sourceFlyerUrl ? (
                  <>
                    {" · "}
                    <a
                      href={offer.sourceFlyerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      origem
                    </a>
                  </>
                ) : null}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Extração</dt>
          <dd>
            {offer.extraction
              ? `${offer.extraction.provider}${offer.extraction.model ? ` · ${offer.extraction.model}` : ""} · ${offer.extraction.status}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Canônico</dt>
          <dd>
            {offer.canonicalProductId ? (
              <Link
                href={`/admin/products/${offer.canonicalProductId}`}
                className="hover:underline"
              >
                Abrir hub do produto
              </Link>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Marca (id)</dt>
          <dd>
            {offer.brandId ? (
              <Link
                href={`/admin/brands`}
                className="hover:underline"
              >
                {offer.normalizedBrand ?? offer.brand ?? offer.brandId}
              </Link>
            ) : (
              offer.brand ?? "—"
            )}
          </dd>
        </div>
      </dl>

      <section className="ds-card mb-6 space-y-4 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
          Condição do preço
        </h2>
        <p className="text-sm">
          {offer.condition?.text ?? "Todos"}
          {conf != null ? ` · confiança ${formatPercent(conf)}` : ""}
        </p>
        {offer.eligibilityEvidence?.text ? (
          <blockquote className="border-l-2 border-[var(--ds-color-border)] pl-3 text-sm text-[var(--ds-color-muted-foreground)]">
            “{offer.eligibilityEvidence.text}”
            {offer.eligibilityEvidence.page != null
              ? ` · pág. ${offer.eligibilityEvidence.page}`
              : ""}
          </blockquote>
        ) : null}

        <ConditionFields value={drafts} onChange={setDrafts} />
        <label className="block text-sm">
          <span className="ds-label-caps">Motivo (auditoria)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Opcional"
            className="ds-search mt-1 w-full"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ds-btn ds-btn--primary"
            onClick={() => {
              const eligibility = primaryEligibility(drafts);
              void setEligibility({
                id,
                eligibility,
                conditions:
                  eligibility === "ALL_CUSTOMERS" || eligibility === "UNKNOWN"
                    ? undefined
                    : drafts.map((d) => ({
                        type: d.type,
                        name: d.name || undefined,
                        description: d.description || undefined,
                      })),
                reason: reason || "confirmado",
              });
            }}
          >
            Confirmar
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--outline"
            onClick={() => {
              setDrafts([]);
              void setEligibility({
                id,
                eligibility: "ALL_CUSTOMERS",
                reason: reason || "sem condição",
              });
            }}
          >
            Sem condição
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            onClick={() => {
              setDrafts([{ type: "UNKNOWN", name: "", description: "" }]);
              void setEligibility({
                id,
                eligibility: "UNKNOWN",
                reason: reason || "não foi possível determinar",
              });
            }}
          >
            Não foi possível determinar
          </button>
        </div>
      </section>

      {history && history.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
            Histórico
          </h2>
          <ul className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h._id} className="text-[var(--ds-color-muted-foreground)]">
                {h.source}: {h.previousEligibility ?? "—"} → {h.newEligibility}
                {h.reason ? ` · ${h.reason}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {offer.pageUrl ? (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
            Evidência
          </h2>
          <a href={offer.pageUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={offer.pageUrl}
              alt="Página do encarte"
              className="max-h-[480px] rounded-lg border border-[var(--ds-color-border)] object-contain"
            />
          </a>
        </div>
      ) : null}

      {offer.rawText ? (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
            Raw text
          </h2>
          <pre className="overflow-auto rounded-lg border border-[var(--ds-color-border)] bg-zinc-950 p-3 text-xs text-[var(--ds-color-muted-foreground)]">
            {offer.rawText}
          </pre>
        </div>
      ) : null}

      {offer.extraction?.rawResponse ? (
        <details className="rounded-lg border border-[var(--ds-color-border)] bg-zinc-950 p-3">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
            Raw response da página
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto text-xs text-[var(--ds-color-muted-foreground)]">
            {offer.extraction.rawResponse}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
