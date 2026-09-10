export async function clientApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/client${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}
