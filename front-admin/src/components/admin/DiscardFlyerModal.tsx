"use client";

import { useEffect, useState } from "react";

export type DiscardScope = "flyer" | "page";

export function DiscardFlyerModal({
  open,
  title,
  pageNumber,
  pageCount,
  flyerOffers,
  pageOffers,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  pageNumber?: number;
  pageCount: number;
  flyerOffers: number;
  pageOffers: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (scope: DiscardScope) => void;
}) {
  const onlyOne = pageCount <= 1;
  const [scope, setScope] = useState<DiscardScope>(
    onlyOne ? "flyer" : "page",
  );

  useEffect(() => {
    if (!open) return;
    setScope(onlyOne ? "flyer" : "page");
  }, [open, onlyOne]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const n = scope === "flyer" ? flyerOffers : pageOffers;

  return (
    <div
      className="ds-modal-overlay"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        className="ds-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-labelledby="discard-flyer-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="discard-flyer-title"
              className="text-[22px] font-semibold tracking-[-0.02em]"
            >
              Excluir
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-[var(--ds-color-muted-foreground)]">
              {title}
            </p>
            <p className="mt-1 text-xs text-[var(--ds-color-danger)]">
              Irreversível.
            </p>
          </div>
          <button
            type="button"
            className="ds-modal-x"
            disabled={busy}
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div>
          <p className="ds-label-caps mb-2">O que apagar</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-[10px] border px-3 py-3 text-left ${
                scope === "flyer"
                  ? "border-[var(--ds-color-danger)] bg-[var(--ds-color-danger)]/10"
                  : "border-[var(--ds-color-border)] bg-[var(--ds-color-card)]"
              }`}
              onClick={() => setScope("flyer")}
            >
              <span className="block text-[13px] font-medium">
                Encarte inteiro
              </span>
              <span className="mt-0.5 block text-xs text-[var(--ds-color-muted-foreground)]">
                {pageCount} página{pageCount === 1 ? "" : "s"} · {flyerOffers}{" "}
                oferta{flyerOffers === 1 ? "" : "s"}
              </span>
            </button>
            <button
              type="button"
              className={`rounded-[10px] border px-3 py-3 text-left ${
                scope === "page"
                  ? "border-[var(--ds-color-danger)] bg-[var(--ds-color-danger)]/10"
                  : "border-[var(--ds-color-border)] bg-[var(--ds-color-card)]"
              }`}
              disabled={pageNumber == null}
              onClick={() => setScope("page")}
            >
              <span className="block text-[13px] font-medium">
                Só esta página
              </span>
              <span className="mt-0.5 block text-xs text-[var(--ds-color-muted-foreground)]">
                {pageNumber == null
                  ? "Sem página"
                  : onlyOne
                    ? `p. ${pageNumber} — última, apaga o encarte`
                    : `p. ${pageNumber} · ${pageOffers} oferta${pageOffers === 1 ? "" : "s"}`}
              </span>
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="ds-btn ds-btn--outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--danger"
            disabled={busy || (scope === "page" && pageNumber == null)}
            onClick={() => onConfirm(scope)}
          >
            {busy
              ? "Apagando…"
              : scope === "flyer"
                ? `Apagar encarte${n ? ` · ${n} oferta(s)` : ""}`
                : `Apagar p. ${pageNumber}${n ? ` · ${n} oferta(s)` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
