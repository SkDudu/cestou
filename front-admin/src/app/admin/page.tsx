"use client";

import Link from "next/link";
import { useAdminOverview } from "@/lib/use-admin-overview";

const cards = [
  { key: "supermarkets", label: "Redes ativas", href: "/admin/supermarkets" },
  { key: "activeFlows", label: "Fluxos ativos", href: "/admin/scraper" },
  { key: "runningRuns", label: "Execuções em curso", href: "/admin/scraper" },
  { key: "failedFlyers", label: "Encartes com falha", href: "/admin/flyers" },
] as const;

export default function AdminOverviewPage() {
  const { data, error, loading } = useAdminOverview();

  return <section className="mx-auto max-w-6xl space-y-7"><header><p className="text-sm font-medium text-emerald-700">Cestou Ops</p><h1 className="mt-1 text-3xl font-semibold">Visão geral</h1><p className="mt-2 text-sm text-slate-500">Indicadores operacionais calculados no PostgreSQL.</p></header>{error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar o painel.</p> : loading ? <p className="text-sm text-slate-500">Carregando indicadores…</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card) => <Link key={card.key} href={card.href} className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-emerald-400"><p className="text-sm text-slate-500">{card.label}</p><p className="mt-3 text-3xl font-semibold tabular-nums">{data?.[card.key] ?? 0}</p></Link>)}</div>}<div className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">Próximas ações</h2><p className="mt-2 text-sm text-slate-500">Acompanhe execuções e inicie fluxos no painel de Workers. As atualizações de execução usam eventos SSE persistidos.</p><Link href="/admin/scraper" className="mt-4 inline-flex rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Abrir Workers</Link></div></section>;
}
