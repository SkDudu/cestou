"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { MetricCard } from "@/components/admin/MetricCard";
import { PageHeader } from "@/components/admin/PageHeader";
import { formatDateTime, formatNumber } from "@/lib/format";

export default function SupermarketsPage() {
  const supermarkets = useQuery(api.supermarkets.list);

  if (!supermarkets) {
    return <p className="text-sm text-zinc-500">Carregando…</p>;
  }

  return (
    <div>
      <PageHeader title="Supermarkets" description="Status por supermercado" />

      <div className="grid gap-4 md:grid-cols-2">
        {supermarkets.map((s) => (
          <Link
            key={s._id}
            href={`/admin/supermarkets/${s._id}`}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-medium text-zinc-100">{s.name}</h2>
              <span className={s.isOnline ? "text-emerald-400" : "text-rose-400"}>
                {s.isOnline ? "✓" : "✗"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MetricCard label="Produtos" value={formatNumber(s.productCount)} />
              <MetricCard
                label="Última coleta"
                value={formatDateTime(s.lastCollectedAt)}
              />
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Promoções: {s.promotionCount} · Taxa sucesso: {s.successRate}%
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
