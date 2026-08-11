"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { BarChart } from "@/components/admin/BarChart";
import { MetricCard } from "@/components/admin/MetricCard";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  formatDateTime,
  formatNumber,
  formatRelative,
} from "@/lib/format";

export default function AdminOverviewPage() {
  const metrics = useQuery(api.dashboard.metrics);
  const recentRuns = useQuery(api.scrapingJobs.listRecent, { limit: 8 });

  if (!metrics) {
    return <p className="text-sm text-zinc-500">Carregando métricas…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Observabilidade e validação dos dados coletados"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Produtos" value={formatNumber(metrics.totalRawProducts)} />
        <MetricCard label="Supermercados" value={metrics.totalSupermarkets} />
        <MetricCard label="Preços coletados" value={formatNumber(metrics.totalPrices)} />
        <MetricCard label="Promoções" value={formatNumber(metrics.totalPromotions)} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Última execução"
          value={formatRelative(metrics.lastJob?.finishedAt ?? metrics.lastJob?.startedAt)}
          hint={formatDateTime(metrics.lastJob?.finishedAt ?? metrics.lastJob?.startedAt)}
        />
        <MetricCard
          label="Produtos coletados"
          value={formatNumber(metrics.lastJob?.productsSaved ?? 0)}
        />
        <MetricCard label="Runs com erro" value={metrics.failedScrapeRuns} />
        <MetricCard label="Erros abertos" value={metrics.openErrors} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 xl:col-span-1">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Scraper Status</h2>
          <div className="space-y-3">
            {metrics.supermarketStats.map((s) => (
              <div
                key={s._id}
                className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-zinc-200">{s.name}</p>
                  <p className="text-xs text-zinc-500">
                    Última coleta: {formatDateTime(s.lastCollectedAt)}
                  </p>
                </div>
                <span className={s.isOnline ? "text-emerald-400" : "text-rose-400"}>
                  {s.isOnline ? "● Online" : "● Offline"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">
            Produtos por supermercado
          </h2>
          <BarChart items={metrics.productsBySupermarket.map((s) => ({
            label: s.name,
            value: s.count,
          }))} />
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Scraper Health</h2>
          <BarChart
            items={metrics.supermarketStats.map((s) => ({
              label: s.name,
              value: s.health,
            }))}
          />
        </section>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Produtos por status</h2>
          <BarChart
            items={[
              { label: "Validated", value: metrics.statusCounts.validated },
              { label: "Pending", value: metrics.statusCounts.pending },
              { label: "Suspicious", value: metrics.statusCounts.suspicious },
              { label: "Invalid", value: metrics.statusCounts.invalid },
            ]}
          />
        </section>
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Execuções</h2>
          <BarChart
            items={[
              { label: "Success", value: metrics.runsByStatus.completed },
              { label: "Failed", value: metrics.runsByStatus.failed },
              { label: "Running", value: metrics.runsByStatus.running },
            ]}
          />
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-300">Últimas execuções</h2>
          <Link href="/admin/runs" className="text-xs text-sky-400 hover:underline">
            Ver todas
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Supermercado</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Produtos</th>
                <th className="px-3 py-2">Erros</th>
                <th className="px-3 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {(recentRuns ?? []).map((run) => (
                <tr key={run._id} className="border-b border-zinc-900">
                  <td className="px-3 py-2">
                    <Link href={`/admin/runs/${run._id}`} className="hover:text-sky-400">
                      {run.supermarketName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-3 py-2">{run.productsSaved ?? 0}</td>
                  <td className="px-3 py-2">{run.productsFailed}</td>
                  <td className="px-3 py-2">{formatDateTime(run.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
