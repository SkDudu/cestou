-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN_MASTER', 'CLIENT');

-- CreateEnum
CREATE TYPE "FlyerStatus" AS ENUM ('DISCOVERED', 'DOWNLOADING', 'DOWNLOADED', 'PROCESSING', 'PARTIALLY_PROCESSED', 'PROCESSED', 'EXPIRED', 'DUPLICATE', 'FAILED');

-- CreateEnum
CREATE TYPE "FlyerSourceType" AS ENUM ('PDF', 'IMAGE', 'WEB', 'DYNAMIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "FlyerSourceScope" AS ENUM ('SUPERMARKET', 'STORE');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "OfferValidationStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED', 'SUSPICIOUS');

-- CreateEnum
CREATE TYPE "Eligibility" AS ENUM ('ALL_CUSTOMERS', 'MEMBERS_ONLY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScraperFlowStatus" AS ENUM ('DRAFT', 'TESTING', 'ACTIVE', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "ScraperRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'CANCELLED', 'DUPLICATE', 'FAILED');

-- CreateEnum
CREATE TYPE "NetworkType" AS ENUM ('SUPERMARKET', 'WHOLESALE', 'DISTRIBUTOR');

-- CreateEnum
CREATE TYPE "FlyerErrorStage" AS ENUM ('DISCOVERY', 'DOWNLOAD', 'STORAGE', 'OCR', 'PARSER', 'VALIDATION', 'AI_VISION');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supermarket" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "websiteUrl" TEXT,
    "timezone" TEXT,
    "networkType" "NetworkType",
    "logoPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supermarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" UUID NOT NULL,
    "supermarketId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "number" TEXT,
    "neighborhood" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "url" TEXT,
    "externalId" TEXT,
    "active" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlyerSource" (
    "id" UUID NOT NULL,
    "supermarketId" UUID NOT NULL,
    "flowId" UUID,
    "name" TEXT,
    "type" "FlyerSourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "scope" "FlyerSourceScope",
    "operationalStatus" "OperationalStatus",
    "active" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlyerSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlyerSourceStore" (
    "sourceId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlyerSourceStore_pkey" PRIMARY KEY ("sourceId","storeId")
);

-- CreateTable
CREATE TABLE "Flyer" (
    "id" UUID NOT NULL,
    "supermarketId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "title" TEXT,
    "originalUrl" TEXT NOT NULL,
    "externalId" TEXT,
    "filePath" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "fileHash" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "status" "FlyerStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlyerStore" (
    "flyerId" UUID NOT NULL,
    "storeId" UUID NOT NULL,

    CONSTRAINT "FlyerStore_pkey" PRIMARY KEY ("flyerId","storeId")
);

-- CreateTable
CREATE TABLE "FlyerPage" (
    "id" UUID NOT NULL,
    "flyerId" UUID NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "fileHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlyerPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "flyerId" UUID NOT NULL,
    "supermarketId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" TEXT,
    "unit" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "originalPrice" DECIMAL(12,2),
    "cashPrice" DECIMAL(12,2),
    "installmentCount" INTEGER,
    "installmentAmount" DECIMAL(12,2),
    "installmentInterestFree" BOOLEAN,
    "discountPercentage" DECIMAL(5,2),
    "pageNumber" INTEGER,
    "rawText" TEXT,
    "extractionConfidence" DOUBLE PRECISION,
    "eligibility" "Eligibility",
    "conditions" JSONB,
    "eligibilityConfidence" DOUBLE PRECISION,
    "eligibilityEvidence" JSONB,
    "eligibilityStatus" "EligibilityStatus",
    "normalizedName" TEXT,
    "normalizedBrand" TEXT,
    "quantityValue" DOUBLE PRECISION,
    "unitNormalized" TEXT,
    "brandId" UUID,
    "canonicalProductId" UUID,
    "publicPrice" DECIMAL(12,2),
    "memberPrice" DECIMAL(12,2),
    "requiresMembership" BOOLEAN,
    "membershipName" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'flyer',
    "sourceFlyerTitle" TEXT,
    "sourceFlyerUrl" TEXT,
    "sourceFlyerHash" TEXT,
    "sourceEvidencePurgedAt" TIMESTAMP(3),
    "validationStatus" "OfferValidationStatus" NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferEligibilityHistory" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "previousEligibility" "Eligibility",
    "newEligibility" "Eligibility" NOT NULL,
    "previousConfidence" DOUBLE PRECISION,
    "newConfidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferEligibilityHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlyerExtraction" (
    "id" UUID NOT NULL,
    "flyerId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "ExtractionStatus" NOT NULL,
    "rawResponse" TEXT,
    "offerCount" INTEGER,
    "extractionConfidence" DOUBLE PRECISION,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlyerExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlyerError" (
    "id" UUID NOT NULL,
    "flyerId" UUID,
    "supermarketId" UUID NOT NULL,
    "stage" "FlyerErrorStage" NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlyerError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScraperFlow" (
    "id" UUID NOT NULL,
    "supermarketId" UUID NOT NULL,
    "storeId" UUID,
    "scope" "FlyerSourceScope",
    "name" TEXT NOT NULL,
    "startUrl" TEXT NOT NULL,
    "status" "ScraperFlowStatus" NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB,
    "schedule" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "discoveryAttempts" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScraperFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScraperStep" (
    "id" UUID NOT NULL,
    "flowId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScraperStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScraperRun" (
    "id" UUID NOT NULL,
    "flowId" UUID NOT NULL,
    "status" "ScraperRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "stepsExecuted" INTEGER NOT NULL DEFAULT 0,
    "flyersFound" INTEGER NOT NULL DEFAULT 0,
    "storesFound" INTEGER NOT NULL DEFAULT 0,
    "log" TEXT,

    CONSTRAINT "ScraperRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScraperRunEvent" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScraperRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScraperSetupEvent" (
    "id" UUID NOT NULL,
    "flowId" UUID NOT NULL,
    "sessionId" TEXT,
    "order" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "payload" JSONB,

    CONSTRAINT "ScraperSetupEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalProduct" (
    "id" UUID NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brandId" UUID,
    "quantity" TEXT,
    "unit" TEXT,
    "category" TEXT,
    "matchKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" UUID NOT NULL,
    "canonicalProductId" UUID NOT NULL,
    "supermarketId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "originalPrice" DECIMAL(12,2),
    "memberPrice" DECIMAL(12,2),
    "requiresMembership" BOOLEAN,
    "membershipName" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "neighborhood" TEXT,
    "addressText" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteStore" (
    "userId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteStore_pkey" PRIMARY KEY ("userId","storeId")
);

-- CreateTable
CREATE TABLE "FavoriteProduct" (
    "userId" UUID NOT NULL,
    "canonicalProductId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteProduct_pkey" PRIMARY KEY ("userId","canonicalProductId")
);

-- CreateTable
CREATE TABLE "ShoppingList" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListItem" (
    "id" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "queryText" TEXT NOT NULL,
    "offerId" UUID,
    "canonicalProductId" UUID,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Supermarket_slug_key" ON "Supermarket"("slug");

-- CreateIndex
CREATE INDEX "Store_supermarketId_idx" ON "Store"("supermarketId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_supermarketId_slug_key" ON "Store"("supermarketId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Store_supermarketId_externalId_key" ON "Store"("supermarketId", "externalId");

-- CreateIndex
CREATE INDEX "FlyerSource_supermarketId_active_idx" ON "FlyerSource"("supermarketId", "active");

-- CreateIndex
CREATE INDEX "FlyerSource_flowId_idx" ON "FlyerSource"("flowId");

-- CreateIndex
CREATE INDEX "FlyerSourceStore_storeId_idx" ON "FlyerSourceStore"("storeId");

-- CreateIndex
CREATE INDEX "Flyer_supermarketId_fileHash_idx" ON "Flyer"("supermarketId", "fileHash");

-- CreateIndex
CREATE INDEX "Flyer_supermarketId_sourceId_validFrom_validUntil_idx" ON "Flyer"("supermarketId", "sourceId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "Flyer_supermarketId_externalId_idx" ON "Flyer"("supermarketId", "externalId");

-- CreateIndex
CREATE INDEX "Flyer_status_validUntil_idx" ON "Flyer"("status", "validUntil");

-- CreateIndex
CREATE INDEX "Flyer_sourceId_idx" ON "Flyer"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FlyerPage_flyerId_pageNumber_key" ON "FlyerPage"("flyerId", "pageNumber");

-- CreateIndex
CREATE INDEX "Offer_validationStatus_idx" ON "Offer"("validationStatus");

-- CreateIndex
CREATE INDEX "Offer_supermarketId_validationStatus_idx" ON "Offer"("supermarketId", "validationStatus");

-- CreateIndex
CREATE INDEX "Offer_canonicalProductId_validUntil_idx" ON "Offer"("canonicalProductId", "validUntil");

-- CreateIndex
CREATE INDEX "Offer_brandId_idx" ON "Offer"("brandId");

-- CreateIndex
CREATE INDEX "Offer_normalizedName_idx" ON "Offer"("normalizedName");

-- CreateIndex
CREATE INDEX "OfferEligibilityHistory_offerId_createdAt_idx" ON "OfferEligibilityHistory"("offerId", "createdAt");

-- CreateIndex
CREATE INDEX "FlyerExtraction_flyerId_pageNumber_idx" ON "FlyerExtraction"("flyerId", "pageNumber");

-- CreateIndex
CREATE INDEX "FlyerExtraction_pageId_model_promptVersion_idx" ON "FlyerExtraction"("pageId", "model", "promptVersion");

-- CreateIndex
CREATE INDEX "FlyerError_supermarketId_status_createdAt_idx" ON "FlyerError"("supermarketId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FlyerError_flyerId_idx" ON "FlyerError"("flyerId");

-- CreateIndex
CREATE INDEX "ScraperFlow_supermarketId_status_idx" ON "ScraperFlow"("supermarketId", "status");

-- CreateIndex
CREATE INDEX "ScraperFlow_storeId_idx" ON "ScraperFlow"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ScraperStep_flowId_order_key" ON "ScraperStep"("flowId", "order");

-- CreateIndex
CREATE INDEX "ScraperRun_flowId_startedAt_idx" ON "ScraperRun"("flowId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScraperRunEvent_runId_sequence_key" ON "ScraperRunEvent"("runId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ScraperSetupEvent_flowId_order_key" ON "ScraperSetupEvent"("flowId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalProduct_slug_key" ON "CanonicalProduct"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalProduct_matchKey_key" ON "CanonicalProduct"("matchKey");

-- CreateIndex
CREATE INDEX "CanonicalProduct_brandId_idx" ON "CanonicalProduct"("brandId");

-- CreateIndex
CREATE INDEX "PriceHistory_canonicalProductId_supermarketId_createdAt_idx" ON "PriceHistory"("canonicalProductId", "supermarketId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceHistory_offerId_idx" ON "PriceHistory"("offerId");

-- CreateIndex
CREATE INDEX "Location_userId_isDefault_idx" ON "Location"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "ShoppingList_userId_idx" ON "ShoppingList"("userId");

-- CreateIndex
CREATE INDEX "ShoppingListItem_listId_idx" ON "ShoppingListItem"("listId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_supermarketId_fkey" FOREIGN KEY ("supermarketId") REFERENCES "Supermarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerSource" ADD CONSTRAINT "FlyerSource_supermarketId_fkey" FOREIGN KEY ("supermarketId") REFERENCES "Supermarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerSource" ADD CONSTRAINT "FlyerSource_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ScraperFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerSourceStore" ADD CONSTRAINT "FlyerSourceStore_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "FlyerSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerSourceStore" ADD CONSTRAINT "FlyerSourceStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flyer" ADD CONSTRAINT "Flyer_supermarketId_fkey" FOREIGN KEY ("supermarketId") REFERENCES "Supermarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flyer" ADD CONSTRAINT "Flyer_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "FlyerSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerStore" ADD CONSTRAINT "FlyerStore_flyerId_fkey" FOREIGN KEY ("flyerId") REFERENCES "Flyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerStore" ADD CONSTRAINT "FlyerStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerPage" ADD CONSTRAINT "FlyerPage_flyerId_fkey" FOREIGN KEY ("flyerId") REFERENCES "Flyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_flyerId_fkey" FOREIGN KEY ("flyerId") REFERENCES "Flyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_supermarketId_fkey" FOREIGN KEY ("supermarketId") REFERENCES "Supermarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEligibilityHistory" ADD CONSTRAINT "OfferEligibilityHistory_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerExtraction" ADD CONSTRAINT "FlyerExtraction_flyerId_fkey" FOREIGN KEY ("flyerId") REFERENCES "Flyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerExtraction" ADD CONSTRAINT "FlyerExtraction_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "FlyerPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerError" ADD CONSTRAINT "FlyerError_flyerId_fkey" FOREIGN KEY ("flyerId") REFERENCES "Flyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyerError" ADD CONSTRAINT "FlyerError_supermarketId_fkey" FOREIGN KEY ("supermarketId") REFERENCES "Supermarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScraperFlow" ADD CONSTRAINT "ScraperFlow_supermarketId_fkey" FOREIGN KEY ("supermarketId") REFERENCES "Supermarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScraperFlow" ADD CONSTRAINT "ScraperFlow_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScraperStep" ADD CONSTRAINT "ScraperStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ScraperFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScraperRun" ADD CONSTRAINT "ScraperRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ScraperFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScraperRunEvent" ADD CONSTRAINT "ScraperRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScraperRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScraperSetupEvent" ADD CONSTRAINT "ScraperSetupEvent_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ScraperFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalProduct" ADD CONSTRAINT "CanonicalProduct_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_supermarketId_fkey" FOREIGN KEY ("supermarketId") REFERENCES "Supermarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteStore" ADD CONSTRAINT "FavoriteStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteStore" ADD CONSTRAINT "FavoriteStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteProduct" ADD CONSTRAINT "FavoriteProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteProduct" ADD CONSTRAINT "FavoriteProduct_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
