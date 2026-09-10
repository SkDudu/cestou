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
    headers: { "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { code?: string } | null;
    throw new ApiError(response.status, body?.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const adminApi = {
  login: (email: string, password: string) => apiFetch<void>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => apiFetch<{ id: string; email: string; role: "ADMIN_MASTER" }>("/auth/me"),
  overview: () => apiFetch<{ supermarkets: number; activeFlows: number; runningRuns: number; failedFlyers: number }>("/admin/dashboard/overview"),
  scraperFlows: () => apiFetch<Array<{ id: string; name: string; startUrl: string; status: string; supermarket: { id: string; name: string; slug: string }; latestRun: null | { id: string; status: string; startedAt: string; finishedAt: string | null; flyersFound: number; stepsExecuted: number; error: string | null } }>>("/admin/scraper-flows"),
  createScraperFlow: (data: { supermarketId: string; name: string; startUrl: string; status?: "DRAFT" | "TESTING" | "ACTIVE" | "DISABLED" }) => apiFetch<{ id: string }>("/admin/scraper-flows", { method: "POST", body: JSON.stringify(data) }),
  startScraperRun: (flowId: string) => apiFetch<{ id: string; status: string }>(`/admin/scraper-flows/${flowId}/runs`, { method: "POST" }),
  scraperRuns: () => apiFetch<Array<{ id: string; status: string; startedAt: string; finishedAt: string | null; flyersFound: number; stepsExecuted: number; storesFound: number; error: string | null; flow: { id: string; name: string; supermarket: { name: string } } }>>("/admin/scraper-runs?limit=60"),
  flyers: () => apiFetch<Array<{ id: string; title: string | null; originalUrl: string; status: string; createdAt: string; validFrom: string | null; validUntil: string | null; supermarket: { name: string }; source: { type: string; url: string } }>>("/admin/flyers?limit=100"),
  flyer: (flyerId: string) => apiFetch<{ id: string; title: string | null; status: string; supermarket: { name: string }; offers: Array<{ id: string; name: string; price: string | number }> }>(`/admin/flyers/${flyerId}`),
  offers: () => apiFetch<{ items: Array<{ id: string; name: string; price: string | number; validationStatus: string; supermarket: { name: string }; flyer: { title: string | null } }>; hasMore: boolean; nextCursor: string | null }>("/admin/offers?limit=50"),
  offer: (offerId: string) => apiFetch<{ id: string; name: string; price: string | number; validationStatus: string; supermarket: { name: string }; flyer: { title: string | null } }>(`/admin/offers/${offerId}`),
  updateOfferValidation: (offerId: string, validationStatus: "PENDING" | "VALIDATED" | "REJECTED" | "SUSPICIOUS") => apiFetch(`/admin/offers/${offerId}/validation`, { method: "PATCH", body: JSON.stringify({ validationStatus }) }),
  supermarkets: () => apiFetch<Array<{ id: string; name: string; slug: string; city: string; state: string; active: boolean; _count: { stores: number; flyerSources: number; flyers: number; offers: number } }>>("/admin/supermarkets"),
  supermarket: (supermarketId: string) => apiFetch<{ id: string; name: string; city: string; state: string; active: boolean; stores: Array<{ id: string; name: string; city: string; state: string; active: boolean }>; flyerSources: Array<{ id: string; name: string | null; type: string; url: string; active: boolean }>; scraperFlows: Array<{ id: string; name: string; status: string; startUrl: string }>; _count: { flyers: number; offers: number } }>(`/admin/supermarkets/${supermarketId}`),
  brands: () => apiFetch<Array<{ id: string; name: string; _count: { offers: number; products: number } }>>("/admin/brands"),
  products: () => apiFetch<Array<{ id: string; canonicalName: string; brand: { name: string } | null; _count: { offers: number } }>>("/admin/products"),
  product: (productId: string) => apiFetch<{ canonicalName: string; quantity: string | null; unit: string | null; brand: { name: string } | null; offers: Array<{ id: string; name: string; price: string | number; validationStatus: string; supermarket: { name: string } }>; priceHistory: Array<{ id: string; price: string | number; createdAt: string; supermarket: { name: string } }> }>(`/admin/products/${productId}`),
};
