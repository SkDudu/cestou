import type { Page } from "playwright";
import { config } from "../config/index.js";
import type { RawProduct } from "../types/index.js";
import { logger } from "../utils/logger.js";
import {
  flattenSearch,
  mapItem,
  type MercadappSearchResponse,
} from "./mapper.js";

const STORE_URL = "https://mercadinhossaoluiz.com.br/loja/355";
const MARKET_ID = 355;

/** Search via site UI; capture Mercadapp JSON (no hardcoded OAuth). */
export async function searchSaoLuiz(
  page: Page,
  query: string,
  maxProducts = config.maxProducts,
): Promise<RawProduct[]> {
  logger.debug(`goto ${STORE_URL}`);

  try {
    await page.goto(STORE_URL, {
      waitUntil: "domcontentloaded",
      timeout: config.timeout,
    });
  } catch (err) {
    logger.error(`Failed to access page: ${String(err)}`);
    throw err;
  }

  const input = page.locator('input[placeholder*="Pesquis" i]').first();
  await input.waitFor({ state: "visible", timeout: config.timeout });

  // register before typing
  const waitSearch = page.waitForResponse(
    (res) =>
      res.ok() &&
      res.url().includes(`/markets/${MARKET_ID}/items/search`) &&
      res.url().includes("query="),
    { timeout: config.timeout },
  );

  await input.click();
  await input.fill(query);
  await page.keyboard.press("Enter");

  let data: MercadappSearchResponse;
  try {
    const res = await waitSearch;
    data = (await res.json()) as MercadappSearchResponse;
  } catch (err) {
    logger.error(`Failed to access page: search API — ${String(err)}`);
    throw err;
  }

  const out: RawProduct[] = [];
  for (const item of flattenSearch(data)) {
    if (out.length >= maxProducts) break;
    try {
      const raw = mapItem(item, MARKET_ID);
      if (!raw.name) continue;
      out.push(raw);
    } catch (err) {
      logger.error(`Failed to parse product: ${String(err)}`);
    }
  }

  // ponytail: page 1 only; paginate when maxProducts not enough
  return out;
}
