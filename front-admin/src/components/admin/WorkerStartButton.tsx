"use client";

import { useState } from "react";
import {
  startBrowserWorker,
  stopBrowserWorker,
} from "@/lib/browser-session";

type Props = {
  online?: boolean | null;
  onStarted?: () => void;
  onStopped?: () => void;
};

export function WorkerStartButton({ online, onStarted, onStopped }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onStart() {
    setError(null);
    setBusy(true);
    try {
      await startBrowserWorker();
      onStarted?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onStop() {
    setError(null);
    setBusy(true);
    try {
      await stopBrowserWorker();
      onStopped?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const showStop = online === true;
  const showStart = online !== true;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {showStart ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onStart()}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-40"
        >
          {busy ? "Iniciando…" : "Iniciar worker"}
        </button>
      ) : null}
      {showStop ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onStop()}
          className="rounded-md border border-rose-800 bg-rose-950/60 px-3 py-1.5 text-sm font-medium text-rose-300 hover:bg-rose-900 disabled:opacity-40"
        >
          {busy ? "Parando…" : "Parar worker"}
        </button>
      ) : null}
      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
    </span>
  );
}
