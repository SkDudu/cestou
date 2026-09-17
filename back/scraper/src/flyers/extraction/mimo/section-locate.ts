import { flyerConfig } from "../../core/flyer-config.js";
import { parseJsonObject } from "../json-parse.js";
import { mimoChat } from "./client.js";
import { MimoError } from "./errors.js";

export type SectionOpenKind = "download" | "viewer" | "need_click";

export const SECTION_LOCATE_SYSTEM = `You find the supermarket FLYER / ENCARTE / OFFERS section in page HTML.
Ignore header, footer, nav, app CTAs, product SKU grids, cookie dialogs.
Copy CSS selectors FROM the HTML. Never invent class names. Never reuse schema placeholders.
Return JSON only. No flyerSource, no download strategy.

sectionSelectors = the WHOLE listing container (one region).
itemSelectors = CSS for EACH repeating unit (card, tab, jornal). Not a second region. Always a JSON array of strings.

PAGE ASSET = URL of a full flyer PAGE (not a tiny listing cover):
href/src/data-src/data-lazy/srcset, a[data-fancybox], slick/swiper slide,
OR CSS background-image:url(...), pointing to .pdf / .jpg / .jpeg / .png / .webp
(CDN ok: cloudfront, s3, etc). Hidden/cloned slick slides still count — they are in the HTML.

NOT a page asset: API listing thumbnails only (/Flyer/thumbnail, small cover in a card grid),
OR a grid of cover cards that link to /folheto/ or /encarte/ detail pages.
Those MUST use openKind=need_click — user opens one card, then Detectar de novo.

openKind — pick ONE from THIS html. First match wins:
1) OPEN overlay (.modal/.flipbook-modal/.fancybox-container, role=dialog with pages) → viewer. Point sectionSelectors at that overlay.
2) download — real file control for a flyer file: a[href*=.pdf], [download], "Baixar PDF" / "Baixar página" / "Download" even if the file is jpeg/png. Fill downloadSelectors.
3) viewer — PAGE ASSETS already in this HTML (carousel of pages, fancybox gallery of pages, flipbook CSS bg, iframe PDF). Tabs that switch which jornal is shown in the SAME carousel are still viewer; itemSelectors = those tab/buttons.
4) need_click — PAGE ASSETS absent: listing of covers/cards, one thumb per jornal, pages appear after click. Fill clickTargetSelectors with the real card/link selectors from HTML.

NEVER need_click if PAGE ASSETS exist in this HTML.
Listing thumbs alone (small cover, no page-size images, no download control) = need_click.
Links like /encarte/... or /folheto/... without inline page assets = need_click (not viewer, not download).

{
  "status": "ready" | "not_found",
  "label": "short PT title of the section",
  "why": "short PT",
  "sectionSelectors": ["<copy container selector from HTML>"],
  "itemSelectors": ["<copy repeating card/tab selector from HTML>"],
  "openKind": "download" | "viewer" | "need_click",
  "downloadSelectors": ["<copy real download control from HTML, or empty>"],
  "clickTargetSelectors": ["<copy card link selector when need_click, or empty>"],
  "htmlSnippet": "max 200 chars plain text — no nested quotes"
}`;

export type SectionLocate = {
  status: "ready" | "not_found";
  label: string;
  why: string;
  sectionSelectors: string[];
  itemSelectors: string[];
  htmlSnippet: string;
  openKind: SectionOpenKind;
  downloadSelectors: string[];
  clickTargetSelectors: string[];
};

function asSels(v: unknown): string[] {
  if (typeof v === "string" && v.trim()) {
    return [v.trim()];
  }
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, 8),
    ),
  ];
}

/** True when selector tokens (classes/ids/href fragments) appear in HTML dump. */
export function selectorGroundedInHtml(sel: string, html: string): boolean {
  const s = sel.trim();
  if (!s) return false;
  const classes = [...s.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
  const ids = [...s.matchAll(/#([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
  const hrefFrags = [
    ...s.matchAll(/href\*=['"]?([^'"\]]+)/gi),
  ].map((m) => m[1]);
  if (classes.length || ids.length || hrefFrags.length) {
    const classOk = classes.every((c) => html.includes(c));
    const idOk = ids.every((id) => html.includes(id));
    const hrefOk = hrefFrags.every((f) => html.includes(f));
    return classOk && idOk && hrefOk;
  }
  // Tag / :has-text / complex — keep; DOM resolve will drop later if dead.
  return true;
}

/** Listing covers / JetEngine grid / encarte links (href or data-url). */
export function htmlLooksLikeFlyerListing(html: string): boolean {
  return (
    /jet-listing-grid/i.test(html) ||
    /\/folhet[oós]?\//i.test(html) ||
    /(?:href|data-url)=["'][^"']*\/encarte\//i.test(html) ||
    /\/encarte\/[a-z0-9-]+/i.test(html)
  );
}

/** DOM-derived selectors when model JSON dies or invents classes. */
export function listingSelectorsFromHtml(html: string): {
  sectionSelectors: string[];
  itemSelectors: string[];
} {
  if (/jet-listing-grid__items/i.test(html)) {
    return {
      sectionSelectors: ["div.jet-listing-grid__items", ".jet-listing-grid"],
      itemSelectors: [".jet-listing-grid__item"],
    };
  }
  if (/jet-listing-grid__item/i.test(html)) {
    return {
      sectionSelectors: [".jet-listing-grid"],
      itemSelectors: [".jet-listing-grid__item"],
    };
  }
  if (/e-gallery-item/i.test(html) && /\/encarte\//i.test(html)) {
    return {
      sectionSelectors: [".elementor-gallery__container", ".e-gallery"],
      itemSelectors: [".e-gallery-item"],
    };
  }
  if (/(?:href|data-url)=["'][^"']*\/encarte\//i.test(html)) {
    return {
      sectionSelectors: [],
      itemSelectors: ['[data-url*="/encarte/"]', 'a[href*="/encarte/"]'],
    };
  }
  if (/\/folhet[oós]?\//i.test(html)) {
    return {
      sectionSelectors: [],
      itemSelectors: ['a[href*="/folheto/"]', 'a[href*="/folhetos/"]'],
    };
  }
  return { sectionSelectors: [], itemSelectors: [] };
}

function listingNavInHtml(html: string): boolean {
  return htmlLooksLikeFlyerListing(html);
}

/** Drop invented selectors; recover listing when model/parse fails. */
export function sanitizeSectionLocateAgainstHtml(
  sec: SectionLocate,
  html: string,
): SectionLocate {
  const sectionSelectors = sec.sectionSelectors.filter((s) =>
    selectorGroundedInHtml(s, html),
  );
  const itemSelectors = sec.itemSelectors.filter((s) =>
    selectorGroundedInHtml(s, html),
  );
  const downloadSelectors = sec.downloadSelectors.filter((s) =>
    selectorGroundedInHtml(s, html),
  );
  const clickTargetSelectors = sec.clickTargetSelectors.filter((s) =>
    selectorGroundedInHtml(s, html),
  );
  const listing = listingNavInHtml(html);
  const heur = listing ? listingSelectorsFromHtml(html) : null;

  if (!sectionSelectors.length && !itemSelectors.length) {
    if (listing) {
      return {
        ...sec,
        status: "ready",
        why:
          sec.why ||
          "Listagem de encartes — clica um card e Detectar de novo.",
        label: sec.label || "Encartes",
        sectionSelectors: heur?.sectionSelectors ?? [],
        itemSelectors: heur?.itemSelectors ?? [],
        downloadSelectors: [],
        clickTargetSelectors: heur?.itemSelectors ?? [],
        openKind: "need_click",
      };
    }
    if (sec.status === "ready") {
      return {
        ...sec,
        status: "not_found",
        why: sec.why || "Selectors inventados — nenhum bate no HTML.",
        sectionSelectors: [],
        itemSelectors: [],
        downloadSelectors: [],
        clickTargetSelectors: [],
        openKind: "need_click",
      };
    }
  }

  // Model said not_found but page clearly has flyer listing.
  if (sec.status === "not_found" && listing) {
    return {
      ...sec,
      status: "ready",
      why:
        sec.why ||
        "Listagem de encartes — clica um card e Detectar de novo.",
      label: sec.label || "Encartes",
      sectionSelectors: sectionSelectors.length
        ? sectionSelectors
        : (heur?.sectionSelectors ?? []),
      itemSelectors: itemSelectors.length
        ? itemSelectors
        : (heur?.itemSelectors ?? []),
      downloadSelectors,
      clickTargetSelectors: clickTargetSelectors.length
        ? clickTargetSelectors
        : (heur?.itemSelectors ?? []),
      openKind: "need_click",
    };
  }

  return {
    ...sec,
    sectionSelectors,
    itemSelectors,
    downloadSelectors,
    clickTargetSelectors,
  };
}

function parseOpenKind(raw: unknown): SectionOpenKind {
  if (raw === "download" || raw === "viewer" || raw === "need_click") {
    return raw;
  }
  return "need_click";
}

export function parseSectionLocate(raw: string): SectionLocate {
  let p: Record<string, unknown> = {};
  let parseFailed = false;
  try {
    const parsed = parseJsonObject(raw);
    if (parsed && typeof parsed === "object") {
      p = parsed as Record<string, unknown>;
    } else {
      parseFailed = true;
    }
  } catch {
    parseFailed = true;
    p = extractSectionLocateFields(raw);
  }
  const status = p.status === "ready" ? "ready" : "not_found";
  const sectionSelectors = asSels(p.sectionSelectors);
  const itemSelectors = asSels(p.itemSelectors);
  const downloadSelectors = asSels(p.downloadSelectors);
  const clickTargetSelectors = asSels(p.clickTargetSelectors);
  const label =
    typeof p.label === "string" ? p.label.trim().slice(0, 120) : "";
  const why = typeof p.why === "string" ? p.why.trim().slice(0, 280) : "";
  const htmlSnippet =
    typeof p.htmlSnippet === "string" ? p.htmlSnippet.trim().slice(0, 800) : "";
  const openKind = parseOpenKind(p.openKind);
  if (status === "ready" && !sectionSelectors.length && !itemSelectors.length) {
    return {
      status: "not_found",
      label,
      why: why || "MiMo não devolveu selectors.",
      sectionSelectors: [],
      itemSelectors: [],
      htmlSnippet,
      openKind: "need_click",
      downloadSelectors: [],
      clickTargetSelectors: [],
    };
  }
  if (parseFailed && !sectionSelectors.length && !itemSelectors.length) {
    return {
      status: "not_found",
      label,
      why: why || "JSON da IA inválido (htmlSnippet/aspas).",
      sectionSelectors: [],
      itemSelectors: [],
      htmlSnippet: "",
      openKind: "need_click",
      downloadSelectors: [],
      clickTargetSelectors: [],
    };
  }
  return {
    status,
    label: label || "Seção de encartes",
    why: why || label,
    sectionSelectors,
    itemSelectors,
    htmlSnippet,
    openKind,
    downloadSelectors,
    clickTargetSelectors,
  };
}

/** Last-resort field scrape when JSON.parse still fails after dropping htmlSnippet. */
function extractSectionLocateFields(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const status = raw.match(/"status"\s*:\s*"(ready|not_found)"/);
  if (status) out.status = status[1];
  const openKind = raw.match(
    /"openKind"\s*:\s*"(download|viewer|need_click)"/,
  );
  if (openKind) out.openKind = openKind[1];
  const label = raw.match(/"label"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (label) out.label = label[1].replace(/\\"/g, '"');
  const why = raw.match(/"why"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (why) out.why = why[1].replace(/\\"/g, '"');
  for (const key of [
    "sectionSelectors",
    "itemSelectors",
    "downloadSelectors",
    "clickTargetSelectors",
  ] as const) {
    const arr = raw.match(
      new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`),
    );
    if (!arr) continue;
    const sels = [...arr[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) =>
      m[1].replace(/\\"/g, '"'),
    );
    if (sels.length) out[key] = sels;
  }
  return out;
}

export function sectionLocateUserPrompt(args: {
  url: string;
  html: string;
  hint?: string;
}): string {
  const hint = args.hint?.trim();
  return `Page URL: ${args.url}
${hint ? `Operator hint: ${hint}\n` : ""}
If a flyer modal/flipbook/lightbox is OPEN, openKind=viewer and point sectionSelectors at that dialog.
Else find the listing of flyers/encartes (not a product SKU grid).
openKind from THIS html only. Page jpeg/png/pdf already in DOM (fancybox href, slick slides, download attr, CSS background-image) → download or viewer, never need_click.
Cover cards / gallery thumbs that only link to /encarte/ or /folheto/ (no inline page assets) → openKind=need_click. Copy real Elementor/gallery selectors — never invent section.offers or .offers__item.
htmlSnippet: max 200 chars, plain text only — no nested quotes, no data-nav JSON.

Full page HTML:
${args.html}`;
}

export async function mimoLocateSection(args: {
  url: string;
  html: string;
  hint?: string;
  signal: AbortSignal;
}): Promise<SectionLocate> {
  if (!flyerConfig.mimoApiKey) throw new MimoError("MIMO_API_KEY missing");
  const json = await mimoChat({
    system: SECTION_LOCATE_SYSTEM,
    user: sectionLocateUserPrompt(args),
    signal: args.signal,
  });
  const raw = json.choices?.[0]?.message?.content ?? "";
  const parsed = parseSectionLocate(raw);
  const cleaned = sanitizeSectionLocateAgainstHtml(parsed, args.html);
  if (
    parsed.status === "not_found" &&
    cleaned.status === "ready" &&
    htmlLooksLikeFlyerListing(args.html)
  ) {
    // Recovered from bad JSON / false not_found via DOM listing cues.
  }
  return cleaned;
}

export function openKindHint(kind: SectionOpenKind): string {
  if (kind === "download") return "Tem link/arquivo pra baixar nesta página.";
  if (kind === "viewer") {
    return "Tem visualizador de imagem/PDF nesta página.";
  }
  return "Nada pra baixar aqui. Clica UM encarte no preview, depois Detectar de novo.";
}
