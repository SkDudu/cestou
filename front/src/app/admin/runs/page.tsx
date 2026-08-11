"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, formatDuration } from "@/lib/format";

export default function RunsPage() {
  const [supermarketId, setSupermarketId] = useState("");
  const [status, setStatus] = useState("");
  const [queryFilter, setQueryFilter] = useState("");
  const [pageSize, setPageSize] = useState(20);

  const supermarkets = useQuery(api.supermarkets.list);
  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.scrapingJobs.list,
    {
      supermarketId: supermarketId
        ? (supermarketId as Id<"supermarkets">)
        : undefined,
      status: status
        ? (status as "pending" | "running" | "completed" | "failed")
        : undefined,
      query: queryFilter || undefined,
    },
    { initialNumItems: pageSize },
  );

  return (
    <div>
      <PageHeader title="Runs" description="Execuções do scraper" />

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={supermarketId}
          onChange={(e) => setSupermarketId(e.target.value)}
          className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="">Supermercado</option>
          {(supermarkets ?? []).map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="">Status</option>
          <option value="completed">Completed</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
        </select>
        <input
          value={queryFilter}
          onChange={(e) => setQueryFilter(e.target.value)}
          placeholder="Query"
          className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        />
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
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Supermercado</th>
              <th className="px-3 py-2">Query</th>
              <th className="px-3 py-2">Encontrados</th>
              <th className="px-3 py-2">Salvos</th>
              <th className="px-3 py-2">Erros</th>
              <th className="px-3 py-2">Duração</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {(results ?? []).map((run) => (
              <tr key={run._id} className="border-b border-zinc-900">
                <td className="px-3 py-2">
                  <Link href={`/admin/runs/${run._id}`} className="hover:text-sky-400">
                    {run._id.slice(-6)}
                  </Link>
                </td>
                <td className="px-3 py-2">{run.supermarketName}</td>
                <td className="px-3 py-2">{run.query ?? "—"}</td>
                <td className="px-3 py-2">{run.productsFound ?? 0}</td>
                <td className="px-3 py-2">{run.productsSaved ?? 0}</td>
                <td className="px-3 py-2">{run.productsFailed}</td>
                <td className="px-3 py-2">{formatDuration(run.duration)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={run.status} />
                </td>
                <td className="px-3 py-2">{formatDateTime(run.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageStatus === "CanLoadMore" ? (
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
