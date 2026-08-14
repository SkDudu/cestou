"use client";

import { useState } from "react";
import { startBrowserWorker } from "@/lib/browser-session";

type Props = {
  onStarted?: () => void;
};

export function WorkerStartButton({ onStarted }: Props) {
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

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onStart()}
        className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-40"
      >
        {busy ? "Iniciando worker…" : "Iniciar worker"}
      </button>
      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
    </span>
  );
}
