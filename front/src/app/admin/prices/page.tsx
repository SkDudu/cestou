"use client";

import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { formatCurrency } from "@/lib/format";

export default function PricesPage() {
  const [sortBy, setSortBy] = useState<"discount" | "price" | "date">("discount");
  const [pageSize, setPageSize] = useState(20);
  const { results, status, loadMore } = usePaginatedQuery(
    api.prices.listPromotions,
    { sortBy },
    { initialNumItems: pageSize },
  );

  return (
    <div>
      <PageHeader title="Prices" description="Promoções e comparação de preços" />

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "discount" | "price" | "date")}
          className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="discount">Maior desconto</option>
          <option value="price">Menor preço</option>
          <option value="date">Mais recente</option>
        </select>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value={20}>20 / página</option>
          <option value={50}>50 / página</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Supermercado</th>
              <th className="px-3 py-2">Atual</th>
              <th className="px-3 py-2">Anterior</th>
              <th className="px-3 py-2">Desconto</th>
            </tr>
          </thead>
          <tbody>
            {(results ?? []).map((p) => (
              <tr key={p._id} className="border-b border-zinc-900">
                <td className="px-3 py-2">
                  <Link href={`/admin/products/${p._id}`} className="hover:text-sky-400">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{p.supermarketName}</td>
                <td className="px-3 py-2">{formatCurrency(p.price)}</td>
                <td className="px-3 py-2">
                  {p.originalPrice ? formatCurrency(p.originalPrice) : "—"}
                </td>
                <td className="px-3 py-2">-{p.discount}%</td>
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
