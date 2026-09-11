"use client";

import { useEffect, useState } from "react";
import { eventLine } from "./workers";

const EVENT_TYPES = [
  "run.started",
  "run.cancelled",
  "worker.started",
  "worker.log",
  "worker.completed",
  "worker.failed",
  "step.started",
  "progress",
];

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

export function useScraperRunLog(runId: string | undefined) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!runId) return;
    setLines([]);
    setDone(false);
    const source = new EventSource(`/api/v1/admin/scraper-runs/${runId}/events`, { withCredentials: true });
    const handle = (type: string) => (event: MessageEvent) => {
      let payload: unknown = event.data;
      try {
        payload = JSON.parse(event.data);
      } catch {
        /* keep raw */
      }
      setLines((prev) => [...prev, eventLine(type, payload)]);
      if (type === "worker.completed" || type === "worker.failed" || type === "run.cancelled") {
        setDone(true);
      }
    };
    source.onmessage = handle("message");
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, handle(type));
    }
    return () => source.close();
  }, [runId]);

  return { lines, done };
}
