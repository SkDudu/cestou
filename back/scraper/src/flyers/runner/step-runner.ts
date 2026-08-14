import type { Locator, Page } from "playwright";
import type { FlowState, FlowStep, StepConfig } from "../types/flows.js";
import { interpolate } from "../recorder/action-normalizer.js";
import { downloadPending } from "../jobs/flyer-download.js";
import { extractPending } from "../jobs/flyer-extraction.js";
import {
  attachNetworkHarvester,
  buildCandidates,
  persistDiscovered,
  resolveScopeElement,
  scanDomFlyerCandidates,
} from "./flow-pipeline.js";

export type StepResult = {
  ok: boolean;
  message: string;
  storesFound?: number;
  flyersFound?: number;
  offersFound?: number;
  candidates?: unknown[];
};

async function resolveLocator(page: Page, config: StepConfig) {
  const list = [
    ...(config.selectors ?? []),
    ...(config.selector ? [config.selector] : []),
  ];
  const text = (config.description ?? config.value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (text.length >= 2) {
    const esc = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    list.push(`text="${esc}"`);
  }
  for (const sel of list) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) return loc;
  }
  throw new Error(
    `Selector not found: ${list.join(" | ") || "(none)"}`,
  );
}

/** Prefer a <select> that actually contains the option (UF/Cidade share classes). */
async function resolveSelect(
  page: Page,
  config: StepConfig,
  wanted: string,
  timeoutMs: number,
) {
  const selectors = [
    ...(config.selectors ?? []),
    ...(config.selector ? [config.selector] : []),
  ].filter(Boolean);
  if (!selectors.length) throw new Error("select missing selector");

  const needle = wanted.trim().toLowerCase();
  const deadline = Date.now() + timeoutMs;
  let lastOpts: string[] = [];

  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const all = page.locator(sel);
      const n = await all.count();
      for (let i = 0; i < n; i++) {
        const loc = all.nth(i);
        const opts = await loc.locator("option").evaluateAll((els) =>
          els.map((o) => ({
            value: (o as HTMLOptionElement).value,
            label: (o.textContent ?? "").trim(),
          })),
        );
        lastOpts = opts.map((o) => o.label || o.value);
        const hit = opts.find(
          (o) =>
            o.value.toLowerCase() === needle ||
            o.label.toLowerCase() === needle ||
            o.label.toLowerCase().includes(needle),
        );
        if (hit) return { loc, hit };
      }
    }
    await page.waitForTimeout(200);
  }

  throw new Error(
    `select option "${wanted}" not found (tried: ${lastOpts.slice(0, 12).join(", ") || "no options"})`,
  );
}

async function selectOption(
  loc: Locator,
  hit: { value: string; label: string },
  timeoutMs: number,
) {
  try {
    await loc.selectOption({ value: hit.value }, { timeout: timeoutMs });
  } catch {
    await loc.selectOption({ label: hit.label }, { timeout: timeoutMs });
  }
}

export async function runStep(
  page: Page,
  step: FlowStep,
  state: FlowState,
  opts: { timeoutMs: number; maxRetries: number },
): Promise<StepResult> {
  let lastErr = "";
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await runStepOnce(page, step, state, opts.timeoutMs);
      return result;
    } catch (err) {
      lastErr = String(err);
      if (attempt < opts.maxRetries) {
        await page.waitForTimeout(500);
      }
    }
  }
  return { ok: false, message: lastErr };
}

async function runStepOnce(
  page: Page,
  step: FlowStep,
  state: FlowState,
  timeoutMs: number,
): Promise<StepResult> {
  const cfg = step.config;
  const ctx = state.ctx;
  const t = cfg.timeoutMs ?? timeoutMs;

  switch (step.type) {
    case "navigate": {
      const url = interpolate(cfg.url ?? "", ctx);
      if (!url) throw new Error("navigate missing url");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: t });
      return { ok: true, message: `navigated ${url}` };
    }
    case "click": {
      const loc = await resolveLocator(page, cfg);
      await loc.click({ timeout: t });
      return { ok: true, message: cfg.description ?? "click" };
    }
    case "select": {
      const value = interpolate(cfg.value ?? "", ctx);
      if (!value) throw new Error("select missing value");
      const { loc, hit } = await resolveSelect(page, cfg, value, t);
      await selectOption(loc, hit, t);
      return { ok: true, message: `select ${hit.label || hit.value}` };
    }
    case "input": {
      const loc = await resolveLocator(page, cfg);
      const value = interpolate(cfg.value ?? "", ctx);
      await loc.fill(value, { timeout: t });
      return { ok: true, message: `input ${value}` };
    }
    case "wait": {
      if (cfg.strategy === "timeout") {
        await page.waitForTimeout(cfg.timeoutMs ?? 1000);
      } else if (cfg.strategy === "networkidle") {
        await page.waitForLoadState("networkidle", { timeout: t });
      } else {
        const sel = cfg.selector ?? cfg.selectors?.[0];
        if (!sel) throw new Error("wait selector missing");
        await page.waitForSelector(sel, { timeout: t });
      }
      return { ok: true, message: "wait ok" };
    }
    case "scroll": {
      const amount = cfg.amount ?? 800;
      const dy = cfg.direction === "up" ? -amount : amount;
      await page.evaluate((y) => window.scrollBy(0, y), dy);
      return { ok: true, message: `scroll ${dy}` };
    }
    case "capture-network": {
      const duration = cfg.duration ?? 5000;
      await page.waitForTimeout(duration);
      return { ok: true, message: `capture-network ${duration}ms` };
    }
    case "select-scope": {
      const selectors = [
        ...(cfg.selectors ?? []),
        ...(cfg.selector ? [cfg.selector] : []),
      ].filter(Boolean);
      if (!selectors.length) {
        throw new Error(
          "SCOPE_NOT_FOUND: não foi possível localizar a área configurada",
        );
      }
      const hit = await resolveScopeElement(page, selectors);
      if (!hit) {
        throw new Error(
          "SCOPE_NOT_FOUND: não foi possível localizar a área configurada",
        );
      }
      const loc = page.locator(hit.selector).first();
      const box = await loc.boundingBox();
      const stats = await loc.evaluate((el) => ({
        tagName: el.tagName,
        linkCount: el.querySelectorAll("a[href]").length,
        imageCount: el.querySelectorAll("img").length,
        textCount: (el.textContent ?? "").trim().length,
      }));
      const small =
        !box || box.width < 80 || box.height < 80 || stats.textCount + stats.linkCount + stats.imageCount === 0;
      state.scopeSelectors = [
        hit.selector,
        ...selectors.filter((s) => s !== hit.selector),
      ];
      const idx = selectors.indexOf(hit.selector) + 1;
      return {
        ok: true,
        message: `[SCOPE] Selector ${idx} matched | Tag: ${stats.tagName} | Links: ${stats.linkCount} Images: ${stats.imageCount}${small ? " | warn: small/empty" : ""}`,
      };
    }
    case "discover-store": {
      const stores = await page.evaluate(() => {
        const links = Array.from(
          document.querySelectorAll("a[href], [data-store-id], [data-id]"),
        );
        return links
          .map((el) => {
            const href = el.getAttribute("href") ?? "";
            const id =
              el.getAttribute("data-store-id") ??
              el.getAttribute("data-id") ??
              "";
            const text = (el.textContent ?? "").trim().slice(0, 80);
            return { href, id, text };
          })
          .filter(
            (x) =>
              /loja|store|filial|mercado/i.test(x.href + x.text) ||
              /^\d+$/.test(x.id),
          )
          .slice(0, 50);
      });
      return {
        ok: true,
        message: `stores≈${stores.length}`,
        storesFound: stores.length,
        candidates: stores,
      };
    }
    case "discover-flyer": {
      const useElement =
        cfg.scope === "element" || Boolean(state.scopeSelectors?.length);
      if (useElement && !state.scopeSelectors?.length) {
        throw new Error(
          "SCOPE_REQUIRED: selecione uma área (select-scope) antes do discover-flyer",
        );
      }
      const harvest = attachNetworkHarvester(page);
      try {
        await page.waitForTimeout(cfg.duration ?? 4000);
        await page.evaluate(() => window.scrollBy(0, 600)).catch(() => undefined);
        await page.waitForTimeout(1500);
        const scopeSel = useElement ? state.scopeSelectors![0] : undefined;
        const dom = await scanDomFlyerCandidates(page, scopeSel);
        const net = [...harvest.flyers, ...state.networkFlyers];
        const candidates = buildCandidates(dom, net);
        let persisted = 0;
        if (state.supermarketId || state.ctx.supermarketId) {
          const res = await persistDiscovered(state, candidates);
          persisted = res.created;
        }
        return {
          ok: true,
          message: `[FLYER] ${useElement ? "scoped DOM" : "page"} | Candidates: ${dom.length} | Valid: ${candidates.length} saved=${persisted}`,
          flyersFound: persisted || candidates.length,
          candidates,
        };
      } finally {
        harvest.dispose();
      }
    }
    case "download-flyers": {
      const dl = await downloadPending({
        supermarketId: state.supermarketId ?? state.ctx.supermarketId,
        flyerIds: state.discoveredFlyerIds.length
          ? state.discoveredFlyerIds
          : undefined,
      });
      return {
        ok: true,
        message: `downloaded ${dl.downloaded}/${dl.pending}`,
        flyersFound: dl.downloaded,
      };
    }
    case "extract-offers": {
      const ex = await extractPending({
        supermarketId: state.supermarketId ?? state.ctx.supermarketId,
        flyerIds: state.discoveredFlyerIds.length
          ? state.discoveredFlyerIds
          : undefined,
      });
      state.offersFound += ex.offersFound;
      return {
        ok: true,
        message: `extracted ${ex.processed}/${ex.pending} offers=${ex.offersFound}`,
        offersFound: ex.offersFound,
      };
    }
    default:
      throw new Error(`Unknown step type: ${(step as FlowStep).type}`);
  }
}
