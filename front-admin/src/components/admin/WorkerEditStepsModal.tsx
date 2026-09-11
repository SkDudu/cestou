"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  WorkerSetupRecord,
  type WorkerSetupRecordHandle,
} from "@/components/admin/WorkerSetupRecord";
import {
  FlyerHarvestCheck,
  useHarvestPreview,
} from "@/components/admin/FlyerHarvestCheck";
import {
  EDIT_STEPS,
  WorkerSetupStepper,
} from "@/components/admin/WorkerSetupStepper";
import { stopBrowserSession } from "@/lib/browser-session";

export function WorkerEditStepsModal({
  open,
  flowId,
  startUrl,
  flowVersion,
  flowSlug,
  onSaved,
  onClose,
}: {
  open: boolean;
  flowId: string;
  startUrl: string;
  flowVersion: number;
  flowSlug: string;
  onSaved: (stepCount: number) => void;
  onClose: () => void;
}) {
  const recordRef = useRef<WorkerSetupRecordHandle>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"record" | "check">("record");
  const [previewSid, setPreviewSid] = useState<string | null>(null);
  const preview = useHarvestPreview(previewSid);
  const previewAuto = useRef("");
  const busyRef = useRef(busy);
  const previewSidRef = useRef(previewSid);
  const previewResetRef = useRef(preview.reset);
  busyRef.current = busy;
  previewSidRef.current = previewSid;
  previewResetRef.current = preview.reset;

  const cancelEdit = useCallback(async () => {
    if (busyRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const id = recordRef.current?.sessionId ?? previewSidRef.current;
      if (id) await stopBrowserSession(id);
    } catch {
      /* session already closed */
    }
    previewResetRef.current();
    previewAuto.current = "";
    setBusy(false);
    onClose();
  }, [onClose]);

  const openRef = useRef(false);
  useEffect(() => {
    if (!open) {
      openRef.current = false;
      return;
    }
    // Only reset when the modal opens — not when onClose/cancelEdit identity churns
    // (Convex setupEvents during Teste re-renders parent and used to kick back to record).
    const justOpened = !openRef.current;
    openRef.current = true;
    if (justOpened) {
      setReady(true);
      setError(null);
      setBusy(false);
      setPhase("record");
      setPreviewSid(null);
      previewAuto.current = "";
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      void cancelEdit();
    };
    window.addEventListener("keydown", trap, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", trap, true);
    };
  }, [open, cancelEdit]);

  useEffect(() => {
    if (!open || phase !== "check" || !previewSid) return;
    if (previewAuto.current === previewSid) return;
    previewAuto.current = previewSid;
    void preview.run();
    // once per enter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase, previewSid]);

  if (!open || !ready) return null;

  function goCheck() {
    if (!recordRef.current) return;
    if (!recordRef.current.canPersist) {
      setError("Aprova a listagem antes de testar.");
      return;
    }
    setError(null);
    setPreviewSid(recordRef.current.sessionId);
    previewAuto.current = "";
    setPhase("check");
  }

  async function save() {
    if (!recordRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const stepCount = await recordRef.current.persist();
      onSaved(stepCount);
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="ds-modal-overlay ds-modal-overlay--trap"
      role="presentation"
    >
      <div
        className="ds-modal ds-setup-modal ds-setup-modal--lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-edit-steps-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1
              id="worker-edit-steps-title"
              className="text-[20px] font-bold leading-[26px] tracking-[-0.03em]"
            >
              Editar steps
            </h1>
            <p className="mt-1 text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
              {phase === "check"
                ? "Confere títulos e páginas antes de salvar."
                : "Regrave cliques no Chromium ou Reanalisar com MiMo. Depois testa."}
            </p>
          </div>
          <button
            type="button"
            className="ds-modal-x"
            onClick={() => void cancelEdit()}
            disabled={busy || preview.running}
            aria-label="Cancelar edição"
          >
            ×
          </button>
        </header>

        <WorkerSetupStepper
          step={phase === "record" ? 1 : 2}
          steps={EDIT_STEPS}
        />

        <div className={phase === "record" ? "ds-setup-body" : "hidden"}>
          <WorkerSetupRecord
            key={`${flowId}-${open}`}
            ref={recordRef}
            variant="edit"
            flowId={flowId}
            startUrl={startUrl}
            flowVersion={flowVersion}
            onError={setError}
          />
        </div>

        {phase === "check" ? (
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

        {error && phase !== "record" ? (
          <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>
        ) : null}

        <div className="ds-setup-footer">
          <span className="min-w-0 truncate font-mono text-[13px] text-[var(--ds-color-muted-foreground)]">
            {flowSlug} · v{flowVersion}
          </span>
          {phase === "record" ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                disabled={busy}
                onClick={() => void cancelEdit()}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                disabled={busy}
                onClick={goCheck}
              >
                Testar encartes
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                disabled={busy || preview.running}
                onClick={() => void cancelEdit()}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                disabled={busy || preview.running}
                onClick={() => {
                  preview.reset();
                  previewAuto.current = "";
                  setPhase("record");
                }}
              >
                Voltar
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                disabled={busy || preview.running || !preview.ok}
                onClick={() => void save()}
              >
                {busy ? "Salvando…" : "Salvar steps"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
