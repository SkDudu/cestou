import type { BrandDictionary } from "./dictionary.js";
import { foldBrand } from "./normalize.js";

export type BrandSource =
  | "scraper"
  | "dictionary"
  | "heuristic"
  | "manual"
  | "ai"
  | "none";

export type BrandExtractionResult = {
  brand?: string;
  source: BrandSource;
  confidence: number;
  matchedText?: string;
  reasons: string[];
};

const AUTO_ACCEPT = Number(process.env.BRAND_AUTO_ACCEPT_THRESHOLD ?? 0.8);

const STOPWORDS = new Set(
  foldBrand(
    "tipo integral tradicional original especial premium extra natural zero sem com para de da do das dos em no na um uma e ou kg g mg l ml un unid unidade pack cx pct pacote garrafa lata caixa",
  ).split(" "),
);

const CATEGORY_WORDS = new Set(
  foldBrand(
    "arroz feijao feijão leite cafe café acucar açucar oleo óleo farinha massa macarrao macarrão pao pão bolo biscoito cookie sabao sabão detergente amaciante shampoo condicionador fralda papel toalha guardanapo vela pilha copo vinagre molho catchup ketchup mostarda maionese agua água refrigerante cerveja vinho suco iogurte queijo manteiga margarina",
  ).split(" "),
);

function tokens(foldedName: string): string[] {
  return foldedName.split(" ").filter(Boolean);
}

function isNoiseToken(t: string): boolean {
  if (!t) return true;
  if (STOPWORDS.has(t)) return true;
  if (CATEGORY_WORDS.has(t)) return true;
  if (/^\d+([.,]\d+)?$/.test(t)) return true;
  if (/^\d+(kg|g|mg|l|ml|un|cx)$/.test(t)) return true;
  return false;
}

/** Longest dictionary phrase match inside folded name. */
function matchDictionary(
  foldedName: string,
  dict: BrandDictionary,
): BrandExtractionResult | null {
  const toks = tokens(foldedName);
  for (const entry of dict.sortedForMatch()) {
    for (const key of entry.keys) {
      const keyToks = key.split(" ").filter(Boolean);
      if (keyToks.length === 0) continue;
      for (let i = 0; i <= toks.length - keyToks.length; i++) {
        let ok = true;
        for (let j = 0; j < keyToks.length; j++) {
          if (toks[i + j] !== keyToks[j]) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const multi = keyToks.length > 1;
          return {
            brand: entry.canonical,
            source: "dictionary",
            confidence: multi ? 0.98 : 0.95,
            matchedText: key,
            reasons: [
              multi
                ? "multi-word dictionary match"
                : "dictionary word match",
            ],
          };
        }
      }
    }
  }
  return null;
}

/**
 * Weak heuristic: consecutive Capitalized-looking tokens in original name
 * that aren't stopwords — only if 2+ tokens (strong) or 1 token len>=4.
 */
function matchHeuristic(name: string): BrandExtractionResult | null {
  const parts = name.replace(/\s+/g, " ").trim().split(" ");
  const candidates: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    if (buf.length) {
      candidates.push(buf.join(" "));
      buf = [];
    }
  };

  for (const p of parts) {
    const folded = foldBrand(p);
    const looksBrand =
      /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(p) &&
      !isNoiseToken(folded) &&
      !/^\d/.test(p);
    if (looksBrand) buf.push(p);
    else flush();
  }
  flush();

  // prefer multi-word candidate not at start if first token is category
  const ranked = [...candidates].sort(
    (a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length,
  );

  for (const c of ranked) {
    const f = foldBrand(c);
    const n = f.split(" ").length;
    if (n >= 2) {
      return {
        brand: c,
        source: "heuristic",
        confidence: 0.8,
        matchedText: c,
        reasons: ["capitalized multi-token heuristic"],
      };
    }
    if (n === 1 && f.length >= 4 && !CATEGORY_WORDS.has(f)) {
      return {
        brand: c,
        source: "heuristic",
        confidence: 0.65,
        matchedText: c,
        reasons: ["capitalized single-token heuristic"],
      };
    }
  }
  return null;
}

export function extractBrand(
  name: string,
  existingBrand: string | undefined,
  dict: BrandDictionary,
): BrandExtractionResult {
  if (existingBrand?.trim()) {
    return {
      brand: existingBrand.trim(),
      source: "scraper",
      confidence: 1,
      reasons: ["brand provided by supermarket"],
    };
  }

  const folded = foldBrand(name);
  const fromDict = matchDictionary(folded, dict);
  if (fromDict && fromDict.confidence >= AUTO_ACCEPT) return fromDict;

  const fromHeuristic = matchHeuristic(name);
  if (fromHeuristic && fromHeuristic.confidence >= AUTO_ACCEPT) {
    return fromHeuristic;
  }

  // below threshold → don't fill
  if (fromDict) {
    return {
      source: "none",
      confidence: fromDict.confidence,
      matchedText: fromDict.matchedText,
      reasons: [`dictionary below threshold (${fromDict.confidence})`],
    };
  }
  if (fromHeuristic) {
    return {
      source: "none",
      confidence: fromHeuristic.confidence,
      matchedText: fromHeuristic.matchedText,
      reasons: [`heuristic below threshold (${fromHeuristic.confidence})`],
    };
  }

  return {
    source: "none",
    confidence: 0,
    reasons: ["no brand found"],
  };
}

export const BRAND_ENRICHMENT_VERSION = "brand-enrichment-v1";
