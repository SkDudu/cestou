/**
 * Fase 2 — Normalização de ofertas, resolução de marca e produto canônico.
 *
 * normalizeOfferBatch  — mutation chamada após extração ou sob demanda
 * resolveCanonical     — mutation que faz matching e cria/reutiliza canonicalProducts + priceHistory
 */
import { mutation, internalMutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { ensureBrand } from "./brands";
import { runValidateFlyerOffers } from "./autoValidation";

/* ── helpers de texto ────────────────────────────────────── */

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[\s/-])(\p{L})/gu, (_, sep: string, ch: string) =>
      sep + ch.toUpperCase(),
    );
}

const UNIT_MAP: Record<string, string> = {
  lt: "l", litro: "l", litros: "l",
  und: "un", unid: "un", unidade: "un", unidades: "un",
  kilo: "kg", kilos: "kg", kgs: "kg",
};
const VALID_UNITS = new Set(["kg", "g", "l", "ml", "un", "cx", "pct", "pack", "fd"]);

function normalizeUnit(unit: string): string | undefined {
  const u = unit.toLowerCase().replace(/\.$/, "").trim();
  const mapped = UNIT_MAP[u] ?? u;
  return VALID_UNITS.has(mapped) ? mapped : undefined;
}

function parseQuantity(qty: string | undefined, unit: string | undefined): {
  quantityValue: number | undefined;
  unitNormalized: string | undefined;
} {
  if (qty) {
    const num = Number(qty.replace(",", "."));
    const uNorm = unit ? normalizeUnit(unit) : undefined;
    return {
      quantityValue: Number.isFinite(num) ? num : undefined,
      unitNormalized: uNorm,
    };
  }
  return { quantityValue: undefined, unitNormalized: unit ? normalizeUnit(unit) : undefined };
}

function buildMatchKey(name: string, brand: string | undefined, qty: string | undefined, unit: string | undefined): string {
  const parts = [normalize(name)];
  if (brand) parts.push(normalize(brand));
  if (qty) parts.push(qty.replace(",", "."));
  if (unit) {
    const u = normalizeUnit(unit);
    if (u) parts.push(u);
  }
  return parts.join("|");
}

function slugify(text: string): string {
  return normalize(text).replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/* ── Helpers reutilizáveis (não usar .handler de mutations Convex) ── */

async function runNormalizeOfferBatch(
  ctx: Pick<MutationCtx, "db">,
  flyerId: Id<"flyers">,
  limit?: number,
) {
  const offers = await ctx.db
    .query("offers")
    .withIndex("by_flyer", (q) => q.eq("flyerId", flyerId))
    .collect();
  const batch = limit ? offers.slice(0, limit) : offers;
  const now = Date.now();
  let normalized = 0;

  for (const offer of batch) {
    const normalizedName = normalize(offer.name);
    const normalizedBrand = offer.brand ? titleCase(offer.brand.trim()) : undefined;
    const { quantityValue, unitNormalized } = parseQuantity(offer.quantity, offer.unit);

    let brandId = offer.brandId;
    if (!brandId && normalizedBrand) {
      brandId = await ensureBrand(ctx, normalizedBrand);
    }

    const isMember = offer.eligibility !== undefined && offer.eligibility !== "ALL_CUSTOMERS";
    const membershipPatch: Record<string, unknown> = {};
    if (isMember) {
      membershipPatch.requiresMembership = true;
      membershipPatch.memberPrice = offer.price;
      membershipPatch.publicPrice = offer.originalPrice ?? offer.price;
      const condName = offer.conditions?.[0]?.name;
      membershipPatch.membershipName = condName ?? String(offer.eligibility);
    } else {
      membershipPatch.requiresMembership = false;
      membershipPatch.publicPrice = offer.price;
    }

    await ctx.db.patch(offer._id, {
      normalizedName,
      normalizedBrand,
      quantityValue,
      unitNormalized,
      brandId,
      ...membershipPatch,
      updatedAt: now,
    });
    normalized++;
  }

  return { normalized };
}

async function runResolveCanonical(
  ctx: Pick<MutationCtx, "db">,
  flyerId: Id<"flyers">,
) {
  const flyer = await ctx.db.get(flyerId);
  if (!flyer) return { resolved: 0, created: 0 };

  const offers = await ctx.db
    .query("offers")
    .withIndex("by_flyer", (q) => q.eq("flyerId", flyerId))
    .collect();

  const now = Date.now();
  let resolved = 0;
  let created = 0;

  for (const offer of offers) {
    if (!offer.normalizedName) continue;

    const matchKey = buildMatchKey(
      offer.name,
      offer.normalizedBrand,
      offer.quantity,
      offer.unit,
    );

    let canonical = await ctx.db
      .query("canonicalProducts")
      .withIndex("by_matchKey", (q) => q.eq("matchKey", matchKey))
      .unique();

    if (!canonical) {
      const canonicalName = titleCase(offer.name);
      const slug = slugify(`${offer.normalizedBrand ?? ""} ${offer.name} ${offer.quantity ?? ""} ${offer.unit ?? ""}`);
      const id = await ctx.db.insert("canonicalProducts", {
        canonicalName,
        slug,
        brandId: offer.brandId,
        quantity: offer.quantity,
        unit: offer.unitNormalized ?? offer.unit,
        matchKey,
        createdAt: now,
        updatedAt: now,
      });
      canonical = (await ctx.db.get(id))!;
      created++;
    }

    await ctx.db.patch(offer._id, {
      canonicalProductId: canonical._id,
      updatedAt: now,
    });

    const existingPrice = await ctx.db
      .query("priceHistory")
      .withIndex("by_offer", (q) => q.eq("offerId", offer._id))
      .unique();

    if (!existingPrice) {
      const isMember = offer.eligibility !== undefined && offer.eligibility !== "ALL_CUSTOMERS";
      await ctx.db.insert("priceHistory", {
        canonicalProductId: canonical._id,
        supermarketId: offer.supermarketId,
        offerId: offer._id,
        price: offer.price,
        originalPrice: offer.originalPrice,
        memberPrice: isMember ? offer.price : undefined,
        requiresMembership: isMember || undefined,
        membershipName: isMember && offer.eligibility ? String(offer.eligibility) : undefined,
        validFrom: offer.validFrom,
        validUntil: offer.validUntil,
        createdAt: now,
      });
    }

    resolved++;
  }

  return { resolved, created };
}

/* ── Normalizar um lote de ofertas ───────────────────────── */

export const normalizeOfferBatch = internalMutation({
  args: { flyerId: v.id("flyers"), limit: v.optional(v.number()) },
  handler: async (ctx, args) =>
    runNormalizeOfferBatch(ctx, args.flyerId, args.limit),
});

/* ── Resolver produto canônico para ofertas de um flyer ─── */

export const resolveCanonical = internalMutation({
  args: { flyerId: v.id("flyers") },
  handler: async (ctx, args) => runResolveCanonical(ctx, args.flyerId),
});

/* ── Normalizar + resolver tudo de um flyer (post-extraction) */

export const processFlyer = mutation({
  args: { flyerId: v.id("flyers") },
  handler: async (ctx, args) => {
    const r1 = await runNormalizeOfferBatch(ctx, args.flyerId);
    const r2 = await runResolveCanonical(ctx, args.flyerId);
    const r3 = await runValidateFlyerOffers(ctx, args.flyerId);
    return { ...r1, ...r2, autoValidation: r3 };
  },
});

/* ── Queries ──────────────────────────────────────────────── */

export const listCanonical = query({
  args: {
    brandId: v.optional(v.id("brands")),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let products;
    if (args.brandId) {
      products = await ctx.db
        .query("canonicalProducts")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
        .collect();
    } else {
      products = await ctx.db.query("canonicalProducts").collect();
    }

    if (args.search) {
      const s = normalize(args.search);
      products = products.filter(
        (p) =>
          normalize(p.canonicalName).includes(s) ||
          normalize(p.matchKey).includes(s),
      );
    }

    const limit = args.limit ?? 50;
    return products
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
});

export const getCanonical = query({
  args: { id: v.id("canonicalProducts") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (!p) return null;
    const brand = p.brandId ? await ctx.db.get(p.brandId) : null;
    return { ...p, brand };
  },
});

export const getPriceHistory = query({
  args: { canonicalProductId: v.id("canonicalProducts"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("priceHistory")
      .withIndex("by_canonical", (q) => q.eq("canonicalProductId", args.canonicalProductId))
      .collect();

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const supermarket = await ctx.db.get(row.supermarketId);
        return { ...row, supermarketName: supermarket?.name ?? "—" };
      }),
    );

    return enriched
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, args.limit ?? 100);
  },
});

/** Normalizar todas as ofertas pendentes (backfill) */
export const backfillNormalization = mutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const pending = await ctx.db
      .query("offers")
      .filter((q) => q.eq(q.field("normalizedName"), undefined))
      .take(batchSize);

    if (!pending.length) return { processed: 0, done: true };

    const now = Date.now();
    let processed = 0;

    for (const offer of pending) {
      const normalizedName = normalize(offer.name);
      const normalizedBrand = offer.brand ? titleCase(offer.brand.trim()) : undefined;
      const { quantityValue, unitNormalized } = parseQuantity(offer.quantity, offer.unit);

      let brandId = offer.brandId;
      if (!brandId && normalizedBrand) {
        brandId = await ensureBrand(ctx, normalizedBrand);
      }

      const matchKey = buildMatchKey(offer.name, normalizedBrand, offer.quantity, offer.unit);

      let canonical = await ctx.db
        .query("canonicalProducts")
        .withIndex("by_matchKey", (q) => q.eq("matchKey", matchKey))
        .unique();

      if (!canonical) {
        const canonicalName = titleCase(offer.name);
        const slug = slugify(`${normalizedBrand ?? ""} ${offer.name} ${offer.quantity ?? ""} ${offer.unit ?? ""}`);
        const id = await ctx.db.insert("canonicalProducts", {
          canonicalName,
          slug,
          brandId,
          quantity: offer.quantity,
          unit: unitNormalized ?? offer.unit,
          matchKey,
          createdAt: now,
          updatedAt: now,
        });
        canonical = (await ctx.db.get(id))!;
      }

      await ctx.db.patch(offer._id, {
        normalizedName,
        normalizedBrand,
        quantityValue,
        unitNormalized,
        brandId,
        canonicalProductId: canonical._id,
        updatedAt: now,
      });

      const existingPrice = await ctx.db
        .query("priceHistory")
        .withIndex("by_offer", (q) => q.eq("offerId", offer._id))
        .unique();

      if (!existingPrice) {
        const isMember = offer.eligibility !== undefined && offer.eligibility !== "ALL_CUSTOMERS";
        await ctx.db.insert("priceHistory", {
          canonicalProductId: canonical._id,
          supermarketId: offer.supermarketId,
          offerId: offer._id,
          price: offer.price,
          originalPrice: offer.originalPrice,
          memberPrice: isMember ? offer.price : undefined,
          requiresMembership: isMember || undefined,
          membershipName: isMember && offer.eligibility ? String(offer.eligibility) : undefined,
          validFrom: offer.validFrom,
          validUntil: offer.validUntil,
          createdAt: now,
        });
      }

      processed++;
    }

    return { processed, done: processed < batchSize };
  },
});
