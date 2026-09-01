"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConditionFields } from "@/components/admin/ConditionFields";
import { DiscardFlyerModal } from "@/components/admin/DiscardFlyerModal";
import { ReanalyzeModal } from "@/components/admin/ReanalyzeModal";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  checkWorkerHealth,
  reanalyzeRemote,
  startBrowserWorker,
  type ReanalyzeDiff,
  type ReanalyzeEvent,
} from "@/lib/browser-session";
import {
  formatCurrency,
  formatOpsStamp,
  formatPack,
  formatRange,
  jobLabel,
  PACK_UNITS,
} from "@/lib/format";
import {
  conditionNote,
  draftsFromOffer,
  primaryEligibility,
  type ConditionDraft,
} from "@/lib/eligibility";

type PageStatus = {
  pageNumber: number;
  status: "running" | "done" | "failed" | "skipped" | "pending";
};

function money(n: number) {
  return formatCurrency(n).replace("R$", "").trim();
}

function diffKey(d: { name: string; pageNumber?: number }) {
  return `${d.pageNumber ?? "?"}|${d.name.trim().toLowerCase()}`;
}

export default function ExtractionReviewPage() {
  const params = useParams();
  const runId = params.runId as Id<"scraperRuns">;
  const data = useQuery(api.scraperRuns.review, { runId });
  const setStatus = useMutation(api.offers.setValidationStatus);
  const patchFields = useMutation(api.offers.patchFields);
  const setEligibility = useMutation(api.offers.setEligibility);
  const discardFlyer = useMutation(api.flyers.discardFlyer);
  const discardPage = useMutation(api.flyers.discardPage);

  const [flyerId, setFlyerId] = useState<Id<"flyers"> | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [editId, setEditId] = useState<Id<"offers"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editOriginal, setEditOriginal] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editConds, setEditConds] = useState<ConditionDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "running" | "result">("idle");
  const [pageStatuses, setPageStatuses] = useState<PageStatus[]>([]);
  const [result, setResult] = useState<{
    updated: number;
    locked: number;
    pages: number[];
    diffs: ReanalyzeDiff[];
    error?: string;
  } | null>(null);

  const flyer =
    data?.flyers.find((f) => f._id === flyerId) ?? data?.flyers[0] ?? null;
  const pages = flyer?.pages ?? [];
  const page = pages[pageIdx] ?? pages[0] ?? null;

  useEffect(() => {
    setFlyerId(null);
    setPageIdx(0);
  }, [runId]);

  useEffect(() => {
    if (!flyerId && data?.flyers[0]) setFlyerId(data.flyers[0]._id);
  }, [data, flyerId]);

  useEffect(() => {
    setPageIdx(0);
  }, [flyerId]);

  const pageOffers = useMemo(() => {
    if (!flyer) return [];
    if (!page) return flyer.offers;
    const n = page.pageNumber;
    const matched = flyer.offers.filter((o) => o.pageNumber === n);
    if (matched.length) return matched;
    const unpaged = flyer.offers.filter((o) => o.pageNumber == null);
    return unpaged.length ? unpaged : flyer.offers;
  }, [flyer, page]);

  const pendingPage = pageOffers.filter(
    (o) => o.validationStatus === "pending" || o.validationStatus === "suspicious",
  ).length;

  const counts = useMemo(() => {
    const offers = data?.flyers.flatMap((f) => f.offers) ?? [];
    return {
      ok: offers.filter((o) => o.validationStatus === "validated").length,
      edit: offers.filter((o) => o.validationStatus === "suspicious").length,
      trash: offers.filter((o) => o.validationStatus === "rejected").length,
      pending: offers.filter((o) => o.validationStatus === "pending").length,
    };
  }, [data]);

  const diffMap = useMemo(() => {
    const map = new Map<string, ReanalyzeDiff>();
    for (const d of result?.diffs ?? []) map.set(diffKey(d), d);
    return map;
  }, [result]);

  const progressDone = pageStatuses.filter(
    (p) => p.status === "done" || p.status === "failed",
  ).length;
  const progressTotal = pageStatuses.filter((p) => p.status !== "skipped").length;

  async function startReanalyze(args: {
    scope: "flyer" | "pages";
    pages?: number[];
    includeLocked: boolean;
  }) {
    if (!flyer) return;
    setModalOpen(false);
    setBusy(true);
    setPhase("running");
    setResult(null);
    const allNums = pages.map((p) => p.pageNumber);
    const target = new Set(args.pages?.length ? args.pages : allNums);
    setPageStatuses(
      allNums.map((n) => ({
        pageNumber: n,
        status: target.has(n) ? "pending" : "skipped",
      })),
    );
    try {
      if (!(await checkWorkerHealth())) {
        await startBrowserWorker();
      }
      const done = await reanalyzeRemote(
        {
          flyerId: flyer._id,
          pages: args.pages,
          includeLocked: args.includeLocked,
        },
        (ev: ReanalyzeEvent) => {
          if (ev.type === "page") {
            setPageStatuses((prev) =>
              prev.map((p) =>
                p.pageNumber === ev.pageNumber
                  ? { ...p, status: ev.status }
                  : p,
              ),
            );
          }
        },
      );
      if (done) {
        setResult({
          updated: done.updated,
          locked: done.locked,
          pages: done.pages,
          diffs: done.diffs ?? [],
          error: done.ok ? undefined : done.error,
        });
        setPhase("result");
      } else {
        setPhase("idle");
      }
    } catch (err) {
      setResult({
        updated: 0,
        locked: 0,
        pages: [],
        diffs: [],
        error: String(err),
      });
      setPhase("result");
    } finally {
      setBusy(false);
    }
  }

  if (data === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-[var(--ds-color-danger)]">Run não encontrada.</p>
    );
  }

  const store = data.supermarket?.name ?? data.flow.name;
  const job = jobLabel(data.run._id);

  async function onOk(id: Id<"offers">) {
    await setStatus({ id, validationStatus: "validated" });
  }

  async function onTrash(id: Id<"offers">) {
    await setStatus({ id, validationStatus: "rejected" });
  }

  function startEdit(o: {
    _id: Id<"offers">;
    name: string;
    price: number;
    originalPrice?: number;
    quantity?: string;
    unit?: string;
    eligibility?: string;
    conditions?: {
      type?: string;
      name?: string;
      description?: string;
      requirement?: string;
    }[];
  }) {
    setEditId(o._id);
    setEditName(o.name);
    setEditPrice(String(o.price));
    setEditOriginal(o.originalPrice != null ? String(o.originalPrice) : "");
    setEditQty(o.quantity ?? "");
    setEditUnit(o.unit ?? "");
    setEditConds(draftsFromOffer(o));
  }

  async function saveEdit() {
    if (!editId) return;
    const price = Number(editPrice.replace(",", "."));
    const original =
      editOriginal.trim() === ""
        ? null
        : Number(editOriginal.replace(",", "."));
    if (!editName.trim() || Number.isNaN(price)) return;
    setBusy(true);
    try {
      await patchFields({
        id: editId,
        name: editName,
        price,
        originalPrice: original !== null && Number.isNaN(original) ? null : original,
        quantity: editQty.trim() || null,
        unit: editUnit.trim() || null,
      });
      const eligibility = primaryEligibility(editConds);
      await setEligibility({
        id: editId,
        eligibility,
        conditions:
          eligibility === "ALL_CUSTOMERS" || eligibility === "UNKNOWN"
            ? undefined
            : editConds.map((d) => ({
                type: d.type,
                name: d.name || undefined,
                description: d.description || undefined,
              })),
        reason: "revisão",
      });
      await setStatus({ id: editId, validationStatus: "suspicious" });
      setEditId(null);
    } finally {
      setBusy(false);
    }
  }

  async function publishBatch() {
    if (!data) return;
    const pending = data.flyers.flatMap((f) =>
      f.offers.filter((o) => o.validationStatus === "pending"),
    );
    setBusy(true);
    try {
      for (const o of pending) {
        await setStatus({ id: o._id, validationStatus: "validated" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard(scope: "flyer" | "page") {
    if (!flyer || !data) return;
    setDiscarding(true);
    try {
      if (scope === "page" && page) {
        const r = await discardPage({
          flyerId: flyer._id,
          pageNumber: page.pageNumber,
        });
        if (r.scope === "flyer") {
          const rest = data.flyers.filter((f) => f._id !== flyer._id);
          setFlyerId(rest[0]?._id ?? null);
          setPageIdx(0);
        } else {
          setPageIdx((i) =>
            pages.length <= 1 ? 0 : Math.min(i, pages.length - 2),
          );
        }
      } else {
        const id = flyer._id;
        await discardFlyer({ id });
        const rest = data.flyers.filter((f) => f._id !== id);
        setFlyerId(rest[0]?._id ?? null);
        setPageIdx(0);
      }
      setEditId(null);
      setDiscardOpen(false);
    } finally {
      setDiscarding(false);
    }
  }

  async function returnToQueue() {
    if (!data) return;
    const marked = data.flyers.flatMap((f) =>
      f.offers.filter(
        (o) =>
          o.validationStatus === "validated" ||
          o.validationStatus === "suspicious",
      ),
    );
    setBusy(true);
    try {
      for (const o of marked) {
        await setStatus({ id: o._id, validationStatus: "pending" });
      }
    } finally {
      setBusy(false);
    }
  }

  const title =
    phase === "running"
      ? "Reanálise em andamento"
      : phase === "result"
        ? "Resultado da reanálise"
        : "Revisão";

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/extraction" className="hover:underline">
          Extração
        </Link>
        {" / "}
        Revisão
        {phase !== "idle" ? " / Reanalisar" : ""}
      </p>

      <header className="flex flex-wrap items-start justify-between gap-4 pb-3">
        <div>
          <h1 className="text-[28px] font-bold leading-8 tracking-[-0.04em]">
            {title}
          </h1>
          <p className="mt-1 text-sm text-[var(--ds-color-muted-foreground)]">
            {data.totalOffers} SKUs
            {phase === "running" && progressTotal
              ? ` · reanálise ${progressDone}/${progressTotal}`
              : phase === "result" && result
                ? ` · ${result.diffs.length} diffs`
                : data.pending > 0
                  ? ` · ${data.pending} pendentes`
                  : ""}
            {" · "}
            {store}
            {" · "}
            {formatOpsStamp(data.run.startedAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 pt-1">
          <span className="inline-flex items-center gap-2 text-[13px] text-[var(--ds-color-muted-foreground)]">
            <span
              className="ds-dot"
              style={{ background: "var(--ds-color-success)" }}
            />
            {job} · {store}
          </span>
          <StatusBadge status={data.run.status} />
          <button
            type="button"
            className="ds-btn ds-btn--outline"
            disabled={busy || !flyer || !pages.length}
            onClick={() => setModalOpen(true)}
          >
            Reanalisar
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--primary"
            disabled={busy || counts.pending === 0}
            onClick={() => void publishBatch()}
          >
            Publicar lote
          </button>
        </div>
      </header>

      {data.run.log?.trim() ? (
        <details className="mb-4 rounded-[10px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)]">
          <summary className="cursor-pointer px-3.5 py-2.5 text-[13px] font-medium">
            Log do job · {job}
            {data.run.stepsExecuted
              ? ` · ${data.run.stepsExecuted} steps`
              : ""}
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-[var(--ds-color-border)] bg-[#1A2B3C] px-3.5 py-3 font-mono text-[11px] leading-5 text-[#C5D4C8]">
            {data.run.log}
          </pre>
        </details>
      ) : data.run.status === "running" ? (
        <p className="mb-4 text-[13px] text-[var(--ds-color-muted-foreground)]">
          Job ainda rodando —{" "}
          <Link
            href={`/admin/scraper/${data.flow._id}/run?job=${data.run._id}`}
            className="text-[var(--ds-color-harbor)] hover:underline"
          >
            ver stdout ao vivo
          </Link>
        </p>
      ) : null}

      {phase === "result" && result ? (
        <div className="ds-reanalyze-banner mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">
              {result.error ? "Reanálise falhou" : "Reanálise concluída"}
            </p>
            <p className="text-xs text-[var(--ds-color-muted-foreground)]">
              {result.error
                ? result.error
                : `${result.updated} ofertas atualizadas · ${result.locked} travadas intactas${
                    result.pages.length
                      ? ` · páginas ${result.pages.join(" e ")}`
                      : ""
                  }`}
            </p>
          </div>
          <button
            type="button"
            className="ds-btn ds-btn--outline ds-btn--sm"
            onClick={() => {
              setPhase("idle");
              setResult(null);
              setPageStatuses([]);
            }}
          >
            Voltar à revisão
          </button>
        </div>
      ) : null}

      <div className="ds-review-split relative">
        <section className="ds-review-panel">
          <div className="ds-review-panel-head">
            <span className="text-[13px] font-medium">Encarte</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                {pages.length
                  ? `p. ${pageIdx + 1} / ${pages.length}`
                  : "sem páginas"}
              </span>
              {flyer ? (
                <button
                  type="button"
                  className="ds-btn ds-btn--sm ds-btn--danger"
                  disabled={busy || discarding || phase === "running"}
                  onClick={() => setDiscardOpen(true)}
                  title="Apaga encarte inteiro ou só esta página"
                >
                  {discarding ? "Apagando…" : "Excluir encarte"}
                </button>
              ) : null}
            </div>
          </div>

          {data.flyers.length > 1 ? (
            <div className="ds-review-flyer-tabs">
              {data.flyers.map((f) => (
                <button
                  key={f._id}
                  type="button"
                  className={`ds-chip ds-chip--outline ${f._id === flyer?._id ? "ds-chip--on" : ""}`}
                  onClick={() => setFlyerId(f._id)}
                >
                  {f.title.slice(0, 28)}
                  {f.offers.length ? ` · ${f.offers.length}` : ""}
                </button>
              ))}
            </div>
          ) : null}

          <div className="ds-review-page">
            {flyer ? (
              <>
                <p className="text-[13px] font-medium">
                  {store}
                  {flyer.offers[0]
                    ? ` · ${formatRange(
                        flyer.offers[0].validFrom,
                        flyer.offers[0].validUntil,
                      )}`
                    : ""}
                </p>
                {page?.url || flyer.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={page?.url ?? flyer.coverUrl ?? undefined}
                    alt={`Encarte ${flyer.title}`}
                  />
                ) : (
                  <p className="ds-meta">Sem imagem deste encarte.</p>
                )}
                {pages.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {pages.map((p, i) => (
                      <button
                        key={p.pageNumber}
                        type="button"
                        className={`ds-btn ds-btn--sm ${i === pageIdx ? "ds-btn--primary" : "ds-btn--outline"}`}
                        onClick={() => setPageIdx(i)}
                      >
                        p. {p.pageNumber}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="ds-meta">Nenhum encarte nesta run.</p>
            )}
          </div>
        </section>

        <section className="ds-review-panel">
          <div className="ds-review-panel-head">
            <span className="text-[13px] font-medium">Ofertas extraídas</span>
            <span className="text-xs text-[var(--ds-color-muted-foreground)]">
              {pendingPage} pendentes nesta página
            </span>
          </div>

          <div className="ds-table-cols">
            <span className="ds-label-caps min-w-0 flex-1">Produto</span>
            <span className="ds-label-caps w-[72px] shrink-0">Pack</span>
            <span className="ds-label-caps w-[72px] shrink-0">De</span>
            <span className="ds-label-caps w-[72px] shrink-0">Por</span>
            <span className="ds-label-caps w-[258px] shrink-0 text-right">
              Ação
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {pageOffers.map((o) => {
              const editing = editId === o._id;
              const diff = diffMap.get(diffKey(o));
              const note = conditionNote(o);
              return (
                <div
                  key={o._id}
                  className={`ds-review-sku-row ${editing ? "ds-review-sku-row--edit" : ""}`}
                >
                  {editing ? (
                    <>
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          className="ds-search w-full"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <input
                            className="ds-search w-[72px]"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            placeholder="Qtd"
                          />
                          <select
                            className="ds-search w-[88px]"
                            value={editUnit}
                            onChange={(e) => setEditUnit(e.target.value)}
                          >
                            <option value="">unid</option>
                            {PACK_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                          <input
                            className="ds-search w-[72px]"
                            value={editOriginal}
                            onChange={(e) => setEditOriginal(e.target.value)}
                            placeholder="De"
                          />
                          <input
                            className="ds-search w-[72px]"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            placeholder="Por"
                          />
                        </div>
                        <ConditionFields value={editConds} onChange={setEditConds} />
                      </div>
                      <div className="ds-review-actions">
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--primary"
                          disabled={busy}
                          onClick={() => void saveEdit()}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--outline"
                          onClick={() => setEditId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">
                          {o.name}
                          {o.validationStatus !== "pending" ? (
                            <span className="ml-2 inline-block align-middle">
                              <StatusBadge status={o.validationStatus} />
                            </span>
                          ) : null}
                        </span>
                        {note ? (
                          <span
                            className="mt-0.5 block truncate text-[11px] text-[var(--ds-color-muted-foreground)]"
                            title={note}
                          >
                            {note}
                          </span>
                        ) : null}
                      </span>
                      <span className="w-[72px] shrink-0 font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                        {formatPack(o.quantity, o.unit) ?? "—"}
                      </span>
                      <span className="w-[72px] shrink-0 font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                        {o.originalPrice != null ? money(o.originalPrice) : "—"}
                      </span>
                      <span className="w-[72px] shrink-0 font-mono text-xs">
                        {diff ? (
                          <span>
                            <span className="text-[var(--ds-color-muted-foreground)] line-through">
                              {money(diff.beforePrice)}
                            </span>
                            {" → "}
                            <span style={{ color: "var(--ds-color-harbor)" }}>
                              {money(diff.afterPrice)}
                            </span>
                          </span>
                        ) : (
                          money(o.price)
                        )}
                        {o.installmentCount && o.installmentAmount != null ? (
                          <span className="mt-0.5 block font-sans text-[10px] text-[var(--ds-color-muted-foreground)]">
                            {o.installmentCount}x {money(o.installmentAmount)}
                          </span>
                        ) : null}
                      </span>
                      <div className="ds-review-actions">
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--primary"
                          disabled={busy || o.validationStatus === "validated"}
                          onClick={() => void onOk(o._id)}
                        >
                          Ok
                        </button>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--outline"
                          disabled={busy}
                          onClick={() => startEdit(o)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--ghost-danger"
                          disabled={busy || o.validationStatus === "rejected"}
                          onClick={() => void onTrash(o._id)}
                        >
                          Lixo
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {!pageOffers.length ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
                Nenhuma oferta neste encarte.
              </p>
            ) : null}
          </div>

          <div className="ds-review-panel-head border-t border-[var(--ds-color-border)]">
            <button
              type="button"
              className="text-[13px] text-[var(--ds-color-muted-foreground)] hover:underline"
              disabled={busy}
              onClick={() => void returnToQueue()}
            >
              Devolver à fila
            </button>
            <span className="text-xs text-[var(--ds-color-muted-foreground)]">
              {phase === "result" && result
                ? `${result.locked} travada · ${result.diffs.length} atualizadas`
                : null}
              {phase === "result" && result ? " · " : null}
              {counts.ok} ok · {counts.edit} editar · {counts.trash} lixo
              {counts.pending ? ` · ${counts.pending} pend.` : ""}
            </span>
          </div>
        </section>

        {phase === "running" ? (
          <div className="ds-reanalyze-progress">
            <div className="ds-reanalyze-progress-card">
              <p className="text-[15px] font-semibold">Reanálise em andamento</p>
              <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                Parse por página
                {progressTotal
                  ? ` · ${progressDone} / ${progressTotal}`
                  : ""}
              </p>
              <div className="ds-reanalyze-bar mt-3">
                <span
                  style={{
                    width: progressTotal
                      ? `${Math.round((progressDone / progressTotal) * 100)}%`
                      : "8%",
                  }}
                />
              </div>
              <ul className="mt-3 space-y-1.5">
                {pageStatuses.map((p) => (
                  <li
                    key={p.pageNumber}
                    className="flex items-center justify-between text-[13px]"
                  >
                    <span className="flex items-center gap-2 font-mono text-xs">
                      <span
                        className="ds-dot"
                        style={{
                          background:
                            p.status === "done"
                              ? "var(--ds-color-success)"
                              : p.status === "running"
                                ? "var(--ds-color-harbor)"
                                : p.status === "failed"
                                  ? "var(--ds-color-danger)"
                                  : "var(--ds-color-border)",
                        }}
                      />
                      parse_p{p.pageNumber}
                    </span>
                    <span className="text-xs text-[var(--ds-color-muted-foreground)]">
                      {p.status === "done"
                        ? "Concluído"
                        : p.status === "running"
                          ? "Em execução"
                          : p.status === "failed"
                            ? "Falha"
                            : p.status === "skipped"
                              ? "Fora do recorte"
                              : "Fila"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[var(--ds-color-muted-foreground)]">
                O restante do ops continua disponível. Isto não é scrape nem
                worker.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <DiscardFlyerModal
        open={discardOpen}
        title={flyer?.title ?? store}
        pageNumber={page?.pageNumber}
        pageCount={pages.length}
        flyerOffers={flyer?.offers.length ?? 0}
        pageOffers={
          page && flyer
            ? flyer.offers.filter((o) => o.pageNumber === page.pageNumber)
                .length
            : 0
        }
        busy={discarding}
        onClose={() => setDiscardOpen(false)}
        onConfirm={(scope) => void onDiscard(scope)}
      />
      <ReanalyzeModal
        open={modalOpen}
        flyerTitle={flyer?.title ?? store}
        pages={pages.map((p) => ({ pageNumber: p.pageNumber, url: p.url }))}
        offers={(flyer?.offers ?? []).map((o) => ({
          validationStatus: o.validationStatus,
          pageNumber: o.pageNumber,
        }))}
        currentPage={page?.pageNumber}
        busy={busy}
        onClose={() => setModalOpen(false)}
        onConfirm={(args) => void startReanalyze(args)}
      />
    </div>
  );
}
