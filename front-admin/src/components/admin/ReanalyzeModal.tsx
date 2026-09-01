"use client";

import { useEffect, useMemo, useState } from "react";

export type ReanalyzeScope = "flyer" | "pages";

export type ReanalyzeOffer = {
  validationStatus: string;
  pageNumber?: number;
};

export type ReanalyzePage = {
  pageNumber: number;
  url: string | null;
};

export function ReanalyzeModal({
  open,
  flyerTitle,
  pages,
  offers,
  currentPage,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  flyerTitle: string;
  pages: ReanalyzePage[];
  offers: ReanalyzeOffer[];
  currentPage?: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (args: {
    scope: ReanalyzeScope;
    pages?: number[];
    includeLocked: boolean;
  }) => void;
}) {
  const [scope, setScope] = useState<ReanalyzeScope>("flyer");
  const [selected, setSelected] = useState<number[]>([]);
  const [includeLocked, setIncludeLocked] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope("flyer");
    setIncludeLocked(false);
    setSelected(
      currentPage != null
        ? [currentPage]
        : pages[0]
          ? [pages[0].pageNumber]
          : [],
    );
  }, [open, currentPage, pages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const scopedOffers = useMemo(() => {
    if (scope === "flyer") return offers;
    const set = new Set(selected);
    return offers.filter(
      (o) => o.pageNumber != null && set.has(o.pageNumber),
    );
  }, [offers, scope, selected]);

  const impact = useMemo(() => {
    const locked = scopedOffers.filter(
      (o) =>
        o.validationStatus === "validated" ||
        o.validationStatus === "suspicious",
    ).length;
    const pending = scopedOffers.filter(
      (o) => o.validationStatus === "pending",
    ).length;
    const trash = scopedOffers.filter(
      (o) => o.validationStatus === "rejected",
    ).length;
    const reprocess = includeLocked
      ? locked + pending + trash
      : pending + trash;
    return { locked, pending, trash, reprocess };
  }, [scopedOffers, includeLocked]);

  function togglePage(n: number) {
    setSelected((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort(),
    );
  }

  const emptyFlyer = pages.length > 0 && offers.length === 0;

  if (!open) return null;

  const canGo =
    !busy &&
    pages.length > 0 &&
    (scope === "flyer" || selected.length > 0);

  return (
    <div
      className="ds-modal-overlay"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        className="ds-modal"
        style={{ width: 560, maxWidth: "calc(100vw - 32px)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-labelledby="reanalyze-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="reanalyze-title"
              className="text-[22px] font-semibold tracking-[-0.02em]"
            >
              {emptyFlyer ? "Analisar encarte" : "Reanalisar ofertas"}
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-[var(--ds-color-muted-foreground)]">
              {emptyFlyer
                ? "Sem ofertas ainda. Roda MiMo nas páginas baixadas do encarte."
                : "Não dispara scrape nem worker. Reexecuta o parse das ofertas já extraídas deste encarte."}
            </p>
            <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
              {flyerTitle}
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
          <p className="ds-label-caps mb-2">Escopo</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-[10px] border px-3 py-3 text-left ${
                scope === "flyer"
                  ? "border-[var(--ds-color-harbor)] bg-[var(--ds-color-secondary)]"
                  : "border-[var(--ds-color-border)] bg-[var(--ds-color-card)]"
              }`}
              onClick={() => setScope("flyer")}
            >
              <span className="block text-[13px] font-medium">Encarte inteiro</span>
              <span className="mt-0.5 block text-xs text-[var(--ds-color-muted-foreground)]">
                {pages.length} página{pages.length === 1 ? "" : "s"} · parse global
              </span>
            </button>
            <button
              type="button"
              className={`rounded-[10px] border px-3 py-3 text-left ${
                scope === "pages"
                  ? "border-[var(--ds-color-harbor)] bg-[var(--ds-color-secondary)]"
                  : "border-[var(--ds-color-border)] bg-[var(--ds-color-card)]"
              }`}
              onClick={() => setScope("pages")}
            >
              <span className="block text-[13px] font-medium">Por página</span>
              <span className="mt-0.5 block text-xs text-[var(--ds-color-muted-foreground)]">
                Escolher páginas do encarte
              </span>
            </button>
          </div>
        </div>

        {scope === "pages" ? (
          <div>
            <p className="ds-label-caps mb-2">Páginas</p>
            <div className="flex flex-wrap gap-2">
              {pages.map((p) => {
                const on = selected.includes(p.pageNumber);
                return (
                  <button
                    key={p.pageNumber}
                    type="button"
                    onClick={() => togglePage(p.pageNumber)}
                    className={`flex w-[72px] flex-col overflow-hidden rounded-[8px] border ${
                      on
                        ? "border-[var(--ds-color-harbor)]"
                        : "border-[var(--ds-color-border)]"
                    }`}
                  >
                    <span
                      className="block h-[72px] w-full bg-[var(--ds-color-muted)]"
                      style={
                        p.url
                          ? {
                              backgroundImage: `url(${p.url})`,
                              backgroundSize: "cover",
                              backgroundPosition: "top",
                            }
                          : undefined
                      }
                    />
                    <span className="py-1 text-center font-mono text-xs">
                      {p.pageNumber}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--ds-color-muted-foreground)]">
              {selected.length
                ? `Páginas ${selected.join(" e ")} selecionadas · ${scopedOffers.length} ofertas no recorte`
                : "Selecione ao menos uma página"}
            </p>
          </div>
        ) : null}

        {emptyFlyer ? (
          <div className="rounded-[10px] border border-[var(--ds-color-border)] bg-[var(--ds-color-muted)] px-4 py-3">
            <p className="text-[13px] font-medium">Primeira análise</p>
            <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
              {pages.length} página{pages.length === 1 ? "" : "s"} no encarte · 0
              ofertas. Confirmando, worker chama MiMo nas imagens.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-[10px] border border-[var(--ds-color-border)] bg-[var(--ds-color-muted)] px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px]">Ofertas a reprocessar</span>
                <span className="font-mono text-lg font-semibold">
                  {impact.reprocess}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[var(--ds-color-muted-foreground)]">
                <div>
                  <p>Travadas (Ok + editadas)</p>
                  <p className="font-mono text-sm text-[var(--ds-color-foreground)]">
                    {impact.locked}
                  </p>
                </div>
                <div>
                  <p>Pendentes</p>
                  <p className="font-mono text-sm text-[var(--ds-color-foreground)]">
                    {impact.pending}
                  </p>
                </div>
                <div>
                  <p>Lixo</p>
                  <p className="font-mono text-sm text-[var(--ds-color-foreground)]">
                    {impact.trash}
                  </p>
                </div>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-[var(--ds-color-border)] px-3 py-3">
              <input
                type="checkbox"
                className="mt-0.5 h-[18px] w-[18px] accent-[var(--ds-color-harbor)]"
                checked={includeLocked}
                onChange={(e) => setIncludeLocked(e.target.checked)}
              />
              <span>
                <span className="block text-[13px] font-medium">
                  Incluir ofertas Ok e editadas
                </span>
                <span className="mt-0.5 block text-xs text-[var(--ds-color-muted-foreground)]">
                  Desligado: edições humanas ficam travadas. Só reanalisa Lixo e
                  pendentes.
                </span>
              </span>
            </label>
          </>
        )}

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
            className="ds-btn ds-btn--primary"
            disabled={!canGo}
            onClick={() =>
              onConfirm({
                scope,
                pages: scope === "pages" ? selected : undefined,
                includeLocked,
              })
            }
          >
            {emptyFlyer
              ? "Analisar encarte"
              : scope === "pages"
                ? "Reanalisar páginas"
                : "Reanalisar encarte"}
          </button>
        </div>
      </div>
    </div>
  );
}
