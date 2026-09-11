"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ApiError, adminApi } from "@/lib/api";
import { offerCondition } from "@/lib/eligibility";
import {
  formatCurrency,
  formatDateTime,
  formatInstallment,
  formatPack,
  formatPercent,
} from "@/lib/format";
import { ms } from "@/lib/workers";

type Offer = Awaited<ReturnType<typeof adminApi.offer>>;

const STATUS_ACTIONS = [
  { id: "VALIDATED", label: "validated" },
  { id: "SUSPICIOUS", label: "suspicious" },
  { id: "REJECTED", label: "rejected" },
] as const;

function money(value: string | number | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export default function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [offer, setOffer] = useState<Offer | null>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void adminApi.offer(id).then(
      (row) => alive && setOffer(row),
      (cause: unknown) => {
        if (!alive) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setOffer(null);
          setError("Não encontrado");
          return;
        }
        setOffer(null);
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar a oferta.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  async function setStatus(validationStatus: (typeof STATUS_ACTIONS)[number]["id"]) {
    if (!offer) return;
    setBusy(true);
    try {
      await adminApi.updateOfferValidation(id, validationStatus);
      setOffer({ ...offer, validationStatus });
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>;
  }
  if (!offer) {
    return <p className="ds-meta">Carregando…</p>;
  }

  const price = money(offer.price) ?? 0;
  const original = money(offer.originalPrice);
  const cash = money(offer.cashPrice);
  const discount = money(offer.discountPercentage);
  const conf = offer.eligibilityConfidence;
  const condition = offerCondition(offer);
  const installment = formatInstallment({
    installmentCount: offer.installmentCount,
    installmentAmount: money(offer.installmentAmount),
    installmentInterestFree: offer.installmentInterestFree,
  });

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/offers" className="hover:underline">
          Ofertas
        </Link>
        {" / "}
        Detalhe
      </p>
      <PageHeader title={offer.name} description={offer.supermarket.name}>
        <StatusBadge status={offer.validationStatus.toLowerCase()} />
        {offer.eligibilityStatus ? (
          <StatusBadge status={offer.eligibilityStatus.toLowerCase()} />
        ) : null}
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_ACTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => void setStatus(s.id)}
            className="rounded-md border border-[var(--ds-color-border)] px-3 py-1.5 text-sm"
          >
            {s.label}
          </button>
        ))}
      </div>

      <dl className="mb-6 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Preço</dt>
          <dd className="text-lg font-medium">{formatCurrency(price)}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">À vista</dt>
          <dd>{cash != null ? formatCurrency(cash) : "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Parcelas</dt>
          <dd>{installment ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">De</dt>
          <dd>
            {original != null ? formatCurrency(original) : "—"}
            {discount != null ? ` (${discount}% OFF)` : ""}
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
            {formatDateTime(ms(offer.validFrom))} → {formatDateTime(ms(offer.validUntil))}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Encarte</dt>
          <dd>
            {offer.flyer ? (
              <Link href={`/admin/flyers/${offer.flyer.id}`} className="hover:underline">
                {offer.flyer.title ?? offer.flyer.id}
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
          <dt className="text-[var(--ds-color-muted-foreground)]">Canônico</dt>
          <dd>
            {offer.canonicalProduct ? (
              <Link
                href={`/admin/products/${offer.canonicalProduct.id}`}
                className="hover:underline"
              >
                {offer.canonicalProduct.canonicalName}
              </Link>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Marca</dt>
          <dd>
            {offer.brandRecord ? (
              <Link href="/admin/brands" className="hover:underline">
                {offer.brandRecord.name}
              </Link>
            ) : (
              offer.normalizedBrand ?? offer.brand ?? "—"
            )}
          </dd>
        </div>
      </dl>

      <section className="ds-card mb-6 space-y-4 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
          Condição do preço
        </h2>
        <p className="text-sm">
          {condition.text}
          {conf != null ? ` · confiança ${formatPercent(conf)}` : ""}
        </p>
      </section>

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
    </div>
  );
}
