"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { WorkerSetupStepper } from "@/components/admin/WorkerSetupStepper";
import {
  WorkerSetupRecord,
  type WorkerSetupRecordHandle,
} from "@/components/admin/WorkerSetupRecord";
import {
  FlyerHarvestCheck,
  useHarvestPreview,
} from "@/components/admin/FlyerHarvestCheck";
import type { SessionAction } from "@/lib/browser-session";

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

export function WorkerSetupModal({
  open,
  onClose,
  presetSupermarketId,
}: {
  open: boolean;
  onClose: () => void;
  presetSupermarketId?: string;
}) {
  const router = useRouter();
  const markets = useQuery(api.supermarkets.listNames);
  const create = useMutation(api.scraperFlows.create);
  const update = useMutation(api.scraperFlows.update);
  const recordRef = useRef<WorkerSetupRecordHandle>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [supermarketId, setSupermarketId] = useState(presetSupermarketId ?? "");
  const [scope, setScope] = useState<"supermarket" | "store">("supermarket");
  const [storeId, setStoreId] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [flowId, setFlowId] = useState<Id<"scraperFlows"> | null>(null);
  const [savedActions, setSavedActions] = useState<SessionAction[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [previewSid, setPreviewSid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const preview = useHarvestPreview(previewSid);
  const previewAuto = useRef("");

  const branches = useQuery(
    api.stores.listBySupermarket,
    supermarketId
      ? { supermarketId: supermarketId as Id<"supermarkets"> }
      : "skip",
  );
  const activeBranches = useMemo(
    () => (branches ?? []).filter((s) => s.active),
    [branches],
  );

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSupermarketId(presetSupermarketId ?? "");
    setScope("supermarket");
    setStoreId("");
    setStartUrl("");
    setFlowId(null);
    setSavedActions([]);
    setSavedCount(0);
    setPreviewSid(null);
    setError(null);
    setBusy(false);
  }, [open, presetSupermarketId]);

  useEffect(() => {
    if (!open) return;
    setReady(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      e.preventDefault();
      e.stopPropagation();
      if (step <= 2) onClose();
    };
    window.addEventListener("keydown", trap, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", trap, true);
    };
  }, [open, busy, step, onClose]);

  const market = useMemo(
    () => markets?.find((m) => m._id === supermarketId),
    [markets, supermarketId],
  );
  const branch = useMemo(
    () => activeBranches.find((s) => s._id === storeId),
    [activeBranches, storeId],
  );
  const idPreview = market
    ? workerSlug(
        scope === "store" && branch
          ? `${market.name}_${branch.name}`
          : market.name,
      )
    : "wrk_…";

  function onScopeChange(next: "supermarket" | "store") {
    setScope(next);
    if (next === "supermarket") {
      setStoreId("");
      setStartUrl(market?.websiteUrl ?? "");
      return;
    }
    if (activeBranches.length === 1) {
      const only = activeBranches[0]!;
      setStoreId(only._id);
      setStartUrl(only.url?.trim() || market?.websiteUrl || "");
    } else {
      setStoreId("");
    }
  }

  function onBranchChange(id: string) {
    setStoreId(id);
    const s = activeBranches.find((x) => x._id === id);
    setStartUrl(s?.url?.trim() || market?.websiteUrl || "");
  }

  useEffect(() => {
    if (!open || !markets) return;
    if (supermarketId && !markets.some((m) => m._id === supermarketId)) {
      setSupermarketId("");
      return;
    }
    if (startUrl || !presetSupermarketId) return;
    const m = markets.find((x) => x._id === presetSupermarketId);
    if (m?.websiteUrl) setStartUrl(m.websiteUrl);
  }, [open, markets, presetSupermarketId, supermarketId, startUrl]);

  // sem filiais → força geral
  useEffect(() => {
    if (scope === "store" && branches !== undefined && !activeBranches.length) {
      setScope("supermarket");
      setStoreId("");
    }
  }, [scope, branches, activeBranches.length]);

  useEffect(() => {
    if (step !== 4 || !previewSid) return;
    if (previewAuto.current === previewSid) return;
    previewAuto.current = previewSid;
    void preview.run();
    // once per Chromium session enter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, previewSid]);

  async function openChromium() {
    if (!market) {
      setError("Escolha uma loja.");
      return;
    }
    if (scope === "store" && !storeId) {
      setError("Escolha uma filial.");
      return;
    }
    if (!startUrl.trim()) {
      setError("Informe a URL da fonte.");
      return;
    }
    setError(null);
    if (flowId) {
      setStep(3);
      return;
    }
    setBusy(true);
    try {
      const id = await create({
        supermarketId: market._id,
        name: market.name,
        startUrl: startUrl.trim(),
        scope,
        storeId:
          scope === "store" ? (storeId as Id<"stores">) : undefined,
      });
      setFlowId(id);
      setStep(3);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function finishRecord() {
    if (!recordRef.current) return;
    if (!recordRef.current.canPersist) {
      setError("Aprova a listagem antes de continuar.");
      return;
    }
    setError(null);
    const actions = recordRef.current.actions;
    setSavedActions(actions);
    setSavedCount(actions.length);
    setPreviewSid(recordRef.current.sessionId);
    previewAuto.current = "";
    setStep(4);
  }

  async function confirmWorker() {
    if (!flowId || !recordRef.current) return;
    setBusy(true);
    setError(null);
    try {
      await recordRef.current.persist();
      await update({ id: flowId, status: "active" });
      router.push(`/admin/scraper/${flowId}`);
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  if (!open || !ready) return null;

  const canDismiss = !busy && step <= 2;

  return createPortal(
    <div
      className="ds-modal-overlay ds-modal-overlay--trap"
      role="presentation"
      onClick={canDismiss ? onClose : undefined}
    >
      <div
        className="ds-modal ds-setup-modal ds-setup-modal--lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        {markets === undefined ? (
          <p className="ds-meta">Carregando…</p>
        ) : (
          <>
      <header className="flex items-start justify-between gap-3">
        <div>
        <h1
          id="worker-setup-title"
          className="text-[20px] font-bold leading-[26px] tracking-[-0.03em]"
        >
          Setup do worker
        </h1>
        <p className="mt-1 text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
          Escolha a loja, grave no Chromium, teste os encartes e confirme.
        </p>
        </div>
        <button
          type="button"
          className="ds-modal-x"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>
      </header>

      <WorkerSetupStepper step={step} />

      {step === 1 ? (
        <div className="ds-setup-body overflow-y-auto">
        <div className="ds-setup-card">
          <div>
            <div className="text-base font-semibold">
              {market ? market.name : "Disponibilidade"}
            </div>
            <p className="mt-1 text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
              {market
                ? "Escolha se o worker cobre toda a rede ou uma filial."
                : "Abra o setup a partir de um supermercado."}
            </p>
          </div>

          {supermarketId ? (
            <label className="flex w-full flex-col gap-1.5">
              <span className="text-[13px] font-medium">Disponibilidade</span>
              <select
                className="ds-select w-full"
                value={scope}
                onChange={(e) =>
                  onScopeChange(e.target.value as "supermarket" | "store")
                }
              >
                <option value="supermarket">Geral (toda a rede)</option>
                <option
                  value="store"
                  disabled={!activeBranches.length}
                >
                  {activeBranches.length
                    ? "Filial"
                    : "Filial (cadastre filiais antes)"}
                </option>
              </select>
            </label>
          ) : null}

          {scope === "store" && activeBranches.length ? (
            <label className="flex w-full flex-col gap-1.5">
              <span className="text-[13px] font-medium">Filial</span>
              <select
                className="ds-select w-full"
                value={storeId}
                onChange={(e) => onBranchChange(e.target.value)}
              >
                <option value="">Escolher filial…</option>
                {activeBranches.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                    {s.neighborhood ? ` · ${s.neighborhood}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex w-full flex-col gap-1.5">
            <span className="text-[13px] font-medium">ID do worker</span>
            <input
              readOnly
              value={idPreview}
              className="ds-input ds-input--muted w-full font-mono text-xs"
              tabIndex={-1}
            />
          </label>
          {market ? (
            <div className="flex flex-col gap-2.5 rounded-[var(--ds-radius-md)] bg-[var(--ds-color-muted)] px-4 py-3.5">
              <div className="text-[12px] font-semibold tracking-wide text-[var(--ds-color-muted-foreground)]">
                {scope === "store" && branch ? "DA FILIAL" : "DA REDE"}
              </div>
              <div className="flex gap-6">
                <div className="w-[120px] shrink-0">
                  <div className="text-xs text-[var(--ds-color-muted-foreground)]">
                    Cidade
                  </div>
                  <div className="text-sm font-medium">
                    {branch?.city ?? market.city}
                  </div>
                </div>
                <div className="w-16 shrink-0">
                  <div className="text-xs text-[var(--ds-color-muted-foreground)]">
                    UF
                  </div>
                  <div className="text-sm font-medium">
                    {branch?.state ?? market.state}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-[var(--ds-color-muted-foreground)]">
                    Site
                  </div>
                  <div className="truncate font-mono text-xs">
                    {(
                      (scope === "store" && branch?.url
                        ? branch.url
                        : market.websiteUrl) ?? ""
                    ).replace(/^https?:\/\//, "")}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="ds-setup-body overflow-y-auto">
        <form
          className="ds-setup-card"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void openChromium();
          }}
        >
          <div>
            <div className="text-base font-semibold">Fonte do encarte</div>
            <p className="mt-1 text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
              URL pré-preenchida da filial. Ajuste se o encarte estiver em outra
              página.
            </p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">URL</span>
            <input
              required
              type="url"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              className="ds-input font-mono text-xs"
              placeholder="https://…"
            />
          </label>
          {market ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--ds-color-muted-foreground)]">
                Loja
              </span>
              <span className="rounded-full bg-[var(--ds-color-muted)] px-2.5 py-1 text-xs font-medium">
                {market.name}
              </span>
            </div>
          ) : null}
          <div className="flex gap-3 rounded-[var(--ds-radius-md)] bg-[var(--ds-color-secondary)] px-4 py-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ds-color-primary)] text-xs font-bold text-white">
              AI
            </div>
            <div>
              <div className="text-[13px] font-semibold">
                Próximo: Chromium ao vivo
              </div>
              <p className="text-[13px] text-[var(--ds-color-muted-foreground)]">
                Abre a URL no browser local. Clique na página pra gravar os steps
                do worker.
              </p>
            </div>
          </div>
          <button type="submit" className="hidden" />
        </form>
        </div>
      ) : null}

      {flowId ? (
        <div className={step === 3 ? "ds-setup-body" : "hidden"}>
          <WorkerSetupRecord
            ref={recordRef}
            flowId={flowId}
            startUrl={startUrl.trim()}
            onError={setError}
          />
        </div>
      ) : null}

      {step === 4 ? (
        <div className="ds-setup-body overflow-y-auto">
          <FlyerHarvestCheck
            running={preview.running}
            lines={preview.lines}
            flyers={preview.flyers}
            error={preview.error}
            skippedN={preview.skippedN}
            onRun={() => void preview.run()}
            onSkip={(f, i) => void preview.skip(f, i)}
            onRestore={() => void preview.restore()}
          />
        </div>
      ) : null}

      {step === 5 ? (
        <div className="ds-setup-body overflow-y-auto">
        <div className="ds-setup-card ds-setup-card--wide">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold">Confirmar steps</div>
              <p className="mt-1 text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
                Gravados no Chromium. Confirme pra criar o worker.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[var(--ds-color-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--ds-color-primary)]">
              {savedCount || savedActions.length} steps
            </span>
          </div>
          <div className="flex gap-4 rounded-[var(--ds-radius-md)] bg-[var(--ds-color-muted)] px-3.5 py-3">
            <div className="w-40 shrink-0">
              <div className="text-[11px] text-[var(--ds-color-muted-foreground)]">
                Loja
              </div>
              <div className="text-[13px] font-medium">{market?.name}</div>
            </div>
            <div className="w-36 shrink-0">
              <div className="text-[11px] text-[var(--ds-color-muted-foreground)]">
                Disponibilidade
              </div>
              <div className="text-[13px] font-medium">
                {scope === "store"
                  ? branch?.name ?? "Filial"
                  : "Geral"}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-[var(--ds-color-muted-foreground)]">
                Fonte
              </div>
              <div className="truncate font-mono text-xs">{startUrl}</div>
            </div>
            <div className="w-[140px] shrink-0">
              <div className="text-[11px] text-[var(--ds-color-muted-foreground)]">
                ID
              </div>
              <div className="font-mono text-xs">{idPreview}</div>
            </div>
          </div>
          {preview.flyers?.length ? (
            <p className="text-[13px] text-[var(--ds-color-muted-foreground)]">
              Teste: {preview.flyers.length} encarte(s)
              {preview.warnN ? ` · ${preview.warnN} alerta(s)` : ""}.
            </p>
          ) : null}
          <ol className="ds-setup-actions">
            {savedActions.map((a, i) => (
              <li key={`${i}-${a.kind}`} className="ds-setup-action">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ds-radius-md)] bg-[var(--ds-color-secondary)] font-mono text-[11px] font-semibold text-[var(--ds-color-primary)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{a.kind}</div>
                  <div className="truncate font-mono text-[11px] text-[var(--ds-color-muted-foreground)]">
                    {a.description || a.value || a.url || a.semantic || "—"}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--ds-color-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--ds-color-muted-foreground)]">
                  {a.kind}
                </span>
              </li>
            ))}
            {savedActions.length === 0 ? (
              <li className="px-3 py-8 text-center text-xs text-[var(--ds-color-muted-foreground)]">
                Nenhum step gravado — worker fica só com a URL.
              </li>
            ) : null}
          </ol>
        </div>
        </div>
      ) : null}

      {error && step !== 3 ? (
        <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>
      ) : null}

      <div className="ds-setup-footer">
        <span className="text-[13px] text-[var(--ds-color-muted-foreground)]">
          Passo {step} de 5
        </span>
        <div className="flex items-center gap-2">
          {step === 1 ? (
            <button
              type="button"
              className="ds-btn ds-btn--primary"
              disabled={
                !market || (scope === "store" && !storeId)
              }
              onClick={() => {
                if (!startUrl) {
                  const fallback =
                    (scope === "store" && branch?.url
                      ? branch.url
                      : market?.websiteUrl) ?? "";
                  if (fallback) setStartUrl(fallback);
                }
                setStep(2);
              }}
            >
              Continuar
            </button>
          ) : null}
          {step === 2 ? (
            <>
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                disabled={busy}
                onClick={() => setStep(1)}
              >
                Voltar
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                disabled={
                  busy ||
                  !supermarketId ||
                  !startUrl.trim() ||
                  (scope === "store" && !storeId)
                }
                onClick={() => void openChromium()}
              >
                {busy ? "Criando…" : "Abrir Chromium"}
              </button>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                disabled={busy}
                onClick={() => setStep(2)}
              >
                Voltar
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                disabled={busy}
                onClick={() => void finishRecord()}
              >
                {busy ? "Salvando…" : "Continuar"}
              </button>
            </>
          ) : null}
          {step === 4 ? (
            <>
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                disabled={busy || preview.running}
                onClick={() => {
                  preview.reset();
                  previewAuto.current = "";
                  setStep(3);
                }}
              >
                Voltar
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                disabled={busy || preview.running || !preview.ok}
                onClick={() => setStep(5)}
              >
                {preview.running ? "Testando…" : "Continuar"}
              </button>
            </>
          ) : null}
          {step === 5 ? (
            <>
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                disabled={busy}
                onClick={() => setStep(4)}
              >
                Voltar
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                disabled={busy || !flowId}
                onClick={() => void confirmWorker()}
              >
                {busy ? "Ativando…" : "Criar worker"}
              </button>
            </>
          ) : null}
        </div>
        </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
