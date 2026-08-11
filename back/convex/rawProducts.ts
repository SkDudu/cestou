import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

function isPromotion(price: number, originalPrice?: number) {
  return originalPrice !== undefined && originalPrice > price;
}

function discountPct(price: number, originalPrice?: number) {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

function getIncompleteReason(raw: {
  name: string;
  price: number;
  brand?: string;
  externalId?: string;
  imageUrl?: string;
  url?: string;
}) {
  const issues: string[] = [];
  if (!raw.imageUrl) issues.push("Sem imagem");
  if (!raw.brand) issues.push("Sem marca");
  if (raw.price <= 0) issues.push("Sem preço");
  if (!raw.externalId) issues.push("Sem external ID");
  if (!raw.url) issues.push("Sem URL");
  if (raw.name.length < 3) issues.push("Nome muito curto");
  return issues;
}

function isIncomplete(raw: {
  name: string;
  price: number;
  brand?: string;
  externalId?: string;
  imageUrl?: string;
  url?: string;
}) {
  return getIncompleteReason(raw).length > 0;
}

async function enrichPage(ctx: QueryCtx, page: Doc<"rawProducts">[]) {
  return await Promise.all(
    page.map(async (raw) => {
      const supermarket = await ctx.db.get(raw.supermarketId);
      const validation = await ctx.db
        .query("productValidations")
        .withIndex("by_rawProduct", (q) => q.eq("rawProductId", raw._id))
        .unique();
      const storedImageUrl = raw.imageStorageId
        ? await ctx.storage.getUrl(raw.imageStorageId)
        : null;
      return {
        ...raw,
        supermarketName: supermarket?.name ?? "—",
        discount: discountPct(raw.price, raw.originalPrice),
        isPromotion: isPromotion(raw.price, raw.originalPrice),
        incompleteIssues: getIncompleteReason(raw),
        isIncomplete: isIncomplete(raw),
        validationStatus: validation?.status ?? "pending",
        /** prefer Convex storage; fallback to supermarket CDN */
        displayImageUrl: storedImageUrl ?? raw.imageUrl ?? null,
      };
    }),
  );
}

export const insert = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    scrapingJobId: v.optional(v.id("scrapingJobs")),
    productId: v.optional(v.id("products")),
    externalId: v.optional(v.string()),
    name: v.string(),
    brand: v.optional(v.string()),
    brandSource: v.optional(v.string()),
    brandConfidence: v.optional(v.number()),
    price: v.number(),
    originalPrice: v.optional(v.number()),
    url: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    rawData: v.optional(v.any()),
    collectedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.externalId) {
      const existing = await ctx.db
        .query("rawProducts")
        .withIndex("by_supermarket_externalId", (q) =>
          q.eq("supermarketId", args.supermarketId).eq("externalId", args.externalId),
        )
        .unique();

      if (existing) {
        // don't wipe brand if re-scrape sends empty and we already enriched
        const patch: Record<string, unknown> = {
          name: args.name,
          price: args.price,
          originalPrice: args.originalPrice,
          url: args.url,
          imageUrl: args.imageUrl,
          rawData: args.rawData,
          collectedAt: args.collectedAt,
          scrapingJobId: args.scrapingJobId,
          productId: args.productId,
        };
        if (args.brand) {
          patch.brand = args.brand;
          patch.brandSource = args.brandSource;
          patch.brandConfidence = args.brandConfidence;
        } else if (!existing.brand && args.brandSource) {
          patch.brandSource = args.brandSource;
          patch.brandConfidence = args.brandConfidence;
        }
        await ctx.db.patch(existing._id, patch);
        return existing._id;
      }
    }

    return await ctx.db.insert("rawProducts", args);
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    supermarketId: v.optional(v.id("supermarkets")),
    search: v.optional(v.string()),
    promotionOnly: v.optional(v.boolean()),
    incompleteOnly: v.optional(v.boolean()),
    brand: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let result;

    if (args.search?.trim()) {
      result = await ctx.db
        .query("rawProducts")
        .withSearchIndex("search_name", (q) => {
          let search = q.search("name", args.search!.trim());
          if (args.supermarketId) {
            search = search.eq("supermarketId", args.supermarketId);
          }
          return search;
        })
        .paginate(args.paginationOpts);
    } else if (args.supermarketId) {
      result = await ctx.db
        .query("rawProducts")
        .withIndex("by_supermarket_collectedAt", (q) =>
          q.eq("supermarketId", args.supermarketId!),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db
        .query("rawProducts")
        .withIndex("by_collectedAt")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    let page = result.page;
    if (args.promotionOnly) {
      page = page.filter((r) => isPromotion(r.price, r.originalPrice));
    }
    if (args.incompleteOnly) {
      page = page.filter(isIncomplete);
    }
    if (args.brand) {
      page = page.filter(
        (r) => r.brand?.toLowerCase() === args.brand!.toLowerCase(),
      );
    }

    if (args.search?.trim()) {
      const term = args.search.trim().toLowerCase();
      page = page.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          r.brand?.toLowerCase().includes(term) ||
          r.externalId?.toLowerCase().includes(term),
      );
    }

    const enriched = await enrichPage(ctx, page);
    return { ...result, page: enriched };
  },
});

export const get = query({
  args: { id: v.id("rawProducts") },
  handler: async (ctx, args) => {
    const raw = await ctx.db.get(args.id);
    if (!raw) return null;

    const supermarket = await ctx.db.get(raw.supermarketId);
    const validation = await ctx.db
      .query("productValidations")
      .withIndex("by_rawProduct", (q) => q.eq("rawProductId", args.id))
      .unique();
    const job = raw.scrapingJobId
      ? await ctx.db.get(raw.scrapingJobId)
      : null;

    let priceHistory: Array<{
      price: number;
      originalPrice?: number;
      collectedAt: number;
    }> = [];

    if (raw.productId) {
      const prices = await ctx.db
        .query("prices")
        .withIndex("by_product_supermarket", (q) =>
          q.eq("productId", raw.productId!).eq("supermarketId", raw.supermarketId),
        )
        .collect();
      priceHistory = prices
        .sort((a, b) => b.collectedAt - a.collectedAt)
        .map((p) => ({
          price: p.price,
          originalPrice: p.originalPrice,
          collectedAt: p.collectedAt,
        }));
    }

    const product = raw.productId ? await ctx.db.get(raw.productId) : null;
    const storedImageUrl = raw.imageStorageId
      ? await ctx.storage.getUrl(raw.imageStorageId)
      : null;

    return {
      ...raw,
      supermarket,
      validation,
      job,
      product,
      priceHistory,
      discount: discountPct(raw.price, raw.originalPrice),
      isPromotion: isPromotion(raw.price, raw.originalPrice),
      incompleteIssues: getIncompleteReason(raw),
      isIncomplete: isIncomplete(raw),
      qualityScore: validation?.score ?? computeQualityScore(raw),
      displayImageUrl: storedImageUrl ?? raw.imageUrl ?? null,
    };
  },
});

export const listValidationIssues = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    const all = await ctx.db.query("rawProducts").order("desc").take(500);

    const issues = all
      .map((raw) => {
        const incompleteIssues = getIncompleteReason(raw);
        const suspiciousPrice =
          raw.price <= 0 || raw.price > 500;
        const reasons = [...incompleteIssues];
        if (suspiciousPrice && raw.price > 0) {
          reasons.push("Preço extremamente alto");
        }
        if (reasons.length === 0) return null;
        return { raw, reasons };
      })
      .filter(Boolean)
      .slice(0, limit);

    return await Promise.all(
      issues.map(async (item) => {
        const supermarket = await ctx.db.get(item!.raw.supermarketId);
        return {
          ...item!.raw,
          reasons: item!.reasons,
          supermarketName: (supermarket as { name: string } | null)?.name ?? "—",
        };
      }),
    );
  },
});

export const listDuplicates = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const all = await ctx.db.query("rawProducts").take(1000);
    const groups = new Map<string, typeof all>();

    for (const raw of all) {
      const key = raw.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 40);
      const group = groups.get(key) ?? [];
      group.push(raw);
      groups.set(key, group);
    }

    const duplicates = [...groups.entries()]
      .filter(([, items]) => items.length > 1)
      .slice(0, limit)
      .map(([key, items]) => ({ key, items }));

    return duplicates;
  },
});

export const comparePrices = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    const term = args.search.trim().toLowerCase();
    if (!term) return [];

    const matches = await ctx.db
      .query("rawProducts")
      .withSearchIndex("search_name", (q) => q.search("name", args.search.trim()))
      .take(20);

    const filtered = matches.filter((r) =>
      r.name.toLowerCase().includes(term),
    );

    return await Promise.all(
      filtered.map(async (raw) => {
        const supermarket = await ctx.db.get(raw.supermarketId);
        return {
          name: raw.name,
          supermarketName: (supermarket as { name: string } | null)?.name ?? "—",
          price: raw.price,
          originalPrice: raw.originalPrice,
        };
      }),
    );
  },
});

function computeQualityScore(raw: {
  name: string;
  brand?: string;
  externalId?: string;
  imageUrl?: string;
  url?: string;
  price: number;
}) {
  let score = 0;
  if (raw.name.length >= 3) score += 20;
  if (raw.price > 0) score += 20;
  if (raw.brand) score += 15;
  if (raw.externalId) score += 15;
  if (raw.imageUrl) score += 10;
  if (raw.url) score += 10;
  score += 10;
  return score;
}

export const listBrands = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("rawProducts").take(4000);
    const brands = new Set<string>();
    for (const r of all) {
      if (r.brand) brands.add(r.brand);
    }
    const products = await ctx.db.query("products").take(4000);
    for (const p of products) {
      if (p.brand) brands.add(p.brand);
    }
    return [...brands].sort();
  },
});

/** Patch brand from enrichment CLI (won't overwrite scraper/manual). */
export const setBrand = mutation({
  args: {
    rawProductId: v.id("rawProducts"),
    brand: v.string(),
    brandSource: v.string(),
    brandConfidence: v.number(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const raw = await ctx.db.get(args.rawProductId);
    if (!raw) throw new Error("rawProduct not found");

    if (!args.force) {
      if (raw.brandSource === "scraper" || raw.brandSource === "manual") {
        return { skipped: true };
      }
      // legacy PA rows: brand set, no source → treat as scraper
      if (raw.brand && !raw.brandSource) {
        return { skipped: true };
      }
    }

    await ctx.db.patch(raw._id, {
      brand: args.brand,
      brandSource: args.brandSource,
      brandConfidence: args.brandConfidence,
    });

    if (raw.productId) {
      const product = await ctx.db.get(raw.productId);
      if (
        product &&
        (args.force ||
          !product.brand ||
          product.brandSource === "dictionary" ||
          product.brandSource === "heuristic")
      ) {
        await ctx.db.patch(raw.productId, {
          brand: args.brand,
          brandSource: args.brandSource,
          brandConfidence: args.brandConfidence,
          updatedAt: Date.now(),
        });
      }
    }

    return { skipped: false };
  },
});

/** Batch for validate / enrich CLIs — Convex cursor pagination (no collectedAt skip). */
export const listForValidate = query({
  args: {
    supermarketId: v.optional(v.id("supermarkets")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const base = args.supermarketId
      ? ctx.db
          .query("rawProducts")
          .withIndex("by_supermarket_collectedAt", (q) =>
            q.eq("supermarketId", args.supermarketId!),
          )
          .order("desc")
      : ctx.db.query("rawProducts").withIndex("by_collectedAt").order("desc");

    const result = await base.paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (raw) => {
        const product = raw.productId ? await ctx.db.get(raw.productId) : null;
        const validation = await ctx.db
          .query("productValidations")
          .withIndex("by_rawProduct", (q) => q.eq("rawProductId", raw._id))
          .unique();
        return {
          _id: raw._id,
          supermarketId: raw.supermarketId,
          name: raw.name,
          brand: raw.brand ?? product?.brand,
          brandSource: raw.brandSource,
          brandConfidence: raw.brandConfidence,
          price: raw.price,
          originalPrice: raw.originalPrice,
          quantity: product?.quantity,
          unit: product?.unit,
          url: raw.url,
          imageUrl: raw.imageUrl,
          externalId: raw.externalId,
          collectedAt: raw.collectedAt,
          validationSource: validation?.source,
          validationStatus: validation?.status ?? "pending",
          productId: raw.productId,
        };
      }),
    );

    return { ...result, page };
  },
});
