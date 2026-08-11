"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { MetricCard } from "@/components/admin/MetricCard";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, formatNumber } from "@/lib/format";

export default function SupermarketDetailPage() {
  const params = useParams();
  const id = params.id as Id<"supermarkets">;
  const supermarket = useQuery(api.supermarkets.get, { id });

  if (!supermarket) {
    return <p className="text-sm text-zinc-500">Carregando…</p>;
  }

  return (
    <div>
      <PageHeader
        title={supermarket.name}
        description={supermarket.website ?? supermarket.slug}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Produtos coletados" value={formatNumber(supermarket.productCount)} />
        <MetricCard label="Produtos válidos" value={supermarket.validCount} />
        <MetricCard label="Produtos inválidos" value={supermarket.invalidCount} />
        <MetricCard label="Promoções" value={supermarket.promotionCount} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <MetricCard
          label="Última execução"
          value={formatDateTime(supermarket.lastCollectedAt)}
        />
        <MetricCard label="Taxa de sucesso" value={`${supermarket.successRate}%`} />
      </div>

      <section className="rounded border border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Execuções recentes</h2>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Query</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Salvos</th>
              <th className="px-3 py-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {supermarket.recentJobs.map((job) => (
              <tr key={job._id} className="border-b border-zinc-900">
                <td className="px-3 py-2">
                  <Link href={`/admin/runs/${job._id}`} className="hover:text-sky-400">
                    {job.query ?? job.type}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-3 py-2">{job.productsSaved ?? 0}</td>
                <td className="px-3 py-2">{formatDateTime(job.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
