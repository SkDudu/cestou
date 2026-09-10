"use client";

import { useEffect, useState } from "react";
import { ApiError, adminApi } from "@/lib/api";

type Flow = Awaited<ReturnType<typeof adminApi.scraperFlows>>[number];

function runStatus(status?: string) {
  if (!status) return "Sem execução";
  return status.toLowerCase().replace("_", " ");
}

export default function ScraperFlowsPage() {
  const [flows, setFlows] = useState<Flow[]>();
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState<string>();

  async function load() {
    try {
      setError(undefined);
      setFlows(await adminApi.scraperFlows());
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 401 ? "Sua sessão expirou." : "Não foi possível carregar os fluxos.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function start(flowId: string) {
    setStarting(flowId);
    try {
      await adminApi.startScraperRun(flowId);
      await load();
    } catch {
      setError("Não foi possível iniciar o worker.");
    } finally {
      setStarting(undefined);
    }
  }

  return <section className="mx-auto max-w-6xl space-y-6"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-emerald-700">Operação</p><h1 className="text-3xl font-semibold">Workers de scraper</h1><p className="mt-1 text-sm text-slate-500">Fluxos persistidos no PostgreSQL e executados pela fila pg-boss.</p></div><button onClick={() => void load()} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Atualizar</button></header>{error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}{!flows ? <p className="text-sm text-slate-500">Carregando fluxos…</p> : flows.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Nenhum fluxo configurado.</p> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Fluxo</th><th className="px-4 py-3">Rede</th><th className="px-4 py-3">Última execução</th><th className="px-4 py-3">Resultado</th><th className="px-4 py-3" /></tr></thead><tbody>{flows.map((flow) => <tr key={flow.id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-medium">{flow.name}</p><p className="truncate text-xs text-slate-500">{flow.startUrl}</p></td><td className="px-4 py-3">{flow.supermarket.name}</td><td className="px-4 py-3">{flow.latestRun ? new Date(flow.latestRun.startedAt).toLocaleString("pt-BR") : "—"}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium">{runStatus(flow.latestRun?.status)}</span></td><td className="px-4 py-3 text-right"><button disabled={starting === flow.id} onClick={() => void start(flow.id)} className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{starting === flow.id ? "Iniciando…" : "Executar"}</button></td></tr>)}</tbody></table></div>}</section>;
}
