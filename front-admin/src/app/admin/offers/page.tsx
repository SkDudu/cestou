"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/format";

export default function OffersPage() {
  const names = useQuery(api.supermarkets.listNames);
  const [supermarketId, setSupermarketId] = useState("");
  const [validationStatus, setValidationStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const validateAllPending = useMutation(api.offers.validateAllPending);
  const { results, status, loadMore } = usePaginatedQuery(
    api.offers.list,
    {
      supermarketId: supermarketId
        ? (supermarketId as Id<"supermarkets">)
        : undefined,
      validationStatus: validationStatus
        ? (validationStatus as
            | "pending"
            | "validated"
            | "rejected"
            | "suspicious")
        : undefined,
    },
    { initialNumItems: 40 },
  );

  async function onValidateAll() {
    const scope = supermarketId
      ? "deste supermercado"
      : "de todos os supermercados";
    if (
      !confirm(
        `Validar todas as ofertas pendentes ${scope}? Esta ação não pode ser desfeita facilmente.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await validateAllPending({
        supermarketId: supermarketId
          ? (supermarketId as Id<"supermarkets">)
          : undefined,
      });
      alert(`${result.updated} oferta(s) validada(s).`);
    } catch (err) {
      alert(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Ofertas" description="Ofertas extraídas de encartes">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onValidateAll()}
          className="rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-950 disabled:opacity-50"
        >
          {busy ? "Validando…" : "Validar todas"}
        </button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={supermarketId}
          onChange={(e) => setSupermarketId(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        >
          <option value="">Todos</option>
          {(names ?? []).map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={validationStatus}
          onChange={(e) => setValidationStatus(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        >
          <option value="">Todos status</option>
          <option value="pending">pending</option>
          <option value="validated">validated</option>
          <option value="suspicious">suspicious</option>
          <option value="rejected">rejected</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Mercado</th>
              <th className="px-3 py-2">Preço</th>
              <th className="px-3 py-2">Conf.</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Criado</th>
            </tr>
          </thead>
          <tbody>
            {results.map((o) => (
              <tr key={o._id} className="border-b border-zinc-900">
                <td className="px-3 py-2">
                  <Link href={`/admin/offers/${o._id}`} className="hover:underline">
                    {o.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-zinc-400">{o.supermarketName}</td>
                <td className="px-3 py-2">{formatCurrency(o.price)}</td>
                <td className="px-3 py-2 text-zinc-500">
                  {o.extractionConfidence != null
                    ? `${Math.round(o.extractionConfidence * 100)}%`
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={o.validationStatus} />
                </td>
                <td className="px-3 py-2 text-zinc-500">
                  {formatDateTime(o.createdAt)}
                </td>
              </tr>
            ))}
            {!results.length && status !== "LoadingFirstPage" ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  Nenhuma oferta
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {status === "CanLoadMore" ? (
        <button
          type="button"
          onClick={() => loadMore(40)}
          className="mt-4 rounded-md border border-zinc-700 px-3 py-1.5 text-sm"
        >
          Carregar mais
        </button>
      ) : null}
    </div>
  );
}
