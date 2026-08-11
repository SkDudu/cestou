import type { BrowserContext, Page } from "playwright";
import { closeBrowser, newContext } from "../services/browser.js";
import type { RawProduct, SupermarketScraper } from "../types/index.js";
import { searchPaoDeAcucar } from "./search.js";

export class PaoDeAcucarScraper implements SupermarketScraper {
  name = "Pão de Açúcar";
  slug = "pao-de-acucar";
  website = "https://www.paodeacucar.com";

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
    return searchPaoDeAcucar(page, query, opts?.maxProducts);
  }

  async close(): Promise<void> {
    await this.ctx?.close();
    this.ctx = null;
    this.page = null;
    await closeBrowser();
  }
}
