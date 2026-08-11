import type { Page } from "playwright";
import { config } from "../config/index.js";
import type { RawProduct } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { fetchGpaSearch } from "./api.js";
import {
  flattenSearch,
  mapProduct,
  type GpaSearchResponse,
} from "./mapper.js";
import { ensureFortalezaStore } from "./store.js";

const BASE = "https://www.paodeacucar.com";

async function loadSearchResponse(
  page: Page,
  query: string,
): Promise<GpaSearchResponse> {
  const url = `${BASE}/busca?terms=${encodeURIComponent(query)}`;

  const waitSearch = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.ok() &&
      res.url().includes("/pa/search/search"),
    { timeout: config.timeout },
  );

  logger.debug(`goto ${url}`);
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: config.timeout,
  });

  try {
    const res = await waitSearch;
    return (await res.json()) as GpaSearchResponse;
  } catch {
    logger.debug("search intercept missed — calling GPA API directly");
    return fetchGpaSearch(page, query);
  }
}

/** Search via /busca + GPA JSON (intercept or direct API). */
export async function searchPaoDeAcucar(
  page: Page,
  query: string,
  maxProducts = config.maxProducts,
): Promise<RawProduct[]> {
  await ensureFortalezaStore(page);

  let data: GpaSearchResponse;
  try {
    data = await loadSearchResponse(page, query);
  } catch (err) {
    logger.error(`Failed to access page: search API — ${String(err)}`);
    throw err;
  }

  const out: RawProduct[] = [];
  for (const item of flattenSearch(data)) {
    if (out.length >= maxProducts) break;
    try {
      const raw = mapProduct(item);
      if (!raw.name) continue;
      out.push(raw);
    } catch (err) {
      logger.error(`Failed to parse product: ${String(err)}`);
    }
  }

  // ponytail: page 1 only; paginate when maxProducts not enough
  return out;
}
