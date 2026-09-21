const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1/client";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(code ?? `API request failed with ${status}`);
  }
}

export async function clientApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    throw new ApiError(response.status, body?.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type ClientSession = { id: string; email: string };

export const clientAuth = {
  login: (email: string, password: string) =>
    clientApi<void>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    clientApi<void>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => clientApi<ClientSession>("/auth/me"),
  logout: () => clientApi<void>("/auth/logout", { method: "POST", body: "{}" }),
};
