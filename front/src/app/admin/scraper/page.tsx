"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { WorkerStartButton } from "@/components/admin/WorkerStartButton";
import { checkWorkerHealth } from "@/lib/browser-session";

const inputClass =
  "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200";

export default function ScraperFlowsPage() {
  const flows = useQuery(api.scraperFlows.list, {});
  const markets = useQuery(api.supermarkets.listNames);
  const create = useMutation(api.scraperFlows.create);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const ok = await checkWorkerHealth();
      if (alive) setWorkerOnline(ok);
    };
    void tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const id = await create({
        supermarketId: String(fd.get("supermarketId")) as Id<"supermarkets">,
        name: String(fd.get("name") ?? ""),
        startUrl: String(fd.get("startUrl") ?? ""),
      });
      setOpen(false);
      window.location.href = `/admin/scraper/${id}`;
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Flow Builder"
        description="SPEC 015 — gravar e executar workflows de scraping"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-xs ${workerOnline ? "text-emerald-400" : "text-rose-400"}`}
          >
            {workerOnline === null
              ? "…"
              : workerOnline
                ? "● Worker online"
                : "● Worker offline"}
          </span>
          {workerOnline === false ? (
            <WorkerStartButton onStarted={() => setWorkerOnline(true)} />
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
          >
            {open ? "Fechar" : "Novo fluxo"}
          </button>
        </div>
      </PageHeader>

      {open ? (
        <form
          onSubmit={onSubmit}
          className="mb-6 grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-2"
        >
          <select name="supermarketId" required className={inputClass}>
            <option value="">Supermercado</option>
            {(markets ?? []).map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            name="name"
            required
            placeholder="Nome do fluxo"
            className={inputClass}
          />
          <input
            name="startUrl"
            required
            placeholder="https://..."
            className={`${inputClass} sm:col-span-2`}
          />
          {error ? (
            <p className="text-sm text-rose-400 sm:col-span-2">{error}</p>
          ) : null}
          <button
            type="submit"
            className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 sm:col-span-2"
          >
            Criar
          </button>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Mercado</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Ver</th>
              <th className="px-3 py-2">URL</th>
            </tr>
          </thead>
          <tbody>
            {(flows ?? []).map((f) => {
              const sm = (markets ?? []).find((m) => m._id === f.supermarketId);
              return (
                <tr
                  key={f._id}
                  className="border-b border-zinc-900/80 text-zinc-300"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/scraper/${f._id}`}
                      className="font-medium text-zinc-100 hover:underline"
                    >
                      {f.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{sm?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="px-3 py-2 text-xs">v{f.version}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500 truncate max-w-[240px]">
                    {f.startUrl}
                  </td>
                </tr>
              );
            })}
            {flows?.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-zinc-500"
                >
                  Nenhum fluxo. Crie um pelo botão acima.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
