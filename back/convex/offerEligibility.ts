import { v } from "convex/values";

export const eligibilityType = v.union(
  v.literal("ALL_CUSTOMERS"),
  v.literal("LOYALTY_PROGRAM"),
  v.literal("STORE_CARD"),
  v.literal("CPF_REQUIRED"),
  v.literal("APP_ONLY"),
  v.literal("COUPON_REQUIRED"),
  v.literal("PAYMENT_METHOD"),
  v.literal("QUANTITY_REQUIRED"),
  v.literal("UNKNOWN"),
);

export const eligibilityStatus = v.union(
  v.literal("pending"),
  v.literal("ai_validated"),
  v.literal("review_required"),
  v.literal("human_validated"),
  v.literal("rejected"),
);

export const offerCondition = v.object({
  type: eligibilityType,
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  requirement: v.optional(v.string()),
});

export const eligibilityEvidence = v.object({
  text: v.string(),
  source: v.optional(v.string()),
  page: v.optional(v.number()),
  boundingBox: v.optional(
    v.object({
      x: v.number(),
      y: v.number(),
      w: v.number(),
      h: v.number(),
    }),
  ),
});

export const ELIGIBILITY_LABELS: Record<string, string> = {
  ALL_CUSTOMERS: "Todos",
  LOYALTY_PROGRAM: "Clube",
  STORE_CARD: "Cartão da loja",
  CPF_REQUIRED: "CPF",
  APP_ONLY: "App",
  COUPON_REQUIRED: "Cupom",
  PAYMENT_METHOD: "Pagamento",
  QUANTITY_REQUIRED: "Quantidade",
  UNKNOWN: "Condição não identificada",
};

export type ConditionFields = {
  type?: string;
  name?: string;
  description?: string;
  requirement?: string;
};

export function conditionLine(c: ConditionFields): string {
  const bits = [c.name, c.description, c.requirement]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  return [...new Set(bits)].join(" · ");
}

export function publicCondition(o: {
  eligibility?: string;
  conditions?: ConditionFields[];
}): { kind: "none" | "ok" | "unknown"; text: string } {
  const el = o.eligibility ?? "ALL_CUSTOMERS";
  if (el === "ALL_CUSTOMERS") return { kind: "none", text: "Todos" };
  if (el === "UNKNOWN") {
    return { kind: "unknown", text: "Condição não identificada" };
  }
  const parts = (o.conditions ?? []).map(conditionLine).filter(Boolean);
  return {
    kind: "ok",
    text: parts.length ? parts.join(" · ") : ELIGIBILITY_LABELS[el] || el,
  };
}

export function publicPayment(o: {
  cashPrice?: number;
  installmentCount?: number;
  installmentAmount?: number;
  installmentInterestFree?: boolean;
}) {
  return {
    cashPrice: o.cashPrice,
    installmentCount: o.installmentCount,
    installmentAmount: o.installmentAmount,
    installmentInterestFree: o.installmentInterestFree,
  };
}
