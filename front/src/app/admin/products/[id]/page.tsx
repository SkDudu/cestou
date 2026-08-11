"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/format";

const invalidReasons = [
  "Preço incorreto",
  "Produto incorreto",
  "Produto duplicado",
  "Imagem incorreta",
  "Marca incorreta",
  "Unidade incorreta",
  "Produto indisponível",
  "Outro",
];

export default function ProductDetailPage() {
  const params = useParams();
  const id = params.id as Id<"rawProducts">;
  const product = useQuery(api.rawProducts.get, { id });
  const setValidation = useMutation(api.productValidations.set);
  const [reason, setReason] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [showInvalidForm, setShowInvalidForm] = useState(false);

  if (!product) {
    return <p className="text-sm text-zinc-500">Carregando produto…</p>;
  }

  async function validate(status: "validated" | "suspicious" | "invalid") {
    await setValidation({
      rawProductId: id,
      status,
      reason: reason.join(", ") || undefined,
      notes: notes || undefined,
    });
    setShowInvalidForm(false);
  }

  return (
    <div>
      <PageHeader
        title={product.name}
        description={`${product.supermarket?.name ?? "—"} · ${product.externalId ?? "sem external ID"}`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => validate("validated")}
          className="rounded bg-emerald-900 px-3 py-1.5 text-sm text-emerald-200"
        >
          ✓ Validar
        </button>
        <button
          onClick={() => validate("suspicious")}
          className="rounded bg-amber-900 px-3 py-1.5 text-sm text-amber-200"
        >
          ⚠ Marcar suspeito
        </button>
        <button
          onClick={() => setShowInvalidForm(true)}
          className="rounded bg-rose-900 px-3 py-1.5 text-sm text-rose-200"
        >
          ✗ Invalidar
        </button>
        {product.url ? (
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-900"
          >
            Abrir produto
          </a>
        ) : null}
        <Link href="/admin/products" className="rounded border border-zinc-700 px-3 py-1.5 text-sm">
          Voltar
        </Link>
      </div>

      {product.validation ? (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={product.validation.status} />
            {product.validation.source ? (
              <span className="text-xs text-zinc-500">
                source: {product.validation.source}
              </span>
            ) : null}
            {product.validation.rulesVersion ? (
              <span className="text-xs text-zinc-500">
                {product.validation.rulesVersion}
              </span>
            ) : null}
            {product.validation.automatedStatus &&
            product.validation.automatedStatus !== product.validation.status ? (
              <span className="text-xs text-zinc-500">
                rules said: {product.validation.automatedStatus}
              </span>
            ) : null}
          </div>
          {product.validation.issues && product.validation.issues.length > 0 ? (
            <ul className="space-y-1 text-sm text-zinc-400">
              {product.validation.issues.map((issue, i) => (
                <li key={`${issue.code}-${i}`}>
                  {issue.severity === "error"
                    ? "✗"
                    : issue.severity === "warning"
                      ? "⚠"
                      : "ℹ"}{" "}
                  {issue.message}
                  <span className="ml-1 text-xs text-zinc-600">({issue.code})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">Sem issues</p>
          )}
        </div>
      ) : (
        <p className="mb-4 text-sm text-zinc-500">Validação: pending (ainda sem regras)</p>
      )}

      {showInvalidForm ? (
        <div className="mb-6 rounded border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="mb-2 text-sm font-medium">Motivo</p>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {invalidReasons.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reason.includes(r)}
                  onChange={(e) =>
                    setReason((prev) =>
                      e.target.checked ? [...prev, r] : prev.filter((x) => x !== r),
                    )
                  }
                />
                {r}
              </label>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observação"
            className="mb-3 w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-sm"
            rows={3}
          />
          <button
            onClick={() => validate("invalid")}
            className="rounded bg-rose-900 px-3 py-1.5 text-sm text-rose-200"
          >
            Confirmar invalidação
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-zinc-800 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">Informações coletadas</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Marca</dt><dd>{product.brand ?? product.product?.brand ?? "—"}</dd></div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Brand source</dt>
              <dd>
                {product.brandSource ?? product.product?.brandSource ?? "—"}
                {(product.brandConfidence ?? product.product?.brandConfidence) != null
                  ? ` (${(((product.brandConfidence ?? product.product?.brandConfidence) as number) * 100).toFixed(0)}%)`
                  : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Quantidade</dt><dd>{product.product?.quantity ?? "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Unidade</dt><dd>{product.product?.unit ?? "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Preço</dt><dd>{formatCurrency(product.price)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Preço original</dt><dd>{product.originalPrice ? formatCurrency(product.originalPrice) : "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Desconto</dt><dd>{product.discount > 0 ? `-${product.discount}%` : "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Coleta</dt><dd>{formatDateTime(product.collectedAt)}</dd></div>
          </dl>
          <div className="mt-4">
            <p className="mb-1 text-xs text-zinc-500">Data Quality</p>
            <div className="h-2 rounded bg-zinc-800">
              <div
                className="h-2 rounded bg-emerald-500"
                style={{ width: `${product.qualityScore}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-400">{product.qualityScore}%</p>
          </div>
        </section>

        <section className="rounded border border-zinc-800 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">Histórico de preço</h2>
          {product.priceHistory.length === 0 ? (
            <p className="text-sm text-zinc-500">Sem histórico</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {product.priceHistory.map((p, i) => (
                <li key={i} className="flex justify-between border-b border-zinc-900 pb-2">
                  <span>{formatDateTime(p.collectedAt)}</span>
                  <span>{formatCurrency(p.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-4 rounded border border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Raw Data</h2>
        <pre className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
          {JSON.stringify(product.rawData ?? product, null, 2)}
        </pre>
      </section>
    </div>
  );
}
