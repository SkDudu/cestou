import { randomUUID } from "node:crypto";
import { chromium, type Browser } from "playwright";
import { flyerLog } from "../core/flyer-logger.js";
import { flyerConfig } from "../core/flyer-config.js";
import { mimoLocateSection, openKindHint } from "../extraction/mimo/section-locate.js";
import type {
  LocateCandidate,
  LocateParse,
  OperatorLocateHint,
} from "../extraction/mimo/locate.js";
import {
  buildContextOptions,
  buildLaunchOptions,
  denyNativePermissionPrompts,
} from "../browser/context.js";
import { normalizeAction } from "../recorder/action-normalizer.js";
import { replaceScraperSteps } from "../core/flyer-storage.js";
import type {
  FlyerSource,
  RecordedAction,
  ScopeMetadata,
  StepType,
} from "../types/flows.js";
import {
  attachNetworkHarvester,
  isFlyerHref,
  scanDomFlyerCandidates,
  SCOPE_NOT_FOUND,
} from "../runner/flow-pipeline.js";
import {
  closeFlyerOverlay,
  discoverWithFlyerSource,
  listingKey,
  pruneBarePageImageDocs,
  sanitizeFlyerSource,
  scanDomImageCandidates,
} from "../runner/flyer-discover.js";
import { dismissBlockingDialogs } from "../runner/step-runner.js";
import {
  attachRecorderNow,
  bindRecorder,
  inspectSelectAt,
  recordElementAt,
  type SelectAtPoint,
} from "./action-bridge.js";
import {
  capturePageChrome,
  captureTargetSnapshot,
  dumpFullPageHtml,
  dumpViewerSample,
} from "./click-snapshot.js";
import {
  highlightScope,
  inspectScopeAt,
  type ScopeBox,
  type ScopeNode,
  type ScopePick,
} from "./scope-pick.js";
import {
  augmentListingLinkSelectors,
  countJournalItems,
  countJournalTabs,
  normalizeJournalItemSelectors,
  refineOpenKindFromHtml,
  resolveTeachItemSelectors,
} from "./journal-tabs.js";
import {
  type AnalyzedFlow,
  applyFlyerSource,
  buildTeachSteps,
  flyerSourceFromOpenKind,
  isViewerNoise,
  mergeDetailHarvest,
} from "./teach-repeat.js";
import {
  emit,
  pushAction,
  slimAction,
  touch,
  type LiveSession,
  type SessionEvent,
} from "./types.js";
import { traceSetup } from "./setup-trace.js";

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
    // Headed by default: store modals/selects often never paint in headless,
    // so teach preview (JPEG SSE) stays empty of the dialog. Set
    // BROWSER_SESSION_HEADLESS=true only when you want no OS window.
    headless: process.env.BROWSER_SESSION_HEADLESS === "true",
    timeoutMs: Number(process.env.BROWSER_TIMEOUT ?? 30000),
    fps: Number(process.env.BROWSER_SESSION_FPS ?? 2),
    jpegQuality: Number(process.env.BROWSER_SESSION_JPEG_QUALITY ?? 60),
    ttlMs: Number(process.env.BROWSER_SESSION_TTL_MS ?? 600_000),
    maxMs: Number(process.env.BROWSER_SESSION_MAX_MS ?? 1_800_000),
    maxSessions: Number(process.env.BROWSER_SESSION_MAX ?? 2),
  };
}

function isNavContextError(err: unknown): boolean {
  const s = String(err);
  return /Execution context was destroyed|Target closed|frame was detached|most likely because of a navigation/i.test(
    s,
  );
}

/** Retry when SPA/redirect kills the JS context mid-evaluate/screenshot. */
async function withNavRetry<T>(
  label: string,
  fn: () => Promise<T>,
  tries = 3,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isNavContextError(err) || i === tries - 1) throw err;
      flyerLog.info("SESSION", `${label} retry ${i + 1}: ${String(err)}`);
      await new Promise((r) => setTimeout(r, 200 + i * 200));
    }
  }
  throw last;
}

async function settleAfterNav(page: LiveSession["page"]) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("load").catch(() => undefined);
  await page.waitForTimeout(250);
}

async function takeFrame(session: LiveSession) {
  if (session.navigating || session.page.isClosed()) return;
  try {
    const buf = await withNavRetry("screenshot", () =>
      session.page.screenshot({
        type: "jpeg",
        quality: cfg().jpegQuality,
        // Avoid mid-fade frames where the modal is still opacity:0.
        animations: "disabled",
      }),
    );
    if (session.navigating || session.page.isClosed()) return;
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
    if (session.navigating) return;
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
  traceSetup(session, "session_close", "Sessão de ensino encerrada", {
    actions: session.actions.length,
    url: session.currentUrl,
  });
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
    if (frame !== page.mainFrame()) return;
    session.navigating = true;
    session.currentUrl = page.url();
    emit(session, { type: "url", url: session.currentUrl });
    void (async () => {
      try {
        await settleAfterNav(page);
        await withNavRetry("attachRecorder", () => attachRecorderNow(page));
      } catch (err) {
        flyerLog.info("SESSION", `post-nav attach: ${String(err)}`);
      } finally {
        session.navigating = false;
        void takeFrame(session);
      }
    })();
  });

  try {
    session.navigating = true;
    await page.goto(args.startUrl, {
      waitUntil: "domcontentloaded",
      timeout: c.timeoutMs,
    });
    await settleAfterNav(page);
    await withNavRetry("attachRecorder", () => attachRecorderNow(page));
    session.navigating = false;
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
    traceSetup(session, "session_start", `Sessão ${sessionId} iniciada`, {
      startUrl: args.startUrl,
      url: session.currentUrl,
    });
    startScreenshotLoop(session);
    void takeFrame(session);
    // SPA/modals often mount 0.5–2s after shell — wait + re-frame so preview has them.
    void (async () => {
      const dialog = page.locator(
        '[role="dialog"], [aria-modal="true"], dialog[open], .modal.show, .modal.in',
      );
      const appeared = await dialog
        .first()
        .waitFor({ state: "visible", timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      if (!appeared) await page.waitForTimeout(1500);
      const continuar =
        (await page
          .locator(
            '[role="dialog"] button:has-text("Continuar"), button:has-text("Continuar")',
          )
          .count()
          .catch(() => 0)) > 0;
      flyerLog.info(
        "SESSION",
        appeared
          ? `modal visível${continuar ? " (Continuar)" : ""} — preview`
          : "nenhum modal visível após goto",
      );
      await takeFrame(session);
    })();
    flyerLog.info(
      "SESSION",
      `created ${sessionId} flow=${args.flowId} headless=${c.headless}`,
    );
    return session;
  } catch (err) {
    session.navigating = false;
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

async function applyViewerHarvest(session: LiveSession): Promise<
  | {
      viewerMode?: string;
      notes: string;
      images: number;
      pdfs: number;
      canvas: boolean;
    }
  | undefined
> {
  if (!session.listingTeach) return undefined;
  await session.page
    .locator(
      '.modal.show, .flipbook-modal, [role="dialog"], [class*="flipbook"]',
    )
    .first()
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => undefined);
  await session.page.waitForTimeout(400).catch(() => undefined);
  let target = session.page;
  const extra = session.page
    .context()
    .pages()
    .find((p) => p !== session.page && !p.isClosed());
  if (extra) target = extra;
  const sample = await dumpViewerSample(target);
  const net = pruneBarePageImageDocs(session.networkFlyers);
  const imageUrls = [
    ...sample.imageUrls,
    ...net.flatMap((n) => n.pageUrls ?? []),
  ].filter((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u));
  const pdfUrls = [
    ...sample.pdfUrls,
    ...net.filter((n) => n.pdf || /\.pdf(\?|#|$)/i.test(n.url)).map((n) => n.url),
  ];
  const lastClick = [...session.actions]
    .reverse()
    .find((a) => a.kind === "click" && a.selectors?.length);
  if (!sample.hasCanvas && !imageUrls.length && !pdfUrls.length) {
    return {
      notes: "Nada de viewer. Clica o card do encarte (não o fundo).",
      images: 0,
      pdfs: 0,
      canvas: false,
    };
  }
  const open = session.sectionOpen;
  const scopeForHarvest = session.actions.find((a) => a.kind === "scope")
    ?.selectors?.[0];
  let journalTabCount = 0;
  try {
    journalTabCount = await countJournalTabs(session.page, scopeForHarvest);
  } catch {
    /* */
  }
  const src = mergeDetailHarvest({
    listing: session.listingTeach,
    imageUrls,
    pdfUrls,
    detailUrl: sample.url,
    clickSelectors: lastClick?.selectors,
    hasCanvas: sample.hasCanvas,
    journalTabCount,
    openKind: open?.openKind,
    htmlSnippet: session.sectionOpen?.htmlSnippet,
  });
  session.flyerSource = keepSkip(session, src);
  const analyzed = finishAnalyze(session, {
    version: 1,
    startUrl: session.startUrl,
    notes: src.evidence,
    steps: buildTeachSteps({
      startUrl: session.startUrl,
      actions: session.actions,
      flyerSource: session.flyerSource,
      scopeSelectors: teachScopeSelectors(session),
    }),
    teachPass: 2,
    listingCount: session.listingTeach.count,
  });
  flyerLog.info(
    "SESSION",
    `viewer dump mode=${src.viewerMode} imgs=${imageUrls.length} pdf=${pdfUrls.length} canvas=${sample.hasCanvas}`,
  );
  traceSetup(session, "locate", `Pass 2 — viewer (${src.kind ?? "?"})`, {
    teachPass: 2,
    viewerMode: src.viewerMode,
    flyerSource: src,
    images: imageUrls.length,
    pdfs: pdfUrls.length,
    canvas: sample.hasCanvas,
    evidence: src.evidence,
  });
  return {
    viewerMode: src.viewerMode,
    notes: analyzed.notes ?? src.evidence ?? "Viewer ok",
    images: imageUrls.length,
    pdfs: pdfUrls.length,
    canvas: sample.hasCanvas,
  };
}

async function teachViewerAfterClick(session: LiveSession): Promise<
  | {
      viewerMode?: string;
      notes: string;
      images: number;
      pdfs: number;
      canvas: boolean;
    }
  | undefined
> {
  return applyViewerHarvest(session);
}

export async function clickAt(
  sessionId: string,
  x: number,
  y: number,
): Promise<{
  ok: true;
  select?: SelectAtPoint;
  viewer?: {
    viewerMode?: string;
    notes: string;
    images: number;
    pdfs: number;
    canvas: boolean;
  };
}> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);
  // Native <select> dropdown is OS chrome — never appears in JPEG preview.
  const select = await withNavRetry("inspectSelect", () =>
    inspectSelectAt(session.page, x, y),
  );
  if (select?.options.length) {
    await takeFrame(session);
    return { ok: true, select };
  }
  await session.page.mouse.click(x, y);
  const action = await withNavRetry("recordClick", () =>
    recordElementAt(session.page, x, y),
  );
  if (action) enqueueSnapshot(session, action);
  await takeFrame(session);
  const viewer = await teachViewerAfterClick(session).catch(() => undefined);
  if (viewer) await takeFrame(session);
  return { ok: true, viewer };
}

/** Apply option chosen in admin sidebar (records `change` → flow step `select`). */
export async function chooseSelectOption(
  sessionId: string,
  args: { selectors: string[]; value: string; label?: string },
) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);
  const value = args.value;
  const label = args.label?.trim() || "";
  if (value === undefined && !label) throw new Error("value required");
  let applied = false;
  for (const sel of args.selectors) {
    const loc = session.page.locator(sel).first();
    const n = await loc.count().catch(() => 0);
    if (!n) continue;
    const tries: Array<string | { value: string } | { label: string }> = [];
    if (value !== undefined && value !== "") tries.push({ value });
    if (label) tries.push({ label });
    if (value === "") tries.push({ value: "" });
    if (value) tries.push(value);
    for (const t of tries) {
      try {
        await loc.selectOption(t, { timeout: 5000 });
        applied = true;
        break;
      } catch {
        /* next */
      }
    }
    if (applied) break;
  }
  if (!applied) throw new Error(`select falhou: ${args.selectors[0]}`);
  const recordedValue = value || label;
  // Recorder change-hook usually catches this; force-push if race misses it.
  await session.page.waitForTimeout(50);
  const last = session.actions[session.actions.length - 1];
  if (!last || last.kind !== "change") {
    enqueueSnapshot(session, {
      kind: "change",
      selectors: args.selectors,
      value: recordedValue,
      description: label || recordedValue,
      url: session.page.url(),
    });
  }
  await takeFrame(session);
  return { ok: true as const };
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
  traceSetup(session, "remove_action", `Ação #${index} removida`, { index });
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
  args: {
    x?: number;
    y?: number;
    ancestorIndex?: number;
    selectors?: string[];
    label?: string;
  },
) {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);

  if (args.selectors?.length) {
    let box: ScopeBox | undefined;
    let working = args.selectors;
    for (const sel of args.selectors) {
      const b = await boxForSelector(session.page, sel);
      if (!b) continue;
      box = b;
      working = [sel, ...args.selectors.filter((s) => s !== sel)];
      break;
    }
    const pick = candidateToPick({
      selectors: working,
      label: args.label || "área",
      box,
    });
    if (!pick) throw new Error("No element at selector");
    session.scopeChain = [pick, ...pick.ancestors];
    session.scopeIndex = 0;
  } else if (args.x != null && args.y != null) {
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
  cardCount?: number;
  needPath?: boolean;
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
      error: SCOPE_NOT_FOUND,
    };
  }

  const stats = await session.page.locator(used).first().evaluate((el) => ({
    tagName: el.tagName,
    linkCount: el.querySelectorAll("a[href]").length,
    imageCount: el.querySelectorAll("img").length,
  }));
  // ponytail: teach probe = read-only. Never discoverWithFlyerSource — that
  // open-each-item/click-download while Gravando pollutes session.actions.
  const domHits = await scanDomFlyerCandidates(session.page, used);
  const imgs = await scanDomImageCandidates(session.page, used);
  const netHits = session.networkFlyers
    .map((n) => n.url)
    .filter((u) => /\.pdf(\?|$)|\/Flyer\/|flipbook|\/encarte/i.test(u));
  const seen = new Set<string>();
  const flyers: Array<{
    url: string;
    title?: string;
    kind: string;
  }> = [];
  for (const h of domHits) {
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    flyers.push({
      url: h.url,
      title: h.text,
      kind: /\.pdf(\?|$)/i.test(h.url) ? "pdf" : "link",
    });
  }
  for (const u of netHits) {
    if (seen.has(u)) continue;
    seen.add(u);
    flyers.push({
      url: u,
      kind: /\.pdf(\?|$)/i.test(u) ? "pdf" : "api",
    });
  }
  for (const img of imgs.slice(0, 12)) {
    if (seen.has(img.url)) continue;
    seen.add(img.url);
    flyers.push({ url: img.url, kind: "image" });
  }
  let cardCount = 0;
  try {
    cardCount = await session.page
      .locator(used)
      .locator("a, button")
      .filter({ hasText: /^ver\s+/i })
      .count();
  } catch {
    /* bad scope */
  }
  if (!cardCount && session.flyerSource?.itemSelectors?.length) {
    cardCount = await countListingCards(
      session.page,
      session.flyerSource.itemSelectors,
    );
  }
  return {
    found: true,
    selectorUsed: used,
    flyers,
    cardCount,
    needPath: false,
    ...stats,
  };
}

function teachScopeSelector(session: LiveSession): string | undefined {
  const idx = session.scopeIndex ?? 0;
  return session.scopeChain?.[idx]?.selectors?.[0];
}

function teachScopeSelectors(session: LiveSession): string[] | undefined {
  const idx = session.scopeIndex ?? 0;
  const sels = session.scopeChain?.[idx]?.selectors;
  return sels?.length ? sels : undefined;
}

function cleanOperatorHint(
  raw: OperatorLocateHint | undefined,
): OperatorLocateHint | undefined {
  if (!raw) return undefined;
  const hint = raw.hint?.trim().slice(0, 500);
  const step = raw.selectedStep;
  const selectedStep =
    step && (step.kind || step.selectors?.length || step.description)
      ? {
          kind: (step.kind || "click").slice(0, 40),
          selectors: (step.selectors ?? [])
            .filter((s) => typeof s === "string" && s.trim())
            .map((s) => s.trim())
            .slice(0, 6),
          description: step.description?.trim().slice(0, 120),
          value: step.value?.trim().slice(0, 80),
        }
      : undefined;
  if (!hint && !selectedStep) return undefined;
  return { hint: hint || undefined, selectedStep };
}

function parseFromSection(sec: {
  status: "ready" | "not_found";
  label: string;
  why: string;
  sectionSelectors: string[];
  itemSelectors: string[];
  htmlSnippet: string;
  openKind: "download" | "viewer" | "need_click";
}): LocateParse {
  const sels = sec.sectionSelectors.length
    ? sec.sectionSelectors
    : sec.itemSelectors;
  const why = [sec.why, openKindHint(sec.openKind)].filter(Boolean).join(" ");
  const candidates: LocateCandidate[] = sels.length
    ? [{ selectors: sels, label: sec.label, why }]
    : [];
  const hint =
    sec.status === "not_found"
      ? sec.why || "MiMo não achou seção de encartes."
      : `${sec.label}. ${why}`;
  return {
    status: sec.status,
    humanHint: hint.slice(0, 500),
    selectors: sels,
    label: sec.label,
    candidates,
  };
}

async function boxForSelector(
  page: LiveSession["page"],
  sel: string,
): Promise<ScopeBox | null> {
  try {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) return null;
    const b = await loc.boundingBox();
    if (!b || b.width < 2 || b.height < 2) return null;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    return null;
  }
}

async function resolveCandidates(
  page: LiveSession["page"],
  parsed: LocateParse,
): Promise<LocateCandidate[]> {
  const raw: LocateCandidate[] = parsed.candidates.length
    ? parsed.candidates
    : parsed.selectors.length
      ? [
          {
            selectors: parsed.selectors,
            label: parsed.label || "candidato",
          },
        ]
      : [];
  const out: LocateCandidate[] = [];
  for (const c of raw) {
    const sels = [...new Set(c.selectors ?? [])].filter(Boolean);
    let box: ScopeBox | undefined;
    let working = sels;
    for (const sel of sels) {
      const b = await boxForSelector(page, sel);
      if (!b) continue;
      box = b;
      working = [sel, ...sels.filter((s) => s !== sel)];
      break;
    }
    out.push({
      label: c.label,
      why: c.why,
      selectors: working,
      box,
    });
  }
  return out.slice(0, 12);
}

function candidateToPick(c: LocateCandidate): ScopePick | null {
  if (!c.selectors.length) return null;
  if (!c.box) return null;
  return {
    tagName: "DIV",
    selectors: c.selectors,
    label: c.label,
    box: c.box,
    linkCount: 0,
    imageCount: 0,
    textCount: 0,
    childCount: 0,
    ancestors: [],
  };
}

async function teachWithDump(
  sessionId: string,
  operatorRaw?: OperatorLocateHint,
): Promise<{
  analyzed: AnalyzedFlow;
  parsed: LocateParse;
  openKind?: "download" | "viewer" | "need_click";
  itemSelectors?: string[];
}> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);
  const operator = cleanOperatorHint(operatorRaw);

  const revisit = Boolean(session.listingTeach);
  if (!revisit) {
    await dismissBlockingDialogs(session.page, undefined, 2500).catch(
      () => false,
    );
    await session.page
      .locator(
        'h3:has-text("Encartes"), img[src*="flipbook"], img[alt*="Encarte"], section.offers, .offers__item',
      )
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => undefined);
  } else {
    await session.page
      .locator(
        '.modal.show, .flipbook-modal, [role="dialog"], [class*="flipbook"]',
      )
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => undefined);
  }

  const html = await dumpFullPageHtml(session.page);
  flyerLog.info(
    "SESSION",
    `section-locate html=${html.length} chars url=${session.page.url()} revisit=${revisit}`,
  );

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), flyerConfig.mimoTimeout);
  let sec;
  try {
    sec = await mimoLocateSection({
      url: session.page.url(),
      html,
      hint: [
        operator?.hint,
        revisit
          ? "Operator clicked a card. OPEN modal/flipbook/lightbox with page images, fancybox hrefs, or CSS background-image → openKind=viewer. Listing thumbs only (no page assets) → need_click."
          : undefined,
      ]
        .filter(Boolean)
        .join(" "),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  sec = { ...sec, openKind: refineOpenKindFromHtml(sec.openKind, html) };

  const parsed = parseFromSection(sec);
  if (sec.status === "not_found" && !revisit) {
    session.proposed = undefined;
    session.listingTeach = undefined;
    session.sectionOpen = undefined;
    return {
      analyzed: {
        version: 1,
        startUrl: session.startUrl,
        notes: parsed.humanHint,
        steps: [],
        awaitDetail: false,
      },
      parsed,
    };
  }

  const scopeSel = sec.sectionSelectors[0];
  let items = sec.itemSelectors.length
    ? sec.itemSelectors
    : sec.sectionSelectors;
  const resolved = await resolveTeachItemSelectors(
    session.page,
    scopeSel,
    items,
  );
  items = resolved.selectors;
  const journalTabCount =
    resolved.journalTabCount ||
    (await countJournalTabs(session.page, scopeSel));
  items = normalizeJournalItemSelectors(items, { journalTabCount });
  if (sec.openKind === "need_click") {
    items = await augmentListingLinkSelectors(
      session.page,
      items,
      scopeSel,
    );
  }
  const countCards = Math.min(
    Math.max(
      journalTabCount >= 2
        ? journalTabCount
        : await countJournalItems(session.page, items, scopeSel),
      1,
    ),
    48,
  );
  // ponytail: 2nd locate (viewer) must not replace listing cards with lightbox slides
  if (!revisit || !session.listingTeach) {
    session.listingTeach = {
      listingUrl: session.currentUrl,
      itemSelectors: items,
      count: countCards,
    };
  }
  const harvested = revisit ? await applyViewerHarvest(session) : undefined;
  const openKind =
    harvested && (harvested.images > 0 || harvested.pdfs > 0 || harvested.canvas)
      ? "viewer"
      : sec.openKind;
  session.sectionOpen = {
    openKind,
    downloadSelectors: sec.downloadSelectors,
    clickTargetSelectors: sec.clickTargetSelectors,
    htmlSnippet: sec.htmlSnippet,
  };
  if (openKind === "need_click") {
    // Pass-1: wait for sample click. Do NOT wipe a finished flyerSource if a
    // later Detectar on the detail page re-classifies as need_click (Frangolândia).
    if (!session.flyerSource) {
      session.proposed = undefined;
    }
  }
  const count = session.listingTeach.count;
  const listingSels = session.listingTeach.itemSelectors;
  const notes = [
    parsed.humanHint,
    openKind === "viewer" && harvested?.images
      ? `Viewer: ${harvested.images} página(s) (img + background-image).`
      : "",
    count > 1 && listingSels[0]
      ? `${count} cards · ${listingSels[0]} (padrão de cada item, não outra área).`
      : "",
    sec.htmlSnippet ? `HTML: ${sec.htmlSnippet}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    analyzed: {
      version: 1,
      startUrl: session.startUrl,
      notes,
      steps: session.proposed?.steps ?? [],
      awaitDetail: openKind === "need_click",
      teachPass: openKind === "viewer" ? 2 : 1,
      listingCount: count,
    },
    parsed: { ...parsed, humanHint: notes },
    openKind,
    itemSelectors: listingSels,
  };
}

export async function locateFlyersWithMimo(
  sessionId: string,
  operator?: OperatorLocateHint,
): Promise<{
  pick: ScopePick | null;
  probe: Awaited<ReturnType<typeof probeScope>> | null;
  selectors: string[];
  label: string;
  source: "mimo";
  status: "ready" | "need_click" | "not_found";
  humanHint: string;
  awaitDetail: boolean;
  listingCount?: number;
  stepCount: number;
  flyerSource?: import("../types/flows.js").FlyerSource;
  candidates: LocateCandidate[];
  openKind?: "download" | "viewer" | "need_click";
  itemSelectors?: string[];
}> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  const wasRecording = session.recording;
  session.recording = false;
  const preIdx = session.scopeIndex ?? 0;
  const preChain = session.scopeChain;
  const preNode = preChain?.[preIdx];
  try {
    const { analyzed, parsed, openKind, itemSelectors } = await teachWithDump(
      sessionId,
      operator,
    );
    const candidates = await resolveCandidates(session.page, parsed);

    let pick: ScopePick | null = null;
    const probe = null;

    if (preNode?.selectors?.[0]) {
      pick = nodeToPick(preNode, preChain!.slice(preIdx + 1));
      session.scopeChain = preChain;
      session.scopeIndex = preIdx;
      await highlightScope(session.page, pick.box);
      await takeFrame(session);
    } else {
      const first = candidates.find((c) => c.box && c.selectors.length);
      pick = first ? candidateToPick(first) : null;
      if (pick) {
        session.scopeChain = [pick, ...pick.ancestors];
        session.scopeIndex = 0;
        await highlightScope(session.page, pick.box);
        await takeFrame(session);
      }
    }

    flyerLog.info(
      "SESSION",
      `locate-section mimo status=${parsed.status} cands=${candidates.length} sel=${pick?.selectors[0] ?? "-"} n=${analyzed.listingCount ?? 0}`,
    );
    traceSetup(session, "locate", analyzed.notes?.split("\n")[0] ?? "Detectar encartes", {
      status: parsed.status,
      openKind,
      itemSelectors,
      listingCount: analyzed.listingCount,
      teachPass: analyzed.teachPass ?? 1,
      awaitDetail: analyzed.awaitDetail,
      candidates: candidates.map((c) => ({
        label: c.label,
        selectors: c.selectors,
      })),
      notes: analyzed.notes,
      flyerSource: session.flyerSource,
    });
    return {
      pick,
      probe,
      selectors: pick?.selectors ?? [],
      label: pick?.label ?? parsed.label,
      source: "mimo",
      status: parsed.status,
      humanHint: analyzed.notes ?? parsed.humanHint,
      awaitDetail: analyzed.awaitDetail ?? false,
      listingCount: analyzed.listingCount,
      stepCount: analyzed.steps.length,
      flyerSource: session.flyerSource,
      candidates,
      openKind,
      itemSelectors,
    };
  } finally {
    session.recording = wasRecording;
  }
}

export type PreviewDiscoverFlyer = {
  title: string;
  pageCount: number;
  originalUrl: string;
  warn?: string;
};

/** Persist teach-test denylist on live flyerSource (no Convex write). */
export function skipPreviewFlyer(
  sessionId: string,
  args: { add?: string[]; remove?: string[] },
): { skipKeys: string[] } {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);
  const src = session.flyerSource;
  if (!src) throw new Error("Aprova a listagem primeiro.");
  let keys = [...(src.skipKeys ?? [])];
  if (args.add?.length) keys.push(...args.add);
  if (args.remove?.length) {
    const drop = new Set(args.remove.map((s) => s.trim().toLowerCase()));
    keys = keys.filter((k) => !drop.has(k.trim().toLowerCase()));
  }
  const next = sanitizeFlyerSource({ ...src, skipKeys: keys });
  session.flyerSource = next;
  traceSetup(session, "skip_flyer", `Ignorar encarte(s): ${(args.add ?? []).join(", ")}`, {
    add: args.add,
    remove: args.remove,
    skipKeys: next.skipKeys,
  });
  if (session.proposed?.steps.length) {
    session.proposed = {
      ...session.proposed,
      steps: applyFlyerSource(session.proposed.steps, next),
    };
  }
  return { skipKeys: next.skipKeys ?? [] };
}

/** Dry-run discover on live teach session. No Convex persist. */
export async function previewDiscover(
  sessionId: string,
  onLog: (line: string) => void,
): Promise<{ flyers: PreviewDiscoverFlyer[] }> {
  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");
  touch(session);
  let sourceIn =
    session.flyerSource ??
    session.proposed?.steps.find((s) => s.type === "discover-flyer")?.config
      .flyerSource;
  let scopeSel = session.actions.find((a) => a.kind === "scope")
    ?.selectors?.[0];
  if (!sourceIn || !scopeSel) {
    const { getScraperFlow } = await import("../core/flyer-storage.js");
    const flow = await getScraperFlow(session.flowId);
    for (const s of flow?.steps ?? []) {
      let cfg: { flyerSource?: typeof sourceIn; selectors?: string[] } = {};
      try {
        cfg = JSON.parse(s.config) as typeof cfg;
      } catch {
        continue;
      }
      if (s.type === "discover-flyer" && cfg.flyerSource && !sourceIn) {
        sourceIn = cfg.flyerSource;
        session.flyerSource = cfg.flyerSource;
      }
      if (s.type === "select-scope" && cfg.selectors?.[0] && !scopeSel) {
        scopeSel = cfg.selectors[0];
      }
    }
  }
  if (!sourceIn && session.listingTeach?.itemSelectors?.length) {
    sourceIn = listingSourceFromSelectors(session.listingTeach.itemSelectors);
    session.flyerSource = sourceIn;
  }
  if (!sourceIn) {
    throw new Error("Aprova a listagem primeiro.");
  }
  // Drop stale CDN/page JPEGs from long-lived teach session
  session.networkFlyers = pruneBarePageImageDocs(session.networkFlyers);
  const source = sourceIn;
  const wasRecording = session.recording;
  session.recording = false;
  const harvest = attachNetworkHarvester(session.page);
  try {
    const listUrl = session.listingTeach?.listingUrl;
    if (listUrl && listingKey(session.page.url()) !== listingKey(listUrl)) {
      onLog("[TESTE] volta listagem");
      await session.page
        .goto(listUrl, { waitUntil: "domcontentloaded", timeout: 12_000 })
        .catch(() => undefined);
      const waitSel = source.itemSelectors?.[0];
      if (waitSel) {
        await session.page
          .locator(waitSel)
          .first()
          .waitFor({ state: "visible", timeout: 8000 })
          .catch(() => undefined);
      }
    }
    // ponytail: SPA modal same URL — Teste must close overlay before card loop
    await closeFlyerOverlay(session.page);
    onLog("[TESTE] abrindo cada encarte — não grava, não salva");
    harvest.flyers.push(...session.networkFlyers);
    const candidates = await discoverWithFlyerSource({
      page: session.page,
      scopeSelector: scopeSel,
      network: harvest.flyers,
      source,
      onLog,
    });
    // ponytail: same CDN/canvas URL ≠ same jornal — key externalId (open-each-item)
    const byUrl = new Map<string, PreviewDiscoverFlyer>();
    for (const c of candidates) {
      const pageCount = Math.max(
        c.pageUrls.length,
        c.pageBuffers?.length ?? 0,
      );
      const title = (c.title ?? "").trim() || "(sem título)";
      const originalUrl = c.originalUrl;
      const key = (c.externalId ?? originalUrl).trim();
      const warn = title === "(sem título)" ? "sem título" : undefined;
      const prev = byUrl.get(key);
      if (!prev || pageCount > prev.pageCount) {
        byUrl.set(key, { title, pageCount, originalUrl, warn });
      }
    }
    const flyers = [...byUrl.values()];
    onLog(`[TESTE] ${flyers.length} encarte(s)`);
    traceSetup(session, "preview", `Teste: ${flyers.length} encarte(s)`, {
      flyers,
      flyerSource: source,
      scopeSel,
    });
    return { flyers };
  } finally {
    harvest.dispose();
    session.recording = wasRecording;
    await takeFrame(session);
  }
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
  const open = session.sectionOpen;
  const leftListingUrl = Boolean(
    session.listingTeach &&
      listingKey(session.listingTeach.listingUrl) !==
        listingKey(session.page.url()),
  );
  // ponytail: SPA viewer same URL — don't replace listing cards with modal sels
  const keepListingScope = Boolean(
    session.listingTeach?.itemSelectors?.length &&
      (leftListingUrl ||
        open?.openKind === "viewer" ||
        args.selectors.some((s) => isViewerNoise(s))),
  );
  const scopeSels = keepListingScope
    ? (session.actions.find((a) => a.kind === "scope")?.selectors?.length
        ? (session.actions.find((a) => a.kind === "scope")!.selectors as string[])
        : args.selectors.filter((s) => !isViewerNoise(s)))
    : args.selectors;
  // Always persist select-scope — Assaí viewer tabs used to skip this and save only navigate
  if (
    !session.actions.some((a) => a.kind === "scope") ||
    !keepListingScope
  ) {
    session.actions = session.actions.filter(
      (a) => a.kind !== "scope" && a.value !== "discover-flyer",
    );
    forcePush(session, {
      kind: "scope",
      selectors: scopeSels.length ? scopeSels : args.selectors,
      description: args.label,
      semantic: "SELECT_SCOPE",
      value: args.purpose ?? "flyer-discovery",
      metadata: args.metadata,
    });
  }
  if (!keepListingScope || !session.listingTeach) {
    const itemSels =
      session.listingTeach?.itemSelectors?.length
        ? session.listingTeach.itemSelectors
        : args.selectors;
    const rawCount = await countListingCards(session.page, itemSels);
    const count = Math.min(Math.max(rawCount, 1), 48);
    session.listingTeach = {
      listingUrl: session.currentUrl,
      itemSelectors: itemSels,
      count,
    };
  }
  const itemSels = session.listingTeach!.itemSelectors;
  const scopeSel =
    session.actions.find((a) => a.kind === "scope")?.selectors?.[0] ??
    scopeSels[0];
  const resolved = await resolveTeachItemSelectors(
    session.page,
    scopeSel,
    itemSels,
  );
  const journalTabCount =
    resolved.journalTabCount ||
    (await countJournalTabs(session.page, scopeSel));
  let resolvedSels = normalizeJournalItemSelectors(resolved.selectors, {
    journalTabCount,
  });
  if ((open?.openKind ?? "need_click") === "need_click") {
    resolvedSels = await augmentListingLinkSelectors(
      session.page,
      resolvedSels,
      scopeSel,
    );
  }
  session.listingTeach!.itemSelectors = resolvedSels;
  const listingCount = Math.min(
    Math.max(
      journalTabCount >= 2
        ? journalTabCount
        : await countJournalItems(session.page, resolvedSels, scopeSel),
      1,
    ),
    48,
  );
  session.listingTeach!.count = listingCount;

  // Always rebuild from openKind + DOM tab count — stale image-grid overwrote Assaí tabs
  const rebuilt = flyerSourceFromOpenKind({
    openKind: open?.openKind ?? "need_click",
    itemSelectors: resolvedSels,
    downloadSelectors: open?.downloadSelectors,
    clickTargetSelectors: open?.clickTargetSelectors,
    itemCount: session.listingTeach?.count,
    journalTabCount,
    htmlSnippet: open?.htmlSnippet,
  });
  const prevKind = session.flyerSource?.kind;
  const preferRebuilt =
    journalTabCount >= 2 ||
    rebuilt.kind === "tabs" ||
    !session.flyerSource ||
    prevKind !== rebuilt.kind;
  session.flyerSource = keepSkip(
    session,
    preferRebuilt
      ? rebuilt
      : (args.flyerSource ?? session.flyerSource ?? rebuilt),
  );

  session.proposed = {
    startUrl: session.startUrl,
    notes: args.label,
    steps: buildTeachSteps({
      startUrl: session.startUrl,
      actions: session.actions,
      flyerSource: session.flyerSource,
      scopeSelectors:
        session.actions.find((a) => a.kind === "scope")?.selectors ?? scopeSels,
    }),
    awaitDetail: false,
  };

  traceSetup(session, "confirm_scope", args.label ?? "Listagem aprovada", {
    selectors: scopeSels,
    purpose: args.purpose,
    flyerSource: session.flyerSource,
    listingTeach: session.listingTeach,
    openKind: open?.openKind,
    keepListingScope,
    journalTabCount,
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

async function countListingCards(
  page: LiveSession["page"],
  sels: string[],
  scopeSelector?: string,
): Promise<number> {
  return countJournalItems(page, sels, scopeSelector);
}

function listingSourceFromSelectors(sels: string[]): FlyerSource {
  return flyerSourceFromOpenKind({
    openKind: "need_click",
    itemSelectors: sels,
  });
}

function keepSkip(session: LiveSession, src: FlyerSource): FlyerSource {
  const prev = session.flyerSource?.skipKeys;
  if (!prev?.length) return src;
  return sanitizeFlyerSource({
    ...src,
    skipKeys: [...(src.skipKeys ?? []), ...prev],
  });
}

function finishAnalyze(
  session: LiveSession,
  analyzed: AnalyzedFlow,
): AnalyzedFlow {
  const disc = analyzed.steps.find((s) => s.type === "discover-flyer");
  if (disc?.config.flyerSource) {
    const src = keepSkip(session, disc.config.flyerSource);
    session.flyerSource = src;
    analyzed = {
      ...analyzed,
      steps: applyFlyerSource(analyzed.steps, src),
    };
  }
  session.proposed = analyzed;
  flyerLog.info(
    "SESSION",
    `analyze ${session.sessionId} steps=${analyzed.steps.length} pass=${analyzed.teachPass ?? "-"}`,
  );
  return analyzed;
}

export async function analyzeSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.snapQueue) await session.snapQueue;
  const { analyzed, parsed } = await teachWithDump(sessionId);
  if (parsed.status === "not_found" && !session.listingTeach) {
    throw new Error(analyzed.notes || parsed.humanHint || "not_found");
  }
  traceSetup(session, "analyze", analyzed.notes?.split("\n")[0] ?? "Re-análise", {
    status: parsed.status,
    teachPass: analyzed.teachPass,
    listingCount: analyzed.listingCount,
    steps: analyzed.steps.length,
    notes: analyzed.notes,
  });
  return analyzed;
}

export async function saveSession(sessionId: string): Promise<{ steps: number }> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  if (session.proposed?.awaitDetail) {
    throw new Error("Aprova a listagem antes de salvar.");
  }

  const scopeSelectors =
    (session.actions.find((a) => a.kind === "scope")?.selectors as
      | string[]
      | undefined) ??
    (
      session.proposed?.steps.find((s) => s.type === "select-scope")?.config as
        | { selectors?: string[] }
        | undefined
    )?.selectors;

  const flyerFromProposed = (
    session.proposed?.steps.find((s) => s.type === "discover-flyer")?.config as
      | { flyerSource?: import("../types/flows.js").FlyerSource }
      | undefined
  )?.flyerSource;

  const flyerSource = session.flyerSource ?? flyerFromProposed;

  // Always rebuild via buildTeachSteps when we have teach context — never persist
  // sample clicks (VER ENCARTE / Download PDF) that leave the listing page.
  if (flyerSource || session.listingTeach?.itemSelectors?.length) {
    const src =
      flyerSource ??
      flyerSourceFromOpenKind({
        openKind: "need_click",
        itemSelectors: session.listingTeach!.itemSelectors,
        itemCount: session.listingTeach!.count,
      });
    session.flyerSource = keepSkip(session, src);
    const built = buildTeachSteps({
      startUrl: session.startUrl,
      actions: session.actions,
      flyerSource: session.flyerSource,
      scopeSelectors,
    });
    const rows = built.map((s, i) => ({
      type: s.type,
      config: JSON.stringify(s.config),
      order: i,
    }));
    await replaceScraperSteps(session.flowId, rows);
    session.proposed = {
      startUrl: session.startUrl,
      steps: built,
      awaitDetail: false,
    };
    traceSetup(session, "save", `${rows.length} steps salvos (proposed)`, {
      steps: rows.map((s) => ({ type: s.type, order: s.order })),
      flyerSource: session.flyerSource,
    });
    flyerLog.info(
      "SESSION",
      `saved proposed ${rows.length} steps → ${session.flowId}`,
    );
    return { steps: rows.length };
  }

  if (session.proposed?.steps.length) {
    const rows = session.proposed.steps.map((s, i) => ({
      type: s.type,
      config: JSON.stringify(s.config),
      order: i,
    }));
    await replaceScraperSteps(session.flowId, rows);
    traceSetup(session, "save", `${rows.length} steps salvos (proposed)`, {
      steps: rows.map((s) => ({ type: s.type, order: s.order })),
      flyerSource: session.flyerSource,
    });
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
    if (n.type === "click") {
      const blob = [
        n.config.description,
        n.config.value,
        n.config.selector,
        ...(n.config.selectors ?? []),
      ]
        .filter(Boolean)
        .join(" ");
      // Same filters as buildTeachSteps — teach sample / download noise
      if (
        /ver\s+\S{3,}|baixar|download/i.test(blob) ||
        /flip-card|jet-listing|VER ENCARTE|Download em PDF|card-folheto/i.test(
          blob,
        )
      ) {
        continue;
      }
    }
    if (n.type === "select-scope") hasScope = true;
    steps.push({
      type: n.type,
      config: JSON.stringify(n.config),
      order: order++,
    });
  }

  if (
    session.flyerSource &&
    hasScope &&
    !steps.some((s) => s.type === "discover-flyer")
  ) {
    steps.push({
      type: "discover-flyer",
      config: JSON.stringify({
        scope: "element",
        duration: 3000,
        flyerSource: session.flyerSource,
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
  traceSetup(session, "save", `${steps.length} steps salvos`, {
    steps: steps.map((s) => ({ type: s.type, order: s.order })),
    flyerSource: session.flyerSource,
    actions: session.actions.map(slimAction),
  });
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
