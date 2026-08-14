"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { MetricCard } from "@/components/admin/MetricCard";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, formatNumber } from "@/lib/format";

export default function AdminOverviewPage() {
  const metrics = useQuery(api.dashboard.metrics);

  if (metrics === undefined) {
    return <p className="text-sm text-zinc-500">Carregando…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Pipeline flyer-first — encartes e ofertas"
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Supermercados" value={formatNumber(metrics.supermarkets)} />
        <MetricCard label="Encartes ativos" value={formatNumber(metrics.activeFlyers)} />
        <MetricCard label="Processados" value={formatNumber(metrics.processedFlyers)} />
        <MetricCard label="Parciais" value={formatNumber(metrics.partialFlyers)} />
        <MetricCard label="Ofertas" value={formatNumber(metrics.offersExtracted)} />
        <MetricCard label="Validadas" value={formatNumber(metrics.offersValidated)} />
        <MetricCard label="Pendentes" value={formatNumber(metrics.offersPending)} />
        <MetricCard label="Rejeitadas" value={formatNumber(metrics.offersRejected)} />
        <MetricCard label="Erros abertos" value={formatNumber(metrics.extractionErrors)} />
        <MetricCard
          label="Páginas MiMo"
          value={formatNumber(metrics.offersMimoPages)}
        />
        <MetricCard
          label="Páginas Tesseract"
          value={formatNumber(metrics.offersTesseractPages)}
        />
        <MetricCard label="Falhas IA" value={formatNumber(metrics.aiFailures)} />
        <MetricCard
          label="Latência média"
          value={`${formatNumber(metrics.avgExtractionLatencyMs)} ms`}
        />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Encartes recentes
      </h2>
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Validade</th>
              <th className="px-3 py-2">Criado</th>
            </tr>
          </thead>
          <tbody>
            {metrics.recentFlyers.map((f) => (
              <tr key={f._id} className="border-b border-zinc-900">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/flyers/${f._id}`}
                    className="text-zinc-200 hover:underline"
                  >
                    {f.title ?? "Sem título"}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={f.status} />
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  {formatDateTime(f.validFrom)} → {formatDateTime(f.validUntil)}
                </td>
                <td className="px-3 py-2 text-zinc-500">
                  {formatDateTime(f.createdAt)}
                </td>
              </tr>
            ))}
            {!metrics.recentFlyers.length ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  Nenhum encarte ainda. Use o{" "}
                  <Link href="/admin/scraper" className="text-zinc-300 underline">
                    Flow Builder
                  </Link>
                  .
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
