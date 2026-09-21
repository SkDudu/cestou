const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code?: string) {
    super(code ?? `API request failed with ${status}`);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { code?: string } | null;
    throw new ApiError(response.status, body?.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type OfferListItem = {
  id: string;
  name: string;
  price: string | number;
  originalPrice: string | number | null;
  cashPrice: string | number | null;
  installmentCount: number | null;
  installmentAmount: string | number | null;
  installmentInterestFree: boolean | null;
  brand: string | null;
  brandId: string | null;
  quantity: string | null;
  quantityValue: number | null;
  unit: string | null;
  unitNormalized: string | null;
  pageNumber: number | null;
  extractionConfidence: number | null;
  validationStatus: string;
  eligibility: string | null;
  eligibilityStatus: string | null;
  eligibilityConfidence: number | null;
  conditions?: Array<{
    type?: string;
    name?: string;
    description?: string;
    requirement?: string;
  }> | null;
  membershipName: string | null;
  memberPrice: string | number | null;
  requiresMembership: boolean | null;
  validFrom: string | null;
  validUntil: string | null;
  canonicalProductId: string | null;
  createdAt: string;
  supermarket: { id: string; name: string };
  flyer: { id: string; title: string | null };
  canonicalProduct?: { id: string; category: string | null } | null;
};

export const adminApi = {
  login: (email: string, password: string) => apiFetch<void>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST", body: "{}" }),
  me: () => apiFetch<{ id: string; email: string; role: "ADMIN_MASTER" }>("/auth/me"),
  overview: () => apiFetch<{ supermarkets: number; activeFlows: number; runningRuns: number; failedFlyers: number; pendingOffers: number; workerCount: number }>("/admin/dashboard/overview"),
  scraperFlows: () => apiFetch<Array<{ id: string; name: string; startUrl: string; status: string; scope: string | null; storeId: string | null; version: number; lastRunAt: string | null; nextRunAt: string | null; updatedAt: string; stepCount: number; supermarket: { id: string; name: string; slug: string }; store: { id: string; name: string; slug: string } | null; latestRun: null | { id: string; status: string; startedAt: string; finishedAt: string | null; flyersFound: number; stepsExecuted: number; error: string | null; log: string | null } }>>("/admin/scraper-flows"),
  createScraperFlow: (data: {
    supermarketId: string;
    storeId?: string;
    scope?: "SUPERMARKET" | "STORE";
    name: string;
    startUrl?: string;
    status?: "DRAFT" | "TESTING" | "ACTIVE" | "DISABLED";
  }) => apiFetch<{ id: string }>("/admin/scraper-flows", { method: "POST", body: JSON.stringify(data) }),
  startScraperRun: (flowId: string) => apiFetch<{ id: string; status: string }>(`/admin/scraper-flows/${flowId}/runs`, { method: "POST" }),
  scraperRuns: () => apiFetch<Array<{ id: string; status: string; startedAt: string; finishedAt: string | null; flyersFound: number; stepsExecuted: number; storesFound: number; error: string | null; log: string | null; flow: { id: string; name: string; supermarket: { name: string } } }>>("/admin/scraper-runs?limit=60"),
  scraperRun: (runId: string) => apiFetch<{ id: string; status: string; startedAt: string; finishedAt: string | null; flyersFound: number; stepsExecuted: number; storesFound: number; error: string | null; log: string | null; flow: { id: string; name: string; supermarket: { name: string } }; events: Array<{ id: string; sequence: number; type: string; payload: unknown; createdAt: string }> }>(`/admin/scraper-runs/${runId}`),
  cancelScraperRun: (runId: string) => apiFetch(`/admin/scraper-runs/${runId}/cancel`, { method: "POST" }),
  extractionErrors: () => apiFetch<Array<{ id: string; stage: string; message: string; status: string; createdAt: string; supermarket: { name: string }; flyer: { id: string; title: string | null } | null }>>("/admin/extraction/errors"),
  extractionError: (errorId: string) => apiFetch<{ id: string; stage: string; message: string; stack: string | null; status: string; createdAt: string; supermarket: { name: string }; flyer: { id: string; title: string | null } | null }>(`/admin/extraction/errors/${errorId}`),
  updateExtractionError: (errorId: string, status: string) => apiFetch(`/admin/extraction/errors/${errorId}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  resolveOpenExtractionErrors: () =>
    apiFetch<{ count: number }>("/admin/extraction/errors/resolve-open", { method: "POST" }),
  flyers: () => apiFetch<Array<{ id: string; title: string | null; originalUrl: string; status: string; createdAt: string; validFrom: string | null; validUntil: string | null; validatedOfferCount: number; supermarket: { id: string; name: string }; source: { id: string; type: string; url: string } }>>("/admin/flyers?limit=100"),
  flyer: (flyerId: string) => apiFetch<{ id: string; title: string | null; originalUrl: string; status: string; fileHash: string | null; validFrom: string | null; validUntil: string | null; supermarket: { id: string; name: string }; source: { id: string; type: string; url: string }; pages: Array<{ id: string; pageNumber: number; filePath: string }>; offers: Array<{ id: string; name: string; price: string | number; pageNumber: number | null; validationStatus: string; installmentCount: number | null; installmentAmount: string | number | null; installmentInterestFree: boolean | null }> }>(`/admin/flyers/${flyerId}`),
  normalizeFlyer: (flyerId: string) => apiFetch<{ normalized: number; resolved: number; created: number; autoValidation: { validated: number; suspicious: number; rejected: number; total: number } }>(`/admin/flyers/${flyerId}/normalize`, { method: "POST" }),
  normalizationBackfill: (limit = 50) => apiFetch<{ processed: number }>(`/admin/normalization/backfill`, { method: "POST", body: JSON.stringify({ limit }) }),
  offers: (cursor?: string, validationStatus?: string) => apiFetch<{ items: OfferListItem[]; hasMore: boolean; nextCursor: string | null }>(`/admin/offers?limit=100${cursor ? `&cursor=${cursor}` : ""}${validationStatus ? `&validationStatus=${validationStatus}` : ""}`),
  offer: (offerId: string) => apiFetch<{ id: string; name: string; brand: string | null; quantity: string | null; quantityValue: number | null; unit: string | null; unitNormalized: string | null; price: string | number; originalPrice: string | number | null; cashPrice: string | number | null; installmentCount: number | null; installmentAmount: string | number | null; installmentInterestFree: boolean | null; discountPercentage: string | number | null; pageNumber: number | null; rawText: string | null; extractionConfidence: number | null; eligibility: string | null; eligibilityStatus: string | null; eligibilityConfidence: number | null; conditions?: Array<{ type?: string; name?: string; description?: string; requirement?: string }> | null; membershipName: string | null; normalizedBrand: string | null; brandId: string | null; canonicalProductId: string | null; validationStatus: string; validFrom: string | null; validUntil: string | null; sourceFlyerTitle: string | null; sourceFlyerUrl: string | null; supermarket: { id: string; name: string }; flyer: { id: string; title: string | null } | null; brandRecord: { id: string; name: string } | null; canonicalProduct: { id: string; canonicalName: string; category: string | null } | null }>(`/admin/offers/${offerId}`),
  priceComparison: () => apiFetch<Array<{ productId: string; productName: string; marketCount: number; minPrice: number; maxPrice: number; offers: Array<{ id: string; supermarketName: string; price: number }> }>>("/admin/prices/compare"),
  catalogHealth: () => apiFetch<{ totalOffers: number; withBrand: number; withCanonical: number; pendingValidation: number; suspicious: number; singleMarketProducts: number; pctWithBrand: number; pctWithCanonical: number }>("/admin/catalog/health"),
  updateOfferValidation: (offerId: string, validationStatus: "PENDING" | "VALIDATED" | "REJECTED" | "SUSPICIOUS") => apiFetch(`/admin/offers/${offerId}/validation`, { method: "PATCH", body: JSON.stringify({ validationStatus }) }),
  bulkValidateFlyer: (flyerId: string, validationStatus: "PENDING" | "VALIDATED" | "REJECTED" | "SUSPICIOUS") => apiFetch<{ count: number }>("/admin/offers/bulk-validation", { method: "PATCH", body: JSON.stringify({ flyerId, validationStatus }) }),
  updateOfferCatalog: (offerId: string, data: { name?: string; brandId?: string | null; canonicalProductId?: string | null }) => apiFetch(`/admin/offers/${offerId}/catalog`, { method: "PATCH", body: JSON.stringify(data) }),
  supermarkets: () => apiFetch<Array<{ id: string; name: string; slug: string; city: string; state: string; active: boolean; websiteUrl: string | null; networkType: string | null; logoPath: string | null; _count: { stores: number; flyerSources: number; flyers: number; offers: number } }>>("/admin/supermarkets"),
  createSupermarket: (data: { name: string; websiteUrl?: string; networkType?: "SUPERMARKET" | "WHOLESALE" | "DISTRIBUTOR" }) => apiFetch<{ id: string }>("/admin/supermarkets", { method: "POST", body: JSON.stringify(data) }),
  createStore: (supermarketId: string, data: { name: string; url?: string }) =>
    apiFetch<{ id: string; name: string; slug: string; url: string | null; neighborhood: string | null; city: string; state: string; externalId: string | null; active: boolean }>(
      `/admin/supermarkets/${supermarketId}/stores`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  supermarket: (supermarketId: string) => apiFetch<{ id: string; name: string; slug: string; city: string; state: string; active: boolean; websiteUrl: string | null; networkType: string | null; logoPath: string | null; stores: Array<{ id: string; name: string; slug: string; url: string | null; neighborhood: string | null; city: string; state: string; externalId: string | null; active: boolean }>; flyerSources: Array<{ id: string; name: string | null; type: string; url: string; scope: string | null; operationalStatus: string | null; active: boolean; flowId: string | null }>; scraperFlows: Array<{ id: string; name: string; status: string; startUrl: string }>; _count: { flyers: number; offers: number } }>(`/admin/supermarkets/${supermarketId}`),
  brands: () => apiFetch<Array<{ id: string; name: string; slug: string; aliases: string[]; _count: { offers: number; products: number } }>>("/admin/brands"),
  createBrand: (data: { name: string }) =>
    apiFetch<{ id: string; name: string; slug: string; aliases: string[]; _count: { offers: number; products: number } }>("/admin/brands", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  products: () => apiFetch<Array<{ id: string; canonicalName: string; slug: string; matchKey: string; quantity: string | null; unit: string | null; category: string | null; brandId: string | null; brand: { id: string; name: string } | null; _count: { offers: number } }>>("/admin/products"),
  product: (productId: string) => apiFetch<{ id: string; canonicalName: string; slug: string; matchKey: string; quantity: string | null; unit: string | null; category: string | null; brandId: string | null; brand: { id: string; name: string } | null; offers: Array<{ id: string; name: string; price: string | number; originalPrice: string | number | null; memberPrice: string | number | null; requiresMembership: boolean | null; discountPercentage: string | number | null; validationStatus: string; validFrom: string | null; validUntil: string | null; supermarket: { name: string } }>; priceHistory: Array<{ id: string; price: string | number; createdAt: string; supermarket: { name: string } }> }>(`/admin/products/${productId}`),
};

export async function loadOfferPages(validationStatus?: string) {
  const items: OfferListItem[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let i = 0; i < 15; i++) {
    const page = await adminApi.offers(cursor, validationStatus);
    for (const row of page.items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      items.push(row);
    }
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return items;
}
