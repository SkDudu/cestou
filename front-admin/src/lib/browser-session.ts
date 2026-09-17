const BASE =
  process.env.NEXT_PUBLIC_BROWSER_SESSION_URL ?? "http://127.0.0.1:8791";

export type SessionAction = {
  kind: string;
  selectors?: string[];
  value?: string;
  description?: string;
  url?: string;
  semantic?: string;
};

export type SessionEvent =
  | { type: "frame"; ts: number; width: number; height: number; jpegBase64: string }
  | { type: "url"; url: string }
  | { type: "action"; action: SessionAction }
  | { type: "status"; status: string }
  | { type: "error"; message: string }
  | { type: "actions"; actions: SessionAction[] };

async function req(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function checkWorkerHealth(): Promise<boolean> {
  try {
    const res = await req("/health");
    if (!res.ok) return false;
    const j = (await res.json()) as { ok?: boolean };
    return Boolean(j.ok);
  } catch {
    return false;
  }
}

/** Next.js API → spawns local Playwright worker if it is down. */
export async function startBrowserWorker(): Promise<void> {
  const res = await fetch("/api/browser-worker", { method: "POST" });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !j.ok) {
    throw new Error(j.error ?? `Worker start failed HTTP ${res.status}`);
  }
}

/** Next.js API → POST /shutdown no worker e espera cair. */
export async function stopBrowserWorker(): Promise<void> {
  const res = await fetch("/api/browser-worker", { method: "DELETE" });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !j.ok) {
    throw new Error(j.error ?? `Worker stop failed HTTP ${res.status}`);
  }
}

export async function analyzeBrowserSession(sessionId: string): Promise<{
  version: number;
  startUrl: string;
  notes?: string;
  awaitDetail?: boolean;
  listingCount?: number;
  teachPass?: 1 | 2;
  steps: Array<{ order: number; type: string; config: Record<string, unknown> }>;
}> {
  const res = await req(`/sessions/${sessionId}/analyze`, {
    method: "POST",
    body: "{}",
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "analyze failed");
  return j;
}

export async function createBrowserSession(args: {
  flowId: string;
  startUrl: string;
}): Promise<{
  sessionId: string;
  status: string;
  currentUrl: string;
  eventsUrl: string;
}> {
  const res = await req("/sessions", {
    method: "POST",
    body: JSON.stringify(args),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "Failed to create session");
  return j;
}

export async function stopBrowserSession(sessionId: string) {
  await req(`/sessions/${sessionId}/stop`, { method: "POST", body: "{}" });
}

export async function startRecording(sessionId: string) {
  await req(`/sessions/${sessionId}/record/start`, {
    method: "POST",
    body: "{}",
  });
}

export async function stopRecording(sessionId: string) {
  await req(`/sessions/${sessionId}/record/stop`, {
    method: "POST",
    body: "{}",
  });
}

export type ScopeBox = { x: number; y: number; width: number; height: number };

export type ScopeNode = {
  tagName: string;
  selectors: string[];
  label: string;
  box: ScopeBox;
  linkCount: number;
  imageCount: number;
  textCount: number;
  childCount: number;
  id?: string;
  className?: string;
  textPreview?: string;
  ancestors?: ScopeNode[];
};

export type ProbeFlyer = {
  url: string;
  title?: string;
  kind: string;
  validFrom?: string;
  validUntil?: string;
};

export type ProbeResult = {
  found: boolean;
  selectorUsed?: string;
  flyers: ProbeFlyer[];
  tagName?: string;
  linkCount?: number;
  imageCount?: number;
  cardCount?: number;
  needPath?: boolean;
  error?: string;
};

export async function hoverSession(
  sessionId: string,
  x: number,
  y: number,
): Promise<ScopeNode | null> {
  const res = await req(`/sessions/${sessionId}/hover`, {
    method: "POST",
    body: JSON.stringify({ x, y }),
  });
  if (!res.ok) return null;
  return (await res.json()) as ScopeNode | null;
}

export async function clearSessionHover(sessionId: string) {
  await req(`/sessions/${sessionId}/hover`, {
    method: "POST",
    body: "{}",
  });
}

export async function pickSessionScope(
  sessionId: string,
  args: {
    x?: number;
    y?: number;
    ancestorIndex?: number;
    selectors?: string[];
    label?: string;
  },
): Promise<ScopeNode> {
  const res = await req(`/sessions/${sessionId}/pick-scope`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "pick-scope failed");
  return j as ScopeNode;
}

export type FlyerSourceInfo = {
  kind: string;
  downloadStrategy: string;
  itemSelectors?: string[];
  downloadSelectors?: string[];
  urlFrom?: string;
  evidence?: string;
  networkHints?: { urlIncludes?: string[]; jsonKeys?: string[] };
};

export type LocateFlyersResult = {
  pick: ScopeNode | null;
  probe: ProbeResult | null;
  selectors: string[];
  label: string;
  source: "dump" | "mimo";
  /** Vision model id from MIMO_MODEL (e.g. qwen2.5-vl-7b-instruct). */
  model?: string;
  status: "ready" | "need_click" | "not_found";
  humanHint: string;
  awaitDetail: boolean;
  listingCount?: number;
  stepCount: number;
  flyerSource?: FlyerSourceInfo;
  candidates?: LocateCandidate[];
  teachPass?: 1 | 2;
  openKind?: "download" | "viewer" | "need_click";
  itemSelectors?: string[];
};

export type LocateCandidate = {
  label: string;
  why?: string;
  selectors: string[];
  box?: ScopeBox;
};

export type HarvestPreviewFlyer = {
  title: string;
  pageCount: number;
  originalUrl: string;
  warn?: string;
};

export type PreviewDiscoverEvent =
  | { type: "log"; line: string; ts?: number }
  | {
      type: "done";
      ok: boolean;
      flyers: HarvestPreviewFlyer[];
      error?: string;
      ts?: number;
    };

/** POST /sessions/:id/skip-flyer — denylist on live flyerSource. */
export async function skipFlyerRemote(
  sessionId: string,
  args: { add?: string[]; remove?: string[] },
): Promise<string[]> {
  const res = await req(`/sessions/${sessionId}/skip-flyer`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  const j = (await res.json()) as { error?: string; skipKeys?: string[] };
  if (!res.ok) throw new Error(j.error ?? "skip-flyer failed");
  return j.skipKeys ?? [];
}

/** POST /sessions/:id/preview-discover — SSE, no persist. */
export async function previewDiscoverRemote(
  sessionId: string,
  onEvent: (ev: PreviewDiscoverEvent) => void,
): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/preview-discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error(
      (j as { error?: string }).error ?? `Preview failed HTTP ${res.status}`,
    );
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as PreviewDiscoverEvent);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function locateSessionFlyers(
  sessionId: string,
  opts?: {
    hint?: string;
    selectedStep?: {
      kind: string;
      selectors?: string[];
      description?: string;
      value?: string;
    };
  },
): Promise<LocateFlyersResult> {
  const res = await req(`/sessions/${sessionId}/locate-flyers`, {
    method: "POST",
    body: JSON.stringify({
      hint: opts?.hint,
      selectedStep: opts?.selectedStep,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "locate-flyers failed");
  return j as LocateFlyersResult;
}

export async function probeSessionScope(
  sessionId: string,
  selectors: string[],
): Promise<ProbeResult> {
  const res = await req(`/sessions/${sessionId}/probe-scope`, {
    method: "POST",
    body: JSON.stringify({ selectors, purpose: "flyer-discovery" }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "probe-scope failed");
  return j as ProbeResult;
}

export async function confirmSessionScope(
  sessionId: string,
  args: {
    selectors: string[];
    label?: string;
    purpose?: string;
    flyerSource?: FlyerSourceInfo;
    metadata?: {
      tagName?: string;
      id?: string;
      className?: string;
      textPreview?: string;
      childCount?: number;
      linkCount?: number;
      imageCount?: number;
    };
  },
) {
  const res = await req(`/sessions/${sessionId}/confirm-scope`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "confirm-scope failed");
  return j as { saved: boolean; steps: number };
}

export async function removeSessionAction(sessionId: string, index: number) {
  const res = await req(`/sessions/${sessionId}/remove-action`, {
    method: "POST",
    body: JSON.stringify({ index }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "remove action failed");
  return j as { ok: boolean; actions: SessionAction[] };
}

export type SelectAtPoint = {
  selectors: string[];
  label: string;
  options: Array<{ value: string; label: string }>;
};

export async function clickSession(
  sessionId: string,
  x: number,
  y: number,
): Promise<{
  ok: boolean;
  select?: SelectAtPoint;
  viewer?: {
    viewerMode?: string;
    notes: string;
    images: number;
    pdfs: number;
    canvas: boolean;
  };
}> {
  const res = await req(`/sessions/${sessionId}/click`, {
    method: "POST",
    body: JSON.stringify({ x, y }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    select?: SelectAtPoint;
    viewer?: {
      viewerMode?: string;
      notes: string;
      images: number;
      pdfs: number;
      canvas: boolean;
    };
    error?: string;
  };
  if (!res.ok) throw new Error(j.error ?? "click failed");
  return { ok: true, select: j.select, viewer: j.viewer };
}

export async function chooseSelectOption(
  sessionId: string,
  args: { selectors: string[]; value: string; label?: string },
) {
  const res = await req(`/sessions/${sessionId}/select-option`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(j.error ?? "select-option failed");
  return j;
}

export async function typeSession(sessionId: string, text: string) {
  await req(`/sessions/${sessionId}/type`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function scrollSession(sessionId: string, dy: number) {
  await req(`/sessions/${sessionId}/scroll`, {
    method: "POST",
    body: JSON.stringify({ dy }),
  });
}

export async function addSemanticStep(
  sessionId: string,
  step: "discover-flyer" | "discover-store" | "capture-network",
) {
  await req(`/sessions/${sessionId}/semantic`, {
    method: "POST",
    body: JSON.stringify({ step }),
  });
}

export async function saveBrowserSession(sessionId: string) {
  const res = await req(`/sessions/${sessionId}/save`, {
    method: "POST",
    body: "{}",
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "Save failed");
  return j as { saved: boolean; steps: number };
}

export function subscribeSessionEvents(
  sessionId: string,
  onEvent: (ev: SessionEvent) => void,
): () => void {
  const es = new EventSource(`${BASE}/sessions/${sessionId}/events`);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as SessionEvent);
    } catch {
      /* ignore */
    }
  };
  es.onerror = () => {
    /* browser reconnects EventSource automatically */
  };
  return () => es.close();
}

export function workerBaseUrl() {
  return BASE;
}

export type FlowRunEvent =
  | { type: "log"; line: string; ts?: number }
  | {
      type: "done";
      ok: boolean;
      runId?: string;
      stepsExecuted?: number;
      storesFound?: number;
      flyersFound?: number;
      offersFound?: number;
      error?: string;
      ts?: number;
    };

/** POST /runs — streams SSE log lines until done. */
export async function runFlowRemote(
  args: { flowId: string; ctx: Record<string, string> },
  onEvent: (ev: FlowRunEvent) => void,
): Promise<void> {
  const res = await fetch(`${BASE}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error(
      (j as { error?: string }).error ?? `Run failed HTTP ${res.status}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as FlowRunEvent);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function stopFlowRemote(): Promise<boolean> {
  const res = await fetch(`${BASE}/runs/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const j = (await res.json().catch(() => ({}))) as { stopped?: boolean };
  return Boolean(j.stopped);
}

export type ReanalyzeDiff = {
  name: string;
  pageNumber?: number;
  beforePrice: number;
  afterPrice: number;
};

export type ReanalyzeEvent =
  | { type: "log"; line: string; ts?: number }
  | {
      type: "page";
      pageNumber: number;
      status: "running" | "done" | "failed" | "skipped";
      offers?: number;
      error?: string;
      ts?: number;
    }
  | {
      type: "done";
      ok: boolean;
      updated: number;
      locked: number;
      pages: number[];
      diffs: ReanalyzeDiff[];
      offersFound?: number;
      error?: string;
      ts?: number;
    };

/** POST /extract — re-parse flyer pages via Mimo (SSE). */
export async function reanalyzeRemote(
  args: {
    flyerId: string;
    pages?: number[];
    includeLocked?: boolean;
  },
  onEvent: (ev: ReanalyzeEvent) => void,
): Promise<Extract<ReanalyzeEvent, { type: "done" }> | null> {
  const res = await fetch(`${BASE}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error(
      (j as { error?: string }).error ?? `Extract failed HTTP ${res.status}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let doneEv: Extract<ReanalyzeEvent, { type: "done" }> | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as ReanalyzeEvent;
        onEvent(ev);
        if (ev.type === "done") doneEv = ev;
      } catch {
        /* ignore */
      }
    }
  }
  return doneEv;
}

export async function downloadFlyerRemote(flyerId: string) {
  const res = await req("/download", {
    method: "POST",
    body: JSON.stringify({ flyerId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { ok: boolean; downloaded: number };
}
