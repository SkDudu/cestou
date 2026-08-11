"use client";

import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/format";

export default function ErrorsPage() {
  const [pageSize, setPageSize] = useState(20);
  const { results, status, loadMore } = usePaginatedQuery(
    api.scrapeErrors.list,
    { status: "open" },
    { initialNumItems: pageSize },
  );

  return (
    <div>
      <PageHeader title="Errors" description="Erros de scraping e parsing" />

      <div className="mb-4">
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
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Supermercado</th>
              <th className="px-3 py-2">Query</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Mensagem</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(results ?? []).map((error) => (
              <tr key={error._id} className="border-b border-zinc-900">
                <td className="px-3 py-2">{formatDateTime(error.createdAt)}</td>
                <td className="px-3 py-2">{error.supermarketName}</td>
                <td className="px-3 py-2">{error.query ?? "—"}</td>
                <td className="px-3 py-2">{error.type}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/errors/${error._id}`} className="hover:text-sky-400">
                    {error.message.slice(0, 80)}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={error.status} />
                </td>
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
