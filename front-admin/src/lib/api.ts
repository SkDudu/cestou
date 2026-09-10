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
  startScraperRun: (flowId: string) => apiFetch<{ id: string; status: string }>(`/admin/scraper-flows/${flowId}/runs`, { method: "POST" }),
};
