"use client";

import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/format";

export default function ErrorsPage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.flyerErrors.list,
    { status: "open" },
    { initialNumItems: 30 },
  );

  return (
    <div>
      <PageHeader title="Erros" description="Falhas do pipeline de encartes" />
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Mercado</th>
              <th className="px-3 py-2">Mensagem</th>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((e) => (
              <tr key={e._id} className="border-b border-zinc-900">
                <td className="px-3 py-2 font-mono text-xs">{e.stage}</td>
                <td className="px-3 py-2 text-zinc-400">{e.supermarketName}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/errors/${e._id}`} className="hover:underline">
                    {e.message.slice(0, 120)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-zinc-500">
                  {formatDateTime(e.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={e.status} />
                </td>
              </tr>
            ))}
            {!results.length && status !== "LoadingFirstPage" ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                  Sem erros abertos
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {status === "CanLoadMore" ? (
        <button
          type="button"
          onClick={() => loadMore(30)}
          className="mt-4 rounded-md border border-zinc-700 px-3 py-1.5 text-sm"
        >
          Carregar mais
        </button>
      ) : null}
    </div>
  );
}
