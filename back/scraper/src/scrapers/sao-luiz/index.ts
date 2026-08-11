import type { BrowserContext, Page } from "playwright";
import { closeBrowser, newContext } from "../services/browser.js";
import type { RawProduct, SupermarketScraper } from "../types/index.js";
import { searchSaoLuiz } from "./search.js";

export class SaoLuizScraper implements SupermarketScraper {
  name = "Mercadinhos São Luiz";
  slug = "sao-luiz";
  website = "https://mercadinhossaoluiz.com.br/loja/355";

  private ctx: BrowserContext | null = null;
  private page: Page | null = null;

  private async ensurePage(): Promise<Page> {
    if (!this.page) {
      this.ctx = await newContext();
      this.page = await this.ctx.newPage();
    }
    return this.page;
  }

  async search(
    query: string,
    opts?: { maxProducts?: number },
  ): Promise<RawProduct[]> {
    const page = await this.ensurePage();
    return searchSaoLuiz(page, query, opts?.maxProducts);
  }

  async close(): Promise<void> {
    await this.ctx?.close();
    this.ctx = null;
    this.page = null;
    await closeBrowser();
  }
}
