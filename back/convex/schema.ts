import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const flyerStatus = v.union(
  v.literal("discovered"),
  v.literal("downloading"),
  v.literal("downloaded"),
  v.literal("processing"),
  v.literal("processed"),
  v.literal("expired"),
  v.literal("failed"),
);

const flyerSourceType = v.union(
  v.literal("pdf"),
  v.literal("image"),
  v.literal("web"),
  v.literal("dynamic"),
);

const offerValidationStatus = v.union(
  v.literal("pending"),
  v.literal("validated"),
  v.literal("rejected"),
  v.literal("suspicious"),
);

const flyerErrorStage = v.union(
  v.literal("DISCOVERY"),
  v.literal("DOWNLOAD"),
  v.literal("STORAGE"),
  v.literal("OCR"),
  v.literal("PARSER"),
  v.literal("VALIDATION"),
);

export default defineSchema({
  supermarkets: defineTable({
    name: v.string(),
    slug: v.string(),
    city: v.string(),
    state: v.string(),
    country: v.string(),
    active: v.boolean(),
    websiteUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  flyerSources: defineTable({
    supermarketId: v.id("supermarkets"),
    type: flyerSourceType,
    url: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_supermarket", ["supermarketId"])
    .index("by_supermarket_active", ["supermarketId", "active"]),

  flyers: defineTable({
    supermarketId: v.id("supermarkets"),
    sourceId: v.id("flyerSources"),
    title: v.optional(v.string()),
    originalUrl: v.string(),
    storageId: v.optional(v.id("_storage")),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    fileHash: v.optional(v.string()),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    status: flyerStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_supermarket", ["supermarketId"])
    .index("by_status", ["status"])
    .index("by_validUntil", ["validUntil"])
    .index("by_source", ["sourceId"])
    .index("by_fileHash", ["fileHash"])
    .index("by_identity", [
      "supermarketId",
      "sourceId",
      "validFrom",
      "validUntil",
    ]),

  flyerPages: defineTable({
    flyerId: v.id("flyers"),
    pageNumber: v.number(),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  })
    .index("by_flyer", ["flyerId"])
    .index("by_flyer_page", ["flyerId", "pageNumber"]),

  offers: defineTable({
    flyerId: v.id("flyers"),
    supermarketId: v.id("supermarkets"),
    name: v.string(),
    brand: v.optional(v.string()),
    quantity: v.optional(v.string()),
    unit: v.optional(v.string()),
    price: v.number(),
    originalPrice: v.optional(v.number()),
    discountPercentage: v.optional(v.number()),
    pageNumber: v.optional(v.number()),
    rawText: v.optional(v.string()),
    extractionConfidence: v.optional(v.number()),
    sourceType: v.literal("flyer"),
    validationStatus: offerValidationStatus,
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_flyer", ["flyerId"])
    .index("by_supermarket", ["supermarketId"])
    .index("by_validationStatus", ["validationStatus"])
    .index("by_confidence", ["extractionConfidence"])
    .index("by_supermarket_status", ["supermarketId", "validationStatus"]),

  flyerErrors: defineTable({
    flyerId: v.optional(v.id("flyers")),
    supermarketId: v.id("supermarkets"),
    stage: flyerErrorStage,
    message: v.string(),
    stack: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
  })
    .index("by_supermarket", ["supermarketId"])
    .index("by_flyer", ["flyerId"])
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),
});
