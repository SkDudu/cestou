import { flyerConfig } from "../../core/flyer-config.js";
import { parseJsonObject } from "../json-parse.js";
import { mimoChat } from "./client.js";
import { MimoError } from "./errors.js";
import { parseFlyerSource } from "../../runner/flyer-discover.js";
import type { FlyerSource } from "../../types/flows.js";

export type LocateStatus = "ready" | "need_click" | "not_found";

export const LOCATE_SYSTEM = `You analyze a supermarket page from HTML/CSS structure + network docs (no screenshot).
Decide how flyers/encartes are reached. Copy CSS selectors ONLY from the numbered structure nodes or gallery dump. Never invent selectors.
Ignore product SKUs, banners, category tiles, app CTAs.

status:
- ready — flyer files/viewer already on THIS page. Fill candidates + flyerSource.
- need_click — this page is a LISTING / group of cards/tabs that must be opened to reach flyer pages. Fill candidates for those groups. itemSelectors GENERIC for all cards. humanHint in Portuguese: what to click.
- not_found — no flyer UI. humanHint: scroll or go to encartes.

candidates: 1–8 regions the operator should see. Each: index (from structure), selectors (copied), label, why (short PT).
flyerSource when ready or need_click:
- kind: tabs | carousel | pdf-links | api-json | iframe | image-grid
- downloadStrategy: collect-images | open-each-item | click-download | direct-url | harvest-after-activate
- itemSelectors / downloadSelectors: copy from dump, GENERIC (no Jornal 1, no nth-child)
- urlFrom: network | href | img.src | click-then-network
Network JSON with pageUrls/PDF → prefer api-json + collect-images + urlFrom=network.
Cards/tabs that open a viewer → need_click + open-each-item.
Proven .pdf href or download that opens a new file tab → click-download.

Return JSON only.`;

export type OperatorLocateHint = {
  hint?: string;
  selectedStep?: {
    kind: string;
    selectors?: string[];
    description?: string;
    value?: string;
  };
};

export type LocateCandidate = {
  index?: number;
  selectors: string[];
  label: string;
  why?: string;
  box?: { x: number; y: number; width: number; height: number };
};

export function locateUserPrompt(args: {
  url: string;
  network: string;
  structure: string;
  gallery?: string;
  operator?: OperatorLocateHint;
}) {
  const opHint = args.operator?.hint?.trim();
  const step = args.operator?.selectedStep;
  const opBlock =
    opHint || step
      ? `
OPERATOR HINT:
${opHint || "(none)"}
SELECTED STEP:
${
  step
    ? `kind=${step.kind} selectors=${JSON.stringify(step.selectors ?? [])} description=${JSON.stringify(step.description ?? "")}`
    : "(none)"
}
`
      : "";

  return `Page URL: ${args.url}
${opBlock}
Network flyer docs (JSON):
${args.network || "(none)"}

Gallery selector menu (copy from here):
${args.gallery ?? "(none)"}

Page structure HTML+CSS (numbered — pick index/selectors from these):
${args.structure}

Schema:
{
  "status": "ready|need_click|not_found",
  "humanHint": "Portuguese, for the operator",
  "candidates": [{"index":number,"selectors":["..."],"label":"string","why":"string"}],
  "flyerSource": {
    "kind": "tabs|carousel|pdf-links|api-json|iframe|image-grid",
    "downloadStrategy": "direct-url|collect-images|open-each-item|click-download|harvest-after-activate",
    "itemSelectors": ["..."],
    "downloadSelectors": ["..."],
    "urlFrom": "network|href|img.src|click-then-network",
    "evidence": "string"
  }
}

Listing of cards/tabs that still need a click → status=need_click, not ready.
Skip archive/anteriores.`;
}

export type LocateParse = {
  status: LocateStatus;
  humanHint: string;
  selectors: string[];
  label: string;
  index?: number;
  flyerSource?: FlyerSource;
  candidates: LocateCandidate[];
};

function parseStatus(raw: unknown): LocateStatus {
  if (raw === "ready" || raw === "need_click" || raw === "not_found") {
    return raw;
  }
  return "not_found";
}

function asSels(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v.filter((x): x is string => typeof x === "string" && x.trim().length > 0),
    ),
  ];
}

export function parseLocateFlyers(raw: string): LocateParse {
  const p = parseJsonObject(raw) as {
    status?: unknown;
    humanHint?: unknown;
    hint?: unknown;
    selectors?: unknown;
    selector?: unknown;
    label?: unknown;
    index?: unknown;
    flyerSource?: unknown;
    candidates?: unknown;
  };
  const selectors: string[] = [];
  if (typeof p.selector === "string" && p.selector.trim()) {
    selectors.push(p.selector.trim());
  }
  selectors.push(...asSels(p.selectors));
  const hint =
    (typeof p.humanHint === "string" && p.humanHint.trim()) ||
    (typeof p.hint === "string" && p.hint.trim()) ||
    "";
  const candidates: LocateCandidate[] = [];
  if (Array.isArray(p.candidates)) {
    for (const c of p.candidates) {
      if (!c || typeof c !== "object") continue;
      const rec = c as {
        index?: unknown;
        selectors?: unknown;
        selector?: unknown;
        label?: unknown;
        why?: unknown;
      };
      const sels = [
        ...(typeof rec.selector === "string" ? [rec.selector] : []),
        ...asSels(rec.selectors),
      ];
      if (!sels.length && typeof rec.index !== "number") continue;
      candidates.push({
        index: typeof rec.index === "number" ? rec.index : undefined,
        selectors: sels,
        label:
          typeof rec.label === "string" ? rec.label.slice(0, 80) : "candidato",
        why: typeof rec.why === "string" ? rec.why.slice(0, 160) : undefined,
      });
    }
  }
  if (!selectors.length && candidates[0]?.selectors.length) {
    selectors.push(...candidates[0].selectors);
  }
  return {
    status: parseStatus(p.status),
    humanHint: hint.slice(0, 280),
    selectors: [...new Set(selectors)],
    label: typeof p.label === "string" ? p.label.slice(0, 80) : "",
    index: typeof p.index === "number" ? p.index : undefined,
    flyerSource: parseFlyerSource(p.flyerSource),
    candidates,
  };
}

export async function mimoLocateFlyers(args: {
  url: string;
  network: string;
  structure: string;
  gallery?: string;
  operator?: OperatorLocateHint;
  signal: AbortSignal;
}): Promise<LocateParse> {
  if (!flyerConfig.mimoApiKey) throw new MimoError("MIMO_API_KEY missing");
  const json = await mimoChat({
    system: LOCATE_SYSTEM,
    user: locateUserPrompt(args),
    signal: args.signal,
  });
  return parseLocateFlyers(json.choices?.[0]?.message?.content ?? "");
}
