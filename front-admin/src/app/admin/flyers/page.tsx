"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";

type Flyer = Awaited<ReturnType<typeof adminApi.flyers>>[number];

export default function FlyersPage() {
  const [flyers, setFlyers] = useState<Flyer[]>();
  const [error, setError] = useState(false);
  async function load() { try { setError(false); setFlyers(await adminApi.flyers()); } catch { setError(true); } }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  return <section className="mx-auto max-w-6xl space-y-6"><header className="flex items-end justify-between"><div><p className="text-sm font-medium text-emerald-700">Catálogo</p><h1 className="text-3xl font-semibold">Encartes</h1></div><button onClick={() => void load()} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Atualizar</button></header>{error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar os encartes.</p> : !flyers ? <p className="text-sm text-slate-500">Carregando encartes…</p> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Encarte</th><th className="px-4 py-3">Rede</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Criado em</th></tr></thead><tbody>{flyers.map((flyer) => <tr key={flyer.id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-medium">{flyer.title ?? "Sem título"}</p><a className="text-xs text-emerald-700" href={flyer.originalUrl} target="_blank">Abrir origem</a></td><td className="px-4 py-3">{flyer.supermarket.name}</td><td className="px-4 py-3">{flyer.source.type}</td><td className="px-4 py-3">{flyer.status.toLowerCase()}</td><td className="px-4 py-3">{new Date(flyer.createdAt).toLocaleDateString("pt-BR")}</td></tr>)}</tbody></table></div>}</section>;
}
