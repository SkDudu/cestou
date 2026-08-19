"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { SetupFlowNav } from "@/components/admin/SetupFlowNav";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/format";

const inputClass =
  "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200";

export default function SupermarketDetailPage() {
  const params = useParams();
  const id = params.id as Id<"supermarkets">;
  const data = useQuery(api.supermarkets.get, { id });
  const createSource = useMutation(api.flyerSources.create);
  const updateSource = useMutation(api.flyerSources.update);
  const updateSm = useMutation(api.supermarkets.update);
  const [error, setError] = useState<string | null>(null);

  async function onAddSource(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await createSource({
        supermarketId: id,
        type: String(fd.get("type") ?? "web") as "pdf" | "image" | "web" | "dynamic",
        url: String(fd.get("url") ?? ""),
        active: true,
      });
      e.currentTarget.reset();
    } catch (err) {
      setError(String(err));
    }
  }

  if (data === undefined) {
    return <p className="text-sm text-zinc-500">Carregando…</p>;
  }
  if (!data) {
    return <p className="text-sm text-rose-400">Não encontrado</p>;
  }

  return (
    <div>
      <PageHeader title={data.name} description={`${data.city}/${data.state} · ${data.slug}`}>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/supermarkets"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Voltar
          </Link>
          <Link
            href={`/admin/scraper?supermarketId=${id}${data.websiteUrl ? `&startUrl=${encodeURIComponent(data.websiteUrl)}` : ""}`}
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900"
          >
            Próximo: criar fluxo
          </Link>
          <button
            type="button"
            onClick={() => updateSm({ id, active: !data.active })}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
          >
            {data.active ? "Desativar" : "Ativar"}
          </button>
        </div>
      </PageHeader>

      <SetupFlowNav currentStep={2} supermarketId={id} />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Fontes de encarte
        </h2>
        <ul className="mb-4 space-y-2">
          {data.sources.map((s) => (
            <li
              key={s._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800 px-3 py-2 text-sm"
            >
              <div>
                <span className="text-zinc-300">{s.type}</span>
                <span className="mx-2 text-zinc-600">·</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-zinc-400 hover:underline"
                >
                  {s.url}
                </a>
              </div>
              <button
                type="button"
                onClick={() => updateSource({ id: s._id, active: !s.active })}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                {s.active ? <StatusBadge status="active" /> : "inativo"}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={onAddSource} className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
          <select name="type" className={inputClass} defaultValue="image">
            <option value="pdf">pdf</option>
            <option value="image">image</option>
            <option value="web">web</option>
            <option value="dynamic">dynamic</option>
          </select>
          <input name="url" required placeholder="URL da fonte" className={inputClass} />
          <button
            type="submit"
            className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900"
          >
            Add fonte
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Encartes recentes
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Validade</th>
              </tr>
            </thead>
            <tbody>
              {data.recentFlyers.map((f) => (
                <tr key={f._id} className="border-b border-zinc-900">
                  <td className="px-3 py-2">
                    <Link href={`/admin/flyers/${f._id}`} className="hover:underline">
                      {f.title ?? f._id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {formatDateTime(f.validFrom)} → {formatDateTime(f.validUntil)}
                  </td>
                </tr>
              ))}
              {!data.recentFlyers.length ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-zinc-500">
                    Sem encartes
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
