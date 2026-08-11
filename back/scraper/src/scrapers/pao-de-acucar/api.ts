import type { Page } from "playwright";
import type { GpaSearchResponse } from "./mapper.js";

const BASE = "https://www.paodeacucar.com";
const SEARCH_URL = "https://api.vendas.gpa.digital/pa/search/search";

type GpaSession = {
  storeId: number;
  userHash: string;
};

async function readSession(page: Page): Promise<GpaSession | null> {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem("persist:root");
      if (!raw) return null;
      const root = JSON.parse(raw) as Record<string, string>;
      const delivery = JSON.parse(root.deliveryOptions ?? "{}") as {
        storeId?: number;
      };
      const auth = JSON.parse(root.auth ?? "{}") as { userHash?: string };
      const user = JSON.parse(root.user ?? "{}") as { userHash?: string };
      const storeId = Number(delivery.storeId);
      const userHash = auth.userHash ?? user.userHash ?? "";
      if (!Number.isFinite(storeId)) return null;
      return { storeId, userHash };
    } catch {
      return null;
    }
  });
}

/** POST GPA search API using cookies/session from the open page. */
export async function fetchGpaSearch(
  page: Page,
  query: string,
  resultsPerPage = 21,
): Promise<GpaSearchResponse> {
  const session = await readSession(page);
  const body = {
    terms: query,
    page: 1,
    sortBy: "relevance",
    resultsPerPage,
    allowRedirect: true,
    storeId: session?.storeId ?? 461,
    department: "ecom",
    customerPlus: true,
    partner: "fallback",
    userHash: session?.userHash ?? "",
  };

  const res = await page.request.post(SEARCH_URL, {
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      origin: BASE,
      referer: `${BASE}/`,
    },
    data: body,
  });

  if (!res.ok()) {
    throw new Error(`GPA search API ${res.status()}`);
  }

  return (await res.json()) as GpaSearchResponse;
}
