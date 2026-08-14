import { flyerConfig } from "../../core/flyer-config.js";
import { parseJsonObject } from "../json-parse.js";
import { mimoChat } from "./client.js";
import { MimoError } from "./errors.js";

export const LOCATE_SYSTEM = `You locate supermarket flyer/encarte/catalog galleries in a webpage.
Pick CSS selectors ONLY from the numbered candidate list.
Never invent selectors. Never use visible text as the locator.
Prefer the smallest container that still includes the flyer links (section, article, ul).
Ignore product SKUs, banners, and category tiles.
Return JSON only.`;

export function locateUserPrompt(args: {
  url: string;
  network: string[];
  candidates: string;
}) {
  return `Page URL: ${args.url}

Network flyer document URLs:
${args.network.slice(0, 20).join("\n") || "(none)"}

DOM candidates (pick from these):
${args.candidates}

Schema:
{"index":number,"selectors":["..."],"label":string}

index = 1-based candidate number.
selectors = copy from that candidate, best first.`;
}

export type LocateParse = {
  selectors: string[];
  label: string;
  index?: number;
};

export function parseLocateFlyers(raw: string): LocateParse {
  const p = parseJsonObject(raw) as {
    selectors?: unknown;
    selector?: unknown;
    label?: unknown;
    index?: unknown;
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
  };
}

export async function mimoLocateFlyers(args: {
  imageUrl: string;
  url: string;
  network: string[];
  candidates: string;
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
