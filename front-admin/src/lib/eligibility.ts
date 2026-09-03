export const ELIGIBILITY_OPTIONS = [
  { id: "ALL_CUSTOMERS", label: "Todos os clientes" },
  { id: "LOYALTY_PROGRAM", label: "Clube" },
  { id: "STORE_CARD", label: "Cartão da loja" },
  { id: "CPF_REQUIRED", label: "CPF" },
  { id: "APP_ONLY", label: "App" },
  { id: "COUPON_REQUIRED", label: "Cupom" },
  { id: "PAYMENT_METHOD", label: "Pagamento" },
  { id: "QUANTITY_REQUIRED", label: "Quantidade" },
  { id: "UNKNOWN", label: "Desconhecida" },
] as const;

export type EligibilityId = (typeof ELIGIBILITY_OPTIONS)[number]["id"];

export type ConditionDraft = {
  type: EligibilityId;
  name: string;
  description: string;
};

// ponytail: same rank as scraper eligibility.ts
const RANK: Exclude<EligibilityId, "ALL_CUSTOMERS">[] = [
  "UNKNOWN",
  "QUANTITY_REQUIRED",
  "COUPON_REQUIRED",
  "APP_ONLY",
  "CPF_REQUIRED",
  "STORE_CARD",
  "PAYMENT_METHOD",
  "LOYALTY_PROGRAM",
];

const IDS = new Set<string>(ELIGIBILITY_OPTIONS.map((x) => x.id));

function asId(t?: string): EligibilityId {
  return t && IDS.has(t) ? (t as EligibilityId) : "UNKNOWN";
}

export function primaryEligibility(drafts: ConditionDraft[]): EligibilityId {
  const types = drafts
    .map((d) => d.type)
    .filter(
      (t): t is Exclude<EligibilityId, "ALL_CUSTOMERS"> =>
        t !== "ALL_CUSTOMERS",
    );
  if (!types.length) return "ALL_CUSTOMERS";
  for (const t of RANK) if (types.includes(t)) return t;
  return types[0]!;
}

export function draftsFromOffer(o: {
  eligibility?: string;
  conditions?: {
    type?: string;
    name?: string;
    description?: string;
    requirement?: string;
  }[];
}): ConditionDraft[] {
  const cs = o.conditions ?? [];
  if (!cs.length) {
    const el = o.eligibility ?? "ALL_CUSTOMERS";
    if (el === "ALL_CUSTOMERS") return [];
    return [{ type: asId(el), name: "", description: "" }];
  }
  return cs.map((c) => ({
    type: asId(c.type),
    name: c.name?.trim() ?? "",
    description: [c.description, c.requirement]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(" · "),
  }));
}

export function conditionNote(o: {
  eligibility?: string;
  conditions?: {
    name?: string;
    description?: string;
    requirement?: string;
  }[];
}): string | null {
  const el = o.eligibility ?? "ALL_CUSTOMERS";
  if (el === "ALL_CUSTOMERS") return null;
  const parts = (o.conditions ?? [])
    .flatMap((c) => [c.name, c.description, c.requirement])
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  const text = [...new Set(parts)].join(" · ");
  if (text) return text;
  return ELIGIBILITY_OPTIONS.find((x) => x.id === el)?.label ?? el;
}
