import type { Locator, Page } from "playwright";
import type { FlowState, FlowStep, StepConfig } from "../types/flows.js";
import { interpolate } from "../recorder/action-normalizer.js";
import { downloadPending } from "../jobs/flyer-download.js";
import { extractPending } from "../jobs/flyer-extraction.js";
import { denyNativePermissionPrompts } from "../browser/context.js";
import {
  attachNetworkHarvester,
  persistDiscovered,
  resolveScopeElement,
  SCOPE_NOT_FOUND,
} from "./flow-pipeline.js";
import {
  allowsImageUrls,
  coerceOpenEachIfCardCta,
  discoverWithFlyerSource,
} from "./flyer-discover.js";

export type StepResult = {
  ok: boolean;
  message: string;
  storesFound?: number;
  flyersFound?: number;
  offersFound?: number;
  newFlyers?: number;
  candidates?: unknown[];
};

/** AppNotice não some sozinho — espera aparecer e clica Continuar. */
export async function dismissBlockingDialogs(
  page: Page,
  say?: (line: string) => void,
  timeoutMs = 12_000,
): Promise<boolean> {
  const loc = page
    .locator(
      '[role="dialog"] button:has-text("Continuar"), button:has-text("Continuar")',
    )
    .first();
  try {
    await loc.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    say?.("[DIALOG] Continuar não apareceu — segue");
    return false;
  }
  await loc.click({ timeout: 4000 });
  say?.("[DIALOG] clicou Continuar — esperando dialog sumir");
  await page
    .locator('[role="dialog"]')
    .first()
    .waitFor({ state: "hidden", timeout: 8000 })
    .catch(() => undefined);
  await page.waitForTimeout(300);
  return true;
}

async function waitForFlyerGallery(page: Page, say?: (line: string) => void) {
  try {
    await page
      .locator('h3:has-text("Encartes"), img[src*="flipbook"], img[alt*="Encarte"]')
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
    say?.("[NAV] galeria de encartes visível");
  } catch {
    say?.("[NAV] galeria ainda não visível — segue mesmo assim");
  }
}

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
    const all = page.locator(sel);
    const n = await all.count();
    for (let i = 0; i < n; i++) {
      const loc = all.nth(i);
      if (await loc.isVisible().catch(() => false)) return loc;
    }
  }
  // fallback: first match even if hidden (old behavior)
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
        if (!(await loc.isVisible().catch(() => false))) continue;
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
  const say = (line: string) => state.onLog?.(line);

  switch (step.type) {
    case "navigate": {
      const url = interpolate(cfg.url ?? "", ctx);
      if (!url) throw new Error("navigate missing url");
      say(`[NAV] indo para ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: t });
      say(`[NAV] carregou ${page.url()}`);
      await denyNativePermissionPrompts(
        page.context(),
        page,
        new URL(page.url()).origin,
      ).catch(() => undefined);
      await dismissBlockingDialogs(page, say, Math.min(t, 12_000));
      await waitForFlyerGallery(page, say);
      return { ok: true, message: `navigated ${url}` };
    }
    case "click": {
      const hint = cfg.description ?? cfg.selector ?? cfg.selectors?.[0] ?? "…";
      say(`[CLICK] procurando "${hint}"`);
      const loc = await resolveLocator(page, cfg);
      await loc.click({ timeout: t });
      say(`[CLICK] ok — ${hint}`);
      return { ok: true, message: cfg.description ?? "click" };
    }
    case "select": {
      const value = interpolate(cfg.value ?? "", ctx);
      if (!value) throw new Error("select missing value");
      say(`[SELECT] opção "${value}"`);
      const { loc, hit } = await resolveSelect(page, cfg, value, t);
      await selectOption(loc, hit, t);
      return { ok: true, message: `select ${hit.label || hit.value}` };
    }
    case "input": {
      const loc = await resolveLocator(page, cfg);
      const value = interpolate(cfg.value ?? "", ctx);
      say(`[INPUT] "${value}"`);
      await loc.fill(value, { timeout: t });
      return { ok: true, message: `input ${value}` };
    }
    case "wait": {
      say(`[WAIT] strategy=${cfg.strategy ?? "selector"}`);
      if (cfg.strategy === "timeout") {
        await page.waitForTimeout(cfg.timeoutMs ?? 1000);
      } else if (cfg.strategy === "networkidle") {
        await page.waitForLoadState("networkidle", { timeout: t });
      } else {
        const sel = cfg.selector ?? cfg.selectors?.[0];
        if (!sel) throw new Error("wait selector missing");
        // ponytail: attached-but-hidden selects break Assaí modal — wait visible
        await page.waitForSelector(sel, { state: "visible", timeout: t });
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
      say(`[NET] capturando ${duration}ms…`);
      await page.waitForTimeout(duration);
      say(`[NET] flyers na rede: ${state.networkFlyers.length}`);
      return { ok: true, message: `capture-network ${duration}ms` };
    }
    case "select-scope": {
      say("[SCOPE] resolvendo elemento…");
      await dismissBlockingDialogs(page, say, 5000);
      const selectors = [
        ...(cfg.selectors ?? []),
        ...(cfg.selector ? [cfg.selector] : []),
      ].filter(Boolean);
      if (!selectors.length) {
        state.scopeSelectors = undefined;
        say(`[SCOPE] ${SCOPE_NOT_FOUND}`);
        return { ok: false, message: SCOPE_NOT_FOUND };
      }
      const hit = await resolveScopeElement(page, selectors, t);
      if (!hit) {
        state.scopeSelectors = undefined;
        say(`[SCOPE] ${SCOPE_NOT_FOUND}`);
        return { ok: false, message: SCOPE_NOT_FOUND };
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
      say("[STORE] varrendo links de loja…");
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
      say(`[STORE] achou ≈${stores.length}`);
      return {
        ok: true,
        message: `stores≈${stores.length}`,
        storesFound: stores.length,
        candidates: stores,
      };
    }
    case "discover-flyer": {
      const useElement = Boolean(state.scopeSelectors?.length);
      if (cfg.scope === "element" && !useElement) {
        say(`[FLYER] ${SCOPE_NOT_FOUND}`);
        return { ok: false, message: SCOPE_NOT_FOUND };
      }
      const source = coerceOpenEachIfCardCta(cfg);
      say(
        `[FLYER] buscando ${useElement ? "no scope" : "na página"}…`,
      );
      const harvest = attachNetworkHarvester(page);
      try {
        await page.waitForTimeout(cfg.duration ?? 4000);
        await page.evaluate(() => window.scrollBy(0, 600)).catch(() => undefined);
        await page.waitForTimeout(1500);
        const scopeSel = useElement ? state.scopeSelectors![0] : undefined;
        const network = [...harvest.flyers, ...state.networkFlyers];
        const candidates = await discoverWithFlyerSource({
          page,
          scopeSelector: scopeSel,
          network,
          source,
          onLog: say,
        });
        say(
          `[FLYER] candidatos válidos: ${candidates.length} (kind=${source.kind})`,
        );
        const allowImages =
          allowsImageUrls(source) ||
          candidates.some((c) =>
            c.pageUrls.some((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u)),
          );
        let persisted = 0;
        if (state.supermarketId || state.ctx.supermarketId) {
          const res = await persistDiscovered(state, candidates, {
            allowImages,
          });
          persisted = res.created;
          say(
            `[FLYER] salvos novos=${persisted} totalIds=${res.ids.length}`,
          );
        } else {
          say("[FLYER] sem supermarketId — não persistiu");
        }
        return {
          ok: true,
          message: `[FLYER] ${source.kind}/${source.downloadStrategy} | Valid: ${candidates.length} saved=${persisted}`,
          flyersFound: persisted || candidates.length,
          newFlyers: persisted,
          candidates,
        };
      } finally {
        harvest.dispose();
      }
    }
    case "download-flyers": {
      say("[DOWNLOAD] iniciando…");
      const dl = await downloadPending({
        supermarketId: state.supermarketId ?? state.ctx.supermarketId,
        flyerIds: state.discoveredFlyerIds.length
          ? state.discoveredFlyerIds
          : undefined,
        onLog: state.onLog,
        fetchPage: state.browserFetch,
        capturedPages: state.capturedPages,
      });
      return {
        ok: dl.downloaded > 0 || dl.pending === 0,
        message: `downloaded ${dl.downloaded}/${dl.pending}`,
        flyersFound: dl.downloaded,
      };
    }
    case "extract-offers": {
      say("[EXTRACT] iniciando análise de ofertas…");
      const ex = await extractPending({
        supermarketId: state.supermarketId ?? state.ctx.supermarketId,
        flyerIds: state.discoveredFlyerIds.length
          ? state.discoveredFlyerIds
          : undefined,
        onLog: state.onLog,
      });
      state.offersFound += ex.offersFound;
      say(
        `[EXTRACT] concluído processed=${ex.processed}/${ex.pending} offers=${ex.offersFound}`,
      );
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
