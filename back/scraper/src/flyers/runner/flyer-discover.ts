import type { Download, Page } from "playwright";
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

export function defaultFlyerSource(): FlyerSource {
  return { kind: "pdf-links", downloadStrategy: "direct-url", urlFrom: "href" };
}

export function resolveFlyerSource(cfg: StepConfig): FlyerSource {
  return cfg.flyerSource ?? defaultFlyerSource();
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

async function discoverOpenEachItem(
  page: Page,
  scopeSel: string | undefined,
  network: NetworkFlyerDoc[],
  source: FlyerSource,
  say?: (line: string) => void,
): Promise<DiscoveredCandidate[]> {
  const itemSels = source.itemSelectors?.length
    ? source.itemSelectors
    : [
        '[role="tab"]',
        "[data-oferta-index]",
        'button:has-text("Jornal de Ofertas")',
        'button:has-text("Jornal")',
        ".swiper-slide",
        "[class*='tab'] button",
        "[class*='Tab']",
      ];
  const root = scopeSel ? page.locator(scopeSel).first() : page.locator("body");
  const out: DiscoveredCandidate[] = [];
  const seenTitles = new Set<string>();

  for (const sel of itemSels) {
    let locs;
    try {
      locs = root.locator(sel);
      const n = await locs.count();
      if (!n) continue;
      say?.(`[FLYER] items "${sel}" count=${Math.min(n, 12)}`);
      const limit = Math.min(n, 12);
      for (let i = 0; i < limit; i++) {
        const item = locs.nth(i);
        const title = (
          (await item.innerText().catch(() => "")) ||
          (await item.getAttribute("aria-label").catch(() => "")) ||
          `item-${i + 1}`
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);
        if (title && seenTitles.has(title)) continue;
        if (title) seenTitles.add(title);
        try {
          await item.click({ timeout: 4000 });
        } catch {
          say?.(`[FLYER] click item ${i} falhou — skip`);
          continue;
        }
        await page.waitForTimeout(1200);
        const before = network.length;
        await page.waitForTimeout(800);

        // Tab may need Baixar to open viewer/lightbox — try before DOM-only harvest
        if (source.downloadSelectors?.length) {
          const viaDl = await clickDownloadOnce(
            page,
            scopeSel,
            source,
            network,
            title,
            say,
            {
              externalId: `tab-${i}-${title.slice(0, 40)}`,
              originalUrl: `${page.url().split("#")[0]}#tab-${i}`,
            },
          );
          await closeFlyerOverlay(page);
          if (viaDl) {
            out.push(viaDl);
            continue;
          }
        }

        const imgs = await scanDomImageCandidates(page, scopeSel);
        const classic = await scanDomFlyerCandidates(page, scopeSel);
        const netSlice = filterNet(network.slice(before), source, true);
        const allNet = filterNet(network, source, true);
        const merged = buildLooseCandidates(
          [...classic, ...imgs],
          [...netSlice, ...allNet].slice(0, 40),
          true,
        );
        if (!merged.length) continue;
        const primary = merged[0]!;
        out.push({
          ...primary,
          title: title || primary.title,
          pageUrls: [
            ...new Set(merged.flatMap((m) => m.pageUrls)),
          ].slice(0, 40),
        });
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

/** True when gallery button looks like real file download (PDF / a[download]), not viewer CTA. */
export function hasProvenFileDownload(
  buttons: Array<{ text: string; href?: string; selectors?: string[] }>,
): boolean {
  return buttons.some((b) => {
    if (b.href && /\.pdf(\?|$)/i.test(b.href)) return true;
    if (b.href && /[?&]download=|content-disposition/i.test(b.href)) return true;
    return (b.selectors ?? []).some(
      (s) => /\[download\]/i.test(s) || /href\*=["'][^"']*\.pdf/i.test(s),
    );
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
        ...(mergeTabs ? (opts?.tabSelectors ?? []) : []),
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
      ".lightbox",
      "[class*='lightbox']",
      "[class*='Lightbox']",
      "[class*='viewer']",
      "[class*='Viewer']",
      "[class*='flipbook']",
      "[class*='Flipbook']",
      "[class*='encarte']",
      "dialog[open]",
    ]) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const st = window.getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") continue;
        roots.push(el);
      }
    }
    if (!roots.length) roots.push(document.body);

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
        if (w > 0 && h > 0 && (w < 200 || h < 200)) continue;
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
    return out;
  });
}

async function closeFlyerOverlay(page: Page): Promise<void> {
  await page.keyboard.press("Escape").catch(() => undefined);
  const sels = [
    'button[aria-label="Close"]',
    'button[aria-label="Fechar"]',
    'button:has-text("Fechar")',
    '[role="dialog"] button.close',
    ".modal .close",
    ".lightbox .close",
    '[class*="close-button"]',
    '[class*="CloseButton"]',
  ];
  for (const sel of sels) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      if (!(await loc.isVisible().catch(() => false))) continue;
      await loc.click({ timeout: 1500 });
      await page.waitForTimeout(300);
      break;
    } catch {
      /* try next */
    }
  }
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(400);
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

      await btn.click({ timeout: 4000 });
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
      // Prefer real image/pdf URLs; drop HTML-ish junk when we have buffers
      const preferExt = unique.filter((u) =>
        /\.(jpe?g|png|webp|pdf)(\?|$)/i.test(u),
      );
      const pageUrls = (preferExt.length ? preferExt : unique).slice(0, 40);

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
    : [
        '[role="tab"]',
        "[data-oferta-index]",
        'button:has-text("Jornal de Ofertas")',
      ];

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
      say?.(`[FLYER] click-download tabs "${sel}" ×${limit}`);
      for (let i = 0; i < limit; i++) {
        await closeFlyerOverlay(page);
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
        try {
          await item.click({ timeout: 4000 });
        } catch {
          say?.(`[FLYER] tab click fail i=${i}`);
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
        await closeFlyerOverlay(page);
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
      if (open.length || !source.downloadSelectors?.length) return open;
      onLog?.(
        "[FLYER] open-each-item vazio + downloadSelectors — try click-download",
      );
      return discoverClickDownload(
        page,
        scopeSelector,
        network,
        source,
        onLog,
      );
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
