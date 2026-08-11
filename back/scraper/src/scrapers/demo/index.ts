import type { BrowserContext, Page } from "playwright";
import { closeBrowser, newContext } from "../services/browser.js";
import type { RawProduct, SupermarketScraper } from "../types/index.js";
import { searchBooks } from "./search.js";

export class DemoScraper implements SupermarketScraper {
  name = "Demo Market";
  slug = "demo";
  website = "https://books.toscrape.com";

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
    return searchBooks(page, query, opts?.maxProducts);
  }

  async close(): Promise<void> {
    await this.ctx?.close();
    this.ctx = null;
    this.page = null;
    await closeBrowser();
  }
}
