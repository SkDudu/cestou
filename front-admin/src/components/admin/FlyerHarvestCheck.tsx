"use client";

import { useState } from "react";
import {
  previewDiscoverRemote,
  skipFlyerRemote,
  type HarvestPreviewFlyer,
} from "@/lib/browser-session";

export function useHarvestPreview(sessionId: string | null) {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [flyers, setFlyers] = useState<HarvestPreviewFlyer[] | null>(null);
  const [hidden, setHidden] = useState<HarvestPreviewFlyer[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!sessionId) {
      setError("Sessão fechada — volta no Chromium.");
      return;
    }
    setRunning(true);
    setError(null);
    setFlyers(null);
    setHidden([]);
    setLines([]);
    try {
      await previewDiscoverRemote(sessionId, (ev) => {
        if (ev.type === "log") {
          setLines((prev) => [...prev, ev.line]);
          return;
        }
        setFlyers(ev.flyers ?? []);
        if (ev.error) setError(ev.error);
      });
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setRunning(false);
    }
  }

  // ponytail: URL only — title skip nuked every same-name row
  async function skip(f: HarvestPreviewFlyer, index: number) {
    if (!sessionId) return;
    setError(null);
    try {
      await skipFlyerRemote(sessionId, { add: [f.originalUrl] });
      setFlyers((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
      setHidden((prev) => [...prev, f]);
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    }
  }

  async function restore() {
    if (!sessionId || !hidden.length) return;
    setError(null);
    try {
      await skipFlyerRemote(sessionId, {
        remove: hidden.map((f) => f.originalUrl),
      });
      setFlyers((prev) => (prev ? [...prev, ...hidden] : hidden));
      setHidden([]);
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    }
  }

  const ok = Boolean(flyers && flyers.length > 0 && !running);
  const warnN = flyers?.filter((f) => f.warn).length ?? 0;

  function reset() {
    setFlyers(null);
    setHidden([]);
    setLines([]);
    setError(null);
  }

  return {
    running,
    lines,
    flyers,
    error,
    run,
    skip,
    restore,
    ok,
    warnN,
    skippedN: hidden.length,
    reset,
  };
}

export function FlyerHarvestCheck({
  running,
  lines,
  flyers,
  error,
  skippedN,
  onRun,
  onSkip,
  onRestore,
}: {
  running: boolean;
  lines: string[];
  flyers: HarvestPreviewFlyer[] | null;
  error: string | null;
  skippedN: number;
  onRun: () => void;
  onSkip: (f: HarvestPreviewFlyer, index: number) => void;
  onRestore: () => void;
}) {
  const warnN = flyers?.filter((f) => f.warn).length ?? 0;
  return (
    <div className="ds-setup-card ds-setup-card--wide">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">Teste dos encartes</div>
          <p className="mt-1 text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
            Tira o que não é encarte. Worker ignora no run. Não salva no banco
            até confirmar.
          </p>
        </div>
        <button
          type="button"
          className="ds-btn ds-btn--outline ds-btn--sm shrink-0"
          disabled={running}
          onClick={onRun}
        >
          {running ? "Testando…" : flyers ? "Testar de novo" : "Testar agora"}
        </button>
      </div>

      {running ? (
        <p className="text-[13px] text-[var(--ds-color-primary)]">
          Abrindo encartes — espera. Voltar trava até acabar.
        </p>
      ) : null}

      {flyers ? (
        <div className="ds-table-card">
          <div className="ds-table-head">
            <span className="text-[13px] font-semibold">
              {flyers.length} encarte(s)
              {skippedN ? ` · ${skippedN} fora` : ""}
            </span>
            {skippedN ? (
              <button
                type="button"
                className="text-[12px] font-medium text-[var(--ds-color-primary)]"
                onClick={onRestore}
              >
                Desfazer
              </button>
            ) : warnN ? (
              <span className="text-[12px] font-medium text-amber-700">
                {warnN} com alerta
              </span>
            ) : flyers.length ? (
              <span className="text-[12px] font-medium text-[var(--ds-color-success)]">
                páginas e títulos ok
              </span>
            ) : (
              <span className="text-[12px] text-[var(--ds-color-danger)]">
                nenhum encarte
              </span>
            )}
          </div>
          <div className="ds-table-cols text-[11px] font-medium uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
            <span className="min-w-0 flex-1">Título</span>
            <span className="w-16 shrink-0 text-right">Págs</span>
            <span className="w-[160px] shrink-0 pl-4">Alerta</span>
            <span className="w-14 shrink-0" />
          </div>
          {flyers.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--ds-color-muted-foreground)]">
              {skippedN
                ? "Tirou todos. Desfazer ou testa de novo."
                : "Discover vazio — volta e Aprovar listagem de novo."}
            </div>
          ) : (
            flyers.map((f, i) => (
              <div
                key={`${i}-${f.originalUrl}`}
                className={`ds-table-row ${f.warn ? "bg-amber-50" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {f.title}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                  {f.pageCount}
                </span>
                <span className="w-[160px] shrink-0 truncate pl-4 text-[11px] text-amber-800">
                  {f.warn ?? "—"}
                </span>
                <button
                  type="button"
                  className="ds-btn ds-btn--outline ds-btn--sm w-14 shrink-0 px-0"
                  onClick={() => onSkip(f, i)}
                  aria-label={`Tirar ${f.title}`}
                >
                  Tirar
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {lines.length ? (
        <ol className="max-h-36 overflow-auto rounded-[var(--ds-radius-md)] bg-[var(--ds-color-muted)] px-3 py-2 font-mono text-[11px] leading-4 text-[var(--ds-color-muted-foreground)]">
          {lines.slice(-40).map((l, i) => (
            <li key={`${i}-${l.slice(0, 24)}`}>{l}</li>
          ))}
        </ol>
      ) : null}

      {error ? (
        <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
