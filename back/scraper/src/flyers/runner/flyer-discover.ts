import type { Download, Locator, Page } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  FlyerDownloadStrategy,
  FlyerSource,
  FlyerSourceKind,
  NetworkFlyerDoc,
  StepConfig,
} from "../types/flows.js";
import { detectContentType } from "../core/flyer-downloader.js";
import {
  buildCandidates,
  isFlyerHref,
  isJunkNavHref,
  scanDomFlyerCandidates,
  type DiscoveredCandidate,
} from "./flow-pipeline.js";

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
    if (/button\.selecionado|\.selecionado\b/.test(sel)) continue;
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
    cleaned = [
      ...new Set(['[role="tab"]', "[data-oferta-index]", ...cleaned]),
    ];
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

export function sanitizeFlyerSource(source: FlyerSource): FlyerSource {
  return {
    ...source,
    itemSelectors: sanitizeItemSelectors(source.itemSelectors, {
      kind: source.kind,
    }),
    downloadSelectors: sanitizeDownloadSelectors(source.downloadSelectors),
    evidence: source.evidence?.slice(0, 160),
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

  return sanitizeFlyerSource({
    kind,
    downloadStrategy,
    urlFrom,
    itemSelectors: itemSelectors?.length ? itemSelectors : undefined,
    downloadSelectors: downloadSelectors?.length ? downloadSelectors : undefined,
    networkHints,
    evidence: typeof o.evidence === "string" ? o.evidence.slice(0, 240) : undefined,
  });
}

export function urlsLookLikePdfFile(urls: string[]): boolean {
  return urls.some(
    (u) =>
      /\.pdf(\?|$)/i.test(u) ||
      /\/Flyer\//i.test(u) ||
      /flipbook/i.test(u),
  );
}

/** MiMo labels jpeg viewers as PDF. No real .pdf in dump → images. */
export function preferImagesUnlessPdf(
  source: FlyerSource,
  hints?: {
    links?: string[];
    downloadButtons?: Array<{ text: string; href?: string; selectors?: string[] }>;
  },
): FlyerSource {
  if (!hints) return source;
  const hrefs = [
    ...(hints?.links ?? []),
    ...(hints?.downloadButtons ?? []).map((b) => b.href ?? ""),
  ];
  if (
    hasProvenFileDownload(hints?.downloadButtons ?? []) ||
    urlsLookLikePdfFile(hrefs)
  ) {
    return source;
  }
  const pdfGuess =
    source.kind === "pdf-links" ||
    source.downloadStrategy === "direct-url" ||
    source.urlFrom === "href";
  if (!pdfGuess) return source;
  const loop = Boolean(source.itemSelectors?.length);
  return sanitizeFlyerSource({
    ...source,
    kind: "image-grid",
    downloadStrategy: loop ? "open-each-item" : "collect-images",
    urlFrom: loop ? "click-then-network" : "img.src",
    evidence: `${source.evidence ?? ""} | no .pdf in dump → images`.slice(0, 160),
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

/** Saved card-loop flows: keep recorded itemSelectors, force open-each-item. */
export function coerceOpenEachIfCardCta(cfg: StepConfig): FlyerSource {
  const prev = resolveFlyerSource(cfg);
  const blob = [
    cfg.description,
    ...(prev.itemSelectors ?? []),
    prev.evidence,
  ]
    .filter(Boolean)
    .join(" ");
  const looksCard =
    /ver\s+\S{3,}|has-text\("/i.test(blob) ||
    Boolean(prev.itemSelectors?.some((s) => /:has-text\(/.test(s)));
  if (!looksCard) return prev;
  const itemSelectors = cardItemSelectors(prev.itemSelectors ?? []);
  if (prev.downloadStrategy === "open-each-item") {
    return sanitizeFlyerSource({
      ...prev,
      itemSelectors: itemSelectors.length ? itemSelectors : prev.itemSelectors,
    });
  }
  return sanitizeFlyerSource({
    kind: "image-grid",
    downloadStrategy: "open-each-item",
    urlFrom: "click-then-network",
    itemSelectors: itemSelectors.length ? itemSelectors : prev.itemSelectors,
    downloadSelectors: prev.downloadSelectors,
    networkHints: prev.networkHints,
    evidence: (prev.evidence ?? "") + " | run: card CTA → open-each-item",
  });
}

export function allowsImageUrls(source: FlyerSource): boolean {
  return (
    source.downloadStrategy === "collect-images" ||
    source.downloadStrategy === "open-each-item" ||
    source.downloadStrategy === "click-download" ||
    source.kind === "image-grid" ||
    source.kind === "tabs" ||
    source.kind === "carousel" ||
    source.kind === "react-viewer"
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
    for (const el of Array.from(root.querySelectorAll("img[src]"))) {
      const href = el.getAttribute("src") ?? "";
      if (!href || href.startsWith("data:")) continue;
      let abs = href;
      try {
        abs = new URL(href, location.href).href;
      } catch {
        continue;
      }
      if (seen.has(abs) || skipRe.test(abs)) continue;
      const img = el as HTMLImageElement;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w > 0 && h > 0 && (w < 180 || h < 180)) continue;
      seen.add(abs);
      out.push({
        url: abs,
        text: (img.getAttribute("alt") ?? img.getAttribute("title") ?? "")
          .trim()
          .slice(0, 80),
      });
      if (out.length >= 40) break;
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
    if (!matchesNetworkHints(n.url, source)) return false;
    return isPersistableMedia(n.url, allowImages);
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

  const media = [
    ...dom.map((d) => d.url),
    ...network.map((n) => n.url),
  ].filter((u) => isPersistableMedia(u, true));

  if (!media.length && classic.length) return classic;

  if (media.length) {
    const title =
      dom.find((d) => d.text)?.text ||
      network.find((n) => n.title)?.title ||
      "Encarte";
    const key = media[0]!;
    if (!byKey.has(key)) {
      byKey.set(key, {
        originalUrl: media[0]!,
        title,
        pageUrls: [...new Set(media)],
        externalId: media[0],
      });
    } else {
      const existing = byKey.get(key)!;
      for (const u of media) {
        if (!existing.pageUrls.includes(u)) existing.pageUrls.push(u);
      }
    }
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
  const net = filterNet(network, source, allowImages);
  if (allowImages) return buildLooseCandidates(dom, net, true);
  return buildCandidates(domClassic, net);
}

async function discoverCollectImages(
  page: Page,
  scopeSel: string | undefined,
  network: NetworkFlyerDoc[],
  source: FlyerSource,
): Promise<DiscoveredCandidate[]> {
  const imgs = await scanDomImageCandidates(page, scopeSel);
  const net = filterNet(network, source, true);
  return buildLooseCandidates(imgs, net, true);
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

const GENERIC_ITEM_CTA =
  /^(ver\s+(o\s+)?(encarte|folheto|jornal)(\s+completo)?|baixar|download)$/i;

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

async function discoverOpenEachItem(
  page: Page,
  scopeSel: string | undefined,
  network: NetworkFlyerDoc[],
  source: FlyerSource,
  say?: (line: string) => void,
): Promise<DiscoveredCandidate[]> {
  const itemSels = source.itemSelectors?.length
    ? source.itemSelectors
    : ['[role="tab"]', "[data-oferta-index]", ".swiper-slide"];
  const listingUrl = page.url();
  const out: DiscoveredCandidate[] = [];
  const seenTitles = new Set<string>();
  const seenUrls = new Set<string>();

  const root = () =>
    scopeSel ? page.locator(scopeSel).first() : page.locator("body");

  const harvestOnce = async (
    title: string,
    i: number,
    imgsBefore: Set<string>,
    netBefore: number,
    leftListing: boolean,
  ): Promise<DiscoveredCandidate | null> => {
    const harvestScope = leftListing ? undefined : scopeSel;
    const provenDl = (source.downloadSelectors ?? []).some((s) =>
      /\.pdf/i.test(s),
    );
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
    const light = await harvestLightboxUrls(page);
    const canvases = await harvestCanvasPages(page);
    const netDelta = filterNet(network.slice(netBefore), source, true).filter(
      (n) => /\.(jpe?g|png|webp)(\?|$)/i.test(n.url) || isFlyerHref(n.url),
    );
    if (canvases.length) {
      return {
        originalUrl: `${page.url().split("#")[0]}#canvas-${i}`,
        title,
        pageUrls: canvases.map((b, k) => b.url ?? `capture://canvas-${k}`),
        externalId: `item-${i}-${title.slice(0, 40)}`,
        pageBuffers: canvases,
      };
    }
    if (light.length) {
      const pageUrls = [
        ...new Set(
          [...light, ...netDelta.map((n) => n.url)].filter(
            (u) => !isJunkNavHref(u) && isPersistableMedia(u, true),
          ),
        ),
      ].slice(0, 12);
      if (!pageUrls.length) return null;
      if (pageUrls.every((u) => seenUrls.has(u))) return null;
      return {
        originalUrl: pageUrls[0]!,
        title,
        pageUrls,
        externalId: `item-${i}-${title.slice(0, 40)}`,
      };
    }
    const imgs = await scanDomImageCandidates(page, harvestScope);
    const newImgs = imgs.filter((x) => !imgsBefore.has(x.url));
    const here = page.url();
    const useImgs = leftListing ? imgs.filter((x) => !imgsBefore.has(x.url)) : newImgs;
    if (!useImgs.length && !netDelta.length && !(leftListing && isPersistableMedia(here, true))) {
      return null;
    }
    const pageUrls = [
      ...new Set([
        ...useImgs.map((x) => x.url),
        ...netDelta.map((n) => n.url),
        ...(leftListing && isPersistableMedia(here, true) ? [here] : []),
      ]),
    ]
      .filter((u) => !isJunkNavHref(u) && isPersistableMedia(u, true))
      .slice(0, 12);
    if (!pageUrls.length) return null;
    if (pageUrls.every((u) => seenUrls.has(u))) return null;
    return {
      originalUrl: pageUrls[0]!,
      title,
      pageUrls,
      externalId: `item-${i}-${title.slice(0, 40)}`,
    };
  };

  const clickTargets = async (item: Locator): Promise<Locator[]> => {
    const targets: Locator[] = [];
    const wrap = item.locator(
      "xpath=ancestor::*[self::article or contains(@class,'elementor')][1]",
    );
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
      const n = await root().locator(sel).count();
      if (!n) continue;
      say?.(`[FLYER] items "${sel}" count=${Math.min(n, 12)}`);
      const limit = Math.min(n, 12);
      const moreNav = limit > 1;
      for (let i = 0; i < limit; i++) {
        if (moreNav) await closeFlyerOverlay(page);
        await returnToListing(page, listingUrl, sel);
        const item0 = root().locator(sel).nth(i);
        const title = (
          (await item0.innerText().catch(() => "")) ||
          (await item0.getAttribute("alt").catch(() => "")) ||
          (await item0.getAttribute("aria-label").catch(() => "")) ||
          `item-${i + 1}`
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);
        if (/^(ir para o conteúdo|pular para|skip to content|encartes?)$/i.test(title)) {
          continue;
        }
        const genericCta = GENERIC_ITEM_CTA.test(title);
        if (title && seenTitles.has(title) && !genericCta) continue;
        if (title && !genericCta) seenTitles.add(title);

        const targets = await clickTargets(item0);
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
          if (!(await clickMaybeForce(loc))) {
            say?.(`[FLYER] click item ${i} try ${t} falhou`);
            continue;
          }
          say?.(`[FLYER] item ${i} try ${t} click`);
          await Promise.race([
            page.waitForLoadState("domcontentloaded"),
            page.waitForTimeout(2500),
          ]).catch(() => undefined);
          await page.waitForTimeout(800);
          const leftListing =
            listingKey(page.url()) !== listingKey(listingUrl);
          got = await harvestOnce(
            title,
            i,
            imgsBefore,
            netBefore,
            leftListing,
          );
          if (leftListing) await returnToListing(page, listingUrl, sel);
          else if (moreNav) await closeFlyerOverlay(page);
        }
        if (!got) continue;
        for (const u of got.pageUrls) seenUrls.add(u);
        out.push(got);
      }
      if (out.length) break;
    } catch {
      /* bad selector */
    }
  }

  if (!out.length) {
    say?.("[FLYER] open-each-item vazio — fallback collect-images");
    return discoverCollectImages(page, scopeSel, network, source);
  }
  return out;
}

/** True when gallery button looks like real file download (PDF href), not viewer CTA. */
export function hasProvenFileDownload(
  buttons: Array<{ text: string; href?: string; selectors?: string[] }>,
): boolean {
  return buttons.some((b) => {
    if (b.href && /\.pdf(\?|$)/i.test(b.href)) return true;
    if (b.href && /[?&]download=|content-disposition/i.test(b.href)) return true;
    // ponytail: a[download] alone is a liar (Assaí opens viewer). Need .pdf href.
    return (b.selectors ?? []).some((s) => /href\*=["'][^"']*\.pdf/i.test(s));
  });
}

/** Merge gallery Baixar selectors as hints — never force click-download without PDF proof. */
export function mergeDownloadHints(
  prev: FlyerSource | undefined,
  buttons: Array<{ text: string; href?: string; selectors?: string[] }>,
  opts?: { kind?: FlyerSourceKind; tabSelectors?: string[] },
): FlyerSource | undefined {
  const real = filterFlyerDownloadButtons(buttons);
  if (!real.length && !prev) return undefined;
  const dlSels = sanitizeDownloadSelectors(
    real.flatMap((b) => b.selectors ?? []),
  );
  const proven = hasProvenFileDownload(real);
  const kind =
    prev?.kind ??
    (opts?.kind ?? (opts?.tabSelectors?.length ? "tabs" : "pdf-links"));
  const mergeTabs = kind === "tabs" || kind === "carousel";

  if (!prev) {
    if (!proven || !dlSels?.length) return undefined;
    return sanitizeFlyerSource({
      kind,
      downloadStrategy: "click-download",
      urlFrom: "click-then-network",
      downloadSelectors: dlSels,
      itemSelectors: mergeTabs ? opts?.tabSelectors : undefined,
      evidence: "proven PDF/download attr",
    });
  }

  const next: FlyerSource = {
    ...prev,
    downloadSelectors: [
      ...new Set([...(prev.downloadSelectors ?? []), ...(dlSels ?? [])]),
    ].slice(0, 6),
    itemSelectors: sanitizeItemSelectors(
      [
        ...(prev.itemSelectors ?? []),
        ...(opts?.tabSelectors ?? []),
      ],
      { kind },
    ),
  };

  // Only upgrade strategy when file download is proven
  if (proven && prev.downloadStrategy !== "click-download" && dlSels?.length) {
    next.downloadStrategy = "click-download";
    next.urlFrom = prev.urlFrom ?? "click-then-network";
    next.evidence =
      (prev.evidence ?? "") + " | upgraded: proven PDF/download attr";
  } else if (dlSels?.length) {
    next.evidence =
      (prev.evidence ?? "") +
      " | baixar hint (may open viewer — harvest after click)";
  }
  return sanitizeFlyerSource(next);
}

/** Large imgs in dialog/lightbox/viewer after Baixar opens media instead of file. */
async function harvestLightboxUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const skipRe =
      /productcluster|productsquery|sku|icon|logo|sprite|favicon|avatar|pixel|tracking/i;
    const roots: Element[] = [];
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
    ]) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const st = window.getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") continue;
        roots.push(el);
      }
    }
    if (!roots.length) return [];

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

    for (const root of roots) {
      for (const img of Array.from(root.querySelectorAll("img[src]"))) {
        const el = img as HTMLImageElement;
        const w = el.naturalWidth || el.width || 0;
        const h = el.naturalHeight || el.height || 0;
        if (w > 0 && h > 0 && (w < 280 || h < 280)) continue;
        const st = window.getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") {
          continue;
        }
        if (el.closest('[aria-hidden="true"]')) continue;
        push(el.currentSrc || el.src || el.getAttribute("src"));
        push(el.getAttribute("data-src"));
        push(el.getAttribute("data-full"));
      }
      for (const a of Array.from(root.querySelectorAll("a[href]"))) {
        const href = a.getAttribute("href") ?? "";
        if (/\.pdf(\?|$)/i.test(href) || /flyer|encarte|folheto|jornal/i.test(href)) {
          push(href);
        }
      }
      for (const emb of Array.from(
        root.querySelectorAll("embed[src], object[data], iframe[src]"),
      )) {
        push(
          emb.getAttribute("src") ||
            emb.getAttribute("data") ||
            undefined,
        );
      }
      if (out.length >= 40) break;
    }
    // Viewer without dialog role: large on-screen imgs
    if (!out.length) {
      for (const img of Array.from(document.querySelectorAll("img[src]"))) {
        const el = img as HTMLImageElement;
        const r = el.getBoundingClientRect();
        if (r.width < 360 || r.height < 360) continue;
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        push(el.currentSrc || el.src);
        if (out.length >= 40) break;
      }
    }
    return out;
  });
}

async function overlayVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    for (const sel of [
      '[role="dialog"]',
      '[aria-modal="true"]',
      "dialog[open]",
      ".fancybox-container",
      ".pswp--open",
      ".elementor-lightbox",
      '[class*="lightbox"]',
      '[class*="flyer-viewer"]',
    ]) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const st = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (st.display === "none" || st.visibility === "hidden") continue;
        if (r.width < 80 || r.height < 80) continue;
        return true;
      }
    }
    return false;
  });
}

/** Same-URL flyer viewer (canvas/modal) — not cookie chrome. */
export async function flyerViewerOpen(page: Page): Promise<boolean> {
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

export async function harvestCanvasPages(
  page: Page,
): Promise<NonNullable<DiscoveredCandidate["pageBuffers"]>> {
  const dataUrls = await page.evaluate(() => {
    const out: string[] = [];
    for (const c of Array.from(document.querySelectorAll("canvas"))) {
      const r = c.getBoundingClientRect();
      if (r.width < 200 || r.height < 200) continue;
      try {
        out.push(c.toDataURL("image/jpeg", 0.82));
      } catch {
        /* tainted */
      }
    }
    return out.slice(0, 12);
  });
  const pages: NonNullable<DiscoveredCandidate["pageBuffers"]> = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const b64 = dataUrls[i]?.split(",")[1];
    if (!b64) continue;
    const buffer = Buffer.from(b64, "base64");
    if (!buffer.length) continue;
    pages.push({
      buffer,
      contentType: "image/jpeg",
      url: `capture://canvas-${i}.jpg`,
    });
  }
  if (pages.length) return pages;
  const loc = page.locator("canvas").first();
  if ((await loc.count()) === 0) return [];
  if (!(await loc.isVisible().catch(() => false))) return [];
  try {
    const buffer = await loc.screenshot({ type: "jpeg", quality: 82 });
    if (!buffer.length) return [];
    return [
      { buffer, contentType: "image/jpeg", url: "capture://canvas-0.jpg" },
    ];
  } catch {
    return [];
  }
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

async function closeFlyerOverlay(page: Page): Promise<void> {
  for (let round = 0; round < 3; round++) {
    if (round > 0 && !(await overlayVisible(page))) return;
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
    await page.waitForTimeout(280);
  }
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

async function harvestPopupUrls(
  popup: Page,
  say?: (line: string) => void,
): Promise<string[]> {
  try {
    await popup.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => undefined);
    await popup.waitForTimeout(800);
    const urls: string[] = [];
    const u = popup.url();
    if (u && !u.startsWith("about:") && isPersistableMedia(u, true)) {
      urls.push(u);
      say?.(`[FLYER] popup url=${u.slice(0, 120)}`);
    }
    const imgs = await scanDomImageCandidates(popup);
    for (const img of imgs) urls.push(img.url);
    const classic = await scanDomFlyerCandidates(popup);
    for (const c of classic) urls.push(c.url);
    const light = await harvestLightboxUrls(popup);
    urls.push(...light);
    return [...new Set(urls)];
  } catch {
    return [];
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
        urls.push(...fromPopup);
        if (fromPopup.length) say?.(`[FLYER] popup media ×${fromPopup.length}`);
      }

      // 3) lightbox / modal / viewer on same page
      const light = await harvestLightboxUrls(page);
      urls.push(...light);
      if (light.length) say?.(`[FLYER] lightbox/viewer ×${light.length}`);
      if (!pageBuffers.length) {
        const canvases = await harvestCanvasPages(page);
        pageBuffers.push(...canvases);
        if (canvases.length) say?.(`[FLYER] canvas ×${canvases.length}`);
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
      const fromViewer = unique.filter((u) => light.includes(u));
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
          .slice(0, 80);
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
    say?.("[FLYER] click-download vazio — fallback open-each-item");
    return discoverOpenEachItem(page, scopeSel, network, source, say);
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
  const { page, scopeSelector, network, source, onLog } = args;
  onLog?.(
    `[FLYER] source kind=${source.kind} strategy=${source.downloadStrategy}` +
      (source.evidence ? ` — ${source.evidence}` : ""),
  );

  switch (source.downloadStrategy) {
    case "collect-images":
      return discoverCollectImages(page, scopeSelector, network, source);
    case "open-each-item": {
      const open = await discoverOpenEachItem(
        page,
        scopeSelector,
        network,
        source,
        onLog,
      );
      const hasDoc = open.some(
        (c) =>
          Boolean(c.pageBuffers?.length) ||
          c.pageUrls.some(
            (u) =>
              /\.pdf(\?|$)/i.test(u) ||
              /\/Flyer\//i.test(u) ||
              /flipbook/i.test(u),
          ),
      );
      if (hasDoc || !source.downloadSelectors?.length) return open;
      onLog?.(
        "[FLYER] open-each-item sem PDF/arquivo — try click-download",
      );
      const dl = await discoverClickDownload(
        page,
        scopeSelector,
        network,
        source,
        onLog,
      );
      return dl.length ? dl : open;
    }
    case "click-download":
      return discoverClickDownload(
        page,
        scopeSelector,
        network,
        source,
        onLog,
      );
    case "harvest-after-activate": {
      const harvested = await discoverHarvest(
        page,
        scopeSelector,
        network,
        source,
      );
      if (harvested.length || !source.downloadSelectors?.length) {
        return harvested;
      }
      onLog?.(
        "[FLYER] harvest vazio + downloadSelectors — try click-download",
      );
      return discoverClickDownload(
        page,
        scopeSelector,
        network,
        source,
        onLog,
      );
    }
    case "direct-url":
    default: {
      const direct = await discoverDirect(page, scopeSelector, network, source);
      if (direct.length) return direct;
      onLog?.(
        "[FLYER] direct-url vazio — fallback collect-images",
      );
      return discoverCollectImages(page, scopeSelector, network, {
        ...source,
        kind: source.kind === "pdf-links" ? "image-grid" : source.kind,
        downloadStrategy: "collect-images",
      });
    }
  }
}
