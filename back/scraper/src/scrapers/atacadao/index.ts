import type { RawProduct, SupermarketScraper } from "../types/index.js";
import { searchAtacadao } from "./search.js";

/** Atacadão — VTEX catalog API (no Playwright). */
export class AtacadaoScraper implements SupermarketScraper {
  name = "Atacadão";
  slug = "atacadao";
  website = "https://www.atacadao.com.br";

  async search(
    query: string,
    opts?: { maxProducts?: number },
  ): Promise<RawProduct[]> {
    return searchAtacadao(query, opts?.maxProducts);
  }

  async close(): Promise<void> {
    // ponytail: fetch-only adapter, nothing to close
  }
}
