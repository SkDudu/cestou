"use client";

import { useEffect, useRef, useState } from "react";
import {
  checkWorkerHealth,
  runFlowRemote,
  startBrowserWorker,
  stopFlowRemote,
} from "@/lib/browser-session";

type Props = {
  flowId: string;
  onDone?: () => void;
};

export function FlowRunPanel({ flowId, onDone }: Props) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  async function onRun() {
    setError(null);
    setResult(null);
    setLines([]);
    setRunning(true);
    setStopping(false);
    try {
      if (!online) {
        setLines(["iniciando worker…"]);
        await startBrowserWorker();
        setOnline(true);
      }
      await runFlowRemote(
        { flowId, ctx: {} },
        (ev) => {
          if (ev.type === "log") {
            setLines((prev) => [...prev, ev.line]);
          } else if (ev.type === "done") {
            const cancelled = ev.error === "cancelled";
            const summary = cancelled
              ? `■ STOPPED — steps=${ev.stepsExecuted ?? 0}`
              : ev.ok
                ? `✓ SUCCESS — steps=${ev.stepsExecuted} stores=${ev.storesFound} flyers=${ev.flyersFound} offers=${ev.offersFound ?? 0}`
                : `✕ FAILED — ${ev.error ?? "unknown"}`;
            setResult(summary);
            setLines((prev) => [...prev, summary]);
            onDone?.();
          }
        },
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
      setStopping(false);
    }
  }

  async function onStop() {
    setStopping(true);
    setLines((prev) => [...prev, "… pedindo stop"]);
    try {
      await stopFlowRemote();
    } catch (err) {
      setError(String(err));
      setStopping(false);
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-zinc-200">Rodar fluxo</h2>
        <span
          className={`text-xs ${online ? "text-emerald-400" : "text-rose-400"}`}
        >
          {online === null
            ? "…"
            : online
              ? "● Worker online"
              : "● Worker offline"}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {running ? (
          <button
            type="button"
            disabled={stopping}
            onClick={() => void onStop()}
            className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-40"
          >
            {stopping ? "Parando…" : "Parar"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onRun()}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            Rodar fluxo
          </button>
        )}
      </div>

      {error ? <p className="mb-2 text-sm text-rose-400">{error}</p> : null}
      {result ? (
        <p
          className={`mb-2 text-sm ${
            result.startsWith("✓")
              ? "text-emerald-400"
              : result.startsWith("■")
                ? "text-amber-300"
                : "text-rose-400"
          }`}
        >
          {result}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-zinc-800 bg-black">
        <div className="border-b border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600">
          Console
        </div>
        <pre className="max-h-[28rem] overflow-y-auto p-3 font-mono text-xs leading-relaxed text-emerald-300">
          {lines.length === 0
            ? "// logs aparecem aqui ao rodar — discover → download → análise → fim"
            : lines.map((l, i) => (
                <div
                  key={`${i}-${l.slice(0, 40)}`}
                  className={
                    l.startsWith("✕") || l.includes(" ✕ ")
                      ? "text-rose-400"
                      : l.startsWith("✓") || l.includes(" ✓ ")
                        ? "text-emerald-300"
                        : l.startsWith("[EXTRACT]") ||
                            l.startsWith("[DOWNLOAD]") ||
                            l.startsWith("[FLYER]") ||
                            l.startsWith("[DISCOVER]")
                          ? "text-sky-300"
                          : l.startsWith("■") || l.startsWith("…")
                            ? "text-amber-300"
                            : undefined
                  }
                >
                  {l}
                </div>
              ))}
          <div ref={bottomRef} />
        </pre>
      </div>
    </section>
  );
}
