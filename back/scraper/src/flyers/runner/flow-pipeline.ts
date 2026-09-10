import type { Page, Response } from "playwright";
import {
  createDiscoveredFlyer,
  ensureFlyerSource,
  getSourceStoreIds,
  getSupermarket,
} from "../core/flyer-storage.js";
import { parseValidity } from "../core/validity.js";
import type { FlowState, NetworkFlyerDoc } from "../types/flows.js";

export type DiscoveredCandidate = {
  originalUrl: string;
  title?: string;
  pageUrls: string[];
  externalId?: string;
  validFrom?: string;
  validUntil?: string;
  /** Bytes from Playwright download.saveAs — skip bare fetch later. */
  pageBuffers?: Array<{ buffer: Buffer; contentType: string; url?: string }>;
};

/** Listing index / skip-to-content — not a flyer document. */
export function isJunkNavHref(u: string): boolean {
  if (isPolicyDocHref(u)) return true;
  try {
    const url = new URL(u, "https://local.invalid");
    if (/content|main|primary|skip/i.test(url.hash.replace(/^#/, ""))) {
      return true;
    }
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return /\/encartes$/i.test(path);
  } catch {
    return /ir-para-o-conteudo|#content/i.test(u);
  }
}

/** Cookie / privacy / terms PDFs in footer — not an encarte. */
export function isPolicyDocHref(u: string): boolean {
  return /cookie|privacidade|privacy|lgpd|termos|pol[ií]tica/i.test(u);
}

export function isFlyerHref(u: string): boolean {
  if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) return false;
  if (isJunkNavHref(u)) return false;
  if (/productcluster|productsquery|productgallery|vtexcommercestable|sku/i.test(u)) {
    return false;
  }
  if (/\.pdf(\?|#|$)/i.test(u)) return true;
  // page images use isPersistableMedia — not doc hrefs (avoids /encarte/foo.jpg)
  if (/\.(jpe?g|png|webp)(\?|#|$)/i.test(u)) return false;
  // /encarte/ and /encartes/ (WP CPT singular + listing plural)
  return /\/Flyer\/\?id=|\/Flyer\/thumbnail|\/flyer\/|flipbook|\/flip(\/|\?|$)|api-middleware-flyer-services|flyer-services|\/encartes?\//i.test(
    u,
  ) || /\/folhetos?\/|\/jornais?\//i.test(u);
}

/** CDN page image from flyer API (not product SKU). */
export function isFlyerPageImageUrl(u: string): boolean {
  if (!/^https?:\/\//i.test(u)) return false;
  if (/productcluster|productsquery|sku|icon|logo|sprite|favicon|avatar|pixel/i.test(u)) {
    return false;
  }
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) return false;
  return /jornal|encarte|oferta|flyer|catalog|folheto|flipbook|\/pages?\/|pagina|página|mercadapp|cloudfront|cdn/i.test(
    u,
  );
}

/** File PDF (href, query, or blob labeled pdf) — raster all pages; not a screenshot. */
export function isPdfDocumentUrl(u: string): boolean {
  if (!u) return false;
  if (isPolicyDocHref(u)) return false;
  if (/\.pdf(\?|#|$)/i.test(u)) return true;
  if (/^blob:/i.test(u) && /pdf/i.test(u)) return true;
  return false;
}

function isDocHref(u: string): boolean {
  return isFlyerHref(u) && !/\/Flyer\/thumbnail/i.test(u);
}

function asUrlList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 8);
}

/** Walk JSON for flyer documents (not SKU images). */
export function collectFlyerDocsFromJson(
  obj: unknown,
  out: NetworkFlyerDoc[],
  depth = 0,
) {
  if (depth > 10 || out.length > 80) return;
  if (typeof obj === "string") {
    // ponytail: page JPEGs are pages, not flyers — only file/API hrefs as docs
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
    (typeof rec.documentUrl === "string" && rec.documentUrl) ||
    (typeof rec.pdfUrl === "string" && rec.pdfUrl) ||
    (typeof rec.flyerUrl === "string" && rec.flyerUrl) ||
    (typeof rec.url_document === "string" && rec.url_document) ||
    (typeof rec.fileUrl === "string" && rec.fileUrl) ||
    (typeof rec.downloadUrl === "string" && rec.downloadUrl) ||
    // ponytail: page JPEG in .url is a page, not a flyer record
    (typeof rec.url === "string" && isDocHref(rec.url) ? rec.url : "");
  const thumbs =
    typeof rec.urlFinalDocumentThumbnail === "string"
      ? rec.urlFinalDocumentThumbnail
      : typeof rec.thumbnail === "string"
        ? rec.thumbnail
        : undefined;
  const title =
    typeof rec.name === "string"
      ? rec.name
      : typeof rec.title === "string"
        ? rec.title
        : undefined;
  const validity = rec.validity as { initial?: string; final?: string } | undefined;
  const images = asUrlList(
    rec.images_urls ??
      rec.imagesUrls ??
      rec.pages ??
      rec.pageUrls ??
      rec.images ??
      rec.urls ??
      rec.files ??
      rec.assets,
  ).filter((u) => isDocHref(u) || isFlyerPageImageUrl(u) || /\.pdf(\?|$)/i.test(u));
  let pushed = false;
  if (
    images.length >= 2 ||
    (images.length && (rec.id || rec.name || rec.title || doc))
  ) {
    out.push({
      url: doc || images[0]!,
      title,
      thumbnail: thumbs,
      validFrom: validity?.initial,
      validUntil: validity?.final,
      pageUrls: images,
      pdf: images.every((u) => /\.pdf(\?|$)/i.test(u)) || undefined,
    });
    pushed = true;
  } else if (doc) {
    out.push({
      url: doc,
      title,
      thumbnail: thumbs,
      validFrom: validity?.initial,
      validUntil: validity?.final,
      pdf: /\.pdf(\?|$)/i.test(doc) || undefined,
    });
    pushed = true;
  }
  if (Array.isArray(rec.flyers) || Array.isArray(rec.encartes) || Array.isArray(rec.jornais)) {
    collectFlyerDocsFromJson(rec.flyers ?? rec.encartes ?? rec.jornais, out, depth + 1);
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
          flyers.push({ url, pdf: true });
        }
        return;
      }
      // ponytail: bare CDN JPEG ≠ flyer. Pages come from JSON pageUrls or DOM after open.
      if (ct.includes("image/")) return;
      if (!ct.includes("json")) return;
      if (/product|graphql|analytics|gtm|collect|hotjar|sentry/i.test(url)) {
        return;
      }
      const json = await res.json().catch(() => null);
      if (!json) return;
      const batch: NetworkFlyerDoc[] = [];
      collectFlyerDocsFromJson(json, batch);
      for (const d of batch) {
        const key = d.pageUrls?.length
          ? `${d.url}|${d.pageUrls.length}|${d.title ?? ""}`
          : d.url;
        if (seen.has(key)) continue;
        seen.add(key);
        flyers.push({ ...d, sourceUrl: url });
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

export const SCOPE_NOT_FOUND =
  "SCOPE_NOT_FOUND: não foi possível localizar a área configurada";

export async function resolveScopeElement(
  page: Page,
  selectors: string[],
  timeoutMs = 8000,
): Promise<{ selector: string } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        if ((await loc.count()) > 0) return { selector: sel };
      } catch {
        /* bad selector */
      }
    }
    await page.waitForTimeout(250);
  }
  return null;
}

export async function scanDomFlyerCandidates(
  page: Page,
  scopeSelector?: string,
): Promise<Array<{ url: string; id?: string; text?: string }>> {
  return page.evaluate((rootSel) => {
    const flyerRe =
      /\/Flyer\/\?id=|\/Flyer\/thumbnail|\/flyer\/|flipbook|\/flip(\/|\?|$)|api-middleware-flyer-services|\/encartes?\/|\.pdf(\?|$)/i;
    const skipRe = /productcluster|productsquery|productgallery|sku/i;
    const isFlyer = (u: string) => flyerRe.test(u) && !skipRe.test(u);
    const root = rootSel ? document.querySelector(rootSel) : document;
    if (!root) return [];
    const out: Array<{ url: string; id?: string; text?: string }> = [];
    const seen = new Set<string>();
    const nodes = root.querySelectorAll(
      "a[href], iframe[src], object[data], embed[src], [data-flyer-id], img[src]",
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

export function flyerExternalId(u: string, explicit?: string): string | undefined {
  if (explicit) return explicit;
  const key = flyerKey(u);
  return key !== u ? key : undefined;
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
      externalId: flyerExternalId(d.url, d.id),
    });
  }

  for (const n of network) {
    const pages = [
      ...new Set([
        ...(n.pageUrls?.length ? n.pageUrls : [n.url]),
        ...(n.pdf || /\.pdf(\?|$)/i.test(n.url) ? [n.url] : []),
      ]),
    ].filter(Boolean);
    const key = flyerKey(n.url) + (n.title ? `|${n.title}` : "");
    const existing = byKey.get(key);
    if (existing) {
      for (const u of pages) {
        if (!existing.pageUrls.includes(u)) existing.pageUrls.push(u);
      }
      if (isDocHref(n.url) || n.pdf) existing.originalUrl = n.url;
      if (n.title && !existing.title) existing.title = n.title;
      if (n.validFrom && !existing.validFrom) existing.validFrom = n.validFrom;
      if (n.validUntil && !existing.validUntil) existing.validUntil = n.validUntil;
      continue;
    }
    if (dom.length && !pages.some((u) => isDocHref(u) || isFlyerPageImageUrl(u))) {
      continue;
    }
    if (
      !isDocHref(n.url) &&
      !n.pdf &&
      !pages.some((u) => isDocHref(u) || isFlyerPageImageUrl(u))
    ) {
      continue;
    }
    byKey.set(key, {
      originalUrl: n.url,
      title: n.title,
      pageUrls: pages.length ? pages : [n.url],
      externalId: flyerExternalId(n.url),
      validFrom: n.validFrom,
      validUntil: n.validUntil,
    });
  }

  return [...byKey.values()].filter(
    (c) =>
      isDocHref(c.originalUrl) ||
      c.pageUrls.some((u) => isDocHref(u) || isFlyerPageImageUrl(u)),
  );
}

export async function persistDiscovered(
  state: FlowState,
  candidates: DiscoveredCandidate[],
  opts?: { allowImages?: boolean },
): Promise<{ created: number; duplicates: number; ids: string[] }> {
  const allowImages = opts?.allowImages ?? false;
  const ok = (u: string) =>
    allowImages
      ? isFlyerHref(u) ||
        (/\.(jpe?g|png|webp)(\?|$)/i.test(u) &&
          !/productcluster|sku|icon|logo|sprite|favicon/i.test(u))
      : isFlyerHref(u);

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
  const say = state.onLog;
  // ponytail: Convex also resolves; pass explicit for log + override
  const storeIds = (await getSourceStoreIds(sourceId)) ?? undefined;
  if (storeIds?.length) {
    say?.(`[DISCOVER] fonte escopo filiais=${storeIds.length}`);
  }
  const sm = await getSupermarket(supermarketId);
  const tz =
    (sm as { timezone?: string } | null)?.timezone || "America/Fortaleza";

  const ids: string[] = [];
  let created = 0;
  let duplicates = 0;
  if (!state.capturedPages) state.capturedPages = new Map();
  for (const c of candidates) {
    const pages = c.pageUrls.filter(ok);
    // Keep per-tab synthetic originalUrl (#oferta-N) so 3 jornais ≠ 1 dedupe
    const original =
      (c.externalId && c.originalUrl) ||
      (ok(c.originalUrl) ? c.originalUrl : undefined) ||
      pages[0];
    if (!original || (!pages.length && !c.pageBuffers?.length)) {
      say?.(
        `[DISCOVER] skip (sem mídia persistível) → ${c.title ?? c.originalUrl}`,
      );
      continue;
    }
    const originalUrl = original;
    const pageUrls =
      pages.length > 0
        ? pages
        : c.pageBuffers!.map(
            (b, i) => b.url ?? `capture://${c.externalId ?? "p"}/${i}`,
          );
    const res = await createDiscoveredFlyer({
      supermarketId,
      sourceId,
      title: c.title,
      originalUrl,
      pageUrls,
      externalId: c.externalId ?? flyerExternalId(originalUrl),
      validFrom: parseValidity(c.validFrom, tz, "from"),
      validUntil: parseValidity(c.validUntil, tz, "until"),
      storeIds,
    });
    ids.push(res.id);
    if (c.pageBuffers?.length) {
      state.capturedPages.set(res.id, c.pageBuffers);
    }
    if (res.created) {
      created++;
      say?.(
        `[DISCOVER] novo flyer → ${c.title ?? originalUrl} (${pageUrls.length} pág${c.pageBuffers?.length ? ` +${c.pageBuffers.length} buf` : ""})`,
      );
    } else {
      duplicates++;
      say?.(`[DISCOVER] já existia → ${c.title ?? originalUrl}`);
    }
    if (res.retired) {
      say?.(
        `[DISCOVER] validade: aposentou ${res.retired} edição(ões) do mesmo slot`,
      );
    }
  }
  state.discoveredFlyerIds.push(...ids);
  return { created, duplicates, ids };
}
