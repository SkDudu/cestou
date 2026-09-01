export const ELIGIBILITY_TYPES = [
  "ALL_CUSTOMERS",
  "LOYALTY_PROGRAM",
  "STORE_CARD",
  "CPF_REQUIRED",
  "APP_ONLY",
  "COUPON_REQUIRED",
  "PAYMENT_METHOD",
  "QUANTITY_REQUIRED",
  "UNKNOWN",
] as const;

export type EligibilityType = (typeof ELIGIBILITY_TYPES)[number];

export const ELIGIBILITY_CONFIDENCE = {
  high: 0.9,
  medium: 0.7,
  rules: 0.92,
} as const;

export type EligibilityBand = "HIGH" | "MEDIUM" | "LOW";

export function eligibilityBand(score: number): EligibilityBand {
  if (score >= ELIGIBILITY_CONFIDENCE.high) return "HIGH";
  if (score >= ELIGIBILITY_CONFIDENCE.medium) return "MEDIUM";
  return "LOW";
}

export function eligibilityStatusFor(score: number):
  | "ai_validated"
  | "review_required" {
  return eligibilityBand(score) === "HIGH"
    ? "ai_validated"
    : "review_required";
}

export type OfferCondition = {
  type: EligibilityType;
  name?: string;
  description?: string;
  requirement?: string;
};

export type EligibilityEvidence = {
  text: string;
  source?: string;
  page?: number;
};

export type EligibilityResult = {
  eligibility: EligibilityType;
  conditions: OfferCondition[];
  eligibilityConfidence: number;
  eligibilityEvidence?: EligibilityEvidence;
  eligibilityStatus: "ai_validated" | "review_required";
};

type PhraseHit = {
  type: Exclude<EligibilityType, "ALL_CUSTOMERS">;
  text: string;
};

// ponytail: phrases not tokens — "cartão"/"leve"/"app" alone = noise
const PHRASES: Array<{
  type: Exclude<EligibilityType, "ALL_CUSTOMERS" | "UNKNOWN">;
  re: RegExp;
}> = [
  {
    type: "LOYALTY_PROGRAM",
    re: /exclusiv[oa]\s+(para\s+)?(os\s+)?(clientes?\s+)?(do\s+)?clube/i,
  },
  { type: "LOYALTY_PROGRAM", re: /cliente\s+clube/i },
  { type: "LOYALTY_PROGRAM", re: /pre[cç]o\s+(do\s+|exclusivo\s+)?clube/i },
  { type: "LOYALTY_PROGRAM", re: /programa\s+de\s+fidelidade/i },
  { type: "LOYALTY_PROGRAM", re: /cliente\s+cadastrad/i },
  { type: "LOYALTY_PROGRAM", re: /cliente\s+mais\b/i },
  { type: "LOYALTY_PROGRAM", re: /\bclube\s+[a-záàâãéêíóôõú]{3,}/i },
  {
    type: "STORE_CARD",
    re: /cart[aã]o\s+(da\s+loja|do\s+supermercado|atacad\w*)/i,
  },
  { type: "STORE_CARD", re: /no\s+cart[aã]o\s+(da|do)\b/i },
  { type: "CPF_REQUIRED", re: /(pre[cç]o\s+)?(com|mediante|exclusiv[oa])\s+cpf/i },
  { type: "CPF_REQUIRED", re: /\bcpf\s+(na\s+nota|obrigat)/i },
  {
    type: "APP_ONLY",
    re: /exclusiv[oa]\s+(no\s+)?(app|aplicativo)/i,
  },
  {
    type: "APP_ONLY",
    re: /(somente|s[oó]|apenas)\s+no\s+(app|aplicativo)/i,
  },
  { type: "COUPON_REQUIRED", re: /(com|use\s+o|usando)\s+cupom/i },
  { type: "COUPON_REQUIRED", re: /\bcupom\s+[a-z0-9]{3,}/i },
  { type: "PAYMENT_METHOD", re: /pagando\s+com\b/i },
  { type: "PAYMENT_METHOD", re: /\bno\s+pix\b/i },
  { type: "QUANTITY_REQUIRED", re: /leve\s+\d+/i },
  { type: "QUANTITY_REQUIRED", re: /a\s+partir\s+de\s+\d+/i },
  { type: "QUANTITY_REQUIRED", re: /na\s+compra\s+de\b/i },
];

const UNKNOWN_HINT = /exclusiv[oa]\b/i;
const INSTITUTIONAL =
  /aceitamos\s+cart|bandeiras|visa|mastercard|hipercard/i;

function clipMatch(haystack: string, re: RegExp): string | undefined {
  const m = haystack.match(re);
  return m?.[0]?.trim();
}

export function detectEligibilityPhrases(haystack: string): PhraseHit[] {
  const text = haystack.replace(/\s+/g, " ").trim();
  if (!text) return [];
  if (INSTITUTIONAL.test(text) && /cart[aã]o/i.test(text) && !/cart[aã]o\s+(da\s+loja|do\s+supermercado|atacad)/i.test(text)) {
    // skip store-card false positive; other types still scan
  }
  const hits: PhraseHit[] = [];
  const seen = new Set<string>();
  for (const { type, re } of PHRASES) {
    if (type === "STORE_CARD" && INSTITUTIONAL.test(text)) continue;
    const snippet = clipMatch(text, re);
    if (!snippet) continue;
    const key = `${type}:${snippet.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ type, text: snippet });
  }
  if (!hits.length && UNKNOWN_HINT.test(text)) {
    const snippet = clipMatch(text, UNKNOWN_HINT);
    if (snippet) hits.push({ type: "UNKNOWN", text: snippet });
  }
  return hits;
}

const TYPE_SET = new Set<string>(ELIGIBILITY_TYPES);

function asType(value: unknown): EligibilityType | undefined {
  return typeof value === "string" && TYPE_SET.has(value)
    ? (value as EligibilityType)
    : undefined;
}

function asConditions(raw: unknown): OfferCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: OfferCondition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const type = asType(rec.type);
    if (!type || type === "ALL_CUSTOMERS") continue;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;
    out.push({
      type,
      name: str(rec.name),
      description: str(rec.description),
      requirement: str(rec.requirement),
    });
  }
  return out;
}

function asEvidence(
  raw: unknown,
  page?: number,
): EligibilityEvidence | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const text =
    typeof rec.text === "string" && rec.text.trim()
      ? rec.text.trim().slice(0, 400)
      : undefined;
  if (!text) return undefined;
  const p =
    typeof rec.page === "number" && Number.isFinite(rec.page)
      ? rec.page
      : page;
  const source =
    typeof rec.source === "string" && rec.source.trim()
      ? rec.source.trim().slice(0, 40)
      : "flyer";
  return { text, source, page: p };
}

const RANK: EligibilityType[] = [
  "UNKNOWN",
  "QUANTITY_REQUIRED",
  "COUPON_REQUIRED",
  "APP_ONLY",
  "CPF_REQUIRED",
  "STORE_CARD",
  "PAYMENT_METHOD",
  "LOYALTY_PROGRAM",
  "ALL_CUSTOMERS",
];

export function deriveEligibility(
  conditions: OfferCondition[],
): EligibilityType {
  const types = conditions.map((c) => c.type);
  if (!types.length) return "ALL_CUSTOMERS";
  for (const t of RANK) {
    if (types.includes(t)) return t;
  }
  return types[0]!;
}

function uniqueConditions(list: OfferCondition[]): OfferCondition[] {
  const seen = new Set<string>();
  const out: OfferCondition[] = [];
  for (const c of list) {
    const key = `${c.type}:${(c.name ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function resolveEligibility(args: {
  haystack: string;
  pageNumber?: number;
  ai?: {
    eligibility?: unknown;
    conditions?: unknown;
    confidence?: unknown;
    evidence?: unknown;
  };
}): EligibilityResult {
  const hits = detectEligibilityPhrases(args.haystack);
  const ruleConditions: OfferCondition[] = hits.map((h) => ({
    type: h.type,
    description: h.text,
  }));
  const ruleEvidence = hits[0]
    ? {
        text: hits[0].text,
        source: "rules" as const,
        page: args.pageNumber,
      }
    : undefined;

  const aiConf =
    typeof args.ai?.confidence === "number" &&
    Number.isFinite(args.ai.confidence)
      ? Math.min(1, Math.max(0, args.ai.confidence))
      : undefined;
  const aiEvidence = asEvidence(args.ai?.evidence, args.pageNumber);
  let aiConditions = asConditions(args.ai?.conditions);
  let aiType = asType(args.ai?.eligibility);

  // IA sem evidência não inventa condição
  if (aiType && aiType !== "ALL_CUSTOMERS" && !aiEvidence) {
    if (!aiConditions.length) {
      aiType = "UNKNOWN";
    } else {
      aiType = undefined;
      aiConditions = [];
    }
  }
  if (!aiEvidence) {
    aiConditions = [];
  }

  let conditions: OfferCondition[];
  let evidence: EligibilityEvidence | undefined;
  let confidence: number;

  if (ruleConditions.length) {
    const extra = aiEvidence
      ? aiConditions.filter(
          (c) => !ruleConditions.some((r) => r.type === c.type),
        )
      : [];
    conditions = uniqueConditions([...ruleConditions, ...extra]);
    evidence = ruleEvidence;
    const aiAgrees =
      aiType &&
      aiType !== "ALL_CUSTOMERS" &&
      conditions.some((c) => c.type === aiType);
    // regra com frase explícita vence ALL da IA
    confidence =
      aiAgrees && aiConf != null
        ? Math.max(ELIGIBILITY_CONFIDENCE.rules, aiConf)
        : ELIGIBILITY_CONFIDENCE.rules;
  } else if (aiEvidence && (aiConditions.length || (aiType && aiType !== "ALL_CUSTOMERS"))) {
    conditions =
      aiConditions.length > 0
        ? uniqueConditions(aiConditions)
        : [{ type: aiType && aiType !== "ALL_CUSTOMERS" ? aiType : "UNKNOWN" }];
    evidence = { ...aiEvidence, source: aiEvidence.source ?? "ai" };
    confidence = aiConf ?? 0.75;
  } else if (aiType === "UNKNOWN") {
    conditions = [];
    evidence = aiEvidence;
    confidence = aiConf ?? 0.42;
  } else {
    conditions = [];
    confidence = aiConf ?? 0.91;
  }

  const eligibility = conditions.length
    ? deriveEligibility(conditions)
    : aiType === "UNKNOWN"
      ? "UNKNOWN"
      : "ALL_CUSTOMERS";

  if (eligibility === "UNKNOWN" && !conditions.length) {
    confidence = Math.min(confidence, 0.5);
  }

  return {
    eligibility,
    conditions,
    eligibilityConfidence: confidence,
    eligibilityEvidence: evidence,
    eligibilityStatus: eligibilityStatusFor(confidence),
  };
}
