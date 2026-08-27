import { flyerConfig } from "../../core/flyer-config.js";
import { parseJsonObject } from "../json-parse.js";
import { mimoChat } from "./client.js";
import { MimoError } from "./errors.js";
import type { FlowStep, StepConfig, StepType } from "../../types/flows.js";
import type {
  GalleryScopeDump,
  TeachActionDump,
  TeachPayload,
} from "../../session/click-snapshot.js";
import { parseFlyerSource, sanitizeFlyerSource, sanitizeItemSelectors, preferImagesUnlessPdf, urlsLookLikePdfFile, hasProvenFileDownload, cardItemSelectors } from "../../runner/flyer-discover.js";

export const ANALYZE_FLOW_SYSTEM = `You turn a recorded supermarket-site session into a replayable scraper flow.
Return JSON only. Do not invent CSS selectors — copy from the dump.
Prefer id, data-testid, name, role. Text selectors are last resort.

STEPS — CRITICAL (one job per step, never merge):
Emit SEPARATE steps in order. Typical shape:
1. navigate — startUrl only
2. select / input — one step per field (UF, city, store). value EXACT from recording
3. click — open encartes/flyers gallery ONCE (not per tab, not Baixar)
4. wait — gallery visible OR strategy timeout
5. discover-flyer — ONLY step that may contain flyerSource
Never put city/UF/path/tabs/downloads into flyerSource alone as a substitute for those steps.
Never emit click for "Jornal de Ofertas 1/2/3" or Baixar — discover-flyer loops those.

CRITICAL — values: for select/input steps, copy action.value EXACTLY as recorded (e.g. "CE", "Fortaleza").
NEVER invent or rewrite values. NEVER use {{placeholders}} like {{UF}} {{CITY}} {{city}} {{uf}}.
For wait steps that need a selector: copy a real selector from the dump, or use strategy "timeout" with timeoutMs. Never emit wait with strategy selector and empty selector.

FLYER SOURCE (only on discover-flyer):
Gallery dump is PAGE-WIDE index — copy GENERIC selectors only.
itemSelectors: shared pattern for ALL tabs — e.g. [role=tab], [data-oferta-index], button:has-text("Jornal de Ofertas").
NEVER list Jornal 1, Jornal 2, data-oferta-index="31" separately.
If gallery.downloadButtons has href*.pdf → downloadStrategy "click-download" + downloadSelectors.
DEFAULT: flyers are IMAGES (jpeg/png/webp, lightbox, img.src). kind image-grid. Do NOT emit pdf-links or direct-url unless dump has href ending .pdf.
A button labeled PDF that opens an image viewer is still IMAGES — open-each-item + img.src.
If gallery.tabButtons / recorded clicks show a repeated card CTA (any label) → open-each-item + COPY those selectors. Never invent "Ver Encarte"/"Ver Folheto".
If only "Baixar" text (viewer/lightbox) → open-each-item; harvest images after click.
Else tabs → open-each-item.
Wait steps: prefer strategy timeout. Never invent Elementor gallery class names.
Always end with discover-flyer including flyerSource.
Do NOT include download-flyers or extract-offers.
Ignore product SKUs, banners, and category tiles.
Schema:
{"version":1,"startUrl":string,"notes":string,"steps":[{"type":string,"config":object}]}`;

const ALLOWED: StepType[] = [
  "navigate",
  "click",
  "select",
  "input",
  "wait",
  "scroll",
  "select-scope",
  "discover-store",
  "discover-flyer",
  "capture-network",
];

const ALLOWED_SET = new Set<string>(ALLOWED);

export function analyzeFlowUserPrompt(payload: TeachPayload): string {
  const galleryJson = payload.gallery
    ? JSON.stringify(payload.gallery, null, 2)
    : "(none — no gallery region detected)";
  return `Recorded session. Build the stepper JSON.

Start URL: ${payload.startUrl}
Current URL: ${payload.currentUrl}

Network flyer document URLs:
${payload.networkFlyers.join("\n") || "(none)"}

Page-wide gallery index (copy selectors; do not invent):
${galleryJson}

Actions (html/css/js are truncated dumps of the clicked node):
${JSON.stringify(payload.actions, null, 2)}

Allowed step types: ${ALLOWED.join(", ")}

Config keys you may use: url, selector, selectors, value, description, strategy, timeoutMs, direction, amount, scope, duration, semantic, purpose, label, flyerSource.

Preserve every recorded select/input value verbatim in the matching step — each field = its own step.
Keep steps discrete: navigate → selects/inputs → click open gallery → wait → discover-flyer.
On discover-flyer only: set flyerSource from gallery dump.
If gallery has real flyer downloadButtons with .pdf href → click-download + downloadSelectors; itemSelectors = GENERIC tab pattern only when kind is tabs.
DEFAULT image-grid / img.src / open-each-item or collect-images. Never pdf-links unless dump shows .pdf href.
If gallery.tabButtons or recorded clicks are a repeated card CTA → open-each-item; copy those selectors exactly. Never invent CTA text.
If Baixar only opens viewer/image (no PDF href) → open-each-item; harvest images.
If tabs without download → open-each-item + generic itemSelectors.
Never one click per tab label. Never put Baixar/app CTA as a click step.
HTML href to another page ≠ PDF. Wait = timeout unless selector copied from dump.`;
}

const PLACEHOLDER_RE = /^\{\{\s*[\w.]+\s*\}\}$/;

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out.length ? out : undefined;
}

function isPlaceholderValue(v: string | undefined): boolean {
  if (!v?.trim()) return true;
  return PLACEHOLDER_RE.test(v.trim());
}

function sanitizeConfig(raw: unknown): StepConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const strategy =
    o.strategy === "selector" || o.strategy === "timeout" || o.strategy === "networkidle"
      ? o.strategy
      : undefined;
  const direction = o.direction === "down" || o.direction === "up" ? o.direction : undefined;
  const value = typeof o.value === "string" ? o.value : undefined;
  return {
    url: typeof o.url === "string" ? o.url : undefined,
    selector: typeof o.selector === "string" ? o.selector : undefined,
    selectors: asStringArray(o.selectors),
    // Drop invented {{UF}} etc. — reconcile restores from recording
    value: value && !isPlaceholderValue(value) ? value : undefined,
    description: typeof o.description === "string" ? o.description : undefined,
    strategy,
    timeoutMs: typeof o.timeoutMs === "number" ? o.timeoutMs : undefined,
    direction,
    amount: typeof o.amount === "number" ? o.amount : undefined,
    scope: typeof o.scope === "string" ? o.scope : undefined,
    duration: typeof o.duration === "number" ? o.duration : undefined,
    semantic: typeof o.semantic === "string" ? o.semantic : undefined,
    purpose: typeof o.purpose === "string" ? o.purpose : undefined,
    label: typeof o.label === "string" ? o.label : undefined,
    flyerSource: parseFlyerSource(o.flyerSource),
  };
}

/** Put recorded site values back when MiMo emptied or placeholder-rewrote them. */
export function reconcileRecordedValues(
  steps: FlowStep[],
  actions: TeachActionDump[],
): FlowStep[] {
  const recorded = actions
    .filter(
      (a) =>
        (a.kind === "change" || a.kind === "input") &&
        typeof a.value === "string" &&
        a.value.trim() &&
        !isPlaceholderValue(a.value),
    )
    .map((a) => a.value!.trim());
  let i = 0;
  return steps.map((s) => {
    if (s.type !== "select" && s.type !== "input") return s;
    if (!isPlaceholderValue(s.config.value)) return s;
    if (i >= recorded.length) return s;
    const value = recorded[i++];
    return { ...s, config: { ...s.config, value } };
  });
}

function hardenWaitSteps(steps: FlowStep[]): FlowStep[] {
  return steps.map((s) => {
    if (s.type !== "wait") return s;
    const sel = s.config.selector ?? s.config.selectors?.[0];
    const strategy = s.config.strategy ?? "selector";
    if (strategy !== "selector" || sel) return s;
    return {
      ...s,
      config: {
        ...s.config,
        strategy: "timeout",
        timeoutMs: s.config.timeoutMs ?? 2000,
        selector: undefined,
        selectors: undefined,
      },
    };
  });
}

const FLYER_TAB_TEXT_RE =
  /jornal\s*de\s*ofertas|encarte|folheto|flyer\s*tab|catalogo|catálogo/i;
const FLYER_TAB_NUM_RE = /\b\d+\s*$/;

function stepBlob(s: FlowStep): string {
  return [
    s.config.description,
    s.config.value,
    s.config.selector,
    ...(s.config.selectors ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

function isFlyerCardCtaClick(s: FlowStep): boolean {
  if (s.type !== "click") return false;
  return /ver\s+\S{3,}/i.test(stepBlob(s));
}

function isFlyerTabClick(s: FlowStep): boolean {
  if (s.type !== "click") return false;
  const blob = stepBlob(s);
  if (isFlyerCardCtaClick(s)) return true;
  if (!FLYER_TAB_TEXT_RE.test(blob)) return false;
  // "Jornal de Ofertas 1" / tab numbered sample — or explicit select-tab wording
  if (FLYER_TAB_NUM_RE.test(blob) || /select\s+(first\s+)?flyer\s+tab|aba/i.test(blob)) {
    return true;
  }
  return /jornal\s*de\s*ofertas/i.test(blob);
}

/** Turn button:has-text("Jornal de Ofertas 1") → button:has-text("Jornal de Ofertas") */
function generalizeTabSelector(sel: string): string | undefined {
  const m = sel.match(/:has-text\("([^"]+)"\)/);
  if (!m?.[1]) return undefined;
  const text = m[1].replace(/\s+\d+\s*$/, "").trim();
  if (!text || text === m[1]) return undefined;
  return sel.replace(m[1], text);
}

/**
 * MiMo often emits one click for "Jornal de Ofertas 1" only.
 * Drop those clicks; discover-flyer loops all tabs.
 */
export function collapseFlyerTabClicks(steps: FlowStep[]): FlowStep[] {
  const tabClicks = steps.filter(isFlyerTabClick);
  if (!tabClicks.length) return steps;
  const cardCta = tabClicks.some(isFlyerCardCtaClick);

  const itemSelectors: string[] = cardCta
    ? []
    : ['[role="tab"]', "[data-oferta-index]"];
  for (const c of tabClicks) {
    for (const sel of [c.config.selector, ...(c.config.selectors ?? [])]) {
      if (!sel) continue;
      const gen = generalizeTabSelector(sel);
      if (gen) itemSelectors.push(gen);
      else if (!/:has-text\("[^"]+\d+"\)/.test(sel) && !/data-oferta-index\s*=/.test(sel)) {
        itemSelectors.push(sel);
      }
    }
  }
  const uniqItems =
    sanitizeItemSelectors(itemSelectors, {
      kind: cardCta ? "image-grid" : "tabs",
    }) ?? itemSelectors.slice(0, 6);

  const kept = steps.filter((s) => !isFlyerTabClick(s));
  let touched = false;
  const out = kept.map((s) => {
    if (s.type !== "discover-flyer") return s;
    touched = true;
    const prev = s.config.flyerSource;
    const keepDl =
      prev?.downloadStrategy === "click-download" ||
      Boolean(prev?.downloadSelectors?.length);
    const kind = cardCta ? "image-grid" : "tabs";
    return {
      ...s,
      config: {
        ...s.config,
        flyerSource: sanitizeFlyerSource({
          kind,
          downloadStrategy: keepDl ? "click-download" : "open-each-item",
          urlFrom:
            prev?.urlFrom ??
            (cardCta || keepDl ? "click-then-network" : "img.src"),
          itemSelectors: [
            ...new Set([...(prev?.itemSelectors ?? []), ...uniqItems]),
          ],
          downloadSelectors: prev?.downloadSelectors,
          networkHints: prev?.networkHints,
          evidence: keepDl
            ? (prev?.evidence ?? "tabs + download")
            : (prev?.evidence ??
              (cardCta
                ? "collapsed card CTA clicks → open-each-item + goBack"
                : "collapsed per-tab clicks → open-each-item")),
        }),
      },
    };
  });
  if (!touched) {
    out.push({
      order: out.length,
      type: "discover-flyer",
      config: {
        scope: "page",
        duration: 4000,
        flyerSource: sanitizeFlyerSource({
          kind: cardCta ? "image-grid" : "tabs",
          downloadStrategy: "open-each-item",
          urlFrom: cardCta ? "click-then-network" : "img.src",
          itemSelectors: uniqItems,
          evidence: cardCta
            ? "collapsed card CTA clicks → open-each-item + goBack"
            : "collapsed per-tab clicks → open-each-item",
        }),
      },
    });
  }
  return out;
}

const CARD_CTA_RE = /ver\s+\S{3,}/i;

function blobHasCardCta(blob: string): boolean {
  return CARD_CTA_RE.test(blob);
}

/** MiMo often emits pdf-links because Elementor buttons have href. Force loop. */
export function forceCardCtaOpenEachItem(
  steps: FlowStep[],
  hints?: {
    notes?: string;
    actions?: TeachActionDump[];
    gallery?: GalleryScopeDump;
  },
): FlowStep[] {
  const parts: string[] = [hints?.notes ?? ""];
  for (const a of hints?.actions ?? []) {
    parts.push(a.description ?? "", a.value ?? "", ...(a.selectors ?? []));
  }
  for (const t of hints?.gallery?.tabButtons ?? []) {
    parts.push(t.text, ...(t.selectors ?? []));
  }
  for (const s of steps) {
    if (s.type !== "discover-flyer") continue;
    parts.push(...(s.config.flyerSource?.itemSelectors ?? []));
    parts.push(s.config.description ?? "");
  }
  if (!blobHasCardCta(parts.join(" "))) return steps;

  const itemSelectors = cardItemSelectors([
    ...steps.flatMap((s) => s.config.flyerSource?.itemSelectors ?? []),
    ...(hints?.gallery?.tabButtons ?? []).flatMap((t) => t.selectors),
  ]);

  return steps.map((s) => {
    if (s.type !== "discover-flyer") return s;
    const prev = s.config.flyerSource;
    return {
      ...s,
      config: {
        ...s.config,
        flyerSource: sanitizeFlyerSource({
          kind: "image-grid",
          downloadStrategy: "open-each-item",
          urlFrom: "click-then-network",
          itemSelectors,
          downloadSelectors: prev?.downloadSelectors,
          networkHints: prev?.networkHints,
            evidence:
            (prev?.evidence ?? "") +
            " | forced: card CTA → open-each-item capa→botão",
        }),
      },
    };
  });
}

export type AnalyzedFlow = {
  version: number;
  startUrl: string;
  notes?: string;
  steps: FlowStep[];
  /** Pass 1: user must open one flyer then analyze again. */
  awaitDetail?: boolean;
  listingCount?: number;
  teachPass?: 1 | 2;
};

export function parseAnalyzedFlow(
  raw: string,
  fallbackStartUrl: string,
  actions?: TeachActionDump[],
  gallery?: GalleryScopeDump,
): AnalyzedFlow {
  const p = parseJsonObject(raw) as {
    version?: unknown;
    startUrl?: unknown;
    notes?: unknown;
    steps?: unknown;
  };
  const stepsIn = Array.isArray(p.steps) ? p.steps : [];
  let steps: FlowStep[] = [];
  let order = 0;
  for (const item of stepsIn) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { type?: unknown; config?: unknown };
    const type = typeof rec.type === "string" ? rec.type : "";
    if (!ALLOWED_SET.has(type)) continue;
    steps.push({
      order: order++,
      type: type as StepType,
      config: sanitizeConfig(rec.config),
    });
  }
  if (!steps.some((s) => s.type === "navigate")) {
    steps.unshift({
      order: 0,
      type: "navigate",
      config: { url: fallbackStartUrl },
    });
    steps.forEach((s, i) => {
      s.order = i;
    });
  }
  if (!steps.some((s) => s.type === "discover-flyer")) {
    steps.push({
      order: steps.length,
      type: "discover-flyer",
      config: { scope: "page", duration: 3000 },
    });
  }
  // Ensure discover-flyer has at least default flyerSource when missing
  steps = steps.map((s) => {
    if (s.type !== "discover-flyer") return s;
    if (!s.config.flyerSource) {
      const noPdf =
        gallery &&
        !urlsLookLikePdfFile(gallery.links ?? []) &&
        !hasProvenFileDownload(gallery.downloadButtons ?? []);
      return {
        ...s,
        config: {
          ...s.config,
          flyerSource: noPdf
            ? {
                kind: "image-grid",
                downloadStrategy: "collect-images",
                urlFrom: "img.src",
              }
            : {
                kind: "pdf-links",
                downloadStrategy: "direct-url",
                urlFrom: "href",
              },
        },
      };
    }
    return {
      ...s,
      config: {
        ...s.config,
        flyerSource: sanitizeFlyerSource(s.config.flyerSource),
      },
    };
  });
  if (actions?.length) {
    steps = reconcileRecordedValues(steps, actions);
  }
  steps = collapseFlyerTabClicks(steps);
  steps = forceCardCtaOpenEachItem(steps, {
    notes: typeof p.notes === "string" ? p.notes : undefined,
    actions,
    gallery,
  });
  steps = steps.map((s) => {
    if (s.type !== "discover-flyer" || !s.config.flyerSource) return s;
    return {
      ...s,
      config: {
        ...s.config,
        flyerSource: preferImagesUnlessPdf(s.config.flyerSource, gallery),
      },
    };
  });
  steps = hardenWaitSteps(steps);
  steps = steps.map((s) => {
    if (s.type !== "discover-flyer" || !s.config.flyerSource) return s;
    return {
      ...s,
      config: {
        ...s.config,
        flyerSource: sanitizeFlyerSource(s.config.flyerSource),
      },
    };
  });
  steps.forEach((s, i) => {
    s.order = i;
  });
  return {
    version: typeof p.version === "number" ? p.version : 1,
    startUrl: typeof p.startUrl === "string" && p.startUrl ? p.startUrl : fallbackStartUrl,
    notes: typeof p.notes === "string" ? p.notes.slice(0, 240) : undefined,
    steps,
  };
}

export async function mimoAnalyzeFlow(args: {
  payload: TeachPayload;
  imageUrl: string;
  signal: AbortSignal;
}): Promise<AnalyzedFlow> {
  if (!flyerConfig.mimoApiKey) throw new MimoError("MIMO_API_KEY missing");
  const json = await mimoChat({
    imageUrl: args.imageUrl,
    system: ANALYZE_FLOW_SYSTEM,
    user: analyzeFlowUserPrompt(args.payload),
    signal: args.signal,
  });
  const raw = json.choices?.[0]?.message?.content ?? "";
  return parseAnalyzedFlow(
    raw,
    args.payload.startUrl,
    args.payload.actions,
    args.payload.gallery,
  );
}
