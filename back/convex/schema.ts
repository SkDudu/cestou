import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  v.literal("AI_VISION"),
);

const extractionProvider = v.union(
  v.literal("mimo-v2.5"),
  v.literal("tesseract-rules"),
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
    /** Direct page image/PDF URLs (flow discovery / flipbooks) — skip live scraper. */
    pageUrls: v.optional(v.array(v.string())),
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

  flyerExtractions: defineTable({
    flyerId: v.id("flyers"),
    pageId: v.id("flyerPages"),
    pageNumber: v.number(),
    provider: extractionProvider,
    model: v.string(),
    promptVersion: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    rawResponse: v.optional(v.string()),
    offerCount: v.optional(v.number()),
    extractionConfidence: v.optional(v.number()),
    error: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_flyer", ["flyerId"])
    .index("by_flyer_page", ["flyerId", "pageNumber"])
    .index("by_page", ["pageId"])
    .index("by_page_model_prompt", ["pageId", "model", "promptVersion"]),

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

  scraperFlows: defineTable({
    supermarketId: v.id("supermarkets"),
    name: v.string(),
    startUrl: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("testing"),
      v.literal("active"),
      v.literal("disabled"),
      v.literal("error"),
    ),
    version: v.number(),
    config: v.optional(v.string()),
    schedule: v.optional(v.string()),
    nextRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_supermarket", ["supermarketId"])
    .index("by_status", ["status"]),

  scraperSteps: defineTable({
    flowId: v.id("scraperFlows"),
    order: v.number(),
    type: v.union(
      v.literal("navigate"),
      v.literal("click"),
      v.literal("select"),
      v.literal("input"),
      v.literal("wait"),
      v.literal("scroll"),
      v.literal("discover-store"),
      v.literal("discover-flyer"),
      v.literal("capture-network"),
      v.literal("download-flyers"),
      v.literal("extract-offers"),
      v.literal("select-scope"),
    ),
    config: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_flow_order", ["flowId", "order"]),

  scraperRuns: defineTable({
    flowId: v.id("scraperFlows"),
    status: v.union(
      v.literal("running"),
      v.literal("success"),
      v.literal("partial"),
      v.literal("failed"),
    ),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    stepsExecuted: v.number(),
    flyersFound: v.number(),
    storesFound: v.number(),
    log: v.optional(v.string()),
  })
    .index("by_flow", ["flowId"])
    .index("by_startedAt", ["startedAt"]),
});
