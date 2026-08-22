import { randomUUID } from "node:crypto";
import { chromium, type Browser } from "playwright";
import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import { mimoAnalyzeFlow } from "../extraction/mimo/analyze-flow.js";
import { mimoLocateFlyers } from "../extraction/mimo/locate.js";
import {
  buildContextOptions,
  buildLaunchOptions,
  denyNativePermissionPrompts,
} from "../browser/context.js";
import { normalizeAction } from "../recorder/action-normalizer.js";
import { replaceScraperSteps } from "../core/flyer-storage.js";
import type { RecordedAction, ScopeMetadata, StepType } from "../types/flows.js";
import { attachNetworkHarvester } from "../runner/flow-pipeline.js";
import {
  allowsImageUrls,
  discoverWithFlyerSource,
  filterFlyerDownloadButtons,
  mergeDownloadHints,
  sanitizeFlyerSource,
} from "../runner/flyer-discover.js";
import { bindRecorder, recordElementAt } from "./action-bridge.js";
import {
  capturePageChrome,
  captureTargetSnapshot,
  dumpGalleryScope,
  packTeachPayload,
  scrollGalleryIntoView,
} from "./click-snapshot.js";
import {
  dumpFlyerCandidates,
  formatFlyerCandidates,
  highlightScope,
  inspectBySelector,
  inspectScopeAt,
  type ScopeNode,
  type ScopePick,
} from "./scope-pick.js";
import {
  emit,
  pushAction,
  slimAction,
  touch,
  type LiveSession,
  type SessionEvent,
} from "./types.js";

const sessions = new Map<string, LiveSession>();
const byFlow = new Map<string, string>();

export type SessionConfig = {
  headless: boolean;
  timeoutMs: number;
  fps: number;
  jpegQuality: number;
  ttlMs: number;
  maxMs: number;
  maxSessions: number;
};

function cfg(): SessionConfig {
  return {
    // Headed by default: Mercadapp AppNotice often missing in headless.
    // Run path stays headless + dismissBlockingDialogs.
    headless: process.env.BROWSER_SESSION_HEADLESS === "true",
    timeoutMs: Number(process.env.BROWSER_TIMEOUT ?? 30000),
    fps: Number(process.env.BROWSER_SESSION_FPS ?? 2),
    jpegQuality: Number(process.env.BROWSER_SESSION_JPEG_QUALITY ?? 60),
    ttlMs: Number(process.env.BROWSER_SESSION_TTL_MS ?? 600_000),
    maxMs: Number(process.env.BROWSER_SESSION_MAX_MS ?? 1_800_000),
    maxSessions: Number(process.env.BROWSER_SESSION_MAX ?? 2),
  };
}

async function takeFrame(session: LiveSession) {
  try {
    const buf = await session.page.screenshot({
      type: "jpeg",
      quality: cfg().jpegQuality,
    });
    const vp = session.page.viewportSize() ?? session.viewport;
    emit(session, {
      type: "frame",
      ts: Date.now(),
      width: vp.width,
      height: vp.height,
      jpegBase64: buf.toString("base64"),
    });
    session.lastJpegBase64 = buf.toString("base64");
    const url = session.page.url();
    if (url !== session.currentUrl) {
      session.currentUrl = url;
      emit(session, { type: "url", url });
      if (session.recording) {
        pushAction(session, {
          kind: "navigation",
          url,
          description: "Navigation",
        });
      }
    }
  } catch (err) {
    flyerLog.info("SESSION", `screenshot fail: ${String(err)}`);
  }
}

function startScreenshotLoop(session: LiveSession) {
  const ms = Math.max(200, Math.floor(1000 / cfg().fps));
  session.screenshotTimer = setInterval(() => {
    void takeFrame(session);
  }, ms);
}

function enqueueSnapshot(session: LiveSession, action: RecordedAction) {
  const run = async () => {
    const snap =
      action.kind === "navigation" || !action.selectors?.length
        ? await capturePageChrome(session.page)
        : await captureTargetSnapshot(session.page, action.selectors);
    pushAction(session, {
      ...action,
      url: action.url ?? session.currentUrl,
      snapshot: snap,
    });
  };
  session.snapQueue = (session.snapQueue ?? Promise.resolve())
    .then(run)
    .catch((err) => {
      flyerLog.info("SESSION", `snapshot fail: ${String(err)}`);
      pushAction(session, {
        ...action,
        url: action.url ?? session.currentUrl,
      });
    });
}

export function getSession(id: string): LiveSession | undefined {
  return sessions.get(id);
}

export function listSessionIds(): string[] {
  return [...sessions.keys()];
}

export async function destroySession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.status = "stopping";
  emit(session, { type: "status", status: "stopping" });
  if (session.screenshotTimer) clearInterval(session.screenshotTimer);
  session.harvestDispose?.();
  try {
    await session.closeBrowser();
  } catch {
    /* ignore */
  }
  session.status = "closed";
  emit(session, { type: "status", status: "closed" });
  sessions.delete(sessionId);
  if (byFlow.get(session.flowId) === sessionId) byFlow.delete(session.flowId);
  flyerLog.info("SESSION", `closed ${sessionId}`);
}

export async function destroyAllSessions() {
  const ids = [...sessions.keys()];
  for (const id of ids) await destroySession(id);
}

export async function createSession(args: {
  flowId: string;
  startUrl: string;
}): Promise<LiveSession> {
  const c = cfg();
  const existingId = byFlow.get(args.flowId);
  if (existingId) await destroySession(existingId);

  if (sessions.size >= c.maxSessions) {
    const oldest = [...sessions.values()].sort(
      (a, b) => a.createdAt - b.createdAt,
    )[0];
    if (oldest) await destroySession(oldest.sessionId);
  }

  const sessionId = `sess_${randomUUID().slice(0, 8)}`;
  const viewport = { width: 1280, height: 720 };
  let browser: Browser | null = null;

  browser = await chromium.launch(buildLaunchOptions({ headless: c.headless }));
  const context = await browser.newContext({
    ...buildContextOptions(),
    viewport,
  });
  context.setDefaultTimeout(c.timeoutMs);
  const page = await context.newPage();
  // deny after goto — about:blank is opaque origin

  const session: LiveSession = {
    sessionId,
    flowId: args.flowId,
    startUrl: args.startUrl,
    status: "starting",
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    viewport,
    currentUrl: args.startUrl,
    recording: true,
    actions: [],
    networkFlyers: [],
    page,
    closeBrowser: async () => {
      await context.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    },
    subscribers: new Set(),
  };

  sessions.set(sessionId, session);
  byFlow.set(args.flowId, sessionId);

  const harvest = attachNetworkHarvester(page);
  session.networkFlyers = harvest.flyers;
  session.harvestDispose = harvest.dispose;

  await bindRecorder(page, (action) => {
    enqueueSnapshot(session, action);
  });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      session.currentUrl = page.url();
      emit(session, { type: "url", url: session.currentUrl });
    }
  });

  try {
    await page.goto(args.startUrl, {
      waitUntil: "domcontentloaded",
      timeout: c.timeoutMs,
    });
    await denyNativePermissionPrompts(
      context,
      page,
      new URL(page.url()).origin,
    ).catch(() => undefined);
    enqueueSnapshot(session, {
      kind: "navigation",
      url: args.startUrl,
      description: "Start URL",
    });
    session.currentUrl = page.url();
    session.status = "recording";
    emit(session, { type: "status", status: "recording" });
    emit(session, { type: "url", url: session.currentUrl });
    startScreenshotLoop(session);
    void takeFrame(session);
    // Notice SPA often pops ~0.5–2s after shell — capture again so preview shows it.
    void (async () => {
      await page.waitForTimeout(1500);
      const has =
        (await page
          .locator(
            '[role="dialog"] button:has-text("Continuar"), button:has-text("Continuar")',
          )
          .count()
          .catch(() => 0)) > 0;
      if (has) {
        flyerLog.info(
          "SESSION",
          "dialog Continuar detectado — janela Chromium / preview",
        );
      } else {
        flyerLog.info("SESSION", "dialog Continuar não encontrado após goto");
      }
      await takeFrame(session);
    })();
    flyerLog.info(
      "SESSION",
      `created ${sessionId} flow=${args.flowId} headless=${c.headless}`,
    );
    return session;
  } catch (err) {
    session.status = "error";
    session.error = String(err);
    emit(session, { type: "error", message: String(err) });
    await destroySession(sessionId);
    throw err;
  }
}

export function subscribe(
  sessionId: string,
  handler: (ev: SessionEvent) => void,
): () => void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  session.subscribers.add(handler);
  handler({ type: "status", status: session.status });
  handler({ type: "url", url: session.currentUrl });
  handler({ type: "actions", actions: session.actions.map(slimAction) });
  return () => session.subscribers.delete(handler);
}

export async function setRecording(sessionId: string, on: boolean) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  session.recording = on;
  session.status = on ? "recording" : "ready";
  touch(session);
  emit(session, { type: "status", status: session.status });
}

export async function clickAt(sessionId: string, x: number, y: number) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);
  await session.page.mouse.click(x, y);
  const action = await recordElementAt(session.page, x, y);
  if (action) enqueueSnapshot(session, action);
  await takeFrame(session);
}

export async function typeText(sessionId: string, text: string) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);
  await session.page.keyboard.type(text, { delay: 20 });
  if (session.recording) {
    pushAction(session, {
      kind: "input",
      value: text,
      description: "typed",
      url: session.page.url(),
    });
  }
  await takeFrame(session);
}

export async function pressKey(sessionId: string, key: string) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);
  await session.page.keyboard.press(key);
  await takeFrame(session);
}

export async function scrollSession(sessionId: string, dy: number) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);
  await session.page.mouse.wheel(0, dy);
  if (session.recording) {
    pushAction(session, {
      kind: "scroll",
      description: `scroll ${dy}`,
      url: session.page.url(),
    });
  }
  await takeFrame(session);
}

function forcePush(session: LiveSession, action: RecordedAction) {
  session.actions.push(action);
  touch(session);
  emit(session, { type: "action", action });
  emit(session, { type: "actions", actions: session.actions });
}

/** Drop recorded click/action by index while session still live. */
export function removeAction(sessionId: string, index: number) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (index < 0 || index >= session.actions.length) {
    throw new Error(`Invalid action index: ${index}`);
  }
  session.actions.splice(index, 1);
  session.proposed = undefined;
  touch(session);
  emit(session, {
    type: "actions",
    actions: session.actions.map(slimAction),
  });
  return { actions: session.actions.map(slimAction) };
}

export async function hoverScope(sessionId: string, x: number, y: number) {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);
  const pick = await inspectScopeAt(session.page, x, y);
  await highlightScope(session.page, pick?.box ?? null);
  return pick;
}

export async function clearScopeHighlight(sessionId: string) {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  await highlightScope(session.page, null);
  session.scopeChain = undefined;
  session.scopeIndex = undefined;
}

function nodeToPick(node: ScopeNode, ancestors: ScopeNode[]) {
  return { ...node, ancestors };
}

export async function pickScope(
  sessionId: string,
  args: { x?: number; y?: number; ancestorIndex?: number },
) {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);

  if (args.x != null && args.y != null) {
    const pick = await inspectScopeAt(session.page, args.x, args.y);
    if (!pick) throw new Error("No element at point");
    session.scopeChain = [pick, ...pick.ancestors];
    session.scopeIndex = 0;
  }

  const chain = session.scopeChain;
  if (!chain?.length) throw new Error("No scope selected");

  if (args.ancestorIndex != null) {
    session.scopeIndex = Math.max(
      0,
      Math.min(args.ancestorIndex, chain.length - 1),
    );
  }
  const idx = session.scopeIndex ?? 0;
  const node = chain[idx]!;
  const ancestors = chain.slice(idx + 1);
  await highlightScope(session.page, node.box);
  await takeFrame(session);
  session.lastScopeMeta = {
    tagName: node.tagName,
    id: node.id,
    className: node.className,
    textPreview: node.textPreview,
    childCount: node.childCount,
    linkCount: node.linkCount,
    imageCount: node.imageCount,
  };
  return nodeToPick(node, ancestors);
}

export async function probeScope(
  sessionId: string,
  selectors: string[],
): Promise<{
  found: boolean;
  selectorUsed?: string;
  flyers: Array<{
    url: string;
    title?: string;
    kind: string;
    validFrom?: string;
    validUntil?: string;
  }>;
  tagName?: string;
  linkCount?: number;
  imageCount?: number;
  error?: string;
}> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);

  let used: string | undefined;
  for (const sel of selectors) {
    try {
      const n = await session.page.locator(sel).count();
      if (n > 0) {
        used = sel;
        break;
      }
    } catch {
      /* bad selector */
    }
  }
  if (!used) {
    return {
      found: false,
      flyers: [],
      error: "SCOPE_NOT_FOUND: não foi possível localizar a área configurada",
    };
  }

  const stats = await session.page.locator(used).first().evaluate((el) => ({
    tagName: el.tagName,
    linkCount: el.querySelectorAll("a[href]").length,
    imageCount: el.querySelectorAll("img").length,
  }));
  const source =
    session.flyerSource ??
    ({
      kind: "pdf-links" as const,
      downloadStrategy: "direct-url" as const,
      urlFrom: "href" as const,
    });
  const candidates = await discoverWithFlyerSource({
    page: session.page,
    scopeSelector: used,
    network: session.networkFlyers,
    source,
  });
  const flyers = candidates.map((c) => ({
    url: c.originalUrl,
    title: c.title,
    kind: c.pageUrls.some((u) => /\.pdf(\?|$)/i.test(u))
      ? "pdf"
      : allowsImageUrls(source)
        ? "image"
        : "api",
  }));
  return {
    found: true,
    selectorUsed: used,
    flyers,
    ...stats,
  };
}

export async function locateFlyersWithMimo(sessionId: string): Promise<{
  pick: ScopePick;
  probe: Awaited<ReturnType<typeof probeScope>>;
  selectors: string[];
  label: string;
  source: "mimo" | "heuristic";
  flyerSource?: import("../types/flows.js").FlyerSource;
}> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);

  await session.page
    .locator(
      'a[href*="Flyer"], a[href*="flipbook"], a[href*="encartes"], a[href*=".pdf"]',
    )
    .first()
    .scrollIntoViewIfNeeded({ timeout: 2500 })
    .catch(() => undefined);

  const dump = await dumpFlyerCandidates(session.page);
  const gallery = await dumpGalleryScope(session.page);
  await scrollGalleryIntoView(session.page, gallery);
  const buf = await session.page.screenshot({
    type: "jpeg",
    quality: cfg().jpegQuality,
  });
  const imageUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), flyerConfig.mimoTimeout);
  let parsed;
  try {
    parsed = await mimoLocateFlyers({
      imageUrl,
      url: session.page.url(),
      network: session.networkFlyers.map((f) => f.url),
      candidates: formatFlyerCandidates(dump),
      gallery: gallery ? JSON.stringify(gallery, null, 2) : undefined,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  // Baixar = hint only. Upgrade to click-download solely when PDF/a[download] proven.
  const realDownloads = filterFlyerDownloadButtons(
    gallery?.downloadButtons ?? [],
  );
  const tabSels = (gallery?.tabButtons ?? []).flatMap((b) => b.selectors);
  const hintedSource = mergeDownloadHints(parsed.flyerSource, realDownloads, {
    kind: gallery?.tabButtons.length ? "tabs" : undefined,
    tabSelectors: tabSels,
  });
  if (hintedSource) parsed.flyerSource = hintedSource;
  else if (parsed.flyerSource) {
    parsed.flyerSource = sanitizeFlyerSource(parsed.flyerSource);
  }

  const fromIndex =
    parsed.index && dump[parsed.index - 1]
      ? dump[parsed.index - 1]!.selectors
      : [];
  const tried = [...parsed.selectors, ...fromIndex];
  let used: string | undefined;
  let source: "mimo" | "heuristic" = "mimo";
  for (const sel of tried) {
    try {
      if ((await session.page.locator(sel).count()) > 0) {
        used = sel;
        break;
      }
    } catch {
      /* bad selector */
    }
  }
  if (!used) {
    source = "heuristic";
    used = dump.find((c) => c.flyerHrefs.length)?.selectors[0];
  }
  if (!used) {
    throw new Error(
      "Não achei flyers nesta página — role até a galeria e tente de novo",
    );
  }

  const pick = await inspectBySelector(session.page, used);
  if (!pick) {
    throw new Error(
      "SCOPE_NOT_FOUND: não foi possível localizar a área configurada",
    );
  }
  const merged = [...new Set([used, ...tried, ...pick.selectors])];
  const working: string[] = [];
  for (const sel of merged) {
    try {
      if ((await session.page.locator(sel).count()) > 0) working.push(sel);
    } catch {
      /* ignore */
    }
  }
  pick.selectors = working.length ? working : [used];
  if (parsed.label) pick.label = parsed.label;
  if (parsed.flyerSource) session.flyerSource = parsed.flyerSource;

  session.scopeChain = [pick, ...pick.ancestors];
  session.scopeIndex = 0;
  await highlightScope(session.page, pick.box);
  await takeFrame(session);

  const probe = await probeScope(sessionId, pick.selectors);
  flyerLog.info(
    "SESSION",
    `locate-flyers source=${source} sel=${pick.selectors[0]} flyers=${probe.flyers.length} kind=${parsed.flyerSource?.kind ?? "?"}`,
  );
  return {
    pick,
    probe,
    selectors: pick.selectors,
    label: pick.label,
    source,
    flyerSource: parsed.flyerSource,
  };
}

export async function confirmScope(
  sessionId: string,
  args: {
    selectors: string[];
    label?: string;
    purpose?: string;
    metadata?: ScopeMetadata;
    flyerSource?: import("../types/flows.js").FlyerSource;
  },
) {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  if (args.flyerSource) session.flyerSource = args.flyerSource;
  session.actions = session.actions.filter(
    (a) => a.kind !== "scope" && a.value !== "discover-flyer",
  );
  forcePush(session, {
    kind: "scope",
    selectors: args.selectors,
    description: args.label,
    semantic: "SELECT_SCOPE",
    value: args.purpose ?? "flyer-discovery",
    metadata: args.metadata,
  });
  forcePush(session, {
    kind: "click",
    description: "discover-flyer",
    semantic: "DISCOVER_FLYER",
    selectors: [],
    value: "discover-flyer",
  });
  return saveSession(sessionId);
}

export async function addSemantic(
  sessionId: string,
  step: "discover-flyer" | "discover-store" | "capture-network",
) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  // Store as fake action; save maps specially
  const action: RecordedAction = {
    kind: "click",
    description: step,
    semantic: step.toUpperCase().replace("-", "_"),
    selectors: [],
    value: step,
  };
  session.actions.push(action);
  touch(session);
  emit(session, { type: "action", action });
  emit(session, { type: "actions", actions: session.actions });
}

export async function analyzeSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.snapQueue) await session.snapQueue;
  if (!session.actions.length) throw new Error("Nenhum clique gravado");
  const gallery = await dumpGalleryScope(session.page);
  await scrollGalleryIntoView(session.page, gallery);
  const buf = await session.page.screenshot({
    type: "jpeg",
    quality: cfg().jpegQuality,
  });
  const jpeg = buf.toString("base64");
  if (!jpeg) throw new Error("Sem screenshot da sessão");
  session.lastJpegBase64 = jpeg;
  const payload = packTeachPayload({
    startUrl: session.startUrl,
    currentUrl: session.currentUrl,
    networkFlyers: session.networkFlyers.map((n) => n.url),
    actions: session.actions,
    gallery: gallery ?? undefined,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), flyerConfig.mimoTimeout);
  try {
    const analyzed = await mimoAnalyzeFlow({
      payload,
      imageUrl: `data:image/jpeg;base64,${jpeg}`,
      signal: ctrl.signal,
    });
    // Baixar hint only — force click-download solely with proven PDF/a[download]
    const realDownloads = filterFlyerDownloadButtons(
      gallery?.downloadButtons ?? [],
    );
    const tabSels = (gallery?.tabButtons ?? []).flatMap((b) => b.selectors);
    analyzed.steps = analyzed.steps.map((s) => {
      if (s.type !== "discover-flyer") return s;
      const merged = mergeDownloadHints(s.config.flyerSource, realDownloads, {
        kind: gallery?.tabButtons.length ? "tabs" : undefined,
        tabSelectors: tabSels,
      });
      if (!merged && !s.config.flyerSource) return s;
      return {
        ...s,
        config: {
          ...s.config,
          flyerSource: merged
            ? merged
            : sanitizeFlyerSource(s.config.flyerSource!),
        },
      };
    });
    session.proposed = analyzed;
    const disc = analyzed.steps.find((s) => s.type === "discover-flyer");
    if (disc?.config.flyerSource) {
      session.flyerSource = disc.config.flyerSource;
    }
    flyerLog.info(
      "SESSION",
      `analyze ${sessionId} steps=${analyzed.steps.length}`,
    );
    return analyzed;
  } finally {
    clearTimeout(timer);
  }
}

export async function saveSession(sessionId: string): Promise<{ steps: number }> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  if (session.proposed?.steps.length) {
    const rows = session.proposed.steps.map((s, i) => ({
      type: s.type,
      config: JSON.stringify(s.config),
      order: i,
    }));
    await replaceScraperSteps(session.flowId, rows);
    flyerLog.info(
      "SESSION",
      `saved proposed ${rows.length} steps → ${session.flowId}`,
    );
    return { steps: rows.length };
  }

  const steps: Array<{ type: StepType; config: string; order: number }> = [];
  let order = 0;
  let hasScope = false;
  for (const a of session.actions) {
    if (a.kind === "scope" || a.semantic === "SELECT_SCOPE") {
      hasScope = true;
      steps.push({
        type: "select-scope",
        config: JSON.stringify({
          purpose: a.value || "flyer-discovery",
          selectors: a.selectors ?? [],
          label: a.description,
          metadata: a.metadata,
        }),
        order: order++,
      });
      continue;
    }
    if (
      a.value === "discover-flyer" ||
      a.value === "discover-store" ||
      a.value === "capture-network"
    ) {
      const scope =
        a.value === "discover-flyer" && hasScope ? "element" : "page";
      steps.push({
        type: a.value,
        config: JSON.stringify(
          a.value === "discover-flyer"
            ? {
                scope,
                duration: 3000,
                ...(session.flyerSource
                  ? { flyerSource: session.flyerSource }
                  : {}),
              }
            : { duration: 3000 },
        ),
        order: order++,
      });
      continue;
    }
    const n = normalizeAction(a);
    if (!n) continue;
    if (n.type === "select-scope") hasScope = true;
    steps.push({
      type: n.type,
      config: JSON.stringify(n.config),
      order: order++,
    });
  }

  if (hasScope && !steps.some((s) => s.type === "discover-flyer")) {
    steps.push({
      type: "discover-flyer",
      config: JSON.stringify({
        scope: "element",
        duration: 3000,
        ...(session.flyerSource ? { flyerSource: session.flyerSource } : {}),
      }),
      order: order++,
    });
  }
  if (steps.some((s) => s.type === "discover-flyer")) {
    if (!steps.some((s) => s.type === "download-flyers")) {
      steps.push({
        type: "download-flyers",
        config: JSON.stringify({}),
        order: order++,
      });
    }
    if (!steps.some((s) => s.type === "extract-offers")) {
      steps.push({
        type: "extract-offers",
        config: JSON.stringify({}),
        order: order++,
      });
    }
  }

  await replaceScraperSteps(session.flowId, steps);
  flyerLog.info("SESSION", `saved ${steps.length} steps → ${session.flowId}`);
  return { steps: steps.length };
}

export function sweepExpired() {
  const c = cfg();
  const now = Date.now();
  for (const s of sessions.values()) {
    const idle = now - s.lastActivityAt > c.ttlMs;
    const hard = now - s.createdAt > c.maxMs;
    if (idle || hard) {
      flyerLog.info("SESSION", `TTL close ${s.sessionId}`);
      void destroySession(s.sessionId);
    }
  }
}
