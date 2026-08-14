import type { Page } from "playwright";
import type { NetworkFlyerDoc, RecordedAction, ScopeMetadata } from "../types/flows.js";
import type { ScopeNode } from "./scope-pick.js";

export type SessionStatus =
  | "starting"
  | "ready"
  | "recording"
  | "stopping"
  | "closed"
  | "error";

export type SessionEvent =
  | { type: "frame"; ts: number; width: number; height: number; jpegBase64: string }
  | { type: "url"; url: string }
  | { type: "action"; action: RecordedAction }
  | { type: "status"; status: SessionStatus }
  | { type: "error"; message: string }
  | { type: "actions"; actions: RecordedAction[] };

export type LiveSession = {
  sessionId: string;
  flowId: string;
  startUrl: string;
  status: SessionStatus;
  createdAt: number;
  lastActivityAt: number;
  viewport: { width: number; height: number };
  currentUrl: string;
  recording: boolean;
  actions: RecordedAction[];
  page: Page;
  closeBrowser: () => Promise<void>;
  subscribers: Set<(ev: SessionEvent) => void>;
  screenshotTimer?: ReturnType<typeof setInterval>;
  error?: string;
  networkFlyers: NetworkFlyerDoc[];
  harvestDispose?: () => void;
  scopeChain?: ScopeNode[];
  scopeIndex?: number;
  lastScopeMeta?: ScopeMetadata;
};

export function emit(session: LiveSession, ev: SessionEvent) {
  for (const sub of session.subscribers) {
    try {
      sub(ev);
    } catch {
      /* ignore broken subscriber */
    }
  }
}

export function touch(session: LiveSession) {
  session.lastActivityAt = Date.now();
}

export function pushAction(session: LiveSession, action: RecordedAction) {
  if (!session.recording) return;
  const last = session.actions[session.actions.length - 1];
  if (
    last &&
    last.kind === action.kind &&
    last.value === action.value &&
    JSON.stringify(last.selectors) === JSON.stringify(action.selectors) &&
    Date.now() - session.lastActivityAt < 300
  ) {
    return;
  }
  session.actions.push(action);
  touch(session);
  emit(session, { type: "action", action });
  emit(session, { type: "actions", actions: session.actions });
}
