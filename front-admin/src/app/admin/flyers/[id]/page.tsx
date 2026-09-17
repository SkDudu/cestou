"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ApiError, adminApi } from "@/lib/api";
import { flyerPageSrc } from "@/lib/flyer-media";
import { formatCurrency, formatDateTime, formatInstallment } from "@/lib/format";
import { flyerDisplayStatus, ms } from "@/lib/workers";

type Flyer = Awaited<ReturnType<typeof adminApi.flyer>>;
type FlyerError = Awaited<ReturnType<typeof adminApi.extractionErrors>>[number];

function money(value: string | number) {
  return formatCurrency(Number(value));
}

export default function FlyerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [flyer, setFlyer] = useState<Flyer | null>();
  const [errors, setErrors] = useState<FlyerError[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([adminApi.flyer(id), adminApi.extractionErrors()]).then(
      ([row, allErrors]) => {
        if (!alive) return;
        setFlyer(row);
        setErrors(allErrors.filter((item) => item.flyer?.id === id && item.status === "open"));
      },
      (cause: unknown) => {
        if (!alive) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setFlyer(null);
          setError("Não encontrado");
          return;
        }
        setFlyer(null);
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar o encarte.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>;
  }
  if (!flyer) {
    return <p className="ds-meta">Carregando…</p>;
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/flyers" className="hover:underline">
          Encartes
        </Link>
        {" / "}
        Detalhe
      </p>
      <PageHeader
        title={flyer.title ?? "Encarte"}
        description={flyer.supermarket.name}
      >
        <StatusBadge
          status={flyerDisplayStatus(
            flyer.status,
            flyer.offers.filter((o) => o.validationStatus.toUpperCase() === "VALIDATED").length,
          )}
        />
      </PageHeader>

      <dl className="mb-6 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Validade</dt>
          <dd>
            {formatDateTime(ms(flyer.validFrom))} → {formatDateTime(ms(flyer.validUntil))}
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
          <dd className="font-mono text-xs text-[var(--ds-color-muted-foreground)]">
            {flyer.fileHash ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Ofertas</dt>
          <dd>{flyer.offers.length}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Fonte</dt>
          <dd>{flyer.source.type}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Rede</dt>
          <dd>
            <Link href={`/admin/supermarkets/${flyer.supermarket.id}`} className="hover:underline">
              {flyer.supermarket.name}
            </Link>
          </dd>
        </div>
      </dl>

      {errors.length ? (
        <section className="mb-6 rounded-[10px] border border-[var(--ds-color-danger)]/40 p-4">
          <h2 className="text-sm font-semibold text-[var(--ds-color-danger)]">
            Erros do encarte
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {errors.map((item) => (
              <li key={item.id}>
                <Link href={`/admin/extraction/errors/${item.id}`} className="hover:underline">
                  <span className="font-mono text-xs">{item.stage}</span>
                  {" · "}
                  {item.message}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
        Páginas
      </h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {flyer.pages.map((page) => {
          const href = flyerPageSrc(page.filePath, flyer.id, page.pageNumber);
          return (
            <a
              key={page.id}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="block ds-table-card"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={href}
                alt={`Página ${page.pageNumber}`}
                className="aspect-[3/4] w-full object-cover object-top"
              />
              <p className="px-2 py-1 text-xs text-[var(--ds-color-muted-foreground)]">
                Página {page.pageNumber}
              </p>
            </a>
          );
        })}
        {!flyer.pages.length ? (
          <p className="text-sm text-[var(--ds-color-muted-foreground)]">Sem páginas.</p>
        ) : null}
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
            {flyer.offers.map((o) => {
              const installment = formatInstallment({
                installmentCount: o.installmentCount,
                installmentAmount:
                  o.installmentAmount == null ? null : Number(o.installmentAmount),
                installmentInterestFree: o.installmentInterestFree,
              });
              return (
                <tr key={o.id} className="border-b border-[var(--ds-color-border)]">
                  <td className="px-3 py-2">
                    <Link href={`/admin/offers/${o.id}`} className="hover:underline">
                      {o.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {money(o.price)}
                    {installment ? (
                      <span className="mt-0.5 block text-[11px] text-[var(--ds-color-muted-foreground)]">
                        {installment}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{o.pageNumber ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={o.validationStatus.toLowerCase()} />
                  </td>
                </tr>
              );
            })}
            {!flyer.offers.length ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-[var(--ds-color-muted-foreground)]"
                >
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
