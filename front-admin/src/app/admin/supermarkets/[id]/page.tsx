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
  "ds-input";

export default function SupermarketDetailPage() {
  const params = useParams();
  const id = params.id as Id<"supermarkets">;
  const data = useQuery(api.supermarkets.get, { id });
  const createSource = useMutation(api.flyerSources.create);
  const updateSource = useMutation(api.flyerSources.update);
  const updateSm = useMutation(api.supermarkets.update);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await updateSm({
        id,
        name: String(fd.get("name") ?? ""),
        city: String(fd.get("city") ?? ""),
        state: String(fd.get("state") ?? ""),
        country: String(fd.get("country") ?? ""),
        websiteUrl: String(fd.get("websiteUrl") ?? ""),
        timezone: String(fd.get("timezone") ?? "") || "America/Fortaleza",
      });
      setSaved(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

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
    return <p className="ds-meta">Carregando…</p>;
  }
  if (!data) {
    return <p className="text-sm text-[var(--ds-color-danger)]">Não encontrado</p>;
  }

  return (
    <div>
      <PageHeader title={data.name} description={`${data.city}/${data.state}`}>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/supermarkets"
            className="ds-btn ds-btn--outline"
          >
            Voltar
          </Link>
          <Link
            href={`/admin/scraper?supermarketId=${id}`}
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900"
          >
            Próximo: criar fluxo
          </Link>
          <button
            type="button"
            onClick={() => updateSm({ id, active: !data.active })}
            className="rounded-md border border-[var(--ds-color-border)] px-3 py-1.5 text-sm "
          >
            {data.active ? "Desativar" : "Ativar"}
          </button>
        </div>
      </PageHeader>

      <SetupFlowNav currentStep={2} supermarketId={id} />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
          Cadastro
        </h2>
        <form
          key={`${data.name}-${data.updatedAt}`}
          onSubmit={onSave}
          className="grid gap-3 ds-form sm:grid-cols-2"
        >
          <label className="text-xs text-[var(--ds-color-muted-foreground)] sm:col-span-2">
            Nome
            <input
              name="name"
              required
              defaultValue={data.name}
              className={`${inputClass} mt-1 w-full`}
            />
          </label>
          <label className="text-xs text-[var(--ds-color-muted-foreground)]">
            Timezone
            <input
              name="timezone"
              defaultValue={data.timezone ?? "America/Fortaleza"}
              placeholder="America/Fortaleza"
              className={`${inputClass} mt-1 w-full`}
            />
          </label>
          <label className="text-xs text-[var(--ds-color-muted-foreground)]">
            Cidade
            <input
              name="city"
              required
              defaultValue={data.city}
              className={`${inputClass} mt-1 w-full`}
            />
          </label>
          <label className="text-xs text-[var(--ds-color-muted-foreground)]">
            Estado
            <input
              name="state"
              required
              defaultValue={data.state}
              className={`${inputClass} mt-1 w-full`}
            />
          </label>
          <label className="text-xs text-[var(--ds-color-muted-foreground)]">
            País
            <input
              name="country"
              required
              defaultValue={data.country}
              className={`${inputClass} mt-1 w-full`}
            />
          </label>
          <label className="text-xs text-[var(--ds-color-muted-foreground)] sm:col-span-2">
            Website URL
            <input
              name="websiteUrl"
              defaultValue={data.websiteUrl ?? ""}
              placeholder="https://…"
              className={`${inputClass} mt-1 w-full`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
            {saved ? (
              <span className="text-sm text-emerald-400">Salvo</span>
            ) : null}
            {error ? <span className="text-sm text-[var(--ds-color-danger)]">{error}</span> : null}
          </div>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
          Fontes de encarte
        </h2>
        <ul className="mb-4 space-y-2">
          {data.sources.map((s) => (
            <li
              key={s._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--ds-color-border)] px-3 py-2 text-sm"
            >
              <div>
                <span className="">{s.type}</span>
                <span className="mx-2 text-zinc-600">·</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-[var(--ds-color-muted-foreground)] hover:underline"
                >
                  {s.url}
                </a>
              </div>
              <button
                type="button"
                onClick={() => updateSource({ id: s._id, active: !s.active })}
                className="text-xs text-[var(--ds-color-muted-foreground)] hover:"
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
        {error ? <p className="mt-2 text-sm text-[var(--ds-color-danger)]">{error}</p> : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
          Encartes recentes
        </h2>
        <div className="ds-table-card">
          <table className="w-full text-left text-sm">
            <thead className="ds-label-caps">
              <tr>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Validade</th>
              </tr>
            </thead>
            <tbody>
              {data.recentFlyers.map((f) => (
                <tr key={f._id} className="border-b border-[var(--ds-color-border)]">
                  <td className="px-3 py-2">
                    <Link href={`/admin/flyers/${f._id}`} className="hover:underline">
                      {f.title ?? f._id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="px-3 py-2 text-[var(--ds-color-muted-foreground)]">
                    {formatDateTime(f.validFrom)} → {formatDateTime(f.validUntil)}
                  </td>
                </tr>
              ))}
              {!data.recentFlyers.length ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-[var(--ds-color-muted-foreground)]">
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
