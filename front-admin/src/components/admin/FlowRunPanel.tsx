"use client";

import { useEffect, useRef, useState } from "react";
import {
  checkWorkerHealth,
  runFlowRemote,
  startBrowserWorker,
  stopFlowRemote,
  type FlowRunEvent,
} from "@/lib/browser-session";

export type FlowRunDoneEvent = Extract<FlowRunEvent, { type: "done" }>;

export function useFlowRun(
  flowId: string,
  onDone?: (ev: FlowRunDoneEvent) => void,
) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

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

  async function onRun() {
    setError(null);
    setResult(null);
    setLastRunId(null);
    setLines([]);
    setStartedAt(Date.now());
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
            const duplicate = ev.error === "duplicate";
            const summary = cancelled
              ? `■ STOPPED — steps=${ev.stepsExecuted ?? 0}`
              : duplicate
                ? `■ DUPLICATE — steps=${ev.stepsExecuted} flyers=${ev.flyersFound}`
                : ev.ok
                  ? `✓ SUCCESS — steps=${ev.stepsExecuted} stores=${ev.storesFound} flyers=${ev.flyersFound} offers=${ev.offersFound ?? 0}`
                  : `✕ FAILED — ${ev.error ?? "unknown"}`;
            setResult(summary);
            setLines((prev) => [...prev, summary]);
            if (ev.runId) setLastRunId(ev.runId);
            onDoneRef.current?.(ev);
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

  return {
    online,
    running,
    stopping,
    lines,
    error,
    result,
    startedAt,
    lastRunId,
    onRun,
    onStop,
  };
}

export function FlowRunPanel({
  run,
}: {
  run: ReturnType<typeof useFlowRun>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { online, lines, error, result } = run;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <section className="rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold">Console</h2>
        <span
          className="text-xs"
          style={{
            color: online
              ? "var(--ds-color-success)"
              : "var(--ds-color-danger)",
          }}
        >
          {online === null ? "…" : online ? "Worker online" : "Worker offline"}
        </span>
      </div>
      {error ? (
        <p className="mb-2 text-sm text-[var(--ds-color-danger)]">{error}</p>
      ) : null}
      {result ? (
        <p className="mb-2 font-mono text-sm text-[var(--ds-color-foreground)]">
          {result}
        </p>
      ) : null}
      <pre className="max-h-[28rem] overflow-y-auto rounded-[10px] bg-[var(--ds-color-ink)] p-3 font-mono text-xs leading-relaxed text-[var(--ds-color-fog)]">
        {lines.length === 0
          ? "// logs ao rodar — discover → download → parse"
          : lines.map((l, i) => <div key={`${i}-${l.slice(0, 40)}`}>{l}</div>)}
        <div ref={bottomRef} />
      </pre>
    </section>
  );
}
