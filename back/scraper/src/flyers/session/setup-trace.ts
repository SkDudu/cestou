import { appendSetupEvent } from "../core/flyer-storage.js";
import type { RecordedAction } from "../types/flows.js";
import type { LiveSession } from "./types.js";
import { slimAction } from "./types.js";

const MAX_PAYLOAD = 14_000;

export type SetupTraceKind =
  | "flow_created"
  | "session_start"
  | "session_close"
  | "navigation"
  | "click"
  | "input"
  | "scroll"
  | "scope"
  | "locate"
  | "analyze"
  | "confirm_scope"
  | "preview"
  | "save"
  | "skip_flyer"
  | "remove_action"
  | "status";

export function truncateSetupPayload(obj: unknown): string {
  try {
    const s = JSON.stringify(obj, (_k, v) => {
      if (typeof v === "string" && v.length > 2400) {
        return `${v.slice(0, 2400)}…`;
      }
      return v;
    });
    if (s.length <= MAX_PAYLOAD) return s;
    return `${s.slice(0, MAX_PAYLOAD)}…[truncated]`;
  } catch {
    return "{}";
  }
}

type TraceTarget = Pick<LiveSession, "flowId" | "sessionId">;

export function traceSetup(
  target: TraceTarget,
  kind: SetupTraceKind,
  label: string,
  payload?: unknown,
): void {
  void appendSetupEvent({
    flowId: target.flowId,
    sessionId: target.sessionId,
    kind,
    label,
    payload: payload !== undefined ? truncateSetupPayload(payload) : undefined,
  }).catch(() => undefined);
}

export function traceRecordedAction(
  session: LiveSession,
  action: RecordedAction,
): void {
  const slim = slimAction(action);
  const blob = [
    slim.description,
    slim.value,
    ...(slim.selectors ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  if (slim.kind === "click") {
    traceSetup(session, "click", blob.slice(0, 200) || "Clique", {
      selectors: slim.selectors,
      value: slim.value,
      semantic: slim.semantic,
      url: slim.url,
      metadata: slim.metadata,
    });
    return;
  }
  if (slim.kind === "navigation") {
    traceSetup(session, "navigation", slim.url ?? slim.description ?? "Navegação", {
      url: slim.url,
      description: slim.description,
    });
    return;
  }
  if (slim.kind === "scope") {
    traceSetup(session, "scope", slim.description ?? "Escopo", {
      selectors: slim.selectors,
      value: slim.value,
      metadata: slim.metadata,
    });
    return;
  }
  if (slim.kind === "scroll") {
    traceSetup(session, "scroll", slim.description ?? "Scroll", {
      value: slim.value,
    });
    return;
  }
  if (slim.kind === "input" || slim.kind === "change") {
    traceSetup(session, "input", slim.description ?? "Input", {
      selectors: slim.selectors,
      value: slim.value,
    });
  }
}
