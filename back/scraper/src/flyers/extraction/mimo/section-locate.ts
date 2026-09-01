import { flyerConfig } from "../../core/flyer-config.js";
import { parseJsonObject } from "../json-parse.js";
import { mimoChat } from "./client.js";
import { MimoError } from "./errors.js";

export type SectionOpenKind = "download" | "viewer" | "need_click";

export const SECTION_LOCATE_SYSTEM = `You find the supermarket FLYER / ENCARTE / OFFERS section in page HTML.
Ignore header, footer, nav, app CTAs, product SKU grids, cookie dialogs.
Copy CSS selectors FROM the HTML. Never invent class names.
Return JSON only. No flyerSource, no download strategy.

sectionSelectors = the WHOLE listing container (one region).
itemSelectors = CSS for EACH repeating unit (card, tab, jornal). Not a second region.

PAGE ASSET = URL of a full flyer PAGE (not a tiny listing cover):
href/src/data-src/data-lazy/srcset, a[data-fancybox], slick/swiper slide,
OR CSS background-image:url(...), pointing to .pdf / .jpg / .jpeg / .png / .webp
(CDN ok: cloudfront, s3, etc). Hidden/cloned slick slides still count — they are in the HTML.

openKind — pick ONE from THIS html. First match wins:
1) OPEN overlay (.modal/.flipbook-modal/.fancybox-container, role=dialog with pages) → viewer. Point sectionSelectors at that overlay.
2) download — real file control for a flyer file: a[href*=.pdf], [download], "Baixar PDF" / "Baixar página" / "Download" even if the file is jpeg/png. Fill downloadSelectors.
3) viewer — PAGE ASSETS already in this HTML (carousel of pages, fancybox gallery of pages, flipbook CSS bg, iframe PDF). Tabs that switch which jornal is shown in the SAME carousel are still viewer; itemSelectors = those tab/buttons.
4) need_click — ONLY when PAGE ASSETS are absent: listing of covers/cards, one thumb per jornal, pages appear after click. Fill clickTargetSelectors.

NEVER need_click if PAGE ASSETS exist in this HTML.
Listing thumbs alone (small cover, no page-size images, no download control) = need_click.

{
  "status": "ready" | "not_found",
  "label": "short PT title of the section",
  "why": "short PT",
  "sectionSelectors": ["section.offers"],
  "itemSelectors": [".offers__item"],
  "openKind": "download" | "viewer" | "need_click",
  "downloadSelectors": ["a[href*='.pdf']", "a[download]"],
  "clickTargetSelectors": [".offers__item a"],
  "htmlSnippet": "small excerpt (max 800 chars)"
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

function parseOpenKind(raw: unknown): SectionOpenKind {
  if (raw === "download" || raw === "viewer" || raw === "need_click") {
    return raw;
  }
  return "need_click";
}

export function parseSectionLocate(raw: string): SectionLocate {
  let p: Record<string, unknown> = {};
  try {
    const parsed = parseJsonObject(raw);
    if (parsed && typeof parsed === "object") {
      p = parsed as Record<string, unknown>;
    }
  } catch {
    /* empty */
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
  return parseSectionLocate(json.choices?.[0]?.message?.content ?? "");
}

export function openKindHint(kind: SectionOpenKind): string {
  if (kind === "download") return "Tem link/arquivo pra baixar nesta página.";
  if (kind === "viewer") {
    return "Tem visualizador de imagem/PDF nesta página.";
  }
  return "Nada pra baixar aqui. Clica UM encarte no preview, depois Detectar de novo.";
}
