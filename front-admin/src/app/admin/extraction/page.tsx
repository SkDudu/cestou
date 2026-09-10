"use client";

import { useEffect, useState } from "react";
import { ApiError, adminApi } from "@/lib/api";

type Run = Awaited<ReturnType<typeof adminApi.scraperRuns>>[number];

export default function ExtractionPage() {
  const [runs, setRuns] = useState<Run[]>();
  const [error, setError] = useState<string>();
  async function load() {
    try { setError(undefined); setRuns(await adminApi.scraperRuns()); }
    catch (cause) { setError(cause instanceof ApiError && cause.status === 401 ? "Sua sessão expirou." : "Não foi possível carregar as execuções."); }
  }
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);
  return <section className="mx-auto max-w-6xl space-y-6"><header className="flex items-end justify-between gap-3"><div><p className="text-sm font-medium text-emerald-700">Operação</p><h1 className="text-3xl font-semibold">Execuções e extração</h1><p className="mt-1 text-sm text-slate-500">Histórico persistido dos jobs do scraper.</p></div><button onClick={() => void load()} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Atualizar</button></header>{error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}{!runs ? <p className="text-sm text-slate-500">Carregando execuções…</p> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Fluxo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Início</th><th className="px-4 py-3">Etapas</th><th className="px-4 py-3">Flyers</th><th className="px-4 py-3">Erro</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-medium">{run.flow.name}</p><p className="text-xs text-slate-500">{run.flow.supermarket.name}</p></td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{run.status.toLowerCase()}</span></td><td className="px-4 py-3">{new Date(run.startedAt).toLocaleString("pt-BR")}</td><td className="px-4 py-3">{run.stepsExecuted}</td><td className="px-4 py-3">{run.flyersFound}</td><td className="max-w-xs truncate px-4 py-3 text-red-700">{run.error ?? "—"}</td></tr>)}</tbody></table></div>}</section>;
}
