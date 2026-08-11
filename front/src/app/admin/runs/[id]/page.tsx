"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatCurrency, formatDateTime, formatDuration } from "@/lib/format";

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as Id<"scrapingJobs">;
  const run = useQuery(api.scrapingJobs.get, { id });

  if (!run) {
    return <p className="text-sm text-zinc-500">Carregando execução…</p>;
  }

  return (
    <div>
      <PageHeader
        title={run.supermarket?.name ?? "Run"}
        description={`Run #${run._id.slice(-6)}`}
      />

      <div className="mb-4">
        <StatusBadge status={run.status} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-zinc-800 p-3 text-sm">
          <p className="text-zinc-500">Started</p>
          <p>{formatDateTime(run.startedAt)}</p>
        </div>
        <div className="rounded border border-zinc-800 p-3 text-sm">
          <p className="text-zinc-500">Finished</p>
          <p>{formatDateTime(run.finishedAt)}</p>
        </div>
        <div className="rounded border border-zinc-800 p-3 text-sm">
          <p className="text-zinc-500">Duration</p>
          <p>{formatDuration(run.duration)}</p>
        </div>
        <div className="rounded border border-zinc-800 p-3 text-sm">
          <p className="text-zinc-500">Query</p>
          <p>{run.query ?? run.type}</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-zinc-800 p-3 text-sm">
          <p className="text-zinc-500">Products found</p>
          <p className="text-lg">{run.productsFound ?? 0}</p>
        </div>
        <div className="rounded border border-zinc-800 p-3 text-sm">
          <p className="text-zinc-500">Products saved</p>
          <p className="text-lg">{run.productsSaved ?? 0}</p>
        </div>
        <div className="rounded border border-zinc-800 p-3 text-sm">
          <p className="text-zinc-500">Products failed</p>
          <p className="text-lg">{run.productsFailed}</p>
        </div>
        <div className="rounded border border-zinc-800 p-3 text-sm">
          <p className="text-zinc-500">Errors logged</p>
          <p className="text-lg">{run.errors.length}</p>
        </div>
      </div>

      {run.error ? (
        <section className="mb-6 rounded border border-rose-900 bg-rose-950/30 p-4 text-sm text-rose-200">
          {run.error}
        </section>
      ) : null}

      <section className="rounded border border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Produtos da execução</h2>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Preço</th>
            </tr>
          </thead>
          <tbody>
            {run.sampleProducts.map((p) => (
              <tr key={p._id} className="border-b border-zinc-900">
                <td className="px-3 py-2">
                  <Link href={`/admin/products/${p._id}`} className="hover:text-sky-400">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{formatCurrency(p.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Link href="/admin/runs" className="mt-4 inline-block text-sm text-sky-400 hover:underline">
        Voltar
      </Link>
    </div>
  );
}
