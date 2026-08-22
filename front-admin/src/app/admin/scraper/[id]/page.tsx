"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { SetupFlowNav } from "@/components/admin/SetupFlowNav";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { BrowserSessionPanel } from "@/components/admin/BrowserSessionPanel";
import { TeachPanel } from "@/components/admin/TeachPanel";
import { FlowRunPanel } from "@/components/admin/FlowRunPanel";
import { formatDateTime } from "@/lib/format";

const inputClass =
  "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 w-full";

const STEP_TYPES = [
  "navigate",
  "click",
  "select",
  "input",
  "wait",
  "scroll",
  "select-scope",
  "discover-store",
  "discover-flyer",
  "capture-network",
  "download-flyers",
  "extract-offers",
] as const;

export default function ScraperFlowDetailPage() {
  const params = useParams();
  const id = params.id as Id<"scraperFlows">;
  const data = useQuery(api.scraperFlows.get, { id });
  const updateFlow = useMutation(api.scraperFlows.update);
  const removeFlow = useMutation(api.scraperFlows.remove);
  const addStep = useMutation(api.scraperSteps.add);
  const updateStep = useMutation(api.scraperSteps.update);
  const removeStep = useMutation(api.scraperSteps.remove);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedMeta, setSavedMeta] = useState(false);

  async function onSaveMeta(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSavedMeta(false);
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await updateFlow({
        id,
        name: String(fd.get("name") ?? ""),
        startUrl: String(fd.get("startUrl") ?? ""),
        bumpVersion: true,
      });
      setSavedMeta(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAddStep(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const type = String(fd.get("type")) as (typeof STEP_TYPES)[number];
    let config = String(fd.get("config") ?? "{}");
    try {
      JSON.parse(config);
    } catch {
      setError("config deve ser JSON válido");
      return;
    }
    setBusy(true);
    try {
      await addStep({ flowId: id, type, config });
      e.currentTarget.reset();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (data === undefined) {
    return <p className="text-sm text-zinc-500">Carregando…</p>;
  }
  if (data === null) {
    return <p className="text-sm text-rose-400">Fluxo não encontrado.</p>;
  }

  return (
    <div>
      <PageHeader
        title={data.name}
        description={`${data.supermarket?.name ?? "—"} · ${data.startUrl}`}
      >
        <Link
          href="/admin/scraper"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
        >
          Voltar
        </Link>
      </PageHeader>

      <SetupFlowNav
        currentStep={4}
        supermarketId={data.supermarketId}
        flowId={id}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={data.status} />
        <span className="text-xs text-zinc-500">v{data.version}</span>
        <select
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300"
          value={data.status}
          disabled={busy}
          onChange={async (e) => {
            const status = e.target.value as
              | "draft"
              | "testing"
              | "active"
              | "disabled";
            setBusy(true);
            try {
              await updateFlow({ id, status });
            } finally {
              setBusy(false);
            }
          }}
        >
          {(["draft", "testing", "active", "disabled"] as const).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ml-auto rounded-md border border-rose-900 px-2 py-1 text-xs text-rose-400 hover:bg-rose-950"
          onClick={async () => {
            if (!confirm("Apagar fluxo e steps?")) return;
            await removeFlow({ id });
            window.location.href = "/admin/scraper";
          }}
        >
          Apagar
        </button>
      </div>

      <details className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <summary className="cursor-pointer text-sm text-zinc-300">
          Nome e URL
        </summary>
        <form
          key={`${data.name}-${data.startUrl}-${data.version}`}
          onSubmit={onSaveMeta}
          className="mt-3 grid gap-3"
        >
          <label className="text-xs text-zinc-500">
            Nome
            <input
              name="name"
              required
              defaultValue={data.name}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-zinc-500">
            Start URL
            <input
              name="startUrl"
              required
              defaultValue={data.startUrl}
              placeholder="https://…"
              className={`${inputClass} mt-1 font-mono text-xs`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
            {savedMeta ? (
              <span className="text-sm text-emerald-400">Salvo</span>
            ) : null}
          </div>
        </form>
      </details>

      <TeachPanel
        flowId={id}
        startUrl={data.startUrl}
        onSaved={() => window.location.reload()}
      />

      <details className="mb-8">
        <summary className="mb-3 cursor-pointer text-sm text-zinc-500">
          Sessão JPEG (avançado)
        </summary>
        <BrowserSessionPanel
          flowId={id}
          startUrl={data.startUrl}
          onSaved={() => window.location.reload()}
        />
      </details>

      <FlowRunPanel
        flowId={id}
        onDone={() => {
          /* recent runs refresh via convex query */
        }}
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-zinc-200">
          Steps ({data.steps.length})
        </h2>
        <div className="space-y-2">
          {data.steps.map((s) => {
            let label = "";
            try {
              const cfg = JSON.parse(s.config) as { label?: string };
              if (s.type === "select-scope" && cfg.label) label = cfg.label;
            } catch {
              /* ignore */
            }
            return (
            <div
              key={s._id}
              className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-zinc-500">
                  #{s.order}
                </span>
                <select
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                  value={s.type}
                  onChange={async (e) => {
                    const type = e.target.value as (typeof STEP_TYPES)[number];
                    try {
                      await updateStep({ id: s._id, type });
                    } catch (err) {
                      setError(String(err));
                    }
                  }}
                >
                  {STEP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {label ? (
                  <span className="text-xs text-zinc-500">{label}</span>
                ) : null}
                <button
                  type="button"
                  className="ml-auto text-xs text-rose-400"
                  onClick={() => removeStep({ id: s._id })}
                >
                  Remover
                </button>
              </div>
              <textarea
                className={`${inputClass} font-mono text-xs`}
                rows={3}
                defaultValue={s.config}
                onBlur={async (e) => {
                  try {
                    JSON.parse(e.target.value);
                    await updateStep({ id: s._id, config: e.target.value });
                  } catch {
                    setError("JSON inválido no step " + s.order);
                  }
                }}
              />
            </div>
            );
          })}
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-zinc-500">
            Adicionar etapa manual
          </summary>
        <form
          onSubmit={onAddStep}
          className="mt-2 grid gap-2 rounded-lg border border-dashed border-zinc-700 p-3 sm:grid-cols-2"
        >
          <select name="type" className={inputClass} defaultValue="click">
            {STEP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
          >
            + Adicionar etapa
          </button>
          <textarea
            name="config"
            rows={3}
            placeholder='{"selector":"...","value":"{{city}}"}'
            defaultValue="{}"
            className={`${inputClass} font-mono text-xs sm:col-span-2`}
          />
        </form>
        </details>
        {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-200">
          Últimas execuções
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Steps</th>
                <th className="px-3 py-2">Lojas</th>
                <th className="px-3 py-2">Flyers</th>
                <th className="px-3 py-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {(data.recentRuns ?? []).map((r) => (
                <tr
                  key={r._id}
                  className="border-b border-zinc-900/80 text-zinc-300"
                >
                  <td className="px-3 py-2 text-xs">
                    {formatDateTime(r.startedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2">{r.stepsExecuted}</td>
                  <td className="px-3 py-2">{r.storesFound}</td>
                  <td className="px-3 py-2">{r.flyersFound}</td>
                  <td className="px-3 py-2 text-xs text-rose-400 max-w-[200px] truncate">
                    {r.error ?? "—"}
                  </td>
                </tr>
              ))}
              {(data.recentRuns ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-sm text-zinc-500"
                  >
                    Nenhuma execução ainda.
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
