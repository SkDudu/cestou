import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const findByHash = query({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("imageAssets")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
  },
});

export const ensureAsset = mutation({
  args: {
    hash: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("imageAssets")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("imageAssets", {
      hash: args.hash,
      storageId: args.storageId,
      contentType: args.contentType,
      size: args.size,
      createdAt: Date.now(),
    });
  },
});

/**
 * Attach stored image to rawProduct.
 * Skips if already stored (unless force).
 */
export const attachToRaw = mutation({
  args: {
    rawProductId: v.id("rawProducts"),
    storageId: v.id("_storage"),
    hash: v.string(),
    contentType: v.string(),
    size: v.number(),
    sourceUrl: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const raw = await ctx.db.get(args.rawProductId);
    if (!raw) throw new Error("rawProduct not found");

    if (!args.force && raw.imageStorageId && raw.imageStatus === "stored") {
      return { skipped: true };
    }

    await ctx.db.patch(raw._id, {
      imageStorageId: args.storageId,
      imageStatus: "stored",
      imageHash: args.hash,
      imageContentType: args.contentType,
      imageSize: args.size,
      imageDownloadedAt: Date.now(),
      imageError: undefined,
    });

    if (raw.productId) {
      const product = await ctx.db.get(raw.productId);
      if (product && (args.force || !product.imageUrl)) {
        // keep product.imageUrl as remote fallback; storage is on raw for now
        await ctx.db.patch(raw.productId, {
          imageUrl: product.imageUrl ?? args.sourceUrl ?? raw.imageUrl,
          updatedAt: Date.now(),
        });
      }
    }

    return { skipped: false };
  },
});

export const markFailed = mutation({
  args: {
    rawProductId: v.id("rawProducts"),
    status: v.union(v.literal("failed"), v.literal("invalid")),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const raw = await ctx.db.get(args.rawProductId);
    if (!raw) throw new Error("rawProduct not found");
    if (raw.imageStorageId && raw.imageStatus === "stored") {
      return { skipped: true };
    }
    await ctx.db.patch(raw._id, {
      imageStatus: args.status,
      imageError: args.error.slice(0, 500),
    });
    return { skipped: false };
  },
});

/** Paginated candidates: has remote imageUrl, not yet stored. */
export const listPending = query({
  args: {
    supermarketId: v.optional(v.id("supermarkets")),
    paginationOpts: paginationOptsValidator,
    includeFailed: v.optional(v.boolean()),
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

    const page = result.page
      .filter((r) => {
        if (!r.imageUrl?.trim()) return false;
        if (r.imageStorageId && r.imageStatus === "stored") return false;
        if (r.imageStatus === "invalid") return false;
        if (r.imageStatus === "failed" && !args.includeFailed) return false;
        return true;
      })
      .map((r) => ({
        _id: r._id,
        name: r.name,
        imageUrl: r.imageUrl!,
        imageStatus: r.imageStatus,
        supermarketId: r.supermarketId,
      }));

    return { ...result, page };
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
