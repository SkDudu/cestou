import type { Page } from "playwright";
import { config } from "../config/index.js";
import type { RawProduct } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { mapBookCard } from "./mapper.js";

const BASE = "https://books.toscrape.com";

/** Demo search on books.toscrape.com. Query unused for filter — site has no groceries. */
export async function searchBooks(
  page: Page,
  _query: string,
  maxProducts = config.maxProducts,
): Promise<RawProduct[]> {
  const url = `${BASE}/catalogue/page-1.html`;
  logger.debug(`goto ${url}`);

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.timeout,
    });
  } catch (err) {
    logger.error(`Failed to access page: ${String(err)}`);
    throw err;
  }

  const cards = page.locator("article.product_pod");
  const count = await cards.count();
  const out: RawProduct[] = [];

  for (let i = 0; i < count && out.length < maxProducts; i++) {
    try {
      const card = cards.nth(i);
      const name =
        (await card.locator("h3 a").getAttribute("title")) ??
        (await card.locator("h3 a").innerText());
      const href = await card.locator("h3 a").getAttribute("href");
      const priceText = await card.locator(".price_color").innerText();
      const img = await card.locator("img").getAttribute("src");

      out.push(
        mapBookCard({
          name,
          priceText,
          url: href ? new URL(href, `${BASE}/catalogue/`).href : BASE,
          imageUrl: img ? new URL(img, `${BASE}/catalogue/`).href : "",
        }),
      );
    } catch (err) {
      logger.error(`Failed to parse product: ${String(err)}`);
    }
  }

  return out;
}
