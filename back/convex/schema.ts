import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  eligibilityEvidence,
  eligibilityStatus,
  eligibilityType,
  offerCondition,
} from "./offerEligibility";

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

const flyerSourceType = v.union(
  v.literal("pdf"),
  v.literal("image"),
  v.literal("web"),
  v.literal("dynamic"),
  v.literal("manual"),
);

const flyerSourceScope = v.union(
  v.literal("supermarket"),
  v.literal("store"),
);

const flyerSourceOperationalStatus = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("error"),
  v.literal("not_configured"),
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

const networkType = v.union(
  v.literal("supermarket"),
  v.literal("wholesale"),
  v.literal("distributor"),
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
    timezone: v.optional(v.string()),
    networkType: v.optional(networkType),
    logoStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  // ponytail: filiais físicas; supermarket = rede
  stores: defineTable({
    supermarketId: v.id("supermarkets"),
    name: v.string(),
    slug: v.string(),
    address: v.optional(v.string()),
    number: v.optional(v.string()),
    neighborhood: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    zipCode: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    phone: v.optional(v.string()),
    url: v.optional(v.string()),
    externalId: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_supermarket", ["supermarketId"])
    .index("by_supermarket_slug", ["supermarketId", "slug"])
    .index("by_supermarket_externalId", ["supermarketId", "externalId"]),

  flyerSources: defineTable({
    supermarketId: v.id("supermarkets"),
    name: v.optional(v.string()),
    type: flyerSourceType,
    url: v.string(),
    /** supermarket = todas filiais; store = só as em flyerSourceStores */
    scope: v.optional(flyerSourceScope),
    /** ops: active | inactive | error | not_configured */
    operationalStatus: v.optional(flyerSourceOperationalStatus),
    flowId: v.optional(v.id("scraperFlows")),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_supermarket", ["supermarketId"])
    .index("by_supermarket_active", ["supermarketId", "active"])
    .index("by_flow", ["flowId"]),

  flyerSourceStores: defineTable({
    sourceId: v.id("flyerSources"),
    storeId: v.id("stores"),
    createdAt: v.number(),
  })
    .index("by_source", ["sourceId"])
    .index("by_store", ["storeId"])
    .index("by_source_store", ["sourceId", "storeId"]),

  flyers: defineTable({
    supermarketId: v.id("supermarkets"),
    sourceId: v.id("flyerSources"),
    /** empty/undefined = todas as filiais da rede (scope supermarket) */
    storeIds: v.optional(v.array(v.id("stores"))),
    title: v.optional(v.string()),
    originalUrl: v.string(),
    /** Provider flyer id (`?id=` / data-flyer-id). Not flyerSources._id. */
    externalId: v.optional(v.string()),
    /** Direct page image/PDF URLs (flow discovery / flipbooks) — skip live scraper. */
    pageUrls: v.optional(v.array(v.string())),
    storageId: v.optional(v.id("_storage")),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    fileHash: v.optional(v.string()),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    /** Set when the lifecycle marks the flyer expired; retention uses this. */
    expiredAt: v.optional(v.number()),
    status: flyerStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_supermarket", ["supermarketId"])
    .index("by_status", ["status"])
    .index("by_validUntil", ["validUntil"])
    .index("by_source", ["sourceId"])
    .index("by_supermarket_fileHash", ["supermarketId", "fileHash"])
    .index("by_identity", [
      "supermarketId",
      "sourceId",
      "validFrom",
      "validUntil",
    ])
    .index("by_supermarket_externalId", ["supermarketId", "externalId"]),

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
    cashPrice: v.optional(v.number()),
    installmentCount: v.optional(v.number()),
    installmentAmount: v.optional(v.number()),
    installmentInterestFree: v.optional(v.boolean()),
    discountPercentage: v.optional(v.number()),
    pageNumber: v.optional(v.number()),
    rawText: v.optional(v.string()),
    extractionConfidence: v.optional(v.number()),
    eligibility: v.optional(eligibilityType),
    conditions: v.optional(v.array(offerCondition)),
    eligibilityConfidence: v.optional(v.number()),
    eligibilityEvidence: v.optional(eligibilityEvidence),
    eligibilityStatus: v.optional(eligibilityStatus),
    sourceType: v.literal("flyer"),
    /** Immutable source snapshot retained after the flyer evidence is purged. */
    sourceFlyerTitle: v.optional(v.string()),
    sourceFlyerUrl: v.optional(v.string()),
    sourceFlyerHash: v.optional(v.string()),
    sourceEvidencePurgedAt: v.optional(v.number()),
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
    .index("by_supermarket_status", ["supermarketId", "validationStatus"])
    .index("by_eligibility", ["eligibility"])
    .index("by_eligibilityStatus", ["eligibilityStatus"]),

  // ponytail: admin has no operator userId yet
  offerEligibilityHistory: defineTable({
    offerId: v.id("offers"),
    previousEligibility: v.optional(eligibilityType),
    newEligibility: eligibilityType,
    previousConfidence: v.optional(v.number()),
    newConfidence: v.optional(v.number()),
    source: v.union(
      v.literal("rules"),
      v.literal("ai"),
      v.literal("human"),
      v.literal("merge"),
    ),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_offer", ["offerId"]),

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
    /** supermarket = geral (toda a rede); store = uma filial */
    scope: v.optional(v.union(v.literal("supermarket"), v.literal("store"))),
    storeId: v.optional(v.id("stores")),
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
    lastRunAt: v.optional(v.number()),
    discoveryAttempts: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_supermarket", ["supermarketId"])
    .index("by_status", ["status"])
    .index("by_store", ["storeId"]),

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
      v.literal("cancelled"),
      v.literal("duplicate"),
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

  scraperSetupEvents: defineTable({
    flowId: v.id("scraperFlows"),
    sessionId: v.optional(v.string()),
    order: v.number(),
    at: v.number(),
    kind: v.union(
      v.literal("flow_created"),
      v.literal("session_start"),
      v.literal("session_close"),
      v.literal("navigation"),
      v.literal("click"),
      v.literal("input"),
      v.literal("scroll"),
      v.literal("scope"),
      v.literal("locate"),
      v.literal("analyze"),
      v.literal("confirm_scope"),
      v.literal("preview"),
      v.literal("save"),
      v.literal("skip_flyer"),
      v.literal("remove_action"),
      v.literal("status"),
    ),
    label: v.string(),
    payload: v.optional(v.string()),
  }).index("by_flow_order", ["flowId", "order"]),

  // --- App cliente (docs/cliente-mvp.md) ---
  // ponytail: sessionToken = auth anônimo; email/senha depois
  users: defineTable({
    sessionToken: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_sessionToken", ["sessionToken"]),

  locations: defineTable({
    userId: v.id("users"),
    label: v.string(),
    city: v.string(),
    state: v.string(),
    neighborhood: v.optional(v.string()),
    addressText: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_default", ["userId", "isDefault"]),

  favoriteStores: defineTable({
    userId: v.id("users"),
    supermarketId: v.id("supermarkets"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_store", ["userId", "supermarketId"]),

  shoppingLists: defineTable({
    userId: v.id("users"),
    name: v.string(),
    locationId: v.optional(v.id("locations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  shoppingListItems: defineTable({
    listId: v.id("shoppingLists"),
    queryText: v.string(),
    offerId: v.optional(v.id("offers")),
    quantity: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_list", ["listId"]),
});
