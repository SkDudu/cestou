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
          className="ds-btn ds-btn--primary disabled:opacity-40"
        >
          {busy ? "Iniciando…" : "Iniciar worker"}
        </button>
      ) : null}
      {showStop ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onStop()}
          className="ds-btn ds-btn--danger disabled:opacity-40"
        >
          {busy ? "Parando…" : "Parar worker"}
        </button>
      ) : null}
      {error ? (
        <span className="text-xs text-[var(--ds-color-danger)]">{error}</span>
      ) : null}
    </span>
  );
}
