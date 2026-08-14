import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const flyerStatus = v.union(
  v.literal("discovered"),
  v.literal("downloading"),
  v.literal("downloaded"),
  v.literal("processing"),
  v.literal("partially_processed"),
  v.literal("processed"),
  v.literal("expired"),
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
  args: { fileHash: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("flyers")
      .withIndex("by_fileHash", (q) => q.eq("fileHash", args.fileHash))
      .first(),
});

export const createDiscovered = mutation({
  args: {
    supermarketId: v.id("supermarkets"),
    sourceId: v.id("flyerSources"),
    title: v.optional(v.string()),
    originalUrl: v.string(),
    pageUrls: v.optional(v.array(v.string())),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Dedupe by originalUrl per store — date-only identity collided Açougue/Peixaria
    const byUrl = await ctx.db
      .query("flyers")
      .withIndex("by_supermarket", (q) =>
        q.eq("supermarketId", args.supermarketId),
      )
      .filter((q) => q.eq(q.field("originalUrl"), args.originalUrl))
      .first();
    if (byUrl) {
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (args.pageUrls?.length) patch.pageUrls = args.pageUrls;
      if (args.title) patch.title = args.title;
      if (byUrl.status === "failed" && args.pageUrls?.length) {
        patch.status = "discovered";
      }
      if (Object.keys(patch).length > 1) await ctx.db.patch(byUrl._id, patch);
      return byUrl._id;
    }

    const now = Date.now();
    return await ctx.db.insert("flyers", {
      supermarketId: args.supermarketId,
      sourceId: args.sourceId,
      title: args.title,
      originalUrl: args.originalUrl,
      pageUrls: args.pageUrls,
      validFrom: args.validFrom,
      validUntil: args.validUntil,
      status: "discovered",
      createdAt: now,
      updatedAt: now,
    });
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
      updatedAt: Date.now(),
    });
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
        .withIndex("by_fileHash", (q) => q.eq("fileHash", args.fileHash))
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
        f.status !== "failed"
      ) {
        await ctx.db.patch(f._id, { status: "expired", updatedAt: now });
        count++;
      }
    }
    return { expired: count };
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
