import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { resolveSourceStoreIds } from "./flyerSources";

const flyerStatus = v.union(
  v.literal("discovered"),
  v.literal("downloading"),
  v.literal("downloaded"),
  v.literal("processing"),
  v.literal("partially_processed"),
  v.literal("processed"),
  v.literal("expired"),
  v.literal("duplicate"),
  v.literal("failed"),
);

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const findByIdentity = query({
  args: {
    supermarketId: v.id("supermarkets"),
    sourceId: v.id("flyerSources"),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.validFrom === undefined || args.validUntil === undefined) {
      return null;
    }
    return await ctx.db
      .query("flyers")
      .withIndex("by_identity", (q) =>
        q
          .eq("supermarketId", args.supermarketId)
          .eq("sourceId", args.sourceId)
          .eq("validFrom", args.validFrom)
          .eq("validUntil", args.validUntil),
      )
      .unique();
  },
});

export const findByHash = query({
  args: {
    supermarketId: v.id("supermarkets"),
    fileHash: v.string(),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query("flyers")
      .withIndex("by_supermarket_fileHash", (q) =>
        q
          .eq("supermarketId", args.supermarketId)
          .eq("fileHash", args.fileHash),
      )
      .first(),
});

function discoveredPatch(
  args: {
    title?: string;
    pageUrls?: string[];
    validFrom?: number;
    validUntil?: number;
    externalId?: string;
    originalUrl?: string;
    storeIds?: Id<"stores">[];
  },
  existing: { status: string; storageId?: string },
) {
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (args.pageUrls?.length) patch.pageUrls = args.pageUrls;
  if (args.title) patch.title = args.title;
  if (args.externalId) patch.externalId = args.externalId;
  if (args.validFrom !== undefined) patch.validFrom = args.validFrom;
  if (args.validUntil !== undefined) patch.validUntil = args.validUntil;
  if (args.originalUrl) patch.originalUrl = args.originalUrl;
  if (args.storeIds !== undefined) patch.storeIds = args.storeIds;
  // ponytail: no file in storage → requeue download; skip in-flight / expired
  if (
    args.pageUrls?.length &&
    !existing.storageId &&
    existing.status !== "processing" &&
    existing.status !== "expired"
  ) {
    patch.status = "discovered";
  }
  return patch;
}

export const createDiscovered = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    sourceId: v.id("flyerSources"),
    title: v.optional(v.string()),
    originalUrl: v.string(),
    pageUrls: v.optional(v.array(v.string())),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    externalId: v.optional(v.string()),
    storeIds: v.optional(v.array(v.id("stores"))),
  },
  handler: async (ctx, args) => {
    const storeIds =
      args.storeIds ??
      (await resolveSourceStoreIds(ctx, args.sourceId)) ??
      undefined;
    const withStores = { ...args, storeIds };

    // Dedupe by originalUrl per store — date-only identity collided Açougue/Peixaria
    const byUrl = await ctx.db
      .query("flyers")
      .withIndex("by_supermarket", (q) =>
        q.eq("supermarketId", args.supermarketId),
      )
      .filter((q) => q.eq(q.field("originalUrl"), args.originalUrl))
      .first();
    if (byUrl) {
      const patch = discoveredPatch(withStores, byUrl);
      if (Object.keys(patch).length > 1) await ctx.db.patch(byUrl._id, patch);
      return { id: byUrl._id, created: false };
    }

    if (args.externalId) {
      const byExt = await ctx.db
        .query("flyers")
        .withIndex("by_supermarket_externalId", (q) =>
          q
            .eq("supermarketId", args.supermarketId)
            .eq("externalId", args.externalId),
        )
        .first();
      if (byExt) {
        await ctx.db.patch(byExt._id, discoveredPatch(withStores, byExt));
        return { id: byExt._id, created: false };
      }
    }

    const now = Date.now();
    const id = await ctx.db.insert("flyers", {
      supermarketId: args.supermarketId,
      sourceId: args.sourceId,
      storeIds,
      title: args.title,
      originalUrl: args.originalUrl,
      pageUrls: args.pageUrls,
      validFrom: args.validFrom,
      validUntil: args.validUntil,
      externalId: args.externalId,
      status: "discovered",
      createdAt: now,
      updatedAt: now,
    });
    return { id, created: true };
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("flyers"),
    status: flyerStatus,
  },
  handler: async (ctx, args) => {
    const flyer = await ctx.db.get(args.id);
    if (!flyer) throw new Error("Flyer not found");
    await ctx.db.patch(args.id, {
      status: args.status,
      expiredAt: args.status === "expired" ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Hard-delete flyer + pages + offers + extractions + storage (review discard). */
async function wipeOffers(
  ctx: MutationCtx,
  offers: Array<{ _id: Id<"offers"> }>,
) {
  for (const o of offers) {
    const hist = await ctx.db
      .query("offerEligibilityHistory")
      .withIndex("by_offer", (q) => q.eq("offerId", o._id))
      .collect();
    for (const h of hist) await ctx.db.delete(h._id);
    await ctx.db.delete(o._id);
  }
}

/**
 * Remove only operational evidence. Extracted offers remain available for
 * historical analysis and receive a source snapshot before the flyer is gone.
 */
export async function purgeFlyerEvidence(
  ctx: MutationCtx,
  flyer: {
    _id: Id<"flyers">;
    title?: string;
    originalUrl: string;
    fileHash?: string;
    storageId?: Id<"_storage">;
  },
  preserveOffers: boolean,
) {
  const now = Date.now();
  const offers = await ctx.db
    .query("offers")
    .withIndex("by_flyer", (q) => q.eq("flyerId", flyer._id))
    .collect();
  if (preserveOffers) {
    for (const offer of offers) {
      await ctx.db.patch(offer._id, {
        sourceFlyerTitle: flyer.title,
        sourceFlyerUrl: flyer.originalUrl,
        sourceFlyerHash: flyer.fileHash,
        sourceEvidencePurgedAt: now,
        updatedAt: now,
      });
    }
  } else {
    await wipeOffers(ctx, offers);
  }

  const extractions = await ctx.db
    .query("flyerExtractions")
    .withIndex("by_flyer", (q) => q.eq("flyerId", flyer._id))
    .collect();
  for (const extraction of extractions) await ctx.db.delete(extraction._id);

  const errors = await ctx.db
    .query("flyerErrors")
    .withIndex("by_flyer", (q) => q.eq("flyerId", flyer._id))
    .collect();
  for (const error of errors) await ctx.db.delete(error._id);

  const pages = await ctx.db
    .query("flyerPages")
    .withIndex("by_flyer", (q) => q.eq("flyerId", flyer._id))
    .collect();
  for (const page of pages) {
    try {
      await ctx.storage.delete(page.storageId);
    } catch {
      /* already gone */
    }
    await ctx.db.delete(page._id);
  }

  if (flyer.storageId) {
    try {
      await ctx.storage.delete(flyer.storageId);
    } catch {
      /* already gone */
    }
  }
  await ctx.db.delete(flyer._id);

  return {
    offers: offers.length,
    pages: pages.length,
    extractions: extractions.length,
    errors: errors.length,
  };
}

async function wipeFlyer(ctx: MutationCtx, id: Id<"flyers">) {
  const flyer = await ctx.db.get(id);
  if (!flyer) throw new Error("Flyer not found");

  const result = await purgeFlyerEvidence(ctx, flyer, false);

  return {
    scope: "flyer" as const,
    ...result,
  };
}

export const discardFlyer = mutation({
  args: { id: v.id("flyers") },
  handler: async (ctx, args) => wipeFlyer(ctx, args.id),
});

/** Hard-delete one page + its offers. Last page → wipe whole flyer. */
export const discardPage = mutation({
  args: {
    flyerId: v.id("flyers"),
    pageNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const flyer = await ctx.db.get(args.flyerId);
    if (!flyer) throw new Error("Flyer not found");

    const pages = await ctx.db
      .query("flyerPages")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.flyerId))
      .collect();
    if (pages.length <= 1) return wipeFlyer(ctx, args.flyerId);

    const page = pages.find((p) => p.pageNumber === args.pageNumber);
    if (!page) throw new Error("Página não encontrada");

    const offers = (
      await ctx.db
        .query("offers")
        .withIndex("by_flyer", (q) => q.eq("flyerId", args.flyerId))
        .collect()
    ).filter((o) => o.pageNumber === args.pageNumber);
    await wipeOffers(ctx, offers);

    const extractions = await ctx.db
      .query("flyerExtractions")
      .withIndex("by_flyer_page", (q) =>
        q.eq("flyerId", args.flyerId).eq("pageNumber", args.pageNumber),
      )
      .collect();
    for (const e of extractions) await ctx.db.delete(e._id);

    try {
      await ctx.storage.delete(page.storageId);
    } catch {
      /* already gone */
    }
    await ctx.db.delete(page._id);
    await ctx.db.patch(args.flyerId, { updatedAt: Date.now() });

    return {
      scope: "page" as const,
      offers: offers.length,
      pages: 1,
      pageNumber: args.pageNumber,
    };
  },
});

export const patchValidity = mutation({
  args: {
    id: v.id("flyers"),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const flyer = await ctx.db.get(args.id);
    if (!flyer) throw new Error("Flyer not found");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.validFrom !== undefined && flyer.validFrom === undefined) {
      patch.validFrom = args.validFrom;
    }
    if (args.validUntil !== undefined && flyer.validUntil === undefined) {
      patch.validUntil = args.validUntil;
    }
    if (Object.keys(patch).length > 1) await ctx.db.patch(args.id, patch);
  },
});

/** Operator override: update flyer and all retained offers with the new period. */
export const setValidity = mutation({
  args: {
    id: v.id("flyers"),
    validFrom: v.optional(v.union(v.number(), v.null())),
    validUntil: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const flyer = await ctx.db.get(args.id);
    if (!flyer) throw new Error("Flyer not found");
    const validFrom =
      args.validFrom === undefined
        ? flyer.validFrom
        : args.validFrom === null
          ? undefined
          : args.validFrom;
    const validUntil =
      args.validUntil === undefined
        ? flyer.validUntil
        : args.validUntil === null
          ? undefined
          : args.validUntil;
    if (
      validFrom !== undefined &&
      validUntil !== undefined &&
      validFrom > validUntil
    ) {
      throw new Error("A data inicial deve ser anterior à data final");
    }
    const now = Date.now();
    const status =
      flyer.status === "expired"
        ? flyer.storageId
          ? "downloaded"
          : "discovered"
        : flyer.status;
    await ctx.db.patch(args.id, {
      validFrom,
      validUntil,
      status,
      expiredAt: undefined,
      updatedAt: now,
    });
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.id))
      .collect();
    for (const offer of offers) {
      await ctx.db.patch(offer._id, {
        validFrom,
        validUntil,
        updatedAt: now,
      });
    }
    return { offersUpdated: offers.length };
  },
});

/** Delete stale evidence and offers, then put the same flyer back in download queue. */
export const resetForDownload = mutation({
  args: { id: v.id("flyers") },
  handler: async (ctx, args) => {
    const flyer = await ctx.db.get(args.id);
    if (!flyer) throw new Error("Flyer not found");
    if (flyer.status === "downloading" || flyer.status === "processing") {
      throw new Error("O encarte está em processamento");
    }

    const offers = await ctx.db
      .query("offers")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.id))
      .collect();
    await wipeOffers(ctx, offers);
    const extractions = await ctx.db
      .query("flyerExtractions")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.id))
      .collect();
    for (const extraction of extractions) await ctx.db.delete(extraction._id);
    const errors = await ctx.db
      .query("flyerErrors")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.id))
      .collect();
    for (const error of errors) await ctx.db.delete(error._id);
    const pages = await ctx.db
      .query("flyerPages")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.id))
      .collect();
    for (const page of pages) {
      try {
        await ctx.storage.delete(page.storageId);
      } catch {
        /* already gone */
      }
      await ctx.db.delete(page._id);
    }
    if (flyer.storageId) {
      try {
        await ctx.storage.delete(flyer.storageId);
      } catch {
        /* already gone */
      }
    }
    await ctx.db.patch(args.id, {
      storageId: undefined,
      fileType: undefined,
      fileSize: undefined,
      fileHash: undefined,
      status: "discovered",
      expiredAt: undefined,
      updatedAt: Date.now(),
    });
    return {
      offersDeleted: offers.length,
      pagesDeleted: pages.length,
      extractionsDeleted: extractions.length,
    };
  },
});

export const attachFile = mutation({
  args: {
    id: v.id("flyers"),
    storageId: v.id("_storage"),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    fileHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const flyer = await ctx.db.get(args.id);
    if (!flyer) throw new Error("Flyer not found");

    if (args.fileHash) {
      const byHash = await ctx.db
        .query("flyers")
        .withIndex("by_supermarket_fileHash", (q) =>
          q
            .eq("supermarketId", flyer.supermarketId)
            .eq("fileHash", args.fileHash),
        )
        .first();
      if (byHash && byHash._id !== args.id) {
        // Keep existing; mark this as failed duplicate attempt path stays discovered
        return { duplicateOf: byHash._id as Id<"flyers"> };
      }
    }

    await ctx.db.patch(args.id, {
      storageId: args.storageId,
      fileType: args.fileType,
      fileSize: args.fileSize,
      fileHash: args.fileHash,
      status: "downloaded",
      updatedAt: Date.now(),
    });
    return { duplicateOf: null };
  },
});

export const list = query({
  args: {
    supermarketId: v.optional(v.id("supermarkets")),
    status: v.optional(flyerStatus),
  },
  handler: async (ctx, args) => {
    let flyers;
    if (args.supermarketId) {
      flyers = await ctx.db
        .query("flyers")
        .withIndex("by_supermarket", (q) =>
          q.eq("supermarketId", args.supermarketId!),
        )
        .collect();
    } else if (args.status) {
      flyers = await ctx.db
        .query("flyers")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      flyers = await ctx.db.query("flyers").collect();
    }

    if (args.status && args.supermarketId) {
      flyers = flyers.filter((f) => f.status === args.status);
    }

    const sorted = [...flyers].sort((a, b) => b.createdAt - a.createdAt);
    return await Promise.all(
      sorted.map(async (f) => {
        const supermarket = await ctx.db.get(f.supermarketId);
        const offerCount = (
          await ctx.db
            .query("offers")
            .withIndex("by_flyer", (q) => q.eq("flyerId", f._id))
            .collect()
        ).length;
        const pageCount = (
          await ctx.db
            .query("flyerPages")
            .withIndex("by_flyer", (q) => q.eq("flyerId", f._id))
            .collect()
        ).length;
        return {
          ...f,
          supermarketName: supermarket?.name ?? "—",
          offerCount,
          pageCount,
          retentionAt:
            f.status === "expired" && f.validUntil !== undefined
              ? f.validUntil + FLYER_RETENTION_MS
              : undefined,
        };
      }),
    );
  },
});

export const listPendingDownload = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("flyers")
      .withIndex("by_status", (q) => q.eq("status", "discovered"))
      .collect(),
});

export const listPendingExtract = query({
  args: {},
  handler: async (ctx) => {
    const downloaded = await ctx.db
      .query("flyers")
      .withIndex("by_status", (q) => q.eq("status", "downloaded"))
      .collect();
    const partial = await ctx.db
      .query("flyers")
      .withIndex("by_status", (q) => q.eq("status", "partially_processed"))
      .collect();
    return [...downloaded, ...partial];
  },
});

/** Re-OCR candidates: downloaded, partial, or already processed (has pages). */
export const listForExtract = query({
  args: { includeProcessed: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const downloaded = await ctx.db
      .query("flyers")
      .withIndex("by_status", (q) => q.eq("status", "downloaded"))
      .collect();
    const partial = await ctx.db
      .query("flyers")
      .withIndex("by_status", (q) => q.eq("status", "partially_processed"))
      .collect();
    if (!args.includeProcessed) return [...downloaded, ...partial];
    const processed = await ctx.db
      .query("flyers")
      .withIndex("by_status", (q) => q.eq("status", "processed"))
      .collect();
    return [...downloaded, ...partial, ...processed];
  },
});

export const get = query({
  args: { id: v.id("flyers") },
  handler: async (ctx, args) => {
    const flyer = await ctx.db.get(args.id);
    if (!flyer) return null;
    const supermarket = await ctx.db.get(flyer.supermarketId);
    const source = await ctx.db.get(flyer.sourceId);
    const pages = await ctx.db
      .query("flyerPages")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.id))
      .collect();
    const pagesWithUrls = await Promise.all(
      [...pages]
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map(async (p) => ({
          ...p,
          url: await ctx.storage.getUrl(p.storageId),
        })),
    );
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_flyer", (q) => q.eq("flyerId", args.id))
      .collect();
    const fileUrl = flyer.storageId
      ? await ctx.storage.getUrl(flyer.storageId)
      : null;

    return {
      ...flyer,
      supermarket,
      source,
      pages: pagesWithUrls,
      offers: [...offers].sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0)),
      fileUrl,
      offerCount: offers.length,
      retentionAt:
        flyer.status === "expired" && flyer.validUntil !== undefined
          ? flyer.validUntil + FLYER_RETENTION_MS
          : undefined,
    };
  },
});

export const markExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const flyers = await ctx.db.query("flyers").collect();
    let count = 0;
    for (const f of flyers) {
      if (
        f.validUntil !== undefined &&
        f.validUntil < now &&
        f.status !== "expired" &&
        f.status !== "failed" &&
        f.status !== "downloading" &&
        f.status !== "processing"
      ) {
        await ctx.db.patch(f._id, {
          status: "expired",
          expiredAt: now,
          updatedAt: now,
        });
        count++;
      }
    }
    return { expired: count };
  },
});

export const FLYER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Delete expired flyer evidence older than 30 days, preserving extracted offers. */
export const purgeExpiredEvidence = mutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - FLYER_RETENTION_MS;
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const candidates = (await ctx.db
      .query("flyers")
      .withIndex("by_status", (q) => q.eq("status", "expired"))
      .collect())
      .filter((flyer) => flyer.validUntil !== undefined && flyer.validUntil <= cutoff)
      .slice(0, limit);

    let offersPreserved = 0;
    let pagesDeleted = 0;
    for (const flyer of candidates) {
      const result = await purgeFlyerEvidence(ctx, flyer, true);
      offersPreserved += result.offers;
      pagesDeleted += result.pages;
    }
    return {
      flyersDeleted: candidates.length,
      offersPreserved,
      pagesDeleted,
    };
  },
});

export const listNearExpiration = query({
  args: { beforeHours: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cutoff = now + args.beforeHours * 60 * 60 * 1000;
    const flyers = await ctx.db.query("flyers").collect();
    return flyers.filter(
      (f) =>
        f.validUntil !== undefined &&
        f.validUntil >= now &&
        f.validUntil <= cutoff &&
        (f.status === "processed" ||
          f.status === "downloaded" ||
          f.status === "partially_processed"),
    );
  },
});
