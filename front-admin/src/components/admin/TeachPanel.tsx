"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeBrowserSession,
  checkWorkerHealth,
  clickSession,
  createBrowserSession,
  removeSessionAction,
  saveBrowserSession,
  startBrowserWorker,
  stopBrowserSession,
  subscribeSessionEvents,
  type SessionAction,
} from "@/lib/browser-session";
import { WorkerStartButton } from "@/components/admin/WorkerStartButton";

type Props = {
  flowId: string;
  startUrl: string;
  onSaved?: () => void;
};

type Proposed = {
  version: number;
  startUrl: string;
  notes?: string;
  awaitDetail?: boolean;
  listingCount?: number;
  teachPass?: 1 | 2;
  steps: Array<{ order: number; type: string; config: Record<string, unknown> }>;
};

function interpolateUrl(startUrl: string) {
  return startUrl;
}

export function TeachPanel({ flowId, startUrl, onSaved }: Props) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState(startUrl);
  const [frame, setFrame] = useState<string | null>(null);
  const [actions, setActions] = useState<SessionAction[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [proposed, setProposed] = useState<Proposed | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const ok = await checkWorkerHealth();
      if (alive) setOnline(ok);
    };
    void tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    return () => {
      unsubRef.current?.();
      if (sessionId) void stopBrowserSession(sessionId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachEvents = useCallback((id: string) => {
    unsubRef.current?.();
    unsubRef.current = subscribeSessionEvents(id, (ev) => {
      if (ev.type === "frame") {
        setFrame(`data:image/jpeg;base64,${ev.jpegBase64}`);
      } else if (ev.type === "url") {
        setCurrentUrl(ev.url);
      } else if (ev.type === "actions") {
        setActions(ev.actions);
      } else if (ev.type === "error") {
        setError(ev.message);
      }
    });
  }, []);

  async function openBrowser() {
    setError(null);
    setSavedMsg(null);
    setProposed(null);
    setBusy(true);
    try {
      if (!online) {
        await startBrowserWorker();
        setOnline(true);
      }
      const s = await createBrowserSession({
        flowId,
        startUrl: interpolateUrl(startUrl),
      });
      setSessionId(s.sessionId);
      setCurrentUrl(s.currentUrl);
      setActions([]);
      attachEvents(s.sessionId);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPreviewClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!sessionId || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 720);
    try {
      await clickSession(sessionId, x, y);
    } catch (err) {
      setError(String(err));
    }
  }

  async function analyze() {
    if (!sessionId) return;
    setError(null);
    setBusy(true);
    try {
      const r = await analyzeBrowserSession(sessionId);
      setProposed(r);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!sessionId) return;
    setError(null);
    setBusy(true);
    try {
      const r = await saveBrowserSession(sessionId);
      setSavedMsg(`Salvos ${r.steps} steps`);
      onSaved?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeClick(index: number) {
    if (!sessionId) return;
    setError(null);
    try {
      await removeSessionAction(sessionId, index);
      setProposed(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function close() {
    if (!sessionId) return;
    setBusy(true);
    try {
      unsubRef.current?.();
      unsubRef.current = null;
      await stopBrowserSession(sessionId);
      setSessionId(null);
      setFrame(null);
      setActions([]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--ds-color-border)] bg-[var(--ds-color-card)]/30 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium ">Ensinar fluxo</h2>
        <span
          className={`text-xs ${online ? "text-emerald-400" : "text-rose-400"}`}
        >
          {online === null ? "…" : online ? "● Worker" : "● Worker off"}
        </span>
        {sessionId ? (
          <span className="rounded border border-rose-800 bg-rose-950 px-2 py-0.5 text-xs text-rose-300">
            GRAVANDO
          </span>
        ) : null}
        {online === false ? (
          <WorkerStartButton
            online={online}
            onStarted={() => setOnline(true)}
            onStopped={() => setOnline(false)}
          />
        ) : null}
      </div>

      <p className="mb-3 text-xs text-[var(--ds-color-muted-foreground)]">
        Chromium headed. Clique até os encartes. Analisar grava o fluxo — listing
        de cards não usa MiMo. MiMo só se o site não for listing. Depois: Rodar
        fluxo.
      </p>
      <p className="mb-3 truncate text-xs text-zinc-600">URL: {currentUrl}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {!sessionId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void openBrowser()}
            className="rounded-md bg-sky-800 px-3 py-1.5 text-sm font-medium text-sky-50 hover:bg-sky-700 disabled:opacity-40"
          >
            {busy ? "Abrindo…" : "Abrir Chromium"}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void analyze()}
              className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-40"
            >
              {busy ? "Analisando…" : "Analisar"}
            </button>
            <button
              type="button"
              disabled={busy || !proposed || proposed.awaitDetail}
              onClick={() => void save()}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Salvando…" : "Salvar steps"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void close()}
              className="rounded-md border border-[var(--ds-color-border)] px-3 py-1.5 text-sm text-[var(--ds-color-muted-foreground)] disabled:opacity-40"
            >
              Fechar
            </button>
          </>
        )}
      </div>

      {error ? <p className="mb-3 text-sm text-[var(--ds-color-danger)]">{error}</p> : null}
      {proposed?.awaitDetail ? (
        <p className="mb-3 rounded-md border border-amber-800 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
          {proposed.notes ??
            `Achei ${proposed.listingCount ?? "?"} encartes. Abre UM e Analisar de novo.`}
        </p>
      ) : null}
      {savedMsg ? (
        <p className="mb-3 text-sm text-emerald-400">{savedMsg}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-md border border-[var(--ds-color-border)] bg-black">
          {frame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={frame}
              alt="Preview"
              className="w-full cursor-crosshair"
              onClick={(e) => void onPreviewClick(e)}
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-zinc-600">
              Preview (abra o Chromium)
            </div>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto rounded-md border border-[var(--ds-color-border)]">
          <div className="border-b border-[var(--ds-color-border)] bg-[var(--ds-color-muted)] px-3 py-2 text-xs uppercase text-[var(--ds-color-muted-foreground)]">
            Cliques ({actions.length}) — Chromium ou preview
          </div>
          <ol className="space-y-1 p-2 text-xs ">
            {actions.map((a, i) => (
              <li
                key={`${i}-${a.kind}-${a.description}`}
                className="flex items-start gap-2 rounded bg-zinc-950/60 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-[var(--ds-color-muted-foreground)]">{i + 1}. </span>
                  <span className="font-medium ">{a.kind}</span>
                  {a.semantic ? (
                    <span className="text-sky-400"> · {a.semantic}</span>
                  ) : null}
                  <div className="truncate text-[var(--ds-color-muted-foreground)]">
                    {a.description || a.value || a.url || "—"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeClick(i)}
                  className="shrink-0 rounded border border-[var(--ds-color-border)] px-1.5 py-0.5 text-[10px] text-[var(--ds-color-muted-foreground)] hover:border-rose-800 hover:text-rose-300 disabled:opacity-40"
                  title="Remover clique"
                >
                  ✕
                </button>
              </li>
            ))}
            {actions.length === 0 ? (
              <li className="px-2 py-6 text-center text-zinc-600">
                Nenhum clique ainda
              </li>
            ) : null}
          </ol>
        </div>
      </div>

      {proposed ? (
        <div className="mt-4 rounded-md border border-[var(--ds-color-border)] p-3">
          <p className="mb-2 text-xs text-emerald-400">
            Stepper
            {proposed.teachPass ? ` · pass ${proposed.teachPass}` : " · MiMo"}
            {proposed.notes ? ` · ${proposed.notes}` : ""}
          </p>
          <ol className="mb-3 space-y-1 text-sm ">
            {proposed.steps.map((s) => (
              <li key={s.order} className="flex gap-2">
                <span className="w-6 text-[var(--ds-color-muted-foreground)]">{s.order + 1}.</span>
                <span className="font-mono text-xs text-sky-300">{s.type}</span>
                <span className="truncate text-xs text-[var(--ds-color-muted-foreground)]">
                  {s.config.selector ||
                    (s.config.selectors as string[] | undefined)?.[0] ||
                    (s.config.url as string | undefined) ||
                    (s.config.description as string | undefined) ||
                    ""}
                </span>
              </li>
            ))}
          </ol>
          <pre className="max-h-48 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[10px] text-[var(--ds-color-muted-foreground)]">
            {JSON.stringify(proposed, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
