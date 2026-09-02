"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { OpsHeader, OpsKpi, statusDot } from "@/components/admin/ops";
import { OpsStatusPill } from "@/components/admin/OpsStatusPill";
import { SetupFlowNav } from "@/components/admin/SetupFlowNav";
import { BrowserSessionPanel } from "@/components/admin/BrowserSessionPanel";
import { TeachPanel } from "@/components/admin/TeachPanel";
import { WorkerEditStepsModal } from "@/components/admin/WorkerEditStepsModal";
import { WorkerSetupTracePanel } from "@/components/admin/WorkerSetupTracePanel";
import { formatOpsStamp, isRunCancelled, isRunDuplicate } from "@/lib/format";

const inputClass = "rounded-md border ds-input";

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

type Run = {
  _id: string;
  status: "running" | "success" | "partial" | "cancelled" | "duplicate" | "failed";
  startedAt: number;
  finishedAt?: number;
  error?: string;
  log?: string;
  stepsExecuted: number;
  flyersFound: number;
  storesFound: number;
};

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
  const [edit, setEdit] = useState(false);
  const [editStepsOpen, setEditStepsOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();

  const closeEditSteps = useCallback(() => setEditStepsOpen(false), []);
  const onEditStepsSaved = useCallback(() => {
    setEditStepsOpen(false);
    window.location.reload();
  }, []);

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
    const config = String(fd.get("config") ?? "{}");
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

  const runs = (data?.recentRuns ?? []) as Run[];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return runs.filter(
      (r) =>
        !needle ||
        jobLabel(r._id).includes(needle) ||
        r.status.includes(needle),
    );
  }, [runs, q]);
  const last = runs[0];
  const activeRun = last;

  if (data === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }
  if (data === null) {
    return (
      <p className="text-sm text-[var(--ds-color-danger)]">
        Fluxo não encontrado.
      </p>
    );
  }

  const slug = workerSlug(data.name);
  const scopeLost =
    data.status === "error" ||
    (last?.error ?? "").includes("SCOPE_NOT_FOUND");
  const paused = data.status === "disabled";
  const estado = estadoLabel(data.status);
  const lastDur = last
    ? compactDuration((last.finishedAt ?? Date.now()) - last.startedAt)
    : "—";
  const lastClock = last ? clock(last.startedAt) : "—";
  const cron = data.schedule ?? "—";
  const fonte = sourceKind(data.startUrl);

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/scraper" className="hover:underline">
          Workers
        </Link>
        {" / "}
        {data.supermarket?.name ?? data.name}
      </p>
      <OpsHeader
        title={data.supermarket?.name ?? data.name}
        subtitle={`${slug} · ${fonte} · ${cronHint(data.schedule)}`}
        stamp={`Atualizado ${formatOpsStamp(data.updatedAt)}`}
        primary={
          <>
            <button
              type="button"
              className="ds-btn ds-btn--outline"
              onClick={() => setEditStepsOpen(true)}
            >
              Editar steps
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--outline"
              onClick={() => setEdit((v) => !v)}
            >
              {edit ? "Ver" : "Config"}
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await updateFlow({
                    id,
                    status: paused ? "active" : "disabled",
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <PauseIcon />
              {paused ? "Retomar" : "Pausar"}
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--primary"
              onClick={() => router.push(`/admin/scraper/${id}/run?go=1`)}
            >
              Rodar agora
            </button>
          </>
        }
      />

      <WorkerEditStepsModal
        open={editStepsOpen}
        flowId={id}
        startUrl={data.startUrl}
        flowVersion={data.version}
        flowSlug={slug}
        onClose={closeEditSteps}
        onSaved={onEditStepsSaved}
      />

      {scopeLost ? (
        <p className="mb-4 rounded-[10px] border border-[var(--ds-color-danger)] bg-[var(--ds-color-pill-danger-bg)] px-3 py-2 text-sm text-[var(--ds-color-danger)]">
          Região de flyers não encontrada. Site mudou — Editar steps.
        </p>
      ) : null}

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Estado"
          value={estado.title}
          hint={
            <p
              className="pb-1 text-[13px] font-medium"
              style={{ color: estado.color }}
            >
              {estado.hint}
            </p>
          }
          foot={
            data.lastRunAt
              ? `heartbeat ${clock(data.lastRunAt)}`
              : "sem heartbeat"
          }
        />
        <OpsKpi
          label="Último job"
          value={lastClock}
          hint={
            <p className="pb-1 text-[13px] font-medium text-[var(--ds-color-muted-foreground)]">
              {lastDur}
            </p>
          }
          foot={
            last
              ? `${last.flyersFound} flyers · ${runStatusLabel(last)}`
              : "Nenhum job ainda"
          }
          icon={<ListIcon />}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 pb-4">
        <span className="ds-chip">{data.supermarket?.name ?? "—"}</span>
        <span className="ds-chip">
          {data.supermarket
            ? `${data.supermarket.state} · ${data.supermarket.city}`
            : "—"}
        </span>
        <span className="ds-chip font-mono">{cron}</span>
        <span className="ds-chip ds-chip--outline">{fonte}</span>
      </div>

      <JobFlow
        run={activeRun}
        runningNow={activeRun?.status === "running"}
      />

      <WorkerSetupTracePanel
        events={(data.setupEvents ?? []) as import("@/components/admin/WorkerSetupTracePanel").SetupTraceEvent[]}
      />

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Jobs recentes</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar job"
            className="ds-search"
          />
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps min-w-0 flex-[3.1]">Job</span>
          <span className="ds-label-caps w-[200px] shrink-0">Início</span>
          <span className="ds-label-caps w-[88px] shrink-0">Duração</span>
          <span className="ds-label-caps w-[72px] shrink-0">Flyers</span>
          <span className="ds-label-caps w-[96px] shrink-0">Status</span>
        </div>
        {rows.map((r) => {
          const stopped = isRunCancelled(r);
          const dup = isRunDuplicate(r);
          const pill = stopped
            ? "stop"
            : dup
              ? "review"
              : r.status === "success"
                ? "ok"
                : r.status === "running"
                  ? "running"
                  : r.status === "partial"
                    ? "review"
                    : "fail";
          return (
            <Link
              key={r._id}
              href={`/admin/scraper/${id}/run?job=${r._id}`}
              className="ds-table-row"
            >
              <span className="flex min-w-0 flex-[3.1] items-center gap-2 font-mono text-sm">
                <span
                  className="ds-dot"
                  style={{
                    background: statusDot(
                      pill === "ok" ? "ok" : pill === "stop" ? "queue" : pill,
                    ),
                  }}
                />
                {jobLabel(r._id)}
              </span>
              <span className="w-[200px] shrink-0">{whenLabel(r.startedAt)}</span>
              <span className="w-[88px] shrink-0 font-mono">
                {compactDuration((r.finishedAt ?? Date.now()) - r.startedAt)}
              </span>
              <span className="w-[72px] shrink-0 font-mono">{r.flyersFound}</span>
              <span className="w-[96px] shrink-0">
                {pill === "ok" ? (
                  <span className="ds-pill ds-pill--running">Ok</span>
                ) : pill === "stop" ? (
                  <span className="ds-pill ds-pill--queue">Parado</span>
                ) : dup ? (
                  <span className="ds-pill ds-pill--review">Duplicata</span>
                ) : (
                  <OpsStatusPill
                    status={
                      pill === "running"
                        ? "running"
                        : pill === "review"
                          ? "review"
                          : "fail"
                    }
                  />
                )}
              </span>
            </Link>
          );
        })}
        {!rows.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma execução ainda.
          </p>
        ) : null}
      </section>

      {edit ? (
        <div className="mt-6 space-y-6">
          <SetupFlowNav
            currentStep={4}
            supermarketId={data.supermarketId}
            flowId={id}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="ds-input"
              value={data.status === "error" ? "error" : data.status}
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
              {data.status === "error" ? (
                <option value="error" disabled>
                  error
                </option>
              ) : null}
              {(["draft", "testing", "active", "disabled"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ds-btn ds-btn--danger ml-auto"
              onClick={async () => {
                if (!confirm("Apagar fluxo e steps?")) return;
                await removeFlow({ id });
                window.location.href = "/admin/scraper";
              }}
            >
              Apagar
            </button>
          </div>

          <form
            key={`${data.name}-${data.startUrl}-${data.version}`}
            onSubmit={onSaveMeta}
            className="ds-form ds-form-2"
          >
            <label className="text-xs text-[var(--ds-color-muted-foreground)]">
              Nome
              <input
                name="name"
                required
                defaultValue={data.name}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-xs text-[var(--ds-color-muted-foreground)]">
              Start URL
              <input
                name="startUrl"
                required
                defaultValue={data.startUrl}
                className={`${inputClass} mt-1 font-mono text-xs`}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="ds-btn ds-btn--primary"
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
            {savedMeta ? (
              <span className="text-sm text-[var(--ds-color-success)]">
                Salvo
              </span>
            ) : null}
          </form>

          <TeachPanel
            flowId={id}
            startUrl={data.startUrl}
            onSaved={() => window.location.reload()}
          />
          <details>
            <summary className="ds-meta cursor-pointer">
              Sessão JPEG (avançado)
            </summary>
            <BrowserSessionPanel
              flowId={id}
              startUrl={data.startUrl}
              onSaved={() => window.location.reload()}
            />
          </details>

          <section>
            <h2 className="mb-3 text-[15px] font-semibold">
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
                    className="rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                        #{s.order}
                      </span>
                      <select
                        className="ds-input"
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
                        <span className="text-xs text-[var(--ds-color-muted-foreground)]">
                          {label}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="ml-auto text-xs text-[var(--ds-color-danger)]"
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
                          await updateStep({
                            id: s._id,
                            config: e.target.value,
                          });
                        } catch {
                          setError("JSON inválido no step " + s.order);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <form
              onSubmit={onAddStep}
              className="mt-4 grid gap-2 rounded-[14px] border border-dashed border-[var(--ds-color-border)] p-3 sm:grid-cols-2"
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
                className="ds-btn ds-btn--outline"
              >
                + Adicionar etapa
              </button>
              <textarea
                name="config"
                rows={3}
                defaultValue="{}"
                className={`${inputClass} font-mono text-xs sm:col-span-2`}
              />
            </form>
            {error ? (
              <p className="mt-2 text-sm text-[var(--ds-color-danger)]">
                {error}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function JobFlow({ run, runningNow }: { run?: Run; runningNow: boolean }) {
  const steps = pipeline(run, runningNow);
  return (
    <section className="mb-4 rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-[22px] py-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="ds-label-caps">Fluxo do job</p>
        <p className="text-xs text-[var(--ds-color-muted-foreground)]">
          {run ? `${jobLabel(run._id)} · ${steps.caption}` : "sem job"}
        </p>
      </div>
      <div className="flex items-start">
        {steps.items.map((s, i) => (
          <div key={s.label} className="flex min-w-0 flex-1 items-start">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                  style={s.circle}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{s.label}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                {s.foot}
              </p>
            </div>
            {i < steps.items.length - 1 ? (
              <span
                className="mx-2 mt-3.5 h-0.5 min-w-[24px] flex-1"
                style={{ background: s.line }}
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function pipeline(run: Run | undefined, runningNow: boolean) {
  const done = {
    circle: { background: "#E6EFEA", color: "var(--ds-color-success)" },
    line: "var(--ds-color-success)",
  };
  const now = {
    circle: { background: "var(--ds-color-harbor)", color: "#fff" },
    line: "var(--ds-color-mist)",
  };
  const wait = {
    circle: {
      background: "var(--ds-color-card)",
      color: "var(--ds-color-muted-foreground)",
      border: "1px solid var(--ds-color-mist)",
    },
    line: "var(--ds-color-mist)",
  };
  const fail = {
    circle: {
      background: "var(--ds-color-pill-danger-bg)",
      color: "var(--ds-color-danger)",
    },
    line: "var(--ds-color-mist)",
  };

  const labels = ["Fonte", "Baixa", "Parse", "Revisão", "Ofertas"] as const;
  const t = run ? clock(run.startedAt) : "";
  const live = runningNow || run?.status === "running";

  let kinds: Array<"done" | "now" | "wait" | "fail"> = [
    "wait",
    "wait",
    "wait",
    "wait",
    "wait",
  ];
  let caption = "ainda não";
  let foots = ["ainda não", "ainda não", "ainda não", "espera fila", "ainda não"];

  if (run?.status === "success") {
    kinds = ["done", "done", "done", "done", "done"];
    caption = "ok";
    foots = labels.map(() => `ok · ${t}`);
  } else if (run && isRunCancelled(run)) {
    kinds = ["done", "wait", "wait", "wait", "wait"];
    caption = "cancelado";
    foots = [`ok · ${t}`, "parado", "—", "espera fila", "ainda não"];
  } else if (run && isRunDuplicate(run)) {
    kinds = ["done", "done", "wait", "wait", "wait"];
    caption = "duplicata";
    foots = [`ok · ${t}`, "já existia", "—", "espera fila", "ainda não"];
  } else if (run?.status === "failed") {
    kinds = ["done", "done", "fail", "wait", "wait"];
    caption = "falha no parse";
    foots = [`ok · ${t}`, `ok · ${t}`, "falhou", "espera fila", "ainda não"];
  } else if (live) {
    const blob = (run?.log ?? "").toUpperCase();
    const n = run?.stepsExecuted ?? 0;
    const hasBaixa =
      /\[DOWNLOAD\]|\[FLYER\]|DOWNLOAD-FLYERS/.test(blob) || n >= 2;
    const hasParse =
      /\[EXTRACT\]|EXTRACT-OFFERS|MIMO/.test(blob) ||
      /✓ STEP \d+ EXTRACT/i.test(run?.log ?? "");
    if (hasParse) {
      kinds = ["done", "done", "now", "wait", "wait"];
      caption = "parse agora";
      foots = [`ok · ${t}`, `ok · ${t}`, "agora", "espera fila", `${n} steps`];
    } else if (hasBaixa) {
      kinds = ["done", "now", "wait", "wait", "wait"];
      caption = "baixa agora";
      foots = [`ok · ${t}`, "agora", "fila", "espera fila", `${n} steps`];
    } else {
      kinds = ["now", "wait", "wait", "wait", "wait"];
      caption = "fonte agora";
      foots = ["agora", "fila", "fila", "espera fila", `${n} steps`];
    }
  } else if (run?.status === "partial") {
    kinds = ["done", "done", "done", "now", "wait"];
    caption = "revisão";
    foots = [`ok · ${t}`, `ok · ${t}`, `ok · ${t}`, "espera fila", "ainda não"];
  }

  const style = { done, now, wait, fail };
  return {
    caption,
    items: labels.map((label, i) => ({
      label,
      foot: foots[i],
      ...style[kinds[i]],
    })),
  };
}

function workerSlug(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);
  return slug.startsWith("wrk_") ? slug : `wrk_${slug || "flow"}`;
}

function jobLabel(id: string) {
  return `job_${id.slice(-4)}`;
}

function clock(ts: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
}

function compactDuration(ms: number) {
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, "0")}s`;
}

function whenLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const start = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (start(now) - start(d)) / 86400000;
  const t = clock(ts);
  if (diff === 0) return `hoje ${t}`;
  if (diff === 1) return `ontem ${t}`;
  return `${d.getDate()} ${d.toLocaleDateString("pt-BR", { month: "short" })} ${t}`;
}

function estadoLabel(status: string) {
  if (status === "active")
    return {
      title: "Ativo",
      hint: "estável",
      color: "var(--ds-color-success)",
    };
  if (status === "testing")
    return { title: "Teste", hint: "review", color: "var(--ds-color-buoy)" };
  if (status === "disabled")
    return {
      title: "Pausado",
      hint: "fila",
      color: "var(--ds-color-muted-foreground)",
    };
  if (status === "error")
    return { title: "Erro", hint: "falha", color: "var(--ds-color-danger)" };
  return {
    title: "Rascunho",
    hint: "setup",
    color: "var(--ds-color-muted-foreground)",
  };
}

function cronHint(schedule?: string) {
  if (!schedule) return "manual";
  if (schedule.includes("*/6")) return "cron 6h";
  return "cron";
}

function sourceKind(url: string) {
  if (/\.pdf($|\?)/i.test(url)) return "PDF encarte";
  return "HTML encarte";
}

function runStatusLabel(run: Run) {
  if (isRunCancelled(run)) return "parado";
  if (isRunDuplicate(run)) return "duplicata";
  if (run.status === "success") return "ok";
  if (run.status === "running") return "rodando";
  if (run.status === "partial") return "parcial";
  return "falha";
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M4.5 3v8M9.5 3v8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 4.5h10M3 8h10M3 11.5h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
