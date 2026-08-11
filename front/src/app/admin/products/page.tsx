"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/format";

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [supermarketId, setSupermarketId] = useState<string>("");
  const [promotionOnly, setPromotionOnly] = useState(false);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [pageSize, setPageSize] = useState(20);

  const supermarkets = useQuery(api.supermarkets.list);
  const { results, status, loadMore } = usePaginatedQuery(
    api.rawProducts.list,
    {
      search: search || undefined,
      supermarketId: supermarketId
        ? (supermarketId as Id<"supermarkets">)
        : undefined,
      promotionOnly: promotionOnly || undefined,
      incompleteOnly: incompleteOnly || undefined,
    },
    { initialNumItems: pageSize },
  );

  const products = useMemo(() => results ?? [], [results]);

  return (
    <div>
      <PageHeader
        title="Products"
        description="Listagem de produtos coletados por supermercado"
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto..."
          className="min-w-64 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        />
        <select
          value={supermarketId}
          onChange={(e) => setSupermarketId(e.target.value)}
          className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="">Todos supermercados</option>
          {(supermarkets ?? []).map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={promotionOnly}
            onChange={(e) => setPromotionOnly(e.target.checked)}
          />
          Somente promocionais
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={incompleteOnly}
            onChange={(e) => setIncompleteOnly(e.target.checked)}
          />
          Dados incompletos
        </label>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value={20}>20 / página</option>
          <option value={50}>50 / página</option>
          <option value={100}>100 / página</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Imagem</th>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Marca</th>
              <th className="px-3 py-2">Supermercado</th>
              <th className="px-3 py-2">Preço</th>
              <th className="px-3 py-2">Anterior</th>
              <th className="px-3 py-2">Desconto</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Coleta</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                <td className="px-3 py-2">
                  {p.displayImageUrl ?? p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.displayImageUrl ?? p.imageUrl!}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-800 text-xs text-zinc-500">
                      —
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/admin/products/${p._id}`} className="hover:text-sky-400">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{p.brand ?? "—"}</td>
                <td className="px-3 py-2">{p.supermarketName}</td>
                <td className="px-3 py-2">{formatCurrency(p.price)}</td>
                <td className="px-3 py-2">
                  {p.originalPrice ? formatCurrency(p.originalPrice) : "—"}
                </td>
                <td className="px-3 py-2">
                  {p.discount > 0 ? `-${p.discount}%` : "—"}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge
                    status={
                      p.validationStatus === "pending" && p.isIncomplete
                        ? "suspicious"
                        : p.validationStatus
                    }
                  />
                </td>
                <td className="px-3 py-2">{formatDateTime(p.collectedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status === "CanLoadMore" ? (
        <button
          onClick={() => loadMore(pageSize)}
          className="mt-4 rounded border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900"
        >
          Carregar mais
        </button>
      ) : null}
    </div>
  );
}
