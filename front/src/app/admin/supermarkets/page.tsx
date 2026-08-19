"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { SetupFlowNav } from "@/components/admin/SetupFlowNav";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatNumber } from "@/lib/format";

const inputClass =
  "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200";

export default function SupermarketsPage() {
  const list = useQuery(api.supermarkets.list);
  const create = useMutation(api.supermarkets.create);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const id = await create({
        name: String(fd.get("name") ?? ""),
        slug: String(fd.get("slug") ?? ""),
        city: String(fd.get("city") ?? "Fortaleza"),
        state: String(fd.get("state") ?? "CE"),
        country: String(fd.get("country") ?? "BR"),
        websiteUrl: String(fd.get("websiteUrl") ?? "") || undefined,
        active: true,
      });
      window.location.href = `/admin/supermarkets/${id}`;
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Supermercados"
        description="Cadastro manual — Fortaleza / CE"
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
        >
          {open ? "Fechar" : "Novo"}
        </button>
      </PageHeader>

      <SetupFlowNav currentStep={1} />

      {open ? (
        <form
          onSubmit={onSubmit}
          className="mb-6 grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-2"
        >
          <input name="name" required placeholder="Nome" className={inputClass} />
          <input name="slug" required placeholder="slug" className={inputClass} />
          <input name="city" defaultValue="Fortaleza" className={inputClass} />
          <input name="state" defaultValue="CE" className={inputClass} />
          <input name="country" defaultValue="BR" className={inputClass} />
          <input
            name="websiteUrl"
            placeholder="Website URL"
            className={inputClass}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(list ?? []).map((s) => (
          <Link
            key={s._id}
            href={`/admin/supermarkets/${s._id}`}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-600"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-medium text-zinc-100">{s.name}</h2>
              {s.active ? (
                <StatusBadge status="active" />
              ) : (
                <StatusBadge status="expired" />
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {s.city}/{s.state} · {s.slug}
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              {formatNumber(s.flyerCount)} encartes ·{" "}
              {formatNumber(s.offerCount)} ofertas ·{" "}
              {formatNumber(s.activeSourceCount)} fontes
            </p>
          </Link>
        ))}
        {list?.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum supermercado.</p>
        ) : null}
      </div>
    </div>
  );
}
