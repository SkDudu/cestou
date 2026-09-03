/**
 * Fase 2 — Validação automática de ofertas.
 *
 * Regras:
 *  1. confidence >= 0.8 e preço entre R$0.10 e R$5000 → validated
 *  2. confidence >= 0.5 e preço fora da faixa → suspicious
 *  3. confidence < 0.5 → review_required (fica para humano)
 *  4. nome muito curto (<4 chars) ou preço 0 → rejected
 */
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const PRICE_MIN = 0.1;
const PRICE_MAX = 5000;
const HIGH_CONFIDENCE = 0.8;
const LOW_CONFIDENCE = 0.5;
const MIN_NAME_LENGTH = 4;

type ValidationResult = "validated" | "suspicious" | "rejected";

function autoValidate(offer: {
  name: string;
  price: number;
  extractionConfidence?: number;
  normalizedName?: string;
}): ValidationResult {
  const name = offer.normalizedName ?? offer.name;
  const conf = offer.extractionConfidence ?? 0.7;

  if (name.length < MIN_NAME_LENGTH || offer.price <= 0) return "rejected";
  if (conf < LOW_CONFIDENCE) return "rejected";

  const priceOk = offer.price >= PRICE_MIN && offer.price <= PRICE_MAX;
  if (conf >= HIGH_CONFIDENCE && priceOk) return "validated";
  if (!priceOk) return "suspicious";
  if (conf >= LOW_CONFIDENCE) return "validated";

  return "suspicious";
}

/** Validar automaticamente ofertas pendentes de um flyer (helper reutilizável). */
export async function runValidateFlyerOffers(
  ctx: Pick<MutationCtx, "db">,
  flyerId: Id<"flyers">,
) {
  const offers = await ctx.db
    .query("offers")
    .withIndex("by_flyer", (q) => q.eq("flyerId", flyerId))
    .collect();

  const now = Date.now();
  let validated = 0;
  let suspicious = 0;
  let rejected = 0;

  for (const offer of offers) {
    if (offer.validationStatus !== "pending") continue;

    const result = autoValidate(offer);
    await ctx.db.patch(offer._id, {
      validationStatus: result,
      updatedAt: now,
    });

    if (result === "validated") validated++;
    else if (result === "suspicious") suspicious++;
    else rejected++;
  }

  return { validated, suspicious, rejected, total: offers.length };
}

/** Validar automaticamente ofertas pendentes de um flyer */
export const validateFlyerOffers = internalMutation({
  args: { flyerId: v.id("flyers") },
  handler: async (ctx, args) => runValidateFlyerOffers(ctx, args.flyerId),
});

/** Backfill: validar todas as ofertas pendentes */
export const backfillValidation = mutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 200;
    const pending = await ctx.db
      .query("offers")
      .withIndex("by_validationStatus", (q) => q.eq("validationStatus", "pending"))
      .take(batchSize);

    if (!pending.length) return { processed: 0, done: true };

    const now = Date.now();
    let validated = 0;
    let suspicious = 0;
    let rejected = 0;

    for (const offer of pending) {
      const result = autoValidate(offer);
      await ctx.db.patch(offer._id, {
        validationStatus: result,
        updatedAt: now,
      });
      if (result === "validated") validated++;
      else if (result === "suspicious") suspicious++;
      else rejected++;
    }

    return {
      processed: pending.length,
      validated,
      suspicious,
      rejected,
      done: pending.length < batchSize,
    };
  },
});
