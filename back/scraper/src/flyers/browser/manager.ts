import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { buildContextOptions } from "./context.js";
// ponytail: shared Chromium for flow-runner / flow-record only

export type BrowserManagerOptions = {
  headless: boolean;
  timeoutMs: number;
};

/** Single Chromium lifecycle — scrapers must not launch browsers themselves. */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(private opts: BrowserManagerOptions) {}

  async launch(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.opts.headless });
    this.context = await this.browser.newContext(buildContextOptions());
    this.context.setDefaultTimeout(this.opts.timeoutMs);
    this.context.setDefaultNavigationTimeout(this.opts.timeoutMs);
  }

  async createPage(): Promise<Page> {
    if (!this.context) throw new Error("BrowserManager not launched");
    return this.context.newPage();
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.context = null;
    this.browser = null;
  }
}
