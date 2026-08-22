import { flyerConfig } from "../../core/flyer-config.js";
import { parseJsonObject } from "../json-parse.js";
import { mimoChat } from "./client.js";
import { MimoError } from "./errors.js";
import { parseFlyerSource } from "../../runner/flyer-discover.js";
import type { FlyerSource } from "../../types/flows.js";

export const LOCATE_SYSTEM = `You locate supermarket flyer/encarte/catalog galleries in a webpage.
Pick CSS selectors ONLY from the numbered candidate list.
Never invent selectors. Never use visible text as the locator.
Prefer a container that still includes ALL tabButtons + downloadButtons from the page-wide gallery index — not a tiny inner node that drops Baixar.
Ignore product SKUs, banners, and category tiles.

Also classify HOW flyers are stored on this page (flyerSource):
- kind: tabs | carousel | react-viewer | pdf-links | api-json | iframe | image-grid
- downloadStrategy:
  - direct-url — classic <a href> to PDF /Flyer/?id= / flipbook
  - collect-images — page images in the gallery (img src / CDN)
  - open-each-item — must click each tab/card then collect images or URLs (USE THIS for Assaí-style "Jornal de Ofertas 1/2/3" tabs)
  - click-download — click Baixar/Download; may open PDF file OR image viewer/lightbox/popup — runtime harvests all outcomes
  - harvest-after-activate — viewer loads via network after open
- itemSelectors: GENERIC for ALL tabs only — [role=tab], [data-oferta-index], button:has-text("Jornal de Ofertas"). NEVER "… 1" / data-oferta-index="31"
- downloadSelectors: when Baixar/Download exists — copy from gallery.downloadButtons. Prefer click-download ONLY if href ends .pdf or a[download]; else use open-each-item/harvest and keep selectors as hints.
- urlFrom: href | img.src | data-attr | network | click-then-network
- networkHints.urlIncludes: substrings seen in real network URLs (optional)
- evidence: short note of what you saw

Return JSON only.`;

export function locateUserPrompt(args: {
  url: string;
  network: string[];
  candidates: string;
  gallery?: string;
}) {
  return `Page URL: ${args.url}

Network document/image URLs seen:
${args.network.slice(0, 30).join("\n") || "(none)"}

Page-wide gallery index (tabs, downloads, pdf links, iframes, headings — copy selectors):
${args.gallery ?? "(none)"}

DOM candidates (pick from these):
${args.candidates}

Schema:
{
  "index": number,
  "selectors": ["..."],
  "label": string,
  "flyerSource": {
    "kind": "tabs|carousel|react-viewer|pdf-links|api-json|iframe|image-grid",
    "downloadStrategy": "direct-url|collect-images|open-each-item|click-download|harvest-after-activate",
    "itemSelectors": ["..."],
    "downloadSelectors": ["..."],
    "urlFrom": "href|img.src|data-attr|network|click-then-network",
    "networkHints": { "urlIncludes": ["..."], "jsonKeys": ["..."] },
    "evidence": string
  }
}

index = 1-based candidate number.
selectors = copy from that candidate, best first.
If gallery has downloadButtons with .pdf href or a[download] → prefer click-download + downloadSelectors.
If Baixar only (viewer/lightbox likely) → open-each-item or harvest-after-activate; still copy downloadSelectors.
flyerSource values must match the page — do not invent URLs.`;
}

export type LocateParse = {
  selectors: string[];
  label: string;
  index?: number;
  flyerSource?: FlyerSource;
};

export function parseLocateFlyers(raw: string): LocateParse {
  const p = parseJsonObject(raw) as {
    selectors?: unknown;
    selector?: unknown;
    label?: unknown;
    index?: unknown;
    flyerSource?: unknown;
  };
  const selectors: string[] = [];
  if (typeof p.selector === "string" && p.selector.trim()) {
    selectors.push(p.selector.trim());
  }
  if (Array.isArray(p.selectors)) {
    for (const s of p.selectors) {
      if (typeof s === "string" && s.trim()) selectors.push(s.trim());
    }
  }
  return {
    selectors: [...new Set(selectors)],
    label: typeof p.label === "string" ? p.label.slice(0, 80) : "",
    index: typeof p.index === "number" ? p.index : undefined,
    flyerSource: parseFlyerSource(p.flyerSource),
  };
}

export async function mimoLocateFlyers(args: {
  imageUrl: string;
  url: string;
  network: string[];
  candidates: string;
  gallery?: string;
  signal: AbortSignal;
}): Promise<LocateParse> {
  if (!flyerConfig.mimoApiKey) throw new MimoError("MIMO_API_KEY missing");
  const json = await mimoChat({
    imageUrl: args.imageUrl,
    system: LOCATE_SYSTEM,
    user: locateUserPrompt(args),
    signal: args.signal,
  });
  return parseLocateFlyers(json.choices?.[0]?.message?.content ?? "");
}
