import type { Page } from "playwright";
import type {
  FlowStep,
  FlyerSource,
  NetworkFlyerDoc,
  RecordedAction,
  ScopeMetadata,
} from "../types/flows.js";
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
  /** True while main frame is mid-navigation — skip evaluate/screenshot. */
  navigating?: boolean;
  error?: string;
  networkFlyers: NetworkFlyerDoc[];
  harvestDispose?: () => void;
  scopeChain?: ScopeNode[];
  scopeIndex?: number;
  lastScopeMeta?: ScopeMetadata;
  lastJpegBase64?: string;
  proposed?: {
    startUrl: string;
    notes?: string;
    steps: FlowStep[];
    awaitDetail?: boolean;
  };
  snapQueue?: Promise<void>;
  /** Last teach flyerSource — saved into discover-flyer step. */
  flyerSource?: FlyerSource;
  /** Pass 1 of teach: listing cards. Pass 2 = user opened one flyer. */
  listingTeach?: import("./teach-repeat.js").ListingTeach;
  /** Last MiMo section classify — drives flyerSource on Aprovar. */
  sectionOpen?: {
    openKind: "download" | "viewer" | "need_click";
    downloadSelectors: string[];
    clickTargetSelectors: string[];
  };
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

export function slimAction(action: RecordedAction): RecordedAction {
  const { snapshot: _s, ...rest } = action;
  return rest;
}

export function pushAction(session: LiveSession, action: RecordedAction) {
  if (!session.recording) return;
  if (action.kind === "click") {
    const blob = [
      action.description,
      action.value,
      ...(action.selectors ?? []),
    ]
      .filter(Boolean)
      .join(" ");
    // Drop modal close / X — discover-flyer closes overlays itself
    if (
      /[×✕✖]|\bfechar\b|lucide-x|aria-label=["']?(close|fechar)/i.test(blob)
    ) {
      return;
    }
  }
  const last = session.actions[session.actions.length - 1];
  if (
    last &&
    last.kind === action.kind &&
    last.value === action.value &&
    JSON.stringify(last.selectors) === JSON.stringify(action.selectors) &&
    Date.now() - session.lastActivityAt < 300
  ) {
    if (!last.snapshot && action.snapshot) last.snapshot = action.snapshot;
    return;
  }
  session.actions.push(action);
  touch(session);
  emit(session, { type: "action", action: slimAction(action) });
  emit(session, {
    type: "actions",
    actions: session.actions.map(slimAction),
  });
}