"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeBrowserSession,
  checkWorkerHealth,
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
    <section className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-zinc-200">Ensinar fluxo</h2>
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

      <p className="mb-3 text-xs text-zinc-500">
        Chromium headed. Clique no site até os encartes. MiMo vira JSON
        stepper. Depois: Rodar fluxo (download + extract).
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
              disabled={busy || actions.length === 0}
              onClick={() => void analyze()}
              className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-40"
            >
              {busy ? "MiMo analisando…" : "Analisar com MiMo"}
            </button>
            <button
              type="button"
              disabled={busy || !proposed}
              onClick={() => void save()}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Salvando…" : "Salvar steps"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void close()}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 disabled:opacity-40"
            >
              Fechar
            </button>
          </>
        )}
      </div>

      {error ? <p className="mb-3 text-sm text-rose-400">{error}</p> : null}
      {savedMsg ? (
        <p className="mb-3 text-sm text-emerald-400">{savedMsg}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-black">
          {frame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frame} alt="Preview" className="w-full" />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-zinc-600">
              Preview (abra o Chromium)
            </div>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto rounded-md border border-zinc-800">
          <div className="border-b border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs uppercase text-zinc-500">
            Cliques ({actions.length})
          </div>
          <ol className="space-y-1 p-2 text-xs text-zinc-300">
            {actions.map((a, i) => (
              <li
                key={`${i}-${a.kind}-${a.description}`}
                className="flex items-start gap-2 rounded bg-zinc-950/60 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-zinc-500">{i + 1}. </span>
                  <span className="font-medium text-zinc-100">{a.kind}</span>
                  {a.semantic ? (
                    <span className="text-sky-400"> · {a.semantic}</span>
                  ) : null}
                  <div className="truncate text-zinc-500">
                    {a.description || a.value || a.url || "—"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeClick(i)}
                  className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-rose-800 hover:text-rose-300 disabled:opacity-40"
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
        <div className="mt-4 rounded-md border border-zinc-800 p-3">
          <p className="mb-2 text-xs text-emerald-400">
            Stepper MiMo
            {proposed.notes ? ` · ${proposed.notes}` : ""}
          </p>
          <ol className="mb-3 space-y-1 text-sm text-zinc-200">
            {proposed.steps.map((s) => (
              <li key={s.order} className="flex gap-2">
                <span className="w-6 text-zinc-500">{s.order + 1}.</span>
                <span className="font-mono text-xs text-sky-300">{s.type}</span>
                <span className="truncate text-xs text-zinc-500">
                  {s.config.selector ||
                    (s.config.selectors as string[] | undefined)?.[0] ||
                    (s.config.url as string | undefined) ||
                    (s.config.description as string | undefined) ||
                    ""}
                </span>
              </li>
            ))}
          </ol>
          <pre className="max-h-48 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[10px] text-zinc-500">
            {JSON.stringify(proposed, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
