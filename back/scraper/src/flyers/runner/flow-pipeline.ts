import type { Page, Response } from "playwright";
import {
  createDiscoveredFlyer,
  ensureFlyerSource,
} from "../core/flyer-storage.js";
import type { FlowState, NetworkFlyerDoc } from "../types/flows.js";

export type DiscoveredCandidate = {
  originalUrl: string;
  title?: string;
  pageUrls: string[];
};

export function isFlyerHref(u: string): boolean {
  if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) return false;
  if (/productcluster|productsquery|productgallery|vtexcommercestable|sku/i.test(u)) {
    return false;
  }
  return /\/Flyer\/\?id=|\/Flyer\/thumbnail|\/flyer\/|flipbook|\/flip(\/|\?|$)|api-middleware-flyer-services|\/encartes\/|\.pdf(\?|$)/i.test(
    u,
  );
}

function isDocHref(u: string): boolean {
  return isFlyerHref(u) && !/\/Flyer\/thumbnail/i.test(u);
}

/** Walk JSON for flyer documents (not SKU images). */
export function collectFlyerDocsFromJson(
  obj: unknown,
  out: NetworkFlyerDoc[],
  depth = 0,
) {
  if (depth > 10 || out.length > 80) return;
  if (typeof obj === "string") {
    if (isDocHref(obj)) out.push({ url: obj });
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectFlyerDocsFromJson(item, out, depth + 1);
    return;
  }
  if (!obj || typeof obj !== "object") return;
  const rec = obj as Record<string, unknown>;
  const doc =
    (typeof rec.urlFinalDocument === "string" && rec.urlFinalDocument) ||
    (typeof rec.url === "string" && isDocHref(rec.url) ? rec.url : "");
  const thumbs =
    typeof rec.urlFinalDocumentThumbnail === "string"
      ? rec.urlFinalDocumentThumbnail
      : undefined;
  const title = typeof rec.name === "string" ? rec.name : undefined;
  const validity = rec.validity as { initial?: string; final?: string } | undefined;
  const images = rec.images_urls;
  let pushed = false;
  if (Array.isArray(images) && images.length && (rec.id || rec.name)) {
    const pages = images.filter((x): x is string => typeof x === "string");
    if (pages.length) {
      out.push({
        url: doc || pages[0]!,
        title,
        thumbnail: thumbs,
        validFrom: validity?.initial,
        validUntil: validity?.final,
      });
      pushed = true;
    }
  } else if (doc) {
    out.push({
      url: doc,
      title,
      thumbnail: thumbs,
      validFrom: validity?.initial,
      validUntil: validity?.final,
    });
    pushed = true;
  }
  if (Array.isArray(rec.flyers)) {
    collectFlyerDocsFromJson(rec.flyers, out, depth + 1);
    return;
  }
  if (pushed) return;
  for (const v of Object.values(rec)) {
    collectFlyerDocsFromJson(v, out, depth + 1);
  }
}

export function attachNetworkHarvester(page: Page): {
  flyers: NetworkFlyerDoc[];
  dispose: () => void;
} {
  const flyers: NetworkFlyerDoc[] = [];
  const seen = new Set<string>();
  const onResponse = async (res: Response) => {
    try {
      if (!res.ok()) return;
      const ct = (res.headers()["content-type"] ?? "").toLowerCase();
      const url = res.url();
      if (ct.includes("pdf") || (isDocHref(url) && ct.includes("octet-stream"))) {
        if (!seen.has(url)) {
          seen.add(url);
          flyers.push({ url });
        }
        return;
      }
      if (!ct.includes("json")) return;
      if (/product|graphql|analytics|gtm|collect/i.test(url)) return;
      const json = await res.json().catch(() => null);
      if (!json) return;
      const batch: NetworkFlyerDoc[] = [];
      collectFlyerDocsFromJson(json, batch);
      for (const d of batch) {
        if (seen.has(d.url)) continue;
        seen.add(d.url);
        flyers.push(d);
      }
    } catch {
      /* ignore */
    }
  };
  page.on("response", onResponse);
  return {
    flyers,
    dispose: () => page.off("response", onResponse),
  };
}

export async function resolveScopeElement(
  page: Page,
  selectors: string[],
): Promise<{ selector: string } | null> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) return { selector: sel };
    } catch {
      /* bad selector */
    }
  }
  return null;
}

export async function scanDomFlyerCandidates(
  page: Page,
  scopeSelector?: string,
): Promise<Array<{ url: string; id?: string; text?: string }>> {
  return page.evaluate((rootSel) => {
    const flyerRe =
      /\/Flyer\/\?id=|\/Flyer\/thumbnail|\/flyer\/|flipbook|\/flip(\/|\?|$)|api-middleware-flyer-services|\/encartes\/|\.pdf(\?|$)/i;
    const skipRe = /productcluster|productsquery|productgallery|sku/i;
    const isFlyer = (u: string) => flyerRe.test(u) && !skipRe.test(u);
    const root = rootSel
      ? document.querySelector(rootSel)
      : document;
    if (!root) return [];
    const out: Array<{ url: string; id?: string; text?: string }> = [];
    const seen = new Set<string>();
    const nodes = root.querySelectorAll(
      "a[href], iframe[src], object[data], embed[src], [data-flyer-id]",
    );
    for (const el of Array.from(nodes)) {
      const href =
        el.getAttribute("href") ??
        el.getAttribute("src") ??
        el.getAttribute("data") ??
        "";
      if (!href || href.startsWith("data:")) continue;
      let abs = href;
      try {
        abs = new URL(href, location.href).href;
      } catch {
        continue;
      }
      if (seen.has(abs)) continue;
      const id = el.getAttribute("data-flyer-id") ?? undefined;
      const text = (
        el.getAttribute("title") ??
        el.getAttribute("alt") ??
        el.textContent ??
        ""
      )
        .trim()
        .slice(0, 80);
      if (isFlyer(abs) || id) {
        seen.add(abs);
        out.push({ url: abs, id, text });
      }
    }
    return out.slice(0, 60);
  }, scopeSelector ?? null);
}

export function flyerKey(u: string): string {
  try {
    const url = new URL(u, "https://local.invalid");
    const id = url.searchParams.get("id");
    if (id) return id;
  } catch {
    /* ignore */
  }
  return u;
}

export function flyerKind(u: string): "pdf" | "api" | "flipbook" | "image" {
  if (/\.pdf(\?|$)/i.test(u)) return "pdf";
  if (/flipbook|\/flip(\/|\?|$)/i.test(u)) return "flipbook";
  if (/\/Flyer\/|api-middleware-flyer-services/i.test(u)) return "api";
  return "image";
}

export function buildCandidates(
  dom: Array<{ url: string; id?: string; text?: string }>,
  network: NetworkFlyerDoc[],
): DiscoveredCandidate[] {
  const byKey = new Map<string, DiscoveredCandidate>();

  for (const d of dom) {
    const key = d.id || flyerKey(d.url);
    const url = isDocHref(d.url) ? d.url : d.url;
    byKey.set(key, {
      originalUrl: url,
      title: d.text || d.id,
      pageUrls: [url],
    });
  }

  for (const n of network) {
    const key = flyerKey(n.url);
    const existing = byKey.get(key);
    if (existing) {
      if (isDocHref(n.url)) {
        existing.originalUrl = n.url;
        existing.pageUrls = [
          n.url,
          ...existing.pageUrls.filter((u) => u !== n.url),
        ];
      } else if (!existing.pageUrls.includes(n.url)) {
        existing.pageUrls.push(n.url);
      }
      if (n.title && !existing.title) existing.title = n.title;
      continue;
    }
    if (dom.length) continue;
    if (!isDocHref(n.url)) continue;
    byKey.set(key, {
      originalUrl: n.url,
      title: n.title,
      pageUrls: [n.url],
    });
  }

  return [...byKey.values()].filter(
    (c) => isDocHref(c.originalUrl) || c.pageUrls.some(isDocHref),
  );
}

export async function persistDiscovered(
  state: FlowState,
  candidates: DiscoveredCandidate[],
): Promise<{ created: number; ids: string[] }> {
  const supermarketId = state.supermarketId ?? state.ctx.supermarketId;
  if (!supermarketId) {
    throw new Error("supermarketId missing — cannot persist flyers");
  }
  const sourceId = await ensureFlyerSource({
    supermarketId,
    type: "image",
    url: state.ctx.startUrl || candidates[0]?.originalUrl || "flow",
    active: true,
  });

  const ids: string[] = [];
  let created = 0;
  for (const c of candidates) {
    const pages = c.pageUrls.filter(isDocHref);
    const original = isDocHref(c.originalUrl) ? c.originalUrl : pages[0];
    if (!original || !pages.length) continue;
    const id = await createDiscoveredFlyer({
      supermarketId,
      sourceId,
      title: c.title,
      originalUrl: original,
      pageUrls: pages,
    });
    ids.push(id);
    created++;
  }
  state.discoveredFlyerIds.push(...ids);
  return { created, ids };
}
