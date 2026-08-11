import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const validationStatus = v.union(
  v.literal("pending"),
  v.literal("validated"),
  v.literal("suspicious"),
  v.literal("invalid"),
);

export default defineSchema({
  products: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    brand: v.optional(v.string()),
    brandSource: v.optional(v.string()),
    brandConfidence: v.optional(v.number()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    barcode: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalizedName", ["normalizedName"])
    .index("by_barcode", ["barcode"]),

  supermarkets: defineTable({
    name: v.string(),
    slug: v.string(),
    website: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  rawProducts: defineTable({
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
  })
    .index("by_supermarket_externalId", ["supermarketId", "externalId"])
    .index("by_job", ["scrapingJobId"])
    .index("by_collectedAt", ["collectedAt"])
    .index("by_supermarket_collectedAt", ["supermarketId", "collectedAt"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["supermarketId"],
    }),

  prices: defineTable({
    productId: v.id("products"),
    supermarketId: v.id("supermarkets"),
    price: v.number(),
    originalPrice: v.optional(v.number()),
    discount: v.optional(v.number()),
    collectedAt: v.number(),
    source: v.string(),
  })
    .index("by_product", ["productId"])
    .index("by_supermarket", ["supermarketId"])
    .index("by_product_supermarket", ["productId", "supermarketId"])
    .index("by_collectedAt", ["collectedAt"]),

  scrapingJobs: defineTable({
    supermarketId: v.id("supermarkets"),
    type: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    query: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    productsFound: v.optional(v.number()),
    productsSaved: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_supermarket", ["supermarketId"])
    .index("by_startedAt", ["startedAt"])
    .index("by_status", ["status"]),

  productValidations: defineTable({
    rawProductId: v.id("rawProducts"),
    status: validationStatus,
    /** rules | human | ai — SPEC 006 */
    source: v.optional(
      v.union(v.literal("rules"), v.literal("human"), v.literal("ai")),
    ),
    /** status from rules before human override */
    automatedStatus: v.optional(validationStatus),
    score: v.optional(v.number()),
    issues: v.optional(
      v.array(
        v.object({
          ruleId: v.string(),
          severity: v.union(
            v.literal("info"),
            v.literal("warning"),
            v.literal("error"),
          ),
          code: v.string(),
          message: v.string(),
          field: v.optional(v.string()),
          value: v.optional(v.any()),
        }),
      ),
    ),
    rulesVersion: v.optional(v.string()),
    reason: v.optional(v.string()),
    notes: v.optional(v.string()),
    validatedAt: v.optional(v.number()),
  })
    .index("by_rawProduct", ["rawProductId"])
    .index("by_status", ["status"])
    .index("by_source", ["source"]),

  scrapeErrors: defineTable({
    scrapingJobId: v.optional(v.id("scrapingJobs")),
    supermarketId: v.id("supermarkets"),
    query: v.optional(v.string()),
    type: v.string(),
    message: v.string(),
    stack: v.optional(v.string()),
    url: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
  })
    .index("by_supermarket", ["supermarketId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_job", ["scrapingJobId"])
    .index("by_status", ["status"]),
});
