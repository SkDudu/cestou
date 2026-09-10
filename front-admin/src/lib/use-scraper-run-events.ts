"use client";
import { useEffect } from "react";

export function useScraperRunEvents(runId: string | undefined, onEvent: () => void) {
  useEffect(() => {
    if (!runId) return;
    const source = new EventSource(`/api/v1/admin/scraper-runs/${runId}/events`, { withCredentials: true });
    source.onmessage = onEvent;
    source.addEventListener("worker.completed", onEvent);
    source.addEventListener("worker.failed", onEvent);
    return () => source.close();
  }, [runId, onEvent]);
}
