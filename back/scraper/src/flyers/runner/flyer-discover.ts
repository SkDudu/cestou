import type { Download, Locator, Page } from "playwright";
import {
  resolveDiscoverItemSelectors,
  sanitizePagerSelectors,
} from "../session/journal-tabs.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  FlyerDownloadStrategy,
  FlyerSource,
  FlyerSourceKind,
  FlyerViewerMode,
  NetworkFlyerDoc,
  StepConfig,
} from "../types/flows.js";
import { detectContentType } from "../core/flyer-downloader.js";
import {
  buildCandidates,
  isFlyerHref,
  isFlyerPageImageUrl,
  isJunkNavHref,
  isPdfDocumentUrl,
  scanDomFlyerCandidates,
  type DiscoveredCandidate,
} from "./flow-pipeline.js";
import { parseValidity } from "../core/validity.js";

const KINDS = new Set<FlyerSourceKind>([
  "tabs",
  "carousel",
  "react-viewer",
  "pdf-links",
  "api-json",
  "iframe",
  "image-grid",
]);

const STRATEGIES = new Set<FlyerDownloadStrategy>([
  "direct-url",
  "collect-images",
  "open-each-item",
  "harvest-after-activate",
  "click-download",
]);

const VIEWER_MODES = new Set<FlyerViewerMode>([
  "one-page",
  "img-stack",
  "lazy-scroll",
  "pdf",
]);

/** App store / promo CTAs — never flyer downloads. */
export function isAppDownloadCta(text: string): boolean {
  return /\bapp\b|aplicativo|play\s*store|app\s*store|google\s*play|apple\s*store|ganhe\s+desconto/i.test(
    text,
  );
}

/** Real flyer PDF/download control (not "Baixe o app"). */
export function isFlyerDownloadButton(
  text: string,
  href?: string,
): boolean {
  const blob = `${text} ${href ?? ""}`;
  if (isAppDownloadCta(blob)) return false;
  if (href && /\.pdf(\?|$)/i.test(href)) return true;
  if (/ver\s*pdf|abrir\s*pdf|baixar(\s|$)|download|salvar(\s+pdf)?/i.test(text)) {
    return !isAppDownloadCta(text);
  }
  // "baixe" alone often = app CTA; require flyer noun
  if (/baixe.+(jornal|folheto|encarte|pdf|página|pagina)/i.test(text)) return true;
  return false;
}

export function filterFlyerDownloadButtons<
  T extends { text: string; href?: string },
>(buttons: T[]): T[] {
  return buttons.filter((b) => isFlyerDownloadButton(b.text, b.href));
}

/**
 * Drop per-tab instance selectors ("Jornal 1", data-oferta-index="31").
 * Tab defaults only when kind is tabs/carousel.
 */
const CTA_PREFIX =
  /^(Ver\s+encarte|Ver\s+oferta|Ver\s+folheto|Abrir\s+cat[aá]logo|Ver\s+jornal(?:\s+de\s+ofertas)?)/i;

/** Unique aria-label / long has-text → prefix so open-each-item loops all cards. */
function generalizeItemSelector(sel: string): string | undefined {
  const aria = sel.match(
    /\[aria-label(?:\*=|\^=|=)(["'])((?:\\.|(?!\1).)*)\1\]/i,
  );
  if (aria) {
    const val = aria[2]!.replace(/\\(.)/g, "$1");
    const m = val.match(CTA_PREFIX);
    if (m) return `[aria-label^="${m[1]}"]`;
    if (val.length > 28 || /\d{1,2}\s*\/\s*\d{1,2}/.test(val)) return "";
  }
  const ht = sel.match(/:has-text\("([^"]+)"\)/);
  if (ht?.[1]) {
    const m = ht[1].match(CTA_PREFIX);
    if (m && ht[1].length > m[1].length + 1) {
      return sel.replace(ht[1], m[1]);
    }
  }
  return undefined;
}

export function sanitizeItemSelectors(
  sels: string[] | undefined,
  opts?: { kind?: FlyerSourceKind },
): string[] | undefined {
  if (!sels?.length) return undefined;
  const out: string[] = [];
  for (const raw of sels) {
    const sel = raw.trim();
    if (!sel) continue;
    if (/data-oferta-index\s*=/.test(sel)) {
      out.push("[data-oferta-index]");
      continue;
    }
    if (/^text=/.test(sel) && /\d/.test(sel)) continue;
    if (/:nth-(?:child|of-type)\(/.test(sel)) continue;
    if (/button\.selecionado|\.selecionado\b/.test(sel)) continue;
    const gen = generalizeItemSelector(sel);
    if (gen === "") continue;
    if (gen) {
      out.push(gen);
      continue;
    }
    const m = sel.match(/:has-text\("([^"]+)"\)/);
    if (m?.[1] && /\d+\s*$/.test(m[1])) {
      const base = m[1].replace(/\s+\d+\s*$/, "").trim();
      if (base) out.push(sel.replace(m[1], base));
      continue;
    }
    out.push(sel);
  }
  const forceTabs = opts?.kind === "tabs" || opts?.kind === "carousel";
  let cleaned = [...new Set(out)];
  if (forceTabs) {
    const extras: string[] = [];
    if (cleaned.some((s) => /data-oferta-index/.test(s))) {
      extras.push("[data-oferta-index]");
    }
    if (cleaned.some((s) => /role=["']?tab/.test(s))) {
      extras.push('[role="tab"]');
    }
    cleaned = [...new Set([...extras, ...cleaned])];
  } else {
    // pdf-links / image-grid: strip Assaí defaults that sanitize used to force
    cleaned = cleaned.filter(
      (s) =>
        s !== '[role="tab"]' &&
        s !== "[role=tab]" &&
        s !== "[data-oferta-index]",
    );
  }
  return cleaned.length ? cleaned.slice(0, 6) : undefined;
}

export function sanitizeDownloadSelectors(
  sels: string[] | undefined,
): string[] | undefined {
  if (!sels?.length) return undefined;
  const out = sels
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^text=/.test(s) || !/\d+\s*$/.test(s))
    .filter((s) => !isAppDownloadCta(s));
  return out.length ? [...new Set(out)].slice(0, 6) : undefined;
}

const ARCHIVE_TITLE_RE =
  /anteriores|arquiv|edi[cç][oõ]es?\s+passad|encartes?\s+antig/i;

const DATE_TOKEN_RE =
  /(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2,4}))?/g;
const DATE_RANGE_RE =
  /(\d{1,2}\s*[./-]\s*\d{1,2}(?:\s*[./-]\s*\d{2,4})?)\s+a\s+(\d{1,2}\s*[./-]\s*\d{1,2}(?:\s*[./-]\s*\d{2,4})?)/i;

function toSlashDate(raw: string): string | undefined {
  const m = raw
    .trim()
    .match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2,4}))?$/);
  if (!m) return undefined;
  return m[3] ? `${m[1]}/${m[2]}/${m[3]}` : `${m[1]}/${m[2]}`;
}

/** Skip listing cards under archive copy or with validUntil already past. */
export function skipStaleFlyerTitle(title: string, now = Date.now()): boolean {
  if (ARCHIVE_TITLE_RE.test(title)) return true;
  const range = title.match(DATE_RANGE_RE);
  const tokens = range
    ? [range[2]!]
    : [...title.matchAll(DATE_TOKEN_RE)].map((m) => m[0]!);
  const last = tokens[tokens.length - 1];
  if (!last) return false;
  const slash = toSlashDate(last);
  if (!slash) return false;
  const until = parseValidity(slash, undefined, "until");
  return until !== undefined && until < now;
}

/** Teach-test denylist: originalUrl and/or title. */
export function dropSkipped(
  cands: Array<{ originalUrl: string; title?: string }>,
  skipKeys: string[] | undefined,
  onLog?: (line: string) => void,
): typeof cands {
  const keys = cleanSkipKeys(skipKeys);
  if (!keys?.length) return cands;
  const set = new Set(keys.map((s) => s.toLowerCase()));
  const kept = cands.filter((c) => {
    const url = c.originalUrl.trim().toLowerCase();
    const title = (c.title ?? "").trim().toLowerCase();
    return !set.has(url) && !(title && set.has(title));
  });
  const n = cands.length - kept.length;
  if (n) onLog?.(`[FLYER] skip ${n} rejeitado(s) no teste`);
  return kept;
}

/** Generic listing CTAs — teach pass 1 can save without opening one card. */
export function listingSelectorsReadyToLoop(sels: string[]): boolean {
  if (!sels.length) return false;
  const blob = sels.join(" ");
  if (
    /data-oferta-index|role=["']?tab|:has-text\("Ver |aria-label\^=/i.test(blob)
  ) {
    return true;
  }
  const cleaned = sanitizeItemSelectors(sels, { kind: "image-grid" });
  return Boolean(
    cleaned?.some((s) => /:has-text\("Ver /i.test(s) || /aria-label\^=/.test(s)),
  );
}

function cleanSkipKeys(keys: unknown): string[] | undefined {
  if (!Array.isArray(keys)) return undefined;
  const out = [
    ...new Set(
      keys
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== "(sem título)"),
    ),
  ].slice(0, 40);
  return out.length ? out : undefined;
}

export function sanitizeFlyerSource(source: FlyerSource): FlyerSource {
  return {
    ...source,
    itemSelectors: sanitizeItemSelectors(source.itemSelectors, {
      kind: source.kind,
    }),
    downloadSelectors: sanitizeDownloadSelectors(source.downloadSelectors),
    pagerSelectors: sanitizePagerSelectors(source.pagerSelectors),
    evidence: source.evidence?.slice(0, 160),
    skipKeys: cleanSkipKeys(source.skipKeys),
  };
}

export function parseFlyerSource(raw: unknown): FlyerSource | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const kind = typeof o.kind === "string" && KINDS.has(o.kind as FlyerSourceKind)
    ? (o.kind as FlyerSourceKind)
    : undefined;
  const downloadStrategy =
    typeof o.downloadStrategy === "string" &&
    STRATEGIES.has(o.downloadStrategy as FlyerDownloadStrategy)
      ? (o.downloadStrategy as FlyerDownloadStrategy)
      : undefined;
  if (!kind || !downloadStrategy) return undefined;

  const urlFromOk = [
    "href",
    "img.src",
    "data-attr",
    "network",
    "click-then-network",
  ] as const;
  const urlFrom =
    typeof o.urlFrom === "string" &&
    (urlFromOk as readonly string[]).includes(o.urlFrom)
      ? (o.urlFrom as FlyerSource["urlFrom"])
      : undefined;

  let networkHints: FlyerSource["networkHints"];
  if (o.networkHints && typeof o.networkHints === "object") {
    const nh = o.networkHints as Record<string, unknown>;
    const urlIncludes = Array.isArray(nh.urlIncludes)
      ? nh.urlIncludes.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : undefined;
    const jsonKeys = Array.isArray(nh.jsonKeys)
      ? nh.jsonKeys.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : undefined;
    if (urlIncludes?.length || jsonKeys?.length) {
      networkHints = { urlIncludes, jsonKeys };
    }
  }

  const itemSelectors = Array.isArray(o.itemSelectors)
    ? o.itemSelectors.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : undefined;
  const downloadSelectors = Array.isArray(o.downloadSelectors)
    ? o.downloadSelectors.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : undefined;
  const pagerSelectors = Array.isArray(o.pagerSelectors)
    ? o.pagerSelectors.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : undefined;
  const viewerMode =
    typeof o.viewerMode === "string" &&
    VIEWER_MODES.has(o.viewerMode as FlyerViewerMode)
      ? (o.viewerMode as FlyerViewerMode)
      : undefined;

  return sanitizeFlyerSource({
    kind,
    downloadStrategy,
    urlFrom,
    itemSelectors: itemSelectors?.length ? itemSelectors : undefined,
    downloadSelectors: downloadSelectors?.length ? downloadSelectors : undefined,
    pagerSelectors: pagerSelectors?.length ? pagerSelectors : undefined,
    networkHints,
    viewerMode,
    evidence: typeof o.evidence === "string" ? o.evidence.slice(0, 240) : undefined,
    skipKeys: cleanSkipKeys(o.skipKeys),
  });
}

export function defaultFlyerSource(): FlyerSource {
  return { kind: "pdf-links", downloadStrategy: "direct-url", urlFrom: "href" };
}

export function resolveFlyerSource(cfg: StepConfig): FlyerSource {
  return cfg.flyerSource ?? defaultFlyerSource();
}

export function cardItemSelectors(extra: string[] = []): string[] {
  return (
    sanitizeItemSelectors(extra, { kind: "image-grid" }) ??
    extra.map((s) => s.trim()).filter(Boolean)
  );
}

export function hasTextNeedles(sels: string[]): string[] {
  const out: string[] = [];
  for (const s of sels) {
    for (const m of s.matchAll(/:has-text\("([^"]+)"\)/g)) {
      if (m[1]) out.push(m[1]);
    }
  }
  return [...new Set(out)];
}

export function allowsImageUrls(source: FlyerSource): boolean {
  return (
    source.downloadStrategy === "collect-images" ||
    source.downloadStrategy === "open-each-item" ||
    source.downloadStrategy === "click-download" ||
    source.downloadStrategy === "harvest-after-activate" ||
    source.kind === "image-grid" ||
    source.kind === "tabs" ||
    source.kind === "carousel" ||
    source.kind === "react-viewer" ||
    source.kind === "api-json"
  );
}

/** Network docs rich enough to skip modal JPEG harvest. */
export function networkDocsAreRich(network: NetworkFlyerDoc[]): boolean {
  return pruneBarePageImageDocs(network).some(
    (n) =>
      Boolean(n.pdf) ||
      /\.pdf(\?|#|$)/i.test(n.url) ||
      (n.pageUrls?.length ?? 0) >= 2 ||
      (n.pageUrls?.length === 1 &&
        /\.(jpe?g|png|webp|pdf)(\?|$)/i.test(n.pageUrls[0]!)),
  );
}

/** Real flyer record vs lone page JPEG mistaken for a flyer. */
export function isBarePageImageDoc(n: {
  url: string;
  title?: string;
  pdf?: boolean;
  pageUrls?: string[];
}): boolean {
  if (n.pdf || n.title) return false;
  if ((n.pageUrls?.length ?? 0) >= 2) return false;
  if (isFlyerHref(n.url) && !isFlyerPageImageUrl(n.url)) return false;
  if (isFlyerPageImageUrl(n.url)) return true;
  const only = n.pageUrls?.length === 1 ? n.pageUrls[0]! : "";
  return Boolean(only && isFlyerPageImageUrl(only));
}

export function pruneBarePageImageDocs<
  T extends { url: string; title?: string; pdf?: boolean; pageUrls?: string[] },
>(network: T[]): T[] {
  return network.filter((n) => !isBarePageImageDoc(n));
}

/** Prefer titled / multi-page / PDF records when those exist. */
export function groupedNetworkDocs(
  network: NetworkFlyerDoc[],
): NetworkFlyerDoc[] {
  const cleaned = pruneBarePageImageDocs(network);
  const grouped = cleaned.filter(
    (n) =>
      (n.pageUrls?.length ?? 0) >= 2 ||
      Boolean(n.title) ||
      Boolean(n.pdf) ||
      isFlyerHref(n.url),
  );
  return grouped.length ? grouped : cleaned;
}

export function candidatesFromNetwork(
  network: NetworkFlyerDoc[],
  source: FlyerSource,
): DiscoveredCandidate[] {
  const net = groupedNetworkDocs(filterNet(network, source, true));
  if (!net.length) return [];
  return buildLooseCandidates([], net, true).filter(
    (c) => c.pageUrls.length > 0,
  );
}

/** Image/CDN URLs usable as flyer pages when strategy allows. */
export function isPersistableMedia(u: string, allowImages: boolean): boolean {
  if (isJunkNavHref(u)) return false;
  if (isFlyerHref(u)) return true;
  if (!allowImages) return false;
  if (/productcluster|productsquery|productgallery|sku|icon|logo|sprite|favicon|avatar|pixel|tracking/i.test(u)) {
    return false;
  }
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(u)) return true;
  return /jornal|encarte|oferta|flyer|catalog|folheto|flipbook|\/pages?\//i.test(u);
}

function matchesNetworkHints(url: string, source: FlyerSource): boolean {
  const hints = source.networkHints?.urlIncludes;
  if (!hints?.length) return true;
  const low = url.toLowerCase();
  return hints.some((h) => low.includes(h.toLowerCase()));
}

/** Pull url(...) from CSS background-image (Elementor gallery tiles). */
export function urlsFromBackgroundImageCss(css: string): string[] {
  const out: string[] = [];
  const re = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

export async function scanDomImageCandidates(
  page: Page,
  scopeSelector?: string,
): Promise<Array<{ url: string; id?: string; text?: string }>> {
  return page.evaluate((rootSel) => {
    const skipRe =
      /productcluster|productsquery|productgallery|sku|icon|logo|sprite|favicon|avatar|pixel/i;
    const root = rootSel ? document.querySelector(rootSel) : document;
    if (!root) return [];
    const out: Array<{ url: string; id?: string; text?: string }> = [];
    const seen = new Set<string>();
    const push = (raw: string | null | undefined, text?: string) => {
      if (!raw || raw.startsWith("data:") || skipRe.test(raw)) return;
      let abs = raw;
      try {
        abs = new URL(raw, location.href).href;
      } catch {
        return;
      }
      if (seen.has(abs)) return;
      if (!/\.(jpe?g|png|webp)(\?|$)/i.test(abs) && !/encarte|flyer|jornal|wp-content\/uploads/i.test(abs)) {
        return;
      }
      seen.add(abs);
      out.push({ url: abs, text: (text ?? "").trim().slice(0, 80) });
    };
    for (const el of Array.from(root.querySelectorAll("img[src]"))) {
      const href = el.getAttribute("src") ?? "";
      const img = el as HTMLImageElement;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w > 0 && h > 0 && (w < 180 || h < 180)) continue;
      push(
        href,
        img.getAttribute("alt") ?? img.getAttribute("title") ?? "",
      );
      if (out.length >= 40) break;
    }
    // Gallery tiles: a[href]=page jpeg/pdf + div bg / data-thumbnail
    if (out.length < 40) {
      for (const a of Array.from(
        root.querySelectorAll(
          'a.e-gallery-item[href], a.elementor-gallery-item[href], [class*="gallery"] a[href]',
        ),
      )) {
        push(a.getAttribute("href"));
        if (out.length >= 40) break;
      }
      for (const el of Array.from(
        root.querySelectorAll(
          '.e-gallery-image, [class*="gallery-item__image"], [class*="gallery-item"], [data-thumbnail]',
        ),
      )) {
        push(el.getAttribute("data-thumbnail"));
        push(el.getAttribute("data-src"));
        push(el.getAttribute("data-full"));
        const inline = (el as HTMLElement).style?.backgroundImage ?? "";
        const computed = window.getComputedStyle(el).backgroundImage;
        for (const css of [inline, computed]) {
          const re = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
          let m: RegExpExecArray | null;
          while ((m = re.exec(css))) push(m[1]);
        }
        if (out.length >= 40) break;
      }
    }
    // Inline fancybox / slick page assets (Centerbox, Assaí tab panel)
    if (out.length < 40) {
      for (const a of Array.from(
        root.querySelectorAll(
          'a[data-fancybox][href], .slick-slide a[href], .slick-track a[href]',
        ),
      )) {
        push(a.getAttribute("href"));
        if (out.length >= 40) break;
      }
      for (const img of Array.from(
        root.querySelectorAll("img[data-fancybox][src]"),
      )) {
        push(
          img.getAttribute("src"),
          img.getAttribute("alt") ?? img.getAttribute("title") ?? "",
        );
        if (out.length >= 40) break;
      }
    }
    return out;
  }, scopeSelector ?? null);
}

function filterNet(
  network: NetworkFlyerDoc[],
  source: FlyerSource,
  allowImages: boolean,
): NetworkFlyerDoc[] {
  return network.filter((n) => {
    const urls = [n.url, n.sourceUrl, ...(n.pageUrls ?? [])].filter(
      (u): u is string => Boolean(u),
    );
    if (!urls.some((u) => matchesNetworkHints(u, source))) return false;
    return urls.some((u) => isPersistableMedia(u, allowImages));
  });
}

function buildLooseCandidates(
  dom: Array<{ url: string; id?: string; text?: string }>,
  network: NetworkFlyerDoc[],
  allowImages: boolean,
): DiscoveredCandidate[] {
  const classic = buildCandidates(
    dom.filter((d) => isFlyerHref(d.url) || d.id),
    network.filter((n) => isFlyerHref(n.url)),
  );
  if (!allowImages) return classic;

  const byKey = new Map<string, DiscoveredCandidate>();
  for (const c of classic) byKey.set(c.externalId || c.originalUrl, c);

  for (const n of network) {
    if (isBarePageImageDoc(n)) continue;
    const pages = (
      n.pageUrls?.length ? n.pageUrls : [n.url]
    ).filter((u) => isPersistableMedia(u, true));
    if (!pages.length) continue;
    const key = n.title || n.url;
    const existing = byKey.get(key);
    if (existing) {
      for (const u of pages) {
        if (!existing.pageUrls.includes(u)) existing.pageUrls.push(u);
      }
      if (n.title && !existing.title) existing.title = n.title;
      continue;
    }
    byKey.set(key, {
      originalUrl: n.url,
      title: n.title || "Encarte",
      pageUrls: [...new Set(pages)],
      externalId: n.title || n.url,
      validFrom: n.validFrom,
      validUntil: n.validUntil,
    });
  }

  const media = [
    ...dom.map((d) => d.url),
    ...network.flatMap((n) => (n.pageUrls?.length ? n.pageUrls : [n.url])),
  ].filter((u) => isPersistableMedia(u, true));

  if (!media.length && classic.length) return classic;

  if (media.length && !byKey.size) {
    const title =
      dom.find((d) => d.text)?.text ||
      network.find((n) => n.title)?.title ||
      "Encarte";
    const key = media[0]!;
    byKey.set(key, {
      originalUrl: media[0]!,
      title,
      pageUrls: [...new Set(media)],
      externalId: media[0],
    });
  }

  return [...byKey.values()].map((c) => ({
    ...c,
    pageUrls: c.pageUrls.filter((u) => isPersistableMedia(u, allowImages)),
    originalUrl: isPersistableMedia(c.originalUrl, allowImages)
      ? c.originalUrl
      : c.pageUrls[0]!,
  })).filter((c) => c.pageUrls.length && c.originalUrl);
}

async function discoverDirect(
  page: Page,
  scopeSel: string | undefined,
  network: NetworkFlyerDoc[],
  source: FlyerSource,
): Promise<DiscoveredCandidate[]> {
  const allowImages = allowsImageUrls(source);
  const domClassic = await scanDomFlyerCandidates(page, scopeSel);
  const domImages = allowImages
    ? await scanDomImageCandidates(page, scopeSel)
    : [];
  const dom = [...domClassic, ...domImages];
  const net = groupedNetworkDocs(filterNet(network, source, allowImages));
  if (allowImages) return buildLooseCandidates(dom, net, true);
  return buildCandidates(domClassic, net);
}

async function discoverCollectImages(
  page: Page,
  scopeSel: string | undefined,
  network: NetworkFlyerDoc[],
  source: FlyerSource,
): Promise<DiscoveredCandidate[]> {
  const carousel = await harvestCarouselPagesInScope(
    page,
    scopeSel,
    source.pagerSelectors,
  );
  if (carousel.length >= 1) {
    return [
      {
        originalUrl: carousel[0]!,
        title: "Encarte",
        pageUrls: carousel.slice(0, 24),
        externalId: carousel[0]!,
      },
    ];
  }
  const itemSels = await resolveDiscoverItemSelectors(
    page,
    source.itemSelectors,
    scopeSel,
  );
  const root = () =>
    scopeSel ? page.locator(scopeSel).first() : page.locator("body");
  const grouped: DiscoveredCandidate[] = [];
  for (const sel of itemSels) {
    try {
      const n = await root().locator(sel).count();
      if (n < 2) continue;
      for (let i = 0; i < Math.min(n, 12); i++) {
        const item = root().locator(sel).nth(i);
        const title = (
          (await item.innerText().catch(() => "")) ||
          (await item.getAttribute("alt").catch(() => "")) ||
          `item-${i + 1}`
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 150);
        const urls = await item
          .evaluate((el) => {
            const out: string[] = [];
            const seen = new Set<string>();
            const push = (raw: string | null | undefined) => {
              if (!raw) return;
              try {
                const abs = new URL(raw, location.href).href;
                if (seen.has(abs)) return;
                if (!/\.(jpe?g|png|webp)(\?|$)/i.test(abs)) return;
                seen.add(abs);
                out.push(abs);
              } catch {
                /* */
              }
            };
            for (const a of Array.from(
              el.querySelectorAll('a[data-fancybox][href], a[href]'),
            )) {
              push(a.getAttribute("href"));
            }
            for (const img of Array.from(el.querySelectorAll("img[src]"))) {
              push(img.getAttribute("src"));
            }
            return out;
          })
          .catch(() => [] as string[]);
        if (!urls.length) continue;
        grouped.push({
          originalUrl: urls[0]!,
          title: title || `item-${i + 1}`,
          pageUrls: urls.slice(0, 24),
          externalId: `item-${i}-${(title || "encarte").slice(0, 40)}`,
        });
      }
      if (grouped.length) return grouped;
    } catch {
      /* bad sel */
    }
  }
  for (let i = 0; i < 4; i++) {
    if (!(await loadMoreListing(page, source, scopeSel, "img[src]"))) break;
  }
  const imgs = await scanDomImageCandidates(page, scopeSel);
  const net = groupedNetworkDocs(filterNet(network, source, true));
  return buildLooseCandidates(imgs, net, true);
}

/** All slick/fancybox page JPEGs currently in scope (visible + hidden slides). */
async function harvestInlineCarouselPageUrls(
  page: Page,
  scopeSel?: string,
): Promise<string[]> {
  return page.evaluate((rootSel) => {
    const root = rootSel ? document.querySelector(rootSel) : document.body;
    if (!root) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (raw: string | null | undefined) => {
      if (!raw) return;
      try {
        const abs = new URL(raw, location.href).href;
        if (seen.has(abs)) return;
        if (!/\.(jpe?g|png|webp)(\?|$)/i.test(abs)) return;
        seen.add(abs);
        out.push(abs);
      } catch {
        /* */
      }
    };
    for (const a of Array.from(
      root.querySelectorAll(
        'a[data-fancybox][href], .slick-slide a[href], .slick-track a[href]',
      ),
    )) {
      push(a.getAttribute("href"));
    }
    for (const img of Array.from(
      root.querySelectorAll("img[data-fancybox][src], .slick-slide img[src]"),
    )) {
      push(img.getAttribute("src"));
    }
    return out;
  }, scopeSel ?? null);
}

/** Click carousel pager inside listing scope (Assaí tab panels). */
async function harvestCarouselPagesInScope(
  page: Page,
  scopeSel: string | undefined,
  pagerSels?: string[],
): Promise<string[]> {
  const urls: string[] = [];
  const seen = new Set<string>();
  const ingest = async () => {
    for (const u of await harvestInlineCarouselPageUrls(page, scopeSel)) {
      if (seen.has(u)) continue;
      seen.add(u);
      urls.push(u);
    }
  };
  await ingest();
  for (let i = 0; i < 16; i++) {
    const n = urls.length;
    if (!(await clickFirstPager(page, pagerSels))) break;
    await page.waitForTimeout(420);
    await ingest();
    if (urls.length === n) break;
  }
  return urls.slice(0, 24);
}

export function listingKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url.split("#")[0] ?? url;
  }
}

/**
 * Dedup key for discovered flyers. Same-page modal cards use #item-N / #tab-N —
 * stripping the hash collapses São Luiz / Mercadapp flip-cards into one encarte.
 */
export function encarteDedupKey(originalUrl: string): string {
  const m = originalUrl.match(/#(item|tab)-\d+/i);
  if (m) {
    const base = listingKey(originalUrl);
    return `${base}${m[0]!.toLowerCase()}`;
  }
  return listingKey(originalUrl);
}

const GENERIC_ITEM_CTA =
  /^(ver\s+(o\s+)?(encarte|folheto|jornal)(\s+completo)?|baixar|download)$/i;

/** Temporary fallback while DOM title isn't resolved yet — still click the card. */
export function isPlaceholderListingTitle(title: string): boolean {
  return /^item-\d+$/i.test(title.replace(/\s+/g, " ").trim());
}

/** Listing card title noise — CTAs / date-only labels (not placeholders). */
export function isJunkListingTitle(title: string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (isPlaceholderListingTitle(t)) return false;
  if (GENERIC_ITEM_CTA.test(t)) return true;
  if (/^ver\s+encarte/i.test(t)) return true;
  if (/^de\s+\d{1,2}\b/i.test(t) && DATE_RANGE_RE.test(t)) return true;
  if (/^de\s+\d{1,2}\s+a\s+\d/i.test(t)) return true;
  const letters = t.replace(/[^a-záàâãéêíóôõúç]/gi, "");
  if (
    DATE_RANGE_RE.test(t) &&
    letters.length < 8 &&
    /^\s*de\s+/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Fallback title from /encarte/slug/ path. */
export function titleFromEncarteUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1] ?? "";
    if (!slug || slug === "encarte" || slug === "encartes") return "";
    return decodeURIComponent(slug)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "";
  }
}

async function resolveListingItemTitle(
  item: import("playwright").Locator,
  fallbackIndex: number,
): Promise<string> {
  const fromDom = await item
    .evaluate((el) => {
      const junk = (raw: string) => {
        const t = raw.replace(/\s+/g, " ").trim();
        if (!t || /^item-\d+$/i.test(t)) return true;
        if (/^ver\s+encarte/i.test(t)) return true;
        if (/^clique\s*p\/?\s*visualizar/i.test(t)) return true;
        // Date-only labels (Frangolândia fragment) — keep "Name - 02 a 03/09"
        if (/^de\s+\d{1,2}\b/i.test(t) && /\d{1,2}\s*[./-]/.test(t)) {
          return true;
        }
        return false;
      };
      const pick = (raw: string | null | undefined) => {
        const t = (raw ?? "").replace(/\s+/g, " ").trim();
        return t && !junk(t) ? t : "";
      };
      // Tab / journal buttons (Assaí): the item IS the titled control
      if (
        el.matches(
          "button, [role=tab], [data-oferta-index], .ofertas-tab button",
        )
      ) {
        const self = pick(el.textContent);
        if (self) return self.slice(0, 150);
      }
      for (const sel of [
        ".detalhes .titulo",
        "span.titulo",
        ".titulo",
        '[class*="titulo"]',
        "h1",
        "h2",
        "h3",
        "h4",
        ".jet-listing-dynamic-field__content",
        '[class*="listing-dynamic-field"]',
        ".entry-title",
        ".card-title",
      ]) {
        for (const node of Array.from(el.querySelectorAll(sel))) {
          const t = pick(node.textContent);
          if (t) return t.slice(0, 150);
        }
      }
      const overlay =
        el.querySelector("[data-url]") ??
        el.querySelector("a.jet-engine-listing-overlay-link");
      const href =
        overlay?.getAttribute("data-url") ??
        (overlay as HTMLAnchorElement | null)?.href ??
        el.querySelector("a[href]")?.getAttribute("href") ??
        "";
      if (href) {
        try {
          const slug = new URL(href, location.href).pathname
            .split("/")
            .filter(Boolean)
            .pop();
          if (slug && slug !== "encarte" && slug !== "encartes") {
            const t = decodeURIComponent(slug)
              .replace(/[-_]+/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
            if (!junk(t)) return t.slice(0, 150);
          }
        } catch {
          /* */
        }
      }
      const img = el.querySelector("img[alt]");
      const alt = pick(img?.getAttribute("alt") ?? "");
      if (alt) return alt.slice(0, 150);
      return "";
    })
    .catch(() => "");
  if (fromDom && !isJunkListingTitle(fromDom)) return fromDom;
  return `item-${fallbackIndex + 1}`;
}

async function resolveDetailPageTitle(page: Page): Promise<string> {
  const t = await page
    .evaluate(() => {
      const junk = (raw: string) => {
        const s = raw.replace(/\s+/g, " ").trim();
        if (!s || /^de\s+\d{1,2}\b/i.test(s)) return true;
        return false;
      };
      for (const sel of [
        ".titulo-folheto .titulo",
        ".detalhes .titulo",
        "span.titulo",
        ".titulo",
        "h1.entry-title",
        "h1",
        ".entry-title",
        "title",
      ]) {
        const el = document.querySelector(sel);
        const text =
          sel === "title"
            ? document.title
            : (el?.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text && !junk(text)) return text.slice(0, 150);
      }
      return "";
    })
    .catch(() => "");
  if (t && !isJunkListingTitle(t)) return t;
  return titleFromEncarteUrl(page.url());
}

async function returnToListing(
  page: Page,
  listingUrl: string,
  itemSel: string,
) {
  if (listingKey(page.url()) === listingKey(listingUrl)) return;
  await page
    .goBack({ waitUntil: "domcontentloaded", timeout: 8000 })
    .catch(() => undefined);
  if (listingKey(page.url()) !== listingKey(listingUrl)) {
    await page
      .goto(listingUrl, { waitUntil: "domcontentloaded", timeout: 12_000 })
      .catch(() => undefined);
  }
  await page
    .locator(itemSel)
    .first()
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => undefined);
  await page.waitForTimeout(400);
}

/** Same-page tab/card: wait new img src OR overlay canvas (modal flipbook). */
async function waitForSamePageViewerReady(
  page: Page,
  scopeSel: string | undefined,
  before: Set<string>,
  ms = 5000,
): Promise<boolean> {
  if (!before.size) return true;
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const urls = (await scanDomImageCandidates(page, scopeSel)).map((x) => x.url);
    if (urls.some((u) => !before.has(u))) return true;
    if (await overlayVisible(page)) {
      const light = await harvestLightboxUrls(page);
      if (light.some((u) => !before.has(u))) return true;
      // Presence only — full harvestCanvasPages waits for stable paint
      if ((await canvasPaintFingerprint(page)) !== null) return true;
      const flip = await harvestFlipbookBackgroundUrls(page);
      if (flip.some((u) => !before.has(u)) || flip.length > 0) return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function discoverOpenEachItem(
  page: Page,
  scopeSel: string | undefined,
  network: NetworkFlyerDoc[],
  source: FlyerSource,
  say?: (line: string) => void,
): Promise<DiscoveredCandidate[]> {
  const itemSels = await resolveDiscoverItemSelectors(
    page,
    source.itemSelectors,
    scopeSel,
  );
  const listingUrl = page.url();
  const out: DiscoveredCandidate[] = [];
  const seenTitles = new Set<string>();
  const seenUrls = new Set<string>();
  const seenEncartes = new Set<string>();

  const root = () =>
    scopeSel ? page.locator(scopeSel).first() : page.locator("body");

  const harvestOnce = async (
    title: string,
    i: number,
    imgsBefore: Set<string>,
    netBefore: number,
    leftListing: boolean,
    flipbookId?: string,
  ): Promise<DiscoveredCandidate | null> => {
    const harvestScope = leftListing ? undefined : scopeSel;
    const provenDl = (source.downloadSelectors ?? []).length > 0;
    if (provenDl && source.downloadSelectors?.length) {
      const viaDl = await clickDownloadOnce(
        page,
        harvestScope,
        source,
        network,
        title,
        say,
        {
          externalId: `tab-${i}-${title.slice(0, 40)}`,
          originalUrl: `${page.url().split("#")[0]}#tab-${i}`,
        },
      );
      if (viaDl && (viaDl.pageBuffers?.length || viaDl.pageUrls.length)) {
        return viaDl;
      }
    }
    if (
      source.kind === "tabs" &&
      !itemSels.some((s) =>
        /flip-card|jet-listing-grid__item|card-folheto|offers__item/i.test(s),
      )
    ) {
      const carousel = await harvestCarouselPagesInScope(
        page,
        harvestScope ?? scopeSel,
        source.pagerSelectors,
      );
      if (carousel.length) {
        return {
          originalUrl: `${page.url().split("#")[0]}#tab-${i}`,
          title,
          pageUrls: carousel,
          externalId: `tab-${i}-${title.slice(0, 40)}`,
        };
      }
    }
    // ponytail: file PDF (dom/net/embed) → raster all pages. Canvas only if no file.
    const pdfs = [
      ...(await scanDomFlyerCandidates(page, harvestScope))
        .map((d) => d.url)
        .filter((u) => isPdfDocumentUrl(u)),
      ...(await collectViewerPdfUrls(page)),
      ...network
        .slice(netBefore)
        .filter((n) => n.pdf || isPdfDocumentUrl(n.url))
        .map((n) => n.url),
    ].filter((u) => !isJunkNavHref(u));
    const uniquePdfs = [...new Set(pdfs)];
    const pdfBufs = uniquePdfs.length
      ? await fetchPdfBuffers(page, uniquePdfs)
      : [];
    const modalFlipId =
      flipbookId ?? (await flipbookIdFromVisibleModal(page));
    const overlay = await harvestScrolledViewer(
      page,
      source.viewerMode,
      source.pagerSelectors,
    );
    // Listing covers share CDN URLs with flipbook page-1 — don't drop the only page.
    let overlayUrls = overlay.urls;
    if (!leftListing && imgsBefore.size) {
      const delta = overlay.urls.filter((u) => !imgsBefore.has(u));
      if (delta.length) {
        overlayUrls = delta;
      } else if (await overlayVisible(page)) {
        overlayUrls = preferSameFlipbookUrls(overlay.urls, modalFlipId);
      } else {
        overlayUrls = [];
      }
    }
    overlayUrls = preferSameFlipbookUrls(overlayUrls, modalFlipId).filter(
      (u) => !seenUrls.has(u),
    );
    // ponytail: canvas modal has no img URL delta — never drop buffers on imgsBefore filter
    const overlayN = overlayUrls.length + overlay.buffers.length;
    const itemAnchor = `${page.url().split("#")[0]}#item-${i}`;
    const encarteBase = listingKey(page.url().split("#")[0] ?? page.url());
    const overlayGot = (): DiscoveredCandidate => {
      const pageUrls = overlayUrls.length
        ? overlayUrls.slice(0, 24)
        : overlay.buffers.map((b, k) => b.url ?? `capture://canvas-${k}`);
      const base = leftListing ? encarteBase : itemAnchor;
      return {
        originalUrl: base,
        title,
        pageUrls,
        externalId: base,
        pageBuffers: overlay.buffers.length ? overlay.buffers : undefined,
      };
    };
    // Viewer canvas/imgs beat footer cookie PDFs (one-page overlayN=1 used to lose).
    if (overlayN) return overlayGot();
    if (pdfBufs.length) {
      return {
        originalUrl: uniquePdfs[0]!,
        title,
        pageUrls: uniquePdfs,
        externalId: `item-${i}-${title.slice(0, 40)}`,
        pageBuffers: pdfBufs,
      };
    }
    const httpPdf = uniquePdfs.filter((u) => !u.startsWith("blob:"));
    if (httpPdf.length) {
      return {
        originalUrl: httpPdf[0]!,
        title,
        pageUrls: httpPdf,
        externalId: `item-${i}-${title.slice(0, 40)}`,
      };
    }
    const light = overlayUrls;
    const netDelta = filterNet(network.slice(netBefore), source, true).filter(
      (n) => /\.(jpe?g|png|webp)(\?|$)/i.test(n.url) || isFlyerHref(n.url),
    );
    const imgs = await scanDomImageCandidates(page, harvestScope);
    const newImgs = imgs.filter((x) => !imgsBefore.has(x.url));
    const here = page.url();
    const useImgs = leftListing
      ? imgs.filter((x) => !imgsBefore.has(x.url))
      : newImgs;
    const htmlHere =
      leftListing && isPersistableMedia(here, true) ? [here] : [];
    const pageUrls = preferSameFlipbookUrls(
      [
        ...new Set([
          ...pdfs,
          ...light,
          ...useImgs.map((x) => x.url),
          ...netDelta.map((n) => n.url),
          ...htmlHere,
        ]),
      ]
        .filter((u) => !isJunkNavHref(u) && isPersistableMedia(u, true))
        .filter((u) => !seenUrls.has(u)),
      modalFlipId,
    ).slice(0, 24);
    if (!pageUrls.length) return null;
    if (pageUrls.every((u) => seenUrls.has(u))) return null;
    const baseUrl = leftListing ? encarteBase : itemAnchor;
    if (seenEncartes.has(encarteDedupKey(baseUrl))) return null;
    return {
      originalUrl: baseUrl,
      title,
      pageUrls,
      externalId: baseUrl,
    };
  };

  const clickTargets = async (item: Locator): Promise<Locator[]> => {
    const targets: Locator[] = [];
    const wrap = item.locator(
      "xpath=ancestor::*[self::article or contains(@class,'elementor') or contains(@class,'col-')][1]",
    );
    // Mercadapp flip-card: user clicks the cover img — try that first
    const coverImg = item.locator(".card-body img, img").first();
    if ((await coverImg.count()) > 0) targets.push(coverImg);
    const flipBody = item.locator(".card-body").first();
    if ((await flipBody.count()) > 0) targets.push(flipBody);
    targets.push(item);
    for (const sub of [
      "a.jet-engine-listing-overlay-link",
      '[data-url*="/encarte/"]',
      'a[href*="/folheto/"]',
      'a[href*="/encarte/"]',
      'a[target="_blank"]',
    ]) {
      const link = item.locator(sub).first();
      if ((await link.count()) > 0 && !(await isSocialOrExternalJunk(link))) {
        targets.push(link);
      }
      const wrapLink = wrap.locator(sub).first();
      if (
        (await wrapLink.count()) > 0 &&
        !(await isSocialOrExternalJunk(wrapLink))
      ) {
        targets.push(wrapLink);
      }
    }
    for (const needle of hasTextNeedles(itemSels)) {
      const esc = needle.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const q = `a:has-text("${esc}"), button:has-text("${esc}")`;
      const inner = item.locator(q).first();
      if ((await inner.count()) > 0) targets.push(inner);
      const wrapCta = wrap.locator(q).first();
      if ((await wrapCta.count()) > 0) targets.push(wrapCta);
    }
    const btn = item.locator("a, button, [role=button]").first();
    if ((await btn.count()) > 0) targets.push(btn);
    targets.push(item);
    const inner = item.locator("img").first();
    if ((await inner.count()) > 0) targets.push(inner);
    const near = wrap.locator("img").first();
    if ((await near.count()) > 0) targets.push(near);
    return targets;
  };

  for (const sel of itemSels) {
    try {
      // ponytail: 8 pager rounds, 12 flyers max — bump if listings routinely exceed
      for (let round = 0; round < 8 && out.length < 12; round++) {
        const n = await root().locator(sel).count();
        if (!n) {
          say?.(
            `[FLYER] items "${sel}" count=0 scope=${scopeSel ?? "page"}`,
          );
          break;
        }
        say?.(`[FLYER] items "${sel}" count=${n} round=${round}`);
        const limit = Math.min(n, 48);
        const moreNav = limit > 1 || Boolean(source.pagerSelectors?.length);
        for (let i = 0; i < limit && out.length < 48; i++) {
        if (moreNav) {
          await closeFlyerOverlay(page);
          await page.waitForTimeout(200);
        }
        await returnToListing(page, listingUrl, sel);
        const item0 = root().locator(sel).nth(i);
        await item0.scrollIntoViewIfNeeded().catch(() => undefined);
        await page.waitForTimeout(150);
        let title = await resolveListingItemTitle(item0, i);
        if (isJunkListingTitle(title) || isPlaceholderListingTitle(title)) {
          const href = await item0
            .evaluate((el) => {
              const a =
                el.querySelector("a.jet-engine-listing-overlay-link") ??
                el.querySelector("a[href*='/encarte/']") ??
                el.querySelector("[data-url]") ??
                el.querySelector("a[href]");
              return (
                a?.getAttribute("data-url") ??
                (a as HTMLAnchorElement | null)?.href ??
                ""
              );
            })
            .catch(() => "");
          if (href) title = titleFromEncarteUrl(href) || title;
        }
        if (/^(ir para o conteúdo|pular para|skip to content|encartes?)$/i.test(title)) {
          continue;
        }
        // Skip only real noise (VER ENCARTE / date-only). Keep item-N and click.
        if (isJunkListingTitle(title) && !isPlaceholderListingTitle(title)) {
          say?.(`[FLYER] skip junk title "${title.slice(0, 40)}"`);
          continue;
        }
        if (skipStaleFlyerTitle(title)) {
          say?.(`[FLYER] skip stale "${title.slice(0, 40)}"`);
          continue;
        }
        const genericCta =
          GENERIC_ITEM_CTA.test(title) || isPlaceholderListingTitle(title);
        if (title && seenTitles.has(title) && !genericCta) continue;
        if (title && !genericCta) seenTitles.add(title);

        const targets = await clickTargets(item0);
        const cardFlipId = await flipbookIdFromLocator(item0);
        let got: DiscoveredCandidate | null = null;
        for (let t = 0; t < targets.length && !got; t++) {
          await returnToListing(page, listingUrl, sel);
          const item = root().locator(sel).nth(i);
          const loc = (await clickTargets(item))[t];
          if (!loc) continue;
          const imgsBefore = new Set(
            (await scanDomImageCandidates(page, scopeSel)).map((x) => x.url),
          );
          const netBefore = network.length;
          const hrefBefore = await loc
            .evaluate((el) => {
              const a =
                (el as HTMLAnchorElement).href ||
                el.getAttribute("href") ||
                el.closest("a")?.getAttribute("href") ||
                el
                  .closest("[data-url]")
                  ?.getAttribute("data-url") ||
                "";
              return a;
            })
            .catch(() => "");
          const looksNavEncarte = /\/encarte\//i.test(hrefBefore);
          const looksNewTab = await loc
            .evaluate((el) => {
              const t = (
                el.getAttribute("aria-label") ||
                el.getAttribute("title") ||
                el.textContent ||
                ""
              ).toLowerCase();
              const href =
                (el as HTMLAnchorElement).href ||
                el.getAttribute("href") ||
                "";
              const a = el.closest("a");
              const blank =
                el.getAttribute("target") === "_blank" ||
                a?.getAttribute("target") === "_blank";
              return (
                blank ||
                /\/folhet[oós]?\//i.test(href) ||
                /baixar|download|\bpdf\b/.test(t) ||
                /\.(pdf|jpe?g|png|webp)(\?|$)/i.test(href)
              );
            })
            .catch(() => false);
          const popupPromise = looksNewTab
            ? page
                .context()
                .waitForEvent("page", { timeout: 5000 })
                .catch(() => null)
            : Promise.resolve(null);
          const navPromise = looksNavEncarte
            ? page
                .waitForURL((u) => /\/encarte\//i.test(String(u)), {
                  timeout: 10_000,
                })
                .catch(() => null)
            : Promise.resolve(null);
          if (!(await clickMaybeForce(loc))) {
            say?.(`[FLYER] click item ${i} try ${t} falhou`);
            await popupPromise;
            continue;
          }
          say?.(`[FLYER] item ${i} try ${t} click`);
          const popup = await popupPromise;
          await navPromise;
          await Promise.race([
            page.waitForLoadState("domcontentloaded"),
            page.waitForTimeout(2500),
          ]).catch(() => undefined);
          if (popup) {
            await page.waitForTimeout(800);
          } else if (looksNavEncarte) {
            await page.waitForTimeout(600);
          } else {
            // Wait for modal/flipbook even when listing thumbs already filled imgsBefore
            const modalReady = await page
              .locator(
                '.modal.show, .flipbook-modal.show, .modal.fade.show, [role="dialog"]:visible, [class*="flipbook"]',
              )
              .first()
              .waitFor({ state: "visible", timeout: 7000 })
              .then(() => true)
              .catch(() => false);
            if (!modalReady && imgsBefore.size) {
              const ready = await waitForSamePageViewerReady(
                page,
                scopeSel,
                imgsBefore,
                3000,
              );
              if (!ready && !(await overlayVisible(page))) {
                say?.(`[FLYER] item ${i} try ${t} no viewer ready`);
              }
            } else if (modalReady) {
              await page.waitForTimeout(500);
            } else {
              await page.waitForTimeout(800);
            }
          }
          if (popup) {
            const harvested = await harvestPopupUrls(popup, say);
            if (harvested.urls.length || harvested.buffers.length) {
              const pageUrls = harvested.urls.length
                ? harvested.urls
                : harvested.buffers.map(
                    (b, k) => b.url ?? `capture://popup-${k}`,
                  );
              got = {
                originalUrl: pageUrls[0]!,
                title,
                pageUrls,
                externalId: `popup-${i}-${title.slice(0, 40)}`,
                pageBuffers: harvested.buffers.length
                  ? harvested.buffers
                  : undefined,
              };
              say?.(`[FLYER] item ${i} popup media ×${pageUrls.length}`);
            }
          }
          const leftListing =
            listingKey(page.url()) !== listingKey(listingUrl);
          if (leftListing) {
            const detailTitle = await resolveDetailPageTitle(page);
            if (detailTitle && !isJunkListingTitle(detailTitle)) {
              title = detailTitle;
            }
          }
          if (!got) {
            got = await harvestOnce(
              title,
              i,
              imgsBefore,
              netBefore,
              leftListing,
              cardFlipId,
            );
          }
          if (got) got = await paginateViewer(page, got, source);
          if (got) {
            const flipId =
              cardFlipId ??
              (await flipbookIdFromVisibleModal(page)) ??
              flipbookIdFromUrl(
                preferSameFlipbookUrls(got.pageUrls)[0] ?? "",
              );
            const cleaned = preferSameFlipbookUrls(
              got.pageUrls.filter((u) => !seenUrls.has(u)),
              flipId,
            );
            if (!cleaned.length && !(got.pageBuffers?.length)) {
              got = null;
            } else if (cleaned.length) {
              got = { ...got, pageUrls: cleaned };
              if (cardFlipId) {
                say?.(
                  `[FLYER] item ${i} flipbook=${cardFlipId} págs=${cleaned.length}`,
                );
              }
            }
          }
          if (got) {
            const key = encarteDedupKey(got.originalUrl);
            if (seenEncartes.has(key)) {
              say?.(`[FLYER] skip dup encarte ${key.slice(-48)}`);
              got = null;
            } else {
              seenEncartes.add(key);
            }
          }
          if (leftListing) await returnToListing(page, listingUrl, sel);
          else if (moreNav) await closeFlyerOverlay(page);
        }
        if (!got) {
          say?.(`[FLYER] item ${i} harvest vazio`);
          continue;
        }
        for (const u of got.pageUrls) seenUrls.add(u);
        out.push(got);
        }
        if (out.length >= 12) break;
        const grew = await loadMoreListing(page, source, scopeSel, sel);
        if (!grew) break;
      }
      if (out.length) break;
    } catch {
      /* bad selector */
    }
  }

  if (!out.length) {
    say?.("[FLYER] open-each-item vazio");
  }
  return out;
}

/** True when gallery button looks like real file download (PDF/image href or new tab). */
export function hasProvenFileDownload(
  buttons: Array<{
    text: string;
    href?: string;
    selectors?: string[];
    opensTab?: boolean;
  }>,
): boolean {
  return buttons.some((b) => {
    if (b.href && /\.pdf(\?|$)/i.test(b.href)) return true;
    if (b.href && /\.(jpe?g|png|webp)(\?|$)/i.test(b.href)) return true;
    if (b.href && /[?&]download=|content-disposition/i.test(b.href)) return true;
    if ((b.selectors ?? []).some((s) => /href\*=["'][^"']*\.pdf/i.test(s))) {
      return true;
    }
    // ponytail: target=_blank Baixar → popup PDF/image (not same-page viewer liar)
    if (b.opensTab && isFlyerDownloadButton(b.text, b.href)) return true;
    return false;
  });
}

const OVERLAY_IMG_EVAL = () => {
  const skipRe =
    /productcluster|productsquery|sku|icon|logo|sprite|favicon|avatar|pixel|tracking/i;
  const shells: Element[] = [];
  for (const sel of [
    '[role="dialog"]',
    '[aria-modal="true"]',
    ".modal.show",
    ".modal.in",
    ".elementor-lightbox",
    ".fancybox-container",
    ".pswp--open",
    "dialog[open]",
    '[class*="lightbox"]',
    '[class*="Lightbox"]',
    '[class*="flyer-viewer"]',
    '[class*="flipbook"]',
    '[class*="modal"]',
  ]) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const st = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (st.display === "none" || st.visibility === "hidden") continue;
      if (r.width < 80 || r.height < 80) continue;
      shells.push(el);
    }
  }
  if (!shells.length) {
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const st = window.getComputedStyle(el);
      if (st.position !== "fixed" && st.position !== "absolute") continue;
      if (st.display === "none" || st.visibility === "hidden") continue;
      const z = parseInt(st.zIndex, 10);
      if (!Number.isFinite(z) || z < 10) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 240 || r.height < 240) continue;
      const hasBig = [...el.querySelectorAll("img, canvas, embed, object")].some(
        (m) => {
          const mr = m.getBoundingClientRect();
          return mr.width >= 200 && mr.height >= 200;
        },
      );
      if (hasBig) shells.push(el);
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    if (!raw || raw.startsWith("data:") || skipRe.test(raw)) return;
    let abs = raw;
    try {
      abs = new URL(raw, location.href).href;
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };
  const walkBg = (root: Element) => {
    const nodes = [root, ...Array.from(root.querySelectorAll("*"))];
    for (const n of nodes) {
      const inline = (n as HTMLElement).style?.backgroundImage ?? "";
      const computed = window.getComputedStyle(n).backgroundImage;
      for (const css of [inline, computed]) {
        const re = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(css))) push(m[1]);
      }
    }
  };
  const walkImgs = (root: ParentNode) => {
    for (const img of Array.from(root.querySelectorAll("img"))) {
      const el = img as HTMLImageElement;
      const src =
        el.currentSrc ||
        el.src ||
        el.getAttribute("src") ||
        el.getAttribute("data-src") ||
        el.getAttribute("data-full") ||
        el.getAttribute("data-lazy") ||
        el.getAttribute("data-original") ||
        "";
      const w = el.naturalWidth || el.width || 0;
      const h = el.naturalHeight || el.height || 0;
      const pageLike =
        /\.(jpe?g|png|webp)(\?|$)/i.test(src) ||
        /encarte|flyer|jornal|flipbook|pagina|página|\/pages?\//i.test(src);
      // ponytail: keep display:none lazy pages; skip only tiny loaded icons
      if (!pageLike && w > 0 && h > 0 && (w < 280 || h < 280)) continue;
      push(src);
      push(el.getAttribute("data-src"));
      push(el.getAttribute("data-full"));
      push(el.getAttribute("data-lazy"));
      push(el.getAttribute("data-original"));
      const srcset = el.getAttribute("srcset") || el.getAttribute("data-srcset") || "";
      for (const part of srcset.split(",")) {
        push(part.trim().split(/\s+/)[0]);
      }
    }
  };
  // Gallery tiles: a[href] to page jpeg/pdf + div bg / data-thumbnail (not only overlay)
  const walkPageGallery = () => {
    for (const a of Array.from(
      document.querySelectorAll(
        'a.e-gallery-item[href], a.elementor-gallery-item[href], [class*="gallery"] a[href]',
      ),
    )) {
      const href = a.getAttribute("href") ?? "";
      if (/\.(jpe?g|png|webp|pdf)(\?|#|$)/i.test(href)) push(href);
    }
    for (const el of Array.from(
      document.querySelectorAll(
        '.e-gallery-image, [class*="gallery-item__image"], [class*="gallery-item"], [class*="gallery"] [data-thumbnail], [data-thumbnail]',
      ),
    )) {
      push(el.getAttribute("data-thumbnail"));
      push(el.getAttribute("data-src"));
      push(el.getAttribute("data-full"));
      push(el.getAttribute("data-lazy"));
      walkBg(el);
    }
  };
  if (shells.length) {
    for (const root of shells) {
      walkImgs(root);
      walkBg(root);
      for (const a of Array.from(root.querySelectorAll("a[href]"))) {
        const href = a.getAttribute("href") ?? "";
        if (/\.pdf(\?|#|$)/i.test(href) || /flyer|encarte|folheto|jornal/i.test(href)) {
          push(href);
        }
      }
    }
  } else {
    for (const img of Array.from(document.querySelectorAll("img[src]"))) {
      const el = img as HTMLImageElement;
      const r = el.getBoundingClientRect();
      if (r.width < 280 || r.height < 280) continue;
      push(el.currentSrc || el.src);
    }
  }
  walkPageGallery();
  return out;
};

/** Mercadapp CDN: Flipbook_70649_images_processed_….jpg */
export function flipbookIdFromUrl(url: string): string | undefined {
  const m = url.match(/Flipbook_(\d+)/i);
  return m?.[1];
}

/**
 * Keep URLs of one flipbook when Mercadapp listing covers + modal leak together.
 * preferId from the clicked card cover; else majority Flipbook_ID in the set.
 */
export function preferSameFlipbookUrls(
  urls: string[],
  preferId?: string,
): string[] {
  if (urls.length <= 1) return urls;
  if (preferId) {
    const matched = urls.filter((u) => flipbookIdFromUrl(u) === preferId);
    if (matched.length) return matched;
  }
  const counts = new Map<string, number>();
  for (const u of urls) {
    const fid = flipbookIdFromUrl(u);
    if (!fid) continue;
    counts.set(fid, (counts.get(fid) ?? 0) + 1);
  }
  if (counts.size <= 1) return urls;
  let best = "";
  let bestN = 0;
  for (const [fid, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = fid;
    }
  }
  const matched = urls.filter((u) => flipbookIdFromUrl(u) === best);
  return matched.length ? matched : urls;
}

async function flipbookIdFromLocator(
  item: Locator,
): Promise<string | undefined> {
  const id = await item
    .evaluate((el) => {
      const urls: string[] = [];
      for (const img of Array.from(el.querySelectorAll("img"))) {
        const i = img as HTMLImageElement;
        urls.push(i.currentSrc || i.src || i.getAttribute("src") || "");
      }
      for (const n of [el, ...Array.from(el.querySelectorAll("*"))]) {
        const inline = (n as HTMLElement).style?.backgroundImage ?? "";
        const re = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(inline))) urls.push(m[1]!);
      }
      for (const u of urls) {
        const m = /Flipbook_(\d+)/i.exec(u);
        if (m) return m[1]!;
      }
      return null;
    })
    .catch(() => null);
  return id ?? undefined;
}

async function flipbookIdFromVisibleModal(
  page: Page,
): Promise<string | undefined> {
  for (const frame of page.frames()) {
    const id = await frame
      .evaluate(() => {
        const roots = Array.from(
          document.querySelectorAll(
            ".modal.show, .flipbook-modal.show, .modal.fade.show, [role='dialog']",
          ),
        ).filter((el) => {
          const st = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return (
            st.display !== "none" &&
            st.visibility !== "hidden" &&
            r.width > 80 &&
            r.height > 80
          );
        });
        const root = roots.sort(
          (a, b) =>
            b.getBoundingClientRect().width * b.getBoundingClientRect().height -
            a.getBoundingClientRect().width * a.getBoundingClientRect().height,
        )[0];
        if (!root) return null;
        const blob = root.innerHTML;
        const m = /Flipbook_(\d+)/i.exec(blob);
        return m?.[1] ?? null;
      })
      .catch(() => null);
    if (id) return id;
  }
  return undefined;
}

/** Flipbook pages via CSS background-image — visible modal only (not listing covers). */
async function harvestFlipbookBackgroundUrls(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const frame of page.frames()) {
    const part = await frame
      .evaluate(() => {
        const urls: string[] = [];
        const seen = new Set<string>();
        const push = (raw: string) => {
          if (!raw || seen.has(raw)) return;
          if (!/\.(jpe?g|png|webp)(\?|$)/i.test(raw)) return;
          seen.add(raw);
          try {
            urls.push(new URL(raw, location.href).href);
          } catch {
            urls.push(raw);
          }
        };
        const visible = (el: Element) => {
          const st = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return (
            st.display !== "none" &&
            st.visibility !== "hidden" &&
            r.width > 80 &&
            r.height > 80
          );
        };
        const roots = Array.from(
          document.querySelectorAll(
            ".modal.show, .flipbook-modal.show, .modal.fade.show, .modal.in, [role='dialog'][aria-modal='true'], [aria-modal='true']",
          ),
        ).filter(visible);
        // Fallback: largest visible flipbook shell (not listing .flip-card)
        if (!roots.length) {
          for (const el of Array.from(
            document.querySelectorAll(
              '.flipbook-modal, [class*="flipbook-modal"], [class*="FlyerViewer"]',
            ),
          )) {
            if (visible(el)) roots.push(el);
          }
        }
        const walk = (root: Element) => {
          const nodes = [root, ...Array.from(root.querySelectorAll("*"))];
          for (const el of nodes) {
            const inline = (el as HTMLElement).style?.backgroundImage ?? "";
            const computed = window.getComputedStyle(el).backgroundImage;
            for (const css of [inline, computed]) {
              const re = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
              let m: RegExpExecArray | null;
              while ((m = re.exec(css))) push(m[1]!);
            }
            if (el.tagName === "IMG") {
              const img = el as HTMLImageElement;
              push(img.currentSrc || img.src || "");
            }
          }
        };
        for (const root of roots) walk(root);
        return urls;
      })
      .catch(() => [] as string[]);
    out.push(...part);
  }
  return [...new Set(out)];
}

/** Overlay imgs + page gallery tiles (e-gallery data-thumbnail / bg) — all frames. */
export async function harvestLightboxUrls(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const frame of page.frames()) {
    const part = await frame.evaluate(OVERLAY_IMG_EVAL).catch(() => [] as string[]);
    out.push(...part);
  }
  return [...new Set(out)];
}

/** Modal / lightbox / fixed flyer viewer open on page (any frame). */
export async function overlayVisible(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    const ok = await frame
      .evaluate(() => {
        for (const sel of [
          '[role="dialog"]',
          '[aria-modal="true"]',
          "dialog[open]",
          ".fancybox-container",
          ".pswp--open",
          ".elementor-lightbox",
          '[class*="lightbox"]',
          '[class*="Lightbox"]',
          '[class*="flyer-viewer"]',
          '[class*="flipbook"]',
          '[class*="modal"]',
        ]) {
          for (const el of Array.from(document.querySelectorAll(sel))) {
            const st = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (st.display === "none" || st.visibility === "hidden") continue;
            if (r.width < 80 || r.height < 80) continue;
            return true;
          }
        }
        // Custom shells (Mercadapp etc.): fixed/absolute + big media + z-index
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          const st = window.getComputedStyle(el);
          if (st.position !== "fixed" && st.position !== "absolute") continue;
          if (st.display === "none" || st.visibility === "hidden") continue;
          const z = parseInt(st.zIndex, 10);
          if (!Number.isFinite(z) || z < 10) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 240 || r.height < 240) continue;
          const hasBig = [...el.querySelectorAll("img, canvas, embed, object")].some(
            (m) => {
              const mr = m.getBoundingClientRect();
              return mr.width >= 200 && mr.height >= 200;
            },
          );
          const hasBg = [...el.querySelectorAll("*")].some((n) => {
            const bg = window.getComputedStyle(n).backgroundImage;
            return /url\(/i.test(bg) && /\.(jpe?g|png|webp)/i.test(bg);
          });
          if (hasBig || hasBg) return true;
        }
        return false;
      })
      .catch(() => false);
    if (ok) return true;
  }
  return false;
}

/** Same-URL flyer viewer (canvas/modal) — not cookie chrome. */
export async function flyerViewerOpen(page: Page): Promise<boolean> {
  if (await overlayVisible(page)) return true;
  return page.evaluate(() => {
    const big = (el: Element) => {
      const st = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        st.display !== "none" &&
        st.visibility !== "hidden" &&
        r.width >= 200 &&
        r.height >= 200
      );
    };
    if ([...document.querySelectorAll("canvas")].some(big)) return true;
    for (const sel of ['[role="dialog"]', '[aria-modal="true"]', "dialog[open]"]) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (!big(el)) continue;
        if (el.querySelector("canvas")) return true;
        if (
          [...el.querySelectorAll("img")].some((img) => {
            const r = img.getBoundingClientRect();
            return r.width >= 280 && r.height >= 280;
          })
        ) {
          return true;
        }
      }
    }
    return false;
  });
}

/** Fingerprint of largest canvas — dims + sampled pixel sum (detects load/blur). */
async function canvasPaintFingerprint(page: Page): Promise<string | null> {
  for (const frame of page.frames()) {
    const fp = await frame
      .evaluate(() => {
        let best: HTMLCanvasElement | null = null;
        let bestArea = 0;
        for (const c of Array.from(document.querySelectorAll("canvas"))) {
          const r = c.getBoundingClientRect();
          const w = c.width || Math.round(r.width);
          const h = c.height || Math.round(r.height);
          if (w < 200 || h < 200) continue;
          const area = w * h;
          if (area > bestArea) {
            best = c;
            bestArea = area;
          }
        }
        if (!best) return null;
        const w = best.width || Math.round(best.getBoundingClientRect().width);
        const h = best.height || Math.round(best.getBoundingClientRect().height);
        try {
          const ctx = best.getContext("2d", { willReadFrequently: true });
          if (!ctx) return `${w}x${h}:nctx`;
          const step = Math.max(8, Math.floor(Math.min(w, h) / 10));
          let sum = 0;
          let n = 0;
          let min = 765;
          let max = 0;
          for (let y = step; y < h - step; y += step) {
            for (let x = step; x < w - step; x += step) {
              const d = ctx.getImageData(x, y, 1, 1).data;
              const t = d[0]! + d[1]! + d[2]!;
              sum += t;
              n++;
              if (t < min) min = t;
              if (t > max) max = t;
            }
          }
          return `${w}x${h}:${sum}:${n}:${max - min}`;
        } catch {
          try {
            const len = best.toDataURL("image/jpeg", 0.5).length;
            return `${w}x${h}:t:${len}`;
          } catch {
            return `${w}x${h}:tainted`;
          }
        }
      })
      .catch(() => null);
    if (fp) return fp;
  }
  return null;
}

/**
 * Wait until largest canvas paint stops changing (Cometa PDF.js / flipbook).
 * Skips flat empty frames (solid grey mid page-turn).
 */
async function waitForCanvasStable(
  page: Page,
  opts?: { timeoutMs?: number; settleMs?: number },
): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 6000;
  const settleMs = opts?.settleMs ?? 700;
  const deadline = Date.now() + timeoutMs;
  let last: string | null = null;
  let stableSince = 0;
  while (Date.now() < deadline) {
    const fp = await canvasPaintFingerprint(page);
    if (!fp) {
      last = null;
      stableSince = 0;
      await page.waitForTimeout(250);
      continue;
    }
    const range = Number(fp.split(":")[3] ?? "1");
    const flat = Number.isFinite(range) && range < 8 && !fp.includes(":t:");
    if (flat) {
      last = null;
      stableSince = 0;
      await page.waitForTimeout(300);
      continue;
    }
    if (fp === last) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= settleMs) return true;
    } else {
      last = fp;
      stableSince = 0;
    }
    await page.waitForTimeout(280);
  }
  return last !== null;
}

const MIN_CANVAS_JPEG_BYTES = 12_000;

export async function harvestCanvasPages(
  page: Page,
): Promise<NonNullable<DiscoveredCandidate["pageBuffers"]>> {
  await waitForCanvasStable(page);
  const pages: NonNullable<DiscoveredCandidate["pageBuffers"]> = [];
  let idx = 0;
  for (const frame of page.frames()) {
    const dataUrls = await frame
      .evaluate(() => {
        const out: string[] = [];
        for (const c of Array.from(document.querySelectorAll("canvas"))) {
          const r = c.getBoundingClientRect();
          const w = c.width || r.width;
          const h = c.height || r.height;
          if (w < 200 || h < 200) continue;
          try {
            out.push(c.toDataURL("image/jpeg", 0.92));
          } catch {
            /* tainted */
          }
        }
        return out.slice(0, 24);
      })
      .catch(() => [] as string[]);
    for (const dataUrl of dataUrls) {
      const b64 = dataUrl.split(",")[1];
      if (!b64) continue;
      const buffer = Buffer.from(b64, "base64");
      // ~4KB = empty/blurry mid-load capture (Cometa)
      if (buffer.length < MIN_CANVAS_JPEG_BYTES) continue;
      pages.push({
        buffer,
        contentType: "image/jpeg",
        url: `capture://canvas-${idx++}.jpg`,
      });
    }
  }
  if (pages.length) return pages.slice(0, 24);
  const loc = page.locator("canvas").first();
  if ((await loc.count()) === 0) return [];
  if (!(await loc.isVisible().catch(() => false))) return [];
  try {
    await waitForCanvasStable(page, { timeoutMs: 3000, settleMs: 500 });
    const buffer = await loc.screenshot({ type: "jpeg", quality: 92 });
    if (buffer.length < MIN_CANVAS_JPEG_BYTES) return [];
    return [
      { buffer, contentType: "image/jpeg", url: "capture://canvas-0.jpg" },
    ];
  } catch {
    return [];
  }
}

function canvasKey(b: Buffer): string {
  return `${b.length}:${b.subarray(0, 24).toString("hex")}`;
}

/** Scroll overflow pane in overlay (main + iframes). Also overflow:hidden with scrollHeight. */
async function scrollViewer(page: Page): Promise<boolean> {
  let moved = false;
  for (const frame of page.frames()) {
    const ok = await frame
      .evaluate(() => {
        const shells: Element[] = [];
        for (const sel of [
          "[role='dialog']",
          "[aria-modal='true']",
          "dialog[open]",
          "[class*='lightbox']",
          "[class*='Lightbox']",
          "[class*='flipbook']",
          "[class*='flyer-viewer']",
          "[class*='modal']",
        ]) {
          for (const el of Array.from(document.querySelectorAll(sel))) {
            const st = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (st.display === "none" || st.visibility === "hidden") continue;
            if (r.width < 80 || r.height < 80) continue;
            shells.push(el);
          }
        }
        if (!shells.length) {
          for (const el of Array.from(document.querySelectorAll("body *"))) {
            const st = window.getComputedStyle(el);
            if (st.position !== "fixed" && st.position !== "absolute") continue;
            if (st.display === "none" || st.visibility === "hidden") continue;
            const z = parseInt(st.zIndex, 10);
            if (!Number.isFinite(z) || z < 10) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 240 || r.height < 240) continue;
            const hasBig = [
              ...el.querySelectorAll("img, canvas, embed, object"),
            ].some((m) => {
              const mr = m.getBoundingClientRect();
              return mr.width >= 200 && mr.height >= 200;
            });
            if (hasBig) shells.push(el);
          }
        }
        const roots = shells.length ? shells : [document.documentElement];
        const found: { el: HTMLElement; rank: number; size: number }[] = [];
        for (const root of roots) {
          const nodes = [root, ...Array.from(root.querySelectorAll("*"))];
          for (const node of nodes) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.scrollHeight < node.clientHeight + 40) continue;
            const st = window.getComputedStyle(node);
            const oy = `${st.overflowY} ${st.overflow}`;
            const rank = /(auto|scroll|overlay)/i.test(oy)
              ? 2
              : /hidden/i.test(oy)
                ? 1
                : 0;
            if (!rank) continue;
            found.push({ el: node, rank, size: node.scrollHeight });
          }
        }
        found.sort((a, b) => b.rank - a.rank || b.size - a.size);
        const h = found[0]?.el;
        if (!h) {
          const se = document.scrollingElement as HTMLElement | null;
          if (!se || se.scrollHeight < se.clientHeight + 40) return false;
          const before = se.scrollTop;
          se.scrollTop += Math.max(Math.floor(se.clientHeight * 0.9), 360);
          return se.scrollTop > before + 8;
        }
        const before = h.scrollTop;
        h.scrollTop += Math.max(Math.floor(h.clientHeight * 0.9), 360);
        return h.scrollTop > before + 8;
      })
      .catch(() => false);
    if (ok) moved = true;
  }
  return moved;
}

async function nudgeViewer(page: Page): Promise<void> {
  for (const frame of page.frames()) {
    await frame
      .evaluate(() => {
        const imgs = Array.from(document.querySelectorAll("img"));
        let last: HTMLImageElement | undefined;
        for (const img of imgs) {
          const src =
            img.currentSrc || img.src || img.getAttribute("data-src") || "";
          if (
            !/\.(jpe?g|png|webp)|encarte|flyer|jornal|pagina|página/i.test(src) &&
            img.naturalWidth < 200
          ) {
            continue;
          }
          last = img;
        }
        last?.scrollIntoView({ block: "nearest", inline: "nearest" });
      })
      .catch(() => undefined);
  }
  const vp = page.viewportSize();
  if (vp) {
    await page.mouse
      .move(Math.floor(vp.width / 2), Math.floor(vp.height / 2))
      .catch(() => undefined);
  }
  await page.keyboard.press("PageDown").catch(() => undefined);
  await page.mouse.wheel(0, 900).catch(() => undefined);
}

/** True if overlay has a scrollable pane (no move). */
async function overlayCanScroll(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    const ok = await frame
      .evaluate(() => {
        const shells: Element[] = [];
        for (const sel of [
          "[role='dialog']",
          "[aria-modal='true']",
          "dialog[open]",
          "[class*='lightbox']",
          "[class*='flyer-viewer']",
          "[class*='flipbook']",
          "[class*='modal']",
        ]) {
          for (const el of Array.from(document.querySelectorAll(sel))) {
            const st = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (st.display === "none" || st.visibility === "hidden") continue;
            if (r.width < 80 || r.height < 80) continue;
            shells.push(el);
          }
        }
        const roots = shells.length ? shells : [document.documentElement];
        for (const root of roots) {
          for (const node of [root, ...Array.from(root.querySelectorAll("*"))]) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.scrollHeight < node.clientHeight + 40) continue;
            const st = window.getComputedStyle(node);
            const oy = `${st.overflowY} ${st.overflow}`;
            if (/(auto|scroll|overlay|hidden)/i.test(oy)) return true;
          }
        }
        const se = document.scrollingElement;
        return Boolean(se && se.scrollHeight > se.clientHeight + 40);
      })
      .catch(() => false);
    if (ok) return true;
  }
  return false;
}

/**
 * Resolve viewer page pattern. Teach wins except pdf-when-images.
 * Never treat a tall single image as many pages (no viewport screenshots).
 */
async function resolveViewerMode(
  page: Page,
  hinted?: FlyerViewerMode,
): Promise<FlyerViewerMode> {
  const elementor = await page
    .evaluate(() =>
      Boolean(
        document.querySelector(
          ".elementor-gallery__container, .e-gallery-item, .elementor-lightbox",
        ),
      ),
    )
    .catch(() => false);
  if (elementor) return "img-stack";
  const urls = await harvestLightboxUrls(page);
  if (hinted && hinted !== "pdf") return hinted;
  if (urls.length >= 2) return "img-stack";
  const pdfs = await collectViewerPdfUrls(page);
  if (pdfs.length && urls.length === 0) return "pdf";
  if (await overlayCanScroll(page)) return "lazy-scroll";
  return "one-page";
}

async function harvestScrolledViewer(
  page: Page,
  modeHint?: FlyerViewerMode,
  pagerSels?: string[],
): Promise<{
  urls: string[];
  buffers: NonNullable<DiscoveredCandidate["pageBuffers"]>;
}> {
  const urls: string[] = [];
  const buffers: NonNullable<DiscoveredCandidate["pageBuffers"]> = [];
  const seenUrl = new Set<string>();
  const seenBuf = new Set<string>();
  const ingest = async () => {
    for (const u of await harvestLightboxUrls(page)) {
      if (!isPersistableMedia(u, true) || seenUrl.has(u)) continue;
      seenUrl.add(u);
      urls.push(u);
    }
    for (const c of await harvestCanvasPages(page)) {
      const k = canvasKey(c.buffer);
      if (seenBuf.has(k)) continue;
      seenBuf.add(k);
      buffers.push({
        ...c,
        url: `capture://canvas-${buffers.length}.jpg`,
      });
    }
    for (const u of await harvestFlipbookBackgroundUrls(page)) {
      if (!isPersistableMedia(u, true) || seenUrl.has(u)) continue;
      seenUrl.add(u);
      urls.push(u);
    }
  };
  await ingest();
  const mode = await resolveViewerMode(page, modeHint);
  const paginateWithButtons = async () => {
    for (let i = 0; i < 16 && urls.length + buffers.length < 24; i++) {
      const n = urls.length + buffers.length;
      if (!(await clickFirstPager(page, pagerSels))) break;
      // Cometa canvas needs paint settle after page-turn (was 420 → blur/grey)
      await page.waitForTimeout(900);
      await ingest();
      if (urls.length + buffers.length === n) break;
    }
  };
  // Canvas / flipbook modals: pager buttons beat scroll
  if (
    (mode === "one-page" || mode === "pdf") &&
    (buffers.length || pagerSels?.length)
  ) {
    await paginateWithButtons();
    return { urls: urls.slice(0, 24), buffers: buffers.slice(0, 24) };
  }
  // ponytail: one-page / pdf → no scroll harvest (tall 1-img ≠ N pages)
  if (mode === "one-page" || mode === "pdf") {
    return { urls: urls.slice(0, 24), buffers: buffers.slice(0, 24) };
  }
  let stale = 0;
  // img-stack / lazy-scroll: pager first, then scroll
  for (let i = 0; i < 24 && urls.length + buffers.length < 24; i++) {
    const n = urls.length + buffers.length;
    const paged = await clickFirstPager(page, pagerSels);
    if (paged) {
      await page.waitForTimeout(900);
      await ingest();
      if (urls.length + buffers.length > n) continue;
    }
    const moved = await scrollViewer(page);
    if (!moved) {
      if (mode === "lazy-scroll") await nudgeViewer(page);
      else break;
    }
    await page.waitForTimeout(moved ? 400 : 650);
    const prev = urls.length + buffers.length;
    await ingest();
    if (urls.length + buffers.length > prev) {
      stale = 0;
      continue;
    }
    stale += 1;
    if (stale >= 3) break;
  }
  return { urls: urls.slice(0, 24), buffers: buffers.slice(0, 24) };
}

async function collectViewerPdfUrls(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const frame of page.frames()) {
    const urls = await frame
      .evaluate(() => {
        const found: string[] = [];
        for (const el of Array.from(
          document.querySelectorAll("embed, object, iframe, a[href]"),
        )) {
          const src =
            el.getAttribute("src") ||
            el.getAttribute("data") ||
            el.getAttribute("href") ||
            "";
          if (!src) continue;
          const type = el.getAttribute("type") ?? "";
          const tag = el.tagName;
          const blobViewer =
            /^blob:/i.test(src) &&
            (/pdf/i.test(type) ||
              tag === "EMBED" ||
              tag === "OBJECT" ||
              (tag === "IFRAME" && Boolean(el.closest("[role='dialog'], [aria-modal='true'], dialog"))));
          if (!/\.pdf(\?|#|$)/i.test(src) && !/pdf/i.test(type) && !blobViewer) {
            continue;
          }
          try {
            found.push(new URL(src, location.href).href);
          } catch {
            /* skip */
          }
        }
        return found;
      })
      .catch(() => [] as string[]);
    out.push(...urls);
  }
  return [...new Set(out)];
}

async function fetchPdfBuffers(
  page: Page,
  urls: string[],
): Promise<NonNullable<DiscoveredCandidate["pageBuffers"]>> {
  const out: NonNullable<DiscoveredCandidate["pageBuffers"]> = [];
  for (const url of urls.slice(0, 4)) {
    try {
      let buffer: Buffer | undefined;
      if (url.startsWith("blob:")) {
        let b64 = "";
        for (const frame of page.frames()) {
          b64 = await frame
            .evaluate(async (u) => {
              const r = await fetch(u);
              const bytes = new Uint8Array(await r.arrayBuffer());
              if (bytes.length < 5) return "";
              const head = String.fromCharCode(
                bytes[0]!,
                bytes[1]!,
                bytes[2]!,
                bytes[3]!,
                bytes[4]!,
              );
              if (head !== "%PDF-") return "";
              let bin = "";
              const step = 0x8000;
              for (let i = 0; i < bytes.length; i += step) {
                bin += String.fromCharCode(...bytes.subarray(i, i + step));
              }
              return btoa(bin);
            }, url)
            .catch(() => "");
          if (b64) break;
        }
        if (b64) buffer = Buffer.from(b64, "base64");
      } else {
        const res = await page.request.get(url, { timeout: 20_000 });
        if (res.ok()) buffer = Buffer.from(await res.body());
      }
      if (!buffer?.length) continue;
      const pdf =
        buffer.subarray(0, 5).toString("latin1") === "%PDF-" ||
        isPdfDocumentUrl(url);
      if (!pdf) continue;
      out.push({ buffer, contentType: "application/pdf", url });
    } catch {
      /* next url */
    }
  }
  return out;
}

async function clickMaybeForce(loc: Locator): Promise<boolean> {
  try {
    await loc.click({ timeout: 4000 });
    return true;
  } catch {
    try {
      await loc.click({ timeout: 4000, force: true });
      return true;
    } catch {
      return false;
    }
  }
}

const DEFAULT_PAGER = [
  ".swiper-button-next:not(.swiper-button-disabled)",
  ".slick-next:not(.slick-disabled)",
  'button[aria-label*="próximo" i]',
  'button[aria-label*="proximo" i]',
  'button[aria-label*="próxima" i]',
  'button[aria-label*="proxima" i]',
  'button[aria-label*="Next" i]',
  '[aria-label*="próxima" i]',
  '[aria-label*="proxima" i]',
  ".slider-next",
  '[class*="slider-next"]',
  'button:has-text("Ver mais")',
  'button:has-text("Mostrar mais")',
  'a:has-text("Ver mais")',
];

const SOCIAL_CLICK_RE =
  /youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|whatsapp|aria-label=["']?(youtube|instagram|facebook|linkedin)/i;

const PAGER_OVERLAY_ROOTS = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  ".modal.show",
  ".modal.in",
  ".fancybox-container",
  ".pswp--open",
  ".elementor-lightbox",
  '[class*="lightbox"]',
  '[class*="Lightbox"]',
  '[class*="flipbook"]',
  '[class*="flyer-viewer"]',
  '[class*="FlyerViewer"]',
];

async function isSocialOrExternalJunk(loc: Locator): Promise<boolean> {
  return loc
    .evaluate((el) => {
      const a =
        el.closest("a") ??
        (el.tagName === "A" ? (el as HTMLAnchorElement) : null);
      const href =
        (a as HTMLAnchorElement | null)?.href ??
        el.getAttribute("href") ??
        "";
      const label = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""} ${(el as HTMLElement).innerText ?? ""}`;
      return /youtube|youtu\.be|instagram|facebook|linkedin|tiktok|whatsapp|twitter|\bx\b\.com/i.test(
        `${href} ${label}`,
      );
    })
    .catch(() => false);
}

/** Prefer modal/viewer shell when open — avoid header social icons (Cometa YouTube). */
async function pagerSearchRoots(page: Page): Promise<Locator[]> {
  if (await overlayVisible(page)) {
    const roots: Locator[] = [];
    for (const sel of PAGER_OVERLAY_ROOTS) {
      try {
        const loc = page.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        if (!(await loc.isVisible().catch(() => false))) continue;
        roots.push(loc);
      } catch {
        /* */
      }
    }
    if (roots.length) return roots;
  }
  return [page.locator("body")];
}

async function clickFirstPager(
  page: Page,
  extra?: string[],
): Promise<boolean> {
  const skipPrev = /prev|anterior|slick-prev|button-prev/i;
  const sels = [
    ...(sanitizePagerSelectors(extra) ?? []),
    ...DEFAULT_PAGER,
  ].filter((s) => !SOCIAL_CLICK_RE.test(s));
  const roots = await pagerSearchRoots(page);
  for (const sel of sels) {
    if (skipPrev.test(sel) && !/next|pr[oó]ximo|mais/i.test(sel)) continue;
    for (const root of roots) {
      try {
        const loc = root.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        if (!(await loc.isVisible().catch(() => false))) continue;
        const dis = await loc.getAttribute("aria-disabled").catch(() => null);
        if (dis === "true") continue;
        if (await isSocialOrExternalJunk(loc)) continue;
        if (!(await clickMaybeForce(loc))) continue;
        await page.waitForTimeout(450);
        return true;
      } catch {
        /* bad sel / root */
      }
    }
  }
  return false;
}

async function loadMoreListing(
  page: Page,
  source: FlyerSource,
  scopeSel: string | undefined,
  itemSel: string,
): Promise<boolean> {
  const root = scopeSel ? page.locator(scopeSel).first() : page.locator("body");
  const before = await root.locator(itemSel).count().catch(() => 0);
  if (await clickFirstPager(page, source.pagerSelectors)) return true;
  await page
    .evaluate(() => {
      const el = document.querySelector(
        "[class*='swiper'], [class*='carousel'], [class*='slick']",
      );
      (el ?? document.scrollingElement)?.scrollBy(0, 480);
    })
    .catch(() => undefined);
  await page.waitForTimeout(400);
  const after = await root.locator(itemSel).count().catch(() => 0);
  return after > before;
}

async function paginateViewer(
  page: Page,
  got: DiscoveredCandidate,
  source: FlyerSource,
): Promise<DiscoveredCandidate> {
  const canPaginate =
    (await overlayVisible(page)) ||
    (await flyerViewerOpen(page)) ||
    Boolean(source.pagerSelectors?.length);
  if (!canPaginate) return got;
  const urls = [...got.pageUrls];
  const bufs = [...(got.pageBuffers ?? [])];
  if (bufs.some((b) => isPdfCapBuf(b))) return got;
  let stale = 0;
  for (let i = 0; i < 10; i++) {
    const n = urls.length + bufs.length;
    const paged = await clickFirstPager(page, source.pagerSelectors);
    const scrolled = paged ? false : await scrollViewer(page);
    if (!paged && !scrolled) await nudgeViewer(page);
    // Extra settle after canvas pager (Cometa mid-turn = grey/blur capture)
    await page.waitForTimeout(paged || scrolled ? 900 : 700);
    const light = await harvestLightboxUrls(page);
    for (const u of light) {
      if (!urls.includes(u)) urls.push(u);
    }
    for (const u of await harvestFlipbookBackgroundUrls(page)) {
      if (!urls.includes(u)) urls.push(u);
    }
    const canvases = await harvestCanvasPages(page);
    for (const c of canvases) {
      const k = canvasKey(c.buffer);
      if (bufs.some((b) => canvasKey(b.buffer) === k)) continue;
      bufs.push({ ...c, url: `capture://canvas-${bufs.length}.jpg` });
    }
    if (urls.length + bufs.length > n) {
      stale = 0;
      continue;
    }
    stale += 1;
    if (stale >= 3) break;
  }
  return {
    ...got,
    pageUrls: urls.slice(0, 24),
    pageBuffers: bufs.length ? bufs.slice(0, 24) : got.pageBuffers,
  };
}

function isPdfCapBuf(b: { buffer: Buffer; contentType: string }): boolean {
  return (
    b.contentType.includes("pdf") ||
    (b.buffer.length >= 5 &&
      b.buffer.subarray(0, 5).toString("latin1") === "%PDF-")
  );
}

export async function closeFlyerOverlay(page: Page): Promise<void> {
  for (let round = 0; round < 3; round++) {
    if (round > 0 && !(await overlayVisible(page))) {
      await scrubBootstrapModalResidue(page);
      return;
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    await page
      .evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll(
            'button, a[role="button"], [role="button"], .close, .btn-close',
          ),
        );
        for (const el of nodes) {
          const st = window.getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden") continue;
          const label = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`.trim();
          const text = ((el as HTMLElement).innerText ?? "").trim();
          if (
            /fechar|close/i.test(label) ||
            /^(fechar|close|×|✕)$/i.test(text)
          ) {
            (el as HTMLElement).click();
            return;
          }
        }
        const svg = document.querySelector("svg.lucide-x");
        const btn =
          svg?.closest("button, a, [role=button]") ?? svg;
        (btn as HTMLElement | null)?.click();
      })
      .catch(() => undefined);
    const sels = [
      'button[aria-label="Close"]',
      'button[aria-label="Fechar"]',
      'button[aria-label*="Fechar" i]',
      'button[aria-label*="Close" i]',
      'button:has-text("Fechar")',
      "button:has(svg.lucide-x)",
      "svg.lucide-x",
      '[role="dialog"] button.close',
      ".modal .close",
      ".lightbox .close",
      ".btn-close",
      '[data-dismiss="modal"]',
      '[data-bs-dismiss="modal"]',
      '[class*="close-button"]',
      '[class*="CloseButton"]',
    ];
    for (const sel of sels) {
      try {
        const loc = page.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        if (!(await loc.isVisible().catch(() => false))) continue;
        await loc.click({ timeout: 1200, force: true });
        break;
      } catch {
        /* try next */
      }
    }
    await scrubBootstrapModalResidue(page);
    await page.waitForTimeout(280);
  }
  await scrubBootstrapModalResidue(page);
}

/** Bootstrap leave .modal-backdrop after Esc — blocks side cards, middle still clickable. */
async function scrubBootstrapModalResidue(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      document
        .querySelectorAll(".modal-backdrop, .offcanvas-backdrop")
        .forEach((e) => e.remove());
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("overflow");
      document.body.style.removeProperty("padding-right");
      for (const m of Array.from(
        document.querySelectorAll(".modal.show, .modal"),
      )) {
        (m as HTMLElement).classList.remove("show");
        (m as HTMLElement).style.display = "none";
        m.setAttribute("aria-hidden", "true");
      }
    })
    .catch(() => undefined);
}

async function readPlaywrightDownload(
  download: Download,
  say?: (line: string) => void,
): Promise<{ buffer: Buffer; contentType: string; name: string } | null> {
  const dir = await mkdtemp(join(tmpdir(), "cestou-dl-"));
  try {
    const name = download.suggestedFilename() || "download.bin";
    const filePath = join(dir, name);
    await download.saveAs(filePath);
    const buffer = await readFile(filePath);
    if (!buffer.length) {
      say?.("[FLYER] download saveAs empty");
      return null;
    }
    const contentType =
      detectContentType(buffer) ?? "application/octet-stream";
    if (!detectContentType(buffer)) {
      say?.(`[FLYER] download magic unknown file=${name}`);
      return null;
    }
    say?.(`[FLYER] download saveAs ok file=${name} bytes=${buffer.length}`);
    return { buffer, contentType, name };
  } catch (err) {
    say?.(`[FLYER] download saveAs fail: ${String(err)}`);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

type PopupHarvest = {
  urls: string[];
  buffers: NonNullable<DiscoveredCandidate["pageBuffers"]>;
};

async function harvestPopupUrls(
  popup: Page,
  say?: (line: string) => void,
): Promise<PopupHarvest> {
  const urls: string[] = [];
  const buffers: NonNullable<DiscoveredCandidate["pageBuffers"]> = [];
  try {
    await popup.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => undefined);
    await popup.waitForTimeout(800);
    const u = popup.url();
    // Header social misfires (Cometa YouTube) — close and ignore
    if (
      /youtube\.com|youtu\.be|instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|whatsapp/i.test(
        u,
      )
    ) {
      say?.(`[FLYER] popup social ignorado ${u.slice(0, 80)}`);
      await popup.close().catch(() => undefined);
      return { urls: [], buffers: [] };
    }
    const meta = await popup
      .evaluate(() => ({
        contentType: document.contentType || "",
        embed:
          (document.querySelector("embed, object") as HTMLEmbedElement | null)
            ?.src ||
          document.querySelector("embed, object")?.getAttribute("data") ||
          "",
      }))
      .catch(() => ({ contentType: "", embed: "" }));
    const fileTab =
      /pdf/i.test(meta.contentType) || /^image\//i.test(meta.contentType);
    if (u && !u.startsWith("about:")) {
      if (isPersistableMedia(u, true) || fileTab) {
        if (!u.startsWith("blob:")) urls.push(u);
        say?.(`[FLYER] popup url=${u.slice(0, 120)}`);
      }
    }
    if (meta.embed && isPersistableMedia(meta.embed, true)) {
      urls.push(meta.embed);
    }
    // Capture bytes before close — blob/chrome PDF viewer die with the tab
    if (fileTab || u.startsWith("blob:") || /\.pdf(\?|$)/i.test(u)) {
      try {
        const bytes = await popup.evaluate(async () => {
          const r = await fetch(location.href);
          const ab = await r.arrayBuffer();
          return Array.from(new Uint8Array(ab));
        });
        if (bytes?.length) {
          const buffer = Buffer.from(bytes);
          const contentType =
            detectContentType(buffer) ??
            (meta.contentType || "application/octet-stream");
          buffers.push({
            buffer,
            contentType,
            url: u.startsWith("blob:") ? `capture://popup.bin` : u,
          });
          say?.(`[FLYER] popup bytes=${buffer.length}`);
        }
      } catch {
        /* not fetchable from tab */
      }
    }
    const imgs = await scanDomImageCandidates(popup);
    for (const img of imgs) urls.push(img.url);
    const classic = await scanDomFlyerCandidates(popup);
    for (const c of classic) urls.push(c.url);
    const light = await harvestLightboxUrls(popup);
    urls.push(...light);
    return { urls: [...new Set(urls)], buffers };
  } catch {
    return { urls, buffers };
  } finally {
    await popup.close().catch(() => undefined);
  }
}

async function clickDownloadOnce(
  page: Page,
  scopeSel: string | undefined,
  source: FlyerSource,
  network: NetworkFlyerDoc[],
  title: string,
  say?: (line: string) => void,
  identity?: { externalId: string; originalUrl: string },
): Promise<DiscoveredCandidate | null> {
  const dlSels = source.downloadSelectors?.length
    ? source.downloadSelectors
    : [
        'button:has-text("Baixar")',
        'a:has-text("Baixar")',
        'a:has-text("Baixar página")',
        'button:has-text("Download")',
        'a:has-text("Download")',
        'a[href*=".pdf"]',
        "a[download]",
      ];
  const root = scopeSel ? page.locator(scopeSel).first() : page.locator("body");
  const before = network.length;
  const imgsBefore = new Set(
    (await scanDomImageCandidates(page, scopeSel)).map((i) => i.url),
  );

  for (const sel of dlSels) {
    try {
      const btn = root.locator(sel).first();
      if ((await btn.count()) === 0) continue;
      say?.(`[FLYER] click-download "${sel}"`);

      const ctx = page.context();
      const downloadPromise = page
        .waitForEvent("download", { timeout: 7000 })
        .catch(() => null);
      const popupPromise = ctx
        .waitForEvent("page", { timeout: 7000 })
        .catch(() => null);

      await btn.click({ timeout: 4000, force: true });
      const [download, popup] = await Promise.all([
        downloadPromise,
        popupPromise,
      ]);
      await page.waitForTimeout(1400);

      const pageBuffers: NonNullable<DiscoveredCandidate["pageBuffers"]> = [];
      const urls: string[] = [];
      let overlayUrls: string[] = [];

      // 1) real browser download → saveAs (blob/opaque ok)
      if (download) {
        const saved = await readPlaywrightDownload(download, say);
        if (saved) {
          pageBuffers.push({
            buffer: saved.buffer,
            contentType: saved.contentType,
            url: `capture://${saved.name}`,
          });
        }
        const u = download.url();
        if (u && !u.startsWith("blob:") && isPersistableMedia(u, true)) {
          urls.push(u);
        }
      }

      // 2) popup / new tab
      if (popup) {
        const fromPopup = await harvestPopupUrls(popup, say);
        urls.push(...fromPopup.urls);
        pageBuffers.push(...fromPopup.buffers);
        if (fromPopup.urls.length || fromPopup.buffers.length) {
          say?.(
            `[FLYER] popup media ×${fromPopup.urls.length} buf ×${fromPopup.buffers.length}`,
          );
        }
      }

      // 3) lightbox / modal / viewer on same page
      if (!pageBuffers.length) {
        const pdfUrls = [
          ...(await collectViewerPdfUrls(page)),
          ...network.slice(before).filter((n) => n.pdf || isPdfDocumentUrl(n.url)).map((n) => n.url),
        ];
        const pdfBufs = await fetchPdfBuffers(page, [...new Set(pdfUrls)]);
        if (pdfBufs.length) {
          pageBuffers.push(...pdfBufs);
          say?.(`[FLYER] pdf file ×${pdfBufs.length}`);
        }
      }
      if (!pageBuffers.some((b) => isPdfCapBuf(b))) {
        const overlay = await harvestScrolledViewer(
          page,
          source.viewerMode,
          source.pagerSelectors,
        );
        overlayUrls = overlay.urls;
        urls.push(...overlay.urls);
        if (overlay.urls.length) say?.(`[FLYER] lightbox/viewer ×${overlay.urls.length}`);
        if (!pageBuffers.length) {
          pageBuffers.push(...overlay.buffers);
          if (overlay.buffers.length) say?.(`[FLYER] canvas ×${overlay.buffers.length}`);
        }
      }

      // 4) new DOM images vs pre-click
      const imgsAfter = await scanDomImageCandidates(page, scopeSel);
      for (const img of imgsAfter) {
        if (!imgsBefore.has(img.url)) urls.push(img.url);
      }
      if (!urls.length && !pageBuffers.length) {
        for (const img of imgsAfter) urls.push(img.url);
      }

      // 5) network harvest after click
      for (const n of network.slice(before)) {
        if (isPersistableMedia(n.url, true) || isFlyerHref(n.url)) {
          urls.push(n.url);
        }
      }
      for (const n of filterNet(network, source, true).slice(-15)) {
        if (isPersistableMedia(n.url, true)) urls.push(n.url);
      }

      // 6) href on button itself
      const href = await btn.getAttribute("href").catch(() => null);
      if (href) {
        try {
          const abs = new URL(href, page.url()).href;
          if (/^https?:/i.test(abs)) urls.push(abs);
        } catch {
          /* ignore */
        }
      }

      const unique = [...new Set(urls)].filter((u) =>
        isPersistableMedia(u, true),
      );
      const preferExt = unique.filter((u) =>
        /\.(jpe?g|png|webp|pdf)(\?|$)/i.test(u),
      );
      const fromViewer = unique.filter((u) => overlayUrls.includes(u));
      // Viewer/lightbox first. Never persist listing HTML just because /oferta/ matches.
      const pageUrls = (
        pageBuffers.length
          ? preferExt
          : fromViewer.length
            ? [...new Set([...fromViewer, ...preferExt])]
            : preferExt.length
              ? preferExt
              : unique.filter((u) => /\.(jpe?g|png|webp|pdf)(\?|$)/i.test(u))
      ).slice(0, 40);

      if (!pageBuffers.length && !pageUrls.length) {
        say?.(`[FLYER] click-download "${sel}" → no media (viewer empty?)`);
        continue;
      }
      say?.(
        `[FLYER] click-download ok ×${pageUrls.length} url` +
          (pageBuffers.length ? ` +${pageBuffers.length} buf` : ""),
      );

      const originalUrl =
        identity?.originalUrl ||
        pageUrls[0] ||
        pageBuffers[0]?.url ||
        `${page.url()}#${title}`;
      return {
        originalUrl,
        title,
        pageUrls: pageUrls.length
          ? pageUrls
          : pageBuffers.map((b, i) => b.url ?? `capture://${i}`),
        externalId: identity?.externalId,
        pageBuffers: pageBuffers.length ? pageBuffers : undefined,
      };
    } catch {
      say?.(`[FLYER] download selector fail: ${sel}`);
    }
  }
  return null;
}

async function discoverClickDownload(
  page: Page,
  scopeSel: string | undefined,
  network: NetworkFlyerDoc[],
  source: FlyerSource,
  say?: (line: string) => void,
): Promise<DiscoveredCandidate[]> {
  const itemSels = source.itemSelectors?.length
    ? source.itemSelectors
    : ['[role="tab"]', "[data-oferta-index]"];

  const out: DiscoveredCandidate[] = [];
  const root = scopeSel ? page.locator(scopeSel).first() : page.locator("body");
  let usedTabs = false;
  const seenIds = new Set<string>();

  for (const sel of itemSels) {
    try {
      const locs = root.locator(sel);
      const n = await locs.count();
      if (!n) continue;
      usedTabs = true;
      const limit = Math.min(n, 12);
      const moreNav = limit > 1;
      say?.(`[FLYER] click-download tabs "${sel}" ×${limit}`);
      for (let i = 0; i < limit; i++) {
        if (moreNav) await closeFlyerOverlay(page);
        const item = locs.nth(i);
        const ofertaIdx = await item
          .getAttribute("data-oferta-index")
          .catch(() => null);
        const title = (
          (await item.innerText().catch(() => "")) ||
          (ofertaIdx ? `Jornal ${ofertaIdx}` : `jornal-${i + 1}`)
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 150);
        if (skipStaleFlyerTitle(title)) continue;
        const externalId =
          ofertaIdx != null && ofertaIdx !== ""
            ? `oferta-${ofertaIdx}`
            : `tab-${i}-${title.slice(0, 40)}`;
        if (seenIds.has(externalId)) continue;
        // Unique per tab — avoid originalUrl dedupe collapsing 3 jornais → 1
        const originalUrl = `${page.url().split("#")[0]}#${externalId}`;
        if (!(await clickMaybeForce(item))) {
          say?.(`[FLYER] tab click fail i=${i}`);
          if (moreNav) await closeFlyerOverlay(page);
          continue;
        }
        await page.waitForTimeout(1000);
        const hit = await clickDownloadOnce(
          page,
          scopeSel,
          source,
          network,
          title,
          say,
          { externalId, originalUrl },
        );
        if (moreNav) await closeFlyerOverlay(page);
        if (hit) {
          seenIds.add(externalId);
          out.push(hit);
        }
      }
      if (out.length) break;
    } catch {
      /* bad selector */
    }
  }

  if (!usedTabs || !out.length) {
    const once = await clickDownloadOnce(
      page,
      scopeSel,
      source,
      network,
      "Encarte",
      say,
    );
    if (once) out.push(once);
  }

  if (!out.length) {
    say?.("[FLYER] click-download vazio");
    return out;
  }
  say?.(`[FLYER] click-download done ×${out.length} flyer(s)`);
  return out;
}

async function discoverHarvest(
  page: Page,
  scopeSel: string | undefined,
  network: NetworkFlyerDoc[],
  source: FlyerSource,
): Promise<DiscoveredCandidate[]> {
  await page.waitForTimeout(1500);
  await clickFirstPager(page, source.pagerSelectors);
  await page.evaluate(() => window.scrollBy(0, 400)).catch(() => undefined);
  await page.waitForTimeout(1000);
  return discoverDirect(page, scopeSel, network, source);
}

export async function discoverWithFlyerSource(args: {
  page: Page;
  scopeSelector?: string;
  network: NetworkFlyerDoc[];
  source: FlyerSource;
  onLog?: (line: string) => void;
}): Promise<DiscoveredCandidate[]> {
  const { page, scopeSelector, onLog } = args;
  const networkSnap = pruneBarePageImageDocs(args.network);
  let source = args.source;
  // Stale teach may save Assaí-style tabs; DOM cover cards win at runtime
  const resolvedItems = await resolveDiscoverItemSelectors(
    page,
    source.itemSelectors,
    scopeSelector,
  );
  if (
    resolvedItems.some((s) =>
      /flip-card|jet-listing-grid__item|card-folheto/i.test(s),
    )
  ) {
    source = {
      ...source,
      kind: "image-grid",
      downloadStrategy: "open-each-item",
      urlFrom: "click-then-network",
      itemSelectors: resolvedItems.filter(
        (s) => !/data-oferta-index|role=["']?tab/i.test(s),
      ),
      viewerMode: source.viewerMode ?? "img-stack",
    };
  }
  onLog?.(
    `[FLYER] source kind=${source.kind} strategy=${source.downloadStrategy}` +
      (source.evidence ? ` — ${source.evidence}` : "") +
      ` net=${networkSnap.length}/${args.network.length}`,
  );

  const keep = (cands: DiscoveredCandidate[]) =>
    dropSkipped(cands, source.skipKeys, onLog) as DiscoveredCandidate[];

  switch (source.downloadStrategy) {
    case "collect-images": {
      if (networkDocsAreRich(networkSnap)) {
        let fromNet = candidatesFromNetwork(networkSnap, source);
        if (!fromNet.length && source.networkHints) {
          fromNet = candidatesFromNetwork(networkSnap, {
            ...source,
            networkHints: undefined,
          });
        }
        if (fromNet.length) {
          onLog?.(
            `[FLYER] network ×${fromNet.length} (${fromNet.reduce((n, c) => n + c.pageUrls.length, 0)} págs)`,
          );
          return keep(fromNet);
        }
      }
      return keep(
        await discoverCollectImages(page, scopeSelector, networkSnap, source),
      );
    }
    case "open-each-item":
      return keep(
        await discoverOpenEachItem(
          page,
          scopeSelector,
          args.network,
          source,
          onLog,
        ),
      );
    case "click-download":
      return keep(
        await discoverClickDownload(
          page,
          scopeSelector,
          args.network,
          source,
          onLog,
        ),
      );
    case "harvest-after-activate":
      return keep(
        await discoverHarvest(page, scopeSelector, networkSnap, source),
      );
    case "direct-url":
    default:
      return keep(
        await discoverDirect(page, scopeSelector, networkSnap, source),
      );
  }
}
