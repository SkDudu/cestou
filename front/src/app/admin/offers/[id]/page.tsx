"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/format";

export default function OfferDetailPage() {
  const params = useParams();
  const id = params.id as Id<"offers">;
  const offer = useQuery(api.offers.get, { id });
  const setStatus = useMutation(api.offers.setValidationStatus);

  if (offer === undefined) {
    return <p className="text-sm text-zinc-500">Carregando…</p>;
  }
  if (!offer) {
    return <p className="text-sm text-rose-400">Não encontrado</p>;
  }

  return (
    <div>
      <PageHeader title={offer.name} description={offer.supermarket?.name}>
        <StatusBadge status={offer.validationStatus} />
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        {(["validated", "suspicious", "rejected"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus({ id, validationStatus: s })}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-900"
          >
            {s}
          </button>
        ))}
      </div>

      <dl className="mb-6 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Preço</dt>
          <dd className="text-lg font-medium">{formatCurrency(offer.price)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">De</dt>
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
          <dt className="text-zinc-500">Quantidade</dt>
          <dd>{offer.quantity ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Página</dt>
          <dd>{offer.pageNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Validade</dt>
          <dd>
            {formatDateTime(offer.validFrom)} → {formatDateTime(offer.validUntil)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Encarte</dt>
          <dd>
            <Link href={`/admin/flyers/${offer.flyerId}`} className="hover:underline">
              {offer.flyer?.title ?? offer.flyerId}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Extração</dt>
          <dd>
            {offer.extraction
              ? `${offer.extraction.provider}${offer.extraction.model ? ` · ${offer.extraction.model}` : ""} · ${offer.extraction.status}`
              : "—"}
          </dd>
        </div>
      </dl>

      {offer.pageUrl ? (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Evidência
          </h2>
          <a href={offer.pageUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={offer.pageUrl}
              alt="Página do encarte"
              className="max-h-[480px] rounded-lg border border-zinc-800 object-contain"
            />
          </a>
        </div>
      ) : null}

      {offer.rawText ? (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Raw text
          </h2>
          <pre className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
            {offer.rawText}
          </pre>
        </div>
      ) : null}

      {offer.extraction?.rawResponse ? (
        <details className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Raw response da página
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto text-xs text-zinc-400">
            {offer.extraction.rawResponse}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
