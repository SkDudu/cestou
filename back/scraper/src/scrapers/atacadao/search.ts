import { config } from "../config/index.js";
import type { RawProduct } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { mapProduct, type VtexProduct } from "./mapper.js";
import { atacadaoHeaders, ensureFortalezaRegion } from "./store.js";

const SEARCH =
  "https://www.atacadao.com.br/io/api/catalog_system/pub/products/search";

/** VTEX window max: _to - _from <= 49 */
const PAGE = 50;

async function fetchPage(
  query: string,
  from: number,
  to: number,
): Promise<VtexProduct[]> {
  const url = `${SEARCH}?ft=${encodeURIComponent(query)}&_from=${from}&_to=${to}`;
  const res = await fetch(url, {
    headers: atacadaoHeaders(),
    signal: AbortSignal.timeout(config.timeout),
  });
  if (!res.ok) {
    throw new Error(`Atacadão search API ${res.status}`);
  }
  const data = (await res.json()) as VtexProduct[];
  return Array.isArray(data) ? data : [];
}

/** Search via VTEX catalog API (no DOM). Fortaleza CEP when region resolves. */
export async function searchAtacadao(
  query: string,
  maxProducts = config.maxProducts,
): Promise<RawProduct[]> {
  await ensureFortalezaRegion();
  logger.debug(`Atacadão search: ${query}`);

  const out: RawProduct[] = [];
  let from = 0;

  while (out.length < maxProducts) {
    const remaining = maxProducts - out.length;
    const size = Math.min(PAGE, remaining);
    const to = from + size - 1;

    let page: VtexProduct[];
    try {
      page = await fetchPage(query, from, to);
    } catch (err) {
      logger.error(`Failed to access page: search API — ${String(err)}`);
      throw err;
    }

    if (page.length === 0) break;

    for (const item of page) {
      if (out.length >= maxProducts) break;
      try {
        const raw = mapProduct(item);
        if (!raw) continue;
        out.push(raw);
      } catch (err) {
        logger.error(`Failed to parse product: ${String(err)}`);
      }
    }

    if (page.length < size) break;
    from = to + 1;
  }

  return out;
}
