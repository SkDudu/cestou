import type { Page } from "playwright";
import { harvestLightboxUrls } from "../runner/flyer-discover.js";
import { isFlyerHref } from "../runner/flow-pipeline.js";
import type { ClickSnapshot, RecordedAction } from "../types/flows.js";

const HTML_CAP = 10_000;
const MAX_ACTIONS = 15;

type RawDump = {
  html?: string;
  id?: string;
  className?: string;
  display?: string;
  position?: string;
  sheets?: string[];
  js?: string[];
  links?: string[];
};

function clip(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

/** Full document HTML minus script/style/noscript. For MiMo section locate. */
export async function dumpFullPageHtml(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = document.documentElement.cloneNode(true) as HTMLElement;
    root.querySelectorAll("script, style, noscript").forEach((n) => n.remove());
    return "<!DOCTYPE html>\n" + root.outerHTML;
  });
}

function toSnapshot(raw: RawDump | null): ClickSnapshot | undefined {
  if (!raw) return undefined;
  const links = (raw.links ?? []).filter((u) => isFlyerHref(u)).slice(0, 20);
  return {
    html: raw.html ? clip(raw.html, HTML_CAP) : undefined,
    css: {
      id: raw.id || undefined,
      className: raw.className ? clip(raw.className, 200) : undefined,
      display: raw.display,
      position: raw.position,
      sheets: (raw.sheets ?? []).slice(0, 20),
    },
    js: (raw.js ?? []).slice(0, 20),
    links: links.length ? links : undefined,
  };
}

/** Element dump via selector; flyer links filtered in Node. */
export async function captureTargetSnapshot(
  page: Page,
  selectors: string[],
): Promise<ClickSnapshot | undefined> {
  for (const sel of selectors.slice(0, 6)) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      const raw = await loc.evaluate((el) => {
        const target = el instanceof HTMLElement ? el : el.parentElement;
        if (!target) return null;
        const parent = target.parentElement ?? target;
        const cs = getComputedStyle(target);
        return {
          html: parent.outerHTML.slice(0, 10000),
          id: target.id || "",
          className: String(target.className || ""),
          display: cs.display,
          position: cs.position,
          sheets: [...document.querySelectorAll('link[rel="stylesheet"]')]
            .map((l) => (l as HTMLLinkElement).href)
            .filter(Boolean)
            .slice(0, 20),
          js: [...document.querySelectorAll("script[src]")]
            .map((s) => (s as HTMLScriptElement).src)
            .filter(Boolean)
            .slice(0, 20),
          links: [...parent.querySelectorAll("a[href]")]
            .map((a) => (a as HTMLAnchorElement).href)
            .slice(0, 40),
        };
      });
      const snap = toSnapshot(raw);
      if (snap) return snap;
    } catch {
      /* selector not a locator string */
    }
  }
  return capturePageChrome(page);
}

export async function capturePageChrome(
  page: Page,
): Promise<ClickSnapshot | undefined> {
  try {
    const raw = await page.evaluate(() => {
      const h1 = document.querySelector("h1, h2, [role='dialog']");
      return {
        html: (h1?.outerHTML ?? "").slice(0, 2000),
        id: "",
        className: "",
        display: "",
        position: "",
        sheets: [...document.querySelectorAll('link[rel="stylesheet"]')]
          .map((l) => (l as HTMLLinkElement).href)
          .filter(Boolean)
          .slice(0, 20),
        js: [...document.querySelectorAll("script[src]")]
          .map((s) => (s as HTMLScriptElement).src)
          .filter(Boolean)
          .slice(0, 20),
        links: [...document.querySelectorAll("a[href]")]
          .map((a) => (a as HTMLAnchorElement).href)
          .slice(0, 40),
      };
    });
    return toSnapshot(raw);
  } catch {
    return undefined;
  }
}

export type TeachActionDump = {
  kind: string;
  url?: string;
  selectors?: string[];
  value?: string;
  description?: string;
  semantic?: string;
  html?: string;
  css?: ClickSnapshot["css"];
  js?: string[];
  flyerLinks?: string[];
};

/** Page-wide flyer UI index for MiMo — selectors, not HTML. */
export type GalleryHit = {
  kind: string;
  text: string;
  selectors: string[];
};

export type GalleryScopeDump = {
  downloadButtons: Array<{
    text: string;
    selectors: string[];
    href?: string;
    /** target=_blank / new tab — click-download harvests popup PDF/image */
    opensTab?: boolean;
  }>;
  tabButtons: Array<{ text: string; selectors: string[] }>;
  pager: Array<{ text: string; selectors: string[] }>;
  links: string[];
  iframes: string[];
  headings: string[];
  imageCount: number;
  /** Wide net for teach: user picks which hit is the flyer listing. */
  hits?: GalleryHit[];
};

export type TeachPayload = {
  startUrl: string;
  currentUrl: string;
  networkFlyers: string[];
  actions: TeachActionDump[];
  gallery?: GalleryScopeDump;
};

function dumpAction(a: RecordedAction, keepHtml: boolean): TeachActionDump {
  return {
    kind: a.kind,
    url: a.url,
    selectors: a.selectors,
    value: a.value,
    description: a.description,
    semantic: a.semantic,
    html: keepHtml ? a.snapshot?.html : undefined,
    css: a.snapshot?.css,
    js: a.snapshot?.js,
    flyerLinks: a.snapshot?.links,
  };
}

/** Cap 15 actions. Keep html only on flyer-ish clicks — never strip gallery. */
export function packTeachPayload(args: {
  startUrl: string;
  currentUrl: string;
  networkFlyers: string[];
  actions: RecordedAction[];
  gallery?: GalleryScopeDump;
}): TeachPayload {
  const sliced = args.actions.slice(0, MAX_ACTIONS);
  const dumps = sliced.map((a) => {
    const flyerish =
      a.semantic === "OPEN_FLYERS" ||
      Boolean(a.snapshot?.links?.length) ||
      /encarte|flyer|folheto|catalog/i.test(a.description ?? "");
    return dumpAction(a, flyerish);
  });
  return {
    startUrl: args.startUrl,
    currentUrl: args.currentUrl,
    networkFlyers: args.networkFlyers.slice(0, 30),
    actions: dumps,
    gallery: args.gallery,
  };
}

/** Scroll first dump hit into view so JPEG actually shows the gallery. */
export async function scrollGalleryIntoView(
  page: Page,
  gallery?: GalleryScopeDump,
) {
  const sels = [
    ...(gallery?.downloadButtons ?? []).flatMap((b) => b.selectors),
    ...(gallery?.tabButtons ?? []).flatMap((b) => b.selectors),
    ...(gallery?.pager ?? []).flatMap((b) => b.selectors),
    ...(gallery?.hits ?? []).flatMap((h) => h.selectors),
  ];
  for (const sel of sels.slice(0, 8)) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      await loc.scrollIntoViewIfNeeded({ timeout: 2500 });
      return;
    } catch {
      /* next selector */
    }
  }
}

function gallerySignal(g?: GalleryScopeDump): number {
  if (!g) return 0;
  return (
    g.tabButtons.length +
    g.downloadButtons.length +
    (g.pager?.length ?? 0) +
    g.links.length +
    Math.min(g.imageCount, 8) +
    g.iframes.length +
    (g.hits?.length ?? 0)
  );
}

/** Scroll the page until the gallery dump grows, then bring it into the JPEG. */
export async function prepareGalleryForLocate(
  page: Page,
  scopeSelector?: string,
): Promise<GalleryScopeDump | undefined> {
  if (scopeSelector) {
    await page
      .locator(scopeSelector)
      .first()
      .scrollIntoViewIfNeeded({ timeout: 2500 })
      .catch(() => undefined);
    return dumpGalleryScope(page, scopeSelector);
  }
  let best = await dumpGalleryScope(page);
  let bestScore = gallerySignal(best);
  for (let i = 0; i < 5; i++) {
    await page
      .evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.75)))
      .catch(() => undefined);
    await page.waitForTimeout(220);
    const g = await dumpGalleryScope(page);
    const s = gallerySignal(g);
    if (s > bestScore) {
      best = g;
      bestScore = s;
    }
  }
  await scrollGalleryIntoView(page, best);
  return (await dumpGalleryScope(page)) ?? best;
}

/**
 * Page-wide index of flyer tabs / downloads / pdf links.
 * // ponytail: no outerHTML — arrays are what MiMo copies; HTML blew the old 40k cap
 */
export async function dumpGalleryScope(
  page: Page,
  scopeSelector?: string,
): Promise<GalleryScopeDump | undefined> {
  try {
    return await page.evaluate((rootSel) => {
      const APP_CTA_RE =
        /\bapp\b|aplicativo|play\s*store|app\s*store|google\s*play|apple\s*store|ganhe\s+desconto/i;
      const MORE_RE = /mostrar\s+mais|ver\s+mais|carregar\s+mais|load\s+more|ver\s+todos/i;
      const ARCHIVE_RE = /anteriores|arquiv|edi[cç][oõ]es?\s+passad|encartes?\s+antig/i;
      const PAGER_CLS =
        /swiper-button-next|swiper-button-prev|slick-next|slick-prev|carousel-control/i;
      const HREF_RE =
        /\.pdf(\?|$)|\/Flyer\/|flipbook|encarte|jornal|download|baixar/i;
      const IMG_RE = /jornal|encarte|flyer|oferta|folheto|catalog/i;
        const CLICKABLE =
        "a, button, [role=button], [role=tab], [aria-selected], [data-oferta-index], [download], .swiper-pagination-bullet, .swiper-button-next, .swiper-button-prev, .slick-next, .slick-prev";
      const UTIL =
        /^(w-|h-|p-|m-|flex|grid|text-|bg-|rounded|shadow|overflow|relative|absolute|mx-|my-|md:|sm:|lg:|xl:|col-|row-|gap-|items-|justify-|hidden|block|font-|mb-|mt-|ml-|mr-|px-|py-|pt-|pb-|pl-|pr-|border|cursor|transition|hover:|focus:|group)/;

      function isAppCta(blob: string) {
        return APP_CTA_RE.test(blob);
      }

      /** Flyer PDF download — not "Baixe o app". */
      function isFlyerDownload(
        text: string,
        href: string,
        hasDownload: boolean,
      ) {
        const blob = `${text} ${href}`;
        if (isAppCta(blob)) return false;
        if (hasDownload) return true;
        if (/\.pdf(\?|$)/i.test(href)) return true;
        if (/\.(jpe?g|png|webp)(\?|$)/i.test(href)) return true;
        if (
          /ver\s*pdf|abrir\s*pdf|baixar(\s|$)|download|salvar(\s+pdf)?/i.test(
            text,
          )
        ) {
          return true;
        }
        return /baixe.+(jornal|folheto|encarte|pdf|página|pagina)/i.test(text);
      }

      /**
       * Real tab/carousel item — not nav "Folhetos" or "Mostrar mais folhetos".
       * Structure first; text only for numbered jornal/encarte patterns.
       */
      function isPager(el: Element, text: string, className: string) {
        if (PAGER_CLS.test(className)) return true;
        if (MORE_RE.test(text)) return true;
        const aria = el.getAttribute("aria-label") ?? "";
        if (/pr[oó]ximo|anterior|next|previous|mais/i.test(aria) &&
          (PAGER_CLS.test(className) ||
            Boolean(el.closest("[class*='swiper'], [class*='carousel'], [class*='slick']")))) {
          return true;
        }
        return false;
      }

      function looksArchive(el: Element, text: string) {
        if (ARCHIVE_RE.test(text)) return true;
        let n: Element | null = el;
        for (let i = 0; i < 6 && n; i++) {
          const h = n.querySelector?.("h1, h2, h3, h4");
          const t = `${h?.textContent ?? ""} ${n.getAttribute?.("aria-label") ?? ""}`;
          if (ARCHIVE_RE.test(t)) return true;
          n = n.parentElement;
        }
        return false;
      }

      function isFlyerTab(
        el: Element,
        text: string,
        className: string,
        href: string,
      ) {
        const role = el.getAttribute("role");
        if (role === "tab") return true;
        if (el.hasAttribute("data-oferta-index")) return true;
        if (el.closest("[role=tablist]")) return true;
        if (/swiper-pagination-bullet/.test(className)) return true;
        if (MORE_RE.test(text)) return false;
        if (/^folhetos?$/i.test(text.trim())) return false;
        // bare "Folhetos" nav / title-only — skip unless inside carousel shell
        const inCarousel = Boolean(
          el.closest(
            "[class*='swiper'], [class*='carousel'], [class*='Carousel'], [role=tablist]",
          ),
        );
        if (
          el.getAttribute("aria-selected") != null &&
          (inCarousel || /tab|carousel|swiper/i.test(className))
        ) {
          return true;
        }
        if (href && HREF_RE.test(href)) return true;
        if (
          /jornal\s*(de\s*)?ofertas|encarte\s*\d|folheto\s+\d|flyer\s*\d/i.test(
            text,
          )
        ) {
          return true;
        }
        // Repeated card CTA ("Ver …") — dump captures real text via selectorsFor
        if (/^ver\s+\S{3,}/i.test(text.trim())) return true;
        return false;
      }

      function cssEsc(s: string) {
        try {
          return CSS.escape(s);
        } catch {
          return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
        }
      }

      function selectorsFor(el: Element): string[] {
        const out: string[] = [];
        const html = el as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const testId = el.getAttribute("data-testid");
        if (testId) out.push(`[data-testid="${cssEsc(testId)}"]`);
        for (const a of Array.from(el.attributes)) {
          if (
            a.name.startsWith("data-") &&
            a.value &&
            a.value.length < 80 &&
            !a.name.startsWith("data-nimg")
          ) {
            out.push(`[${a.name}="${cssEsc(a.value)}"]`);
          }
        }
        if (html.id && html.id.length < 60 && !/[:.]/.test(html.id)) {
          out.push(`#${cssEsc(html.id)}`);
        }
        const aria = el.getAttribute("aria-label");
        if (aria && aria.length < 80) out.push(`[aria-label="${cssEsc(aria)}"]`);
        const alt = el.getAttribute("alt");
        if (tag === "img" && alt && alt.length < 80) {
          out.push(`img[alt="${cssEsc(alt)}"]`);
        }
        if (tag === "img") {
          const src = el.getAttribute("src") ?? "";
          if (/flipbook/i.test(src)) out.push('img[src*="flipbook"]');
        }
        const title = el.getAttribute("title");
        if (title && title.length < 80) out.push(`[title="${cssEsc(title)}"]`);
        const role = el.getAttribute("role");
        if (role) out.push(`${tag}[role="${cssEsc(role)}"]`);
        if (el.hasAttribute("download")) out.push(`${tag}[download]`);
        const hrefAttr = el.getAttribute("href");
        if (hrefAttr && /\.pdf/i.test(hrefAttr)) out.push(`${tag}[href*=".pdf"]`);
        if (hrefAttr && /\.jpe?g/i.test(hrefAttr)) {
          out.push(`${tag}[href*=".jpg"]`);
        }
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
        if (text.length >= 2 && /^(button|a)$/i.test(tag)) {
          const esc = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          out.push(`${tag}:has-text("${esc}")`);
        }
        const stable = [...el.classList].filter(
          (c) => c.length > 2 && c.length < 40 && !UTIL.test(c),
        );
        if (stable.length) {
          out.push(`${tag}.${stable.slice(0, 2).map(cssEsc).join(".")}`);
        }
        return [...new Set(out.filter(Boolean))].slice(0, 6);
      }

      function collectClickables(root: ParentNode): Element[] {
        const out: Element[] = [];
        const walk = (node: ParentNode) => {
          out.push(...Array.from(node.querySelectorAll(CLICKABLE)));
          for (const el of Array.from(node.querySelectorAll("*"))) {
            if (el.shadowRoot) walk(el.shadowRoot);
          }
        };
        walk(root);
        return out;
      }

      function labelOf(el: Element): string {
        const t = (
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          el.textContent ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60);
        if (t) return t;
        if (el.hasAttribute("download")) return "download";
        const href = el.getAttribute("href") ?? "";
        if (/\.pdf/i.test(href)) return "pdf";
        if ([...el.classList].some((c) => /download/i.test(c))) return "download";
        if ([...el.classList].some((c) => /swiper-pagination-bullet/i.test(c))) {
          return "bullet";
        }
        return "";
      }

      function hrefOf(el: Element): string {
        if (el instanceof HTMLAnchorElement) return el.href;
        const raw = el.getAttribute("href");
        if (!raw) return "";
        try {
          return new URL(raw, location.href).href;
        } catch {
          return raw;
        }
      }

      const downloads: Array<{
        text: string;
        selectors: string[];
        href?: string;
        opensTab?: boolean;
        score: number;
      }> = [];
      const tabs: Array<{ text: string; selectors: string[]; score: number }> =
        [];
      const pagers: Array<{ text: string; selectors: string[]; score: number }> =
        [];
      const seen = new Set<string>();
      const hitSeen = new Set<string>();
      const scoredHits: Array<{
        kind: string;
        text: string;
        selectors: string[];
        score: number;
      }> = [];

      function pushHit(
        kind: string,
        el: Element,
        text: string,
        score: number,
      ) {
        const sels = selectorsFor(el);
        if (!sels.length) return;
        const key = sels[0]!;
        if (hitSeen.has(key)) return;
        hitSeen.add(key);
        scoredHits.push({
          kind,
          text: (text || kind).replace(/\s+/g, " ").trim().slice(0, 80) || kind,
          selectors: sels,
          score,
        });
      }

      const rootEl = rootSel
        ? document.querySelector(rootSel)
        : null;
      const root: ParentNode = rootEl ?? document;

      for (const el of collectClickables(root)) {
        const text = labelOf(el);
        const href = hrefOf(el);
        const className = String((el as HTMLElement).className || "");
        const role = el.getAttribute("role");
        const hasDownload = el.hasAttribute("download");
        const hasIndex = el.hasAttribute("data-oferta-index");
        const isBullet = /swiper-pagination-bullet/.test(className);
        const isDl = isFlyerDownload(text, href, hasDownload);
        const isPg = isPager(el, text, className);
        const isTab = !isPg && isFlyerTab(el, text, className, href);
        if (!isDl && !isTab && !isPg) continue;
        if (isTab && looksArchive(el, text)) continue;
        const sels = selectorsFor(el);
        if (!sels.length) continue;
        const key = `${el.tagName}:${sels[0]}:${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (isDl) {
          const a = el.closest("a");
          const onclick = el.getAttribute("onclick") ?? "";
          const opensTab =
            el.getAttribute("target") === "_blank" ||
            a?.getAttribute("target") === "_blank" ||
            /window\.open/i.test(onclick);
          let score = 0;
          if (hasDownload) score += 4;
          if (/\.pdf(\?|$)/i.test(href)) score += 4;
          if (/\.(jpe?g|png|webp)(\?|$)/i.test(href)) score += 3;
          if (opensTab) score += 3;
          if (/baixar|download|pdf/i.test(text)) score += 3;
          if (/download/i.test(className)) score += 2;
          downloads.push({
            text: text || "download",
            selectors: sels,
            href: href || undefined,
            opensTab: opensTab || undefined,
            score,
          });
          pushHit(
            /\.pdf(\?|$)/i.test(href) ? "pdf" : "download",
            el,
            text || "download",
            score + 2,
          );
        } else if (isPg) {
          pagers.push({
            text: text || "pager",
            selectors: sels,
            score: PAGER_CLS.test(className) ? 3 : 1,
          });
        } else {
          let score = 0;
          if (role === "tab") score += 4;
          if (hasIndex) score += 4;
          if (isBullet) score += 3;
          if (/jornal|encarte/i.test(text)) score += 2;
          if (el.closest("[role=tablist]")) score += 1;
          tabs.push({ text: text || "tab", selectors: sels, score });
          pushHit(
            /\.pdf(\?|$)/i.test(href) ? "pdf" : "tab",
            el,
            text || "tab",
            score + (HREF_RE.test(href) ? 2 : 0),
          );
        }
      }

      downloads.sort((a, b) => b.score - a.score);
      tabs.sort((a, b) => b.score - a.score);
      pagers.sort((a, b) => b.score - a.score);

      const links: string[] = [];
      const linkSeen = new Set<string>();
      for (const a of Array.from(root.querySelectorAll("a[href]"))) {
        const href = (a as HTMLAnchorElement).href;
        if (!href || linkSeen.has(href) || !HREF_RE.test(href)) continue;
        linkSeen.add(href);
        links.push(href);
        if (links.length >= 30) break;
      }

      const iframes = [...new Set(
        Array.from(root.querySelectorAll("iframe[src]"))
          .map((f) => (f as HTMLIFrameElement).src)
          .filter(Boolean),
      )].slice(0, 12);

      const headings: string[] = [];
      for (const h of Array.from(root.querySelectorAll("h1, h2, h3"))) {
        const t = (h.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
        if (!t) continue;
        headings.push(t);
        if (headings.length >= 12) break;
      }

      let imageCount = 0;
      for (const img of Array.from(root.querySelectorAll("img[src]"))) {
        const blob = `${img.getAttribute("src") ?? ""} ${img.getAttribute("alt") ?? ""}`;
        if (IMG_RE.test(blob)) imageCount++;
      }

      for (const img of Array.from(root.querySelectorAll("img[src]"))) {
        const r = img.getBoundingClientRect();
        if (r.width < 48 || r.height < 48) continue;
        const src = img.getAttribute("src") ?? "";
        const alt = img.getAttribute("alt") ?? "";
        const blob = `${src} ${alt}`;
        if (/logo|icon|sprite|pixel|avatar/i.test(blob)) continue;
        if (
          !IMG_RE.test(blob) &&
          !/flipbook|\.(jpe?g|png|webp)(\?|$)/i.test(src)
        ) {
          continue;
        }
        const host =
          img.closest("a, button, article, li, [role=listitem]") ?? img;
        pushHit("image", host, alt || "imagem", 5);
      }

      for (const a of Array.from(root.querySelectorAll("a[href]"))) {
        const href = (a as HTMLAnchorElement).href;
        if (!href || !HREF_RE.test(href)) continue;
        const t = (a.textContent ?? "").replace(/\s+/g, " ").trim();
        pushHit(
          /\.pdf(\?|$)/i.test(href) ? "pdf" : "link",
          a,
          t || href.slice(-40),
          /\.pdf(\?|$)/i.test(href) ? 6 : 3,
        );
      }

      for (const f of Array.from(root.querySelectorAll("iframe[src]"))) {
        const src = (f as HTMLIFrameElement).src;
        if (!src) continue;
        pushHit("iframe", f, src.slice(-50), 4);
      }

      for (const list of Array.from(
        root.querySelectorAll(
          "ul, ol, [role=list], section, [class*='grid'], [class*='gallery'], [class*='encarte']",
        ),
      )) {
        const imgs = list.querySelectorAll("img[src]").length;
        const flyerAs = Array.from(list.querySelectorAll("a[href]")).filter(
          (x) => HREF_RE.test((x as HTMLAnchorElement).href),
        ).length;
        if (imgs < 2 && flyerAs < 2) continue;
        const heading = (
          list.querySelector("h1, h2, h3, h4")?.textContent ?? ""
        ).replace(/\s+/g, " ").trim();
        pushHit(
          "list",
          list,
          heading || "listagem",
          8 + Math.min(imgs, 6),
        );
      }

      scoredHits.sort((a, b) => b.score - a.score);
      const hits = scoredHits.slice(0, 12).map((h) => ({
        kind: h.kind,
        text: h.text,
        selectors: h.selectors,
      }));

      return {
        downloadButtons: downloads.slice(0, 20).map((d) => ({
          text: d.text,
          selectors: d.selectors,
          href: d.href,
          opensTab: d.opensTab,
        })),
        tabButtons: tabs.slice(0, 40).map((t) => ({
          text: t.text,
          selectors: t.selectors,
        })),
        pager: pagers.slice(0, 12).map((p) => ({
          text: p.text,
          selectors: p.selectors,
        })),
        links,
        iframes,
        headings,
        imageCount,
        hits,
      };
    }, scopeSelector ?? null);
  } catch {
    return undefined;
  }
}

const STRUCT_HTML_CAP = 700;
const STRUCT_MAX = 18;

export type StructureNode = {
  i: number;
  tag: string;
  sels: string[];
  text: string;
  css: {
    display: string;
    position: string;
    x: number;
    y: number;
    w: number;
    h: number;
    parent: string;
  };
  html: string;
  kids: Array<{ tag: string; text: string; href?: string; role?: string }>;
};

/** Compact HTML+CSS of flyer-ish regions. No screenshot. */
export async function dumpPageStructure(
  page: Page,
  rootSelector?: string,
): Promise<StructureNode[]> {
  try {
    return await page.evaluate(
      (args: { rootSel: string | null; htmlCap: number; max: number }) => {
        const { rootSel, htmlCap, max } = args;
        const flyerRe =
          /\/Flyer\/\?id=|\/flyer\/|flipbook|\/flip|\/encartes?\/|\.pdf(\?|$)/i;
        const uiHintRe =
          /tab|carousel|swiper|encarte|flyer|oferta|jornal|folheto|catalog|gallery|galeria/i;
        const UTIL =
          /^(w-|h-|p-|m-|flex|grid|text-|bg-|rounded|shadow|overflow|relative|absolute|mx-|my-|md:|sm:|lg:|xl:|col-|row-|gap-|items-|justify-|hidden|block|font-|mb-|mt-|ml-|mr-|px-|py-|pt-|pb-|pl-|pr-|border|cursor|transition|hover:|focus:|group|max-|min-|z-|top-|left-|right-|bottom-|inset-)/;

        function cssEsc(s: string) {
          try {
            return CSS.escape(s);
          } catch {
            return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
          }
        }

        function selsFor(el: Element): string[] {
          const out: string[] = [];
          const html = el as HTMLElement;
          const tag = el.tagName.toLowerCase();
          const testId = el.getAttribute("data-testid");
          if (testId) out.push(`[data-testid="${cssEsc(testId)}"]`);
          for (const a of Array.from(el.attributes)) {
            if (
              a.name.startsWith("data-") &&
              a.value &&
              a.value.length < 80 &&
              !a.name.startsWith("data-nimg")
            ) {
              out.push(`[${a.name}="${cssEsc(a.value)}"]`);
            }
          }
          if (html.id && html.id.length < 60 && !/[:.]/.test(html.id)) {
            out.push(`#${cssEsc(html.id)}`);
          }
          const aria = el.getAttribute("aria-label");
          if (aria && aria.length < 80) out.push(`[aria-label="${cssEsc(aria)}"]`);
          const role = el.getAttribute("role");
          if (role) out.push(`${tag}[role="${cssEsc(role)}"]`);
          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
          if (text.length >= 2 && /^(button|a)$/i.test(tag)) {
            const esc = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            out.push(`${tag}:has-text("${esc}")`);
          }
          const stable = [...el.classList].filter(
            (c) => c.length > 2 && c.length < 40 && !UTIL.test(c),
          );
          if (stable.length) {
            out.push(`${tag}.${stable.slice(0, 2).map(cssEsc).join(".")}`);
          }
          return [...new Set(out.filter(Boolean))].slice(0, 5);
        }

        const root = rootSel
          ? document.querySelector(rootSel)
          : document.body;
        if (!root) return [];
        const set = new Set<Element>();
        if (rootSel) set.add(root);
        for (const el of root.querySelectorAll(
          "section, article, ul, [role=list], [role=tablist], [role=tabpanel], [data-oferta-index], [class*='swiper'], [class*='encarte'], [class*='flyer']",
        )) {
          set.add(el);
        }
        for (const a of root.querySelectorAll("a[href]")) {
          if (!flyerRe.test(a.getAttribute("href") ?? "")) continue;
          let p: Element | null = a;
          for (let i = 0; i < 4 && p && p !== document.body; i++) {
            set.add(p);
            p = p.parentElement;
          }
        }

        const scored = [...set]
          .filter((el) => el !== document.body && el !== document.documentElement)
          .map((el) => {
            const r = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            const parent = el.parentElement
              ? getComputedStyle(el.parentElement)
              : null;
            const blob = [
              el.id,
              String(el.className ?? ""),
              el.getAttribute("aria-label") ?? "",
            ].join(" ");
            const hrefs = [...el.querySelectorAll("a[href]")].filter((a) =>
              flyerRe.test((a as HTMLAnchorElement).href),
            ).length;
            const imgs = el.querySelectorAll("img[src]").length;
            const ui = uiHintRe.test(blob) || el.getAttribute("role") === "tablist";
            const sels = selsFor(el);
            return {
              el,
              r,
              st,
              parent,
              hrefs,
              imgs,
              ui,
              sels,
              area: r.width * r.height,
            };
          })
          .filter(
            (c) =>
              c.sels.length &&
              (c.hrefs || c.ui || (c.imgs >= 2 && c.area > 12000)),
          )
          .sort(
            (a, b) =>
              b.hrefs - a.hrefs || Number(b.ui) - Number(a.ui) || b.imgs - a.imgs,
          )
          .slice(0, max);

        return scored.map((c, i) => {
          const kids = [
            ...c.el.querySelectorAll(
              "a, button, [role=button], [role=tab], img[src]",
            ),
          ]
            .slice(0, 8)
            .map((k) => ({
              tag: k.tagName.toLowerCase(),
              text: (
                k.getAttribute("aria-label") ||
                k.getAttribute("alt") ||
                k.textContent ||
                ""
              )
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 40),
              href: (k as HTMLAnchorElement).href || k.getAttribute("href") || undefined,
              role: k.getAttribute("role") || undefined,
            }));
          const html = (c.el as HTMLElement).outerHTML
            .replace(/\s+/g, " ")
            .slice(0, htmlCap);
          return {
            i: i + 1,
            tag: c.el.tagName,
            sels: c.sels,
            text: (c.el.getAttribute("aria-label") ?? c.el.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 80),
            css: {
              display: c.st.display,
              position: c.st.position,
              x: Math.round(c.r.x),
              y: Math.round(c.r.y),
              w: Math.round(c.r.width),
              h: Math.round(c.r.height),
              parent: c.parent
                ? `${c.parent.display}/${c.parent.flexDirection || c.parent.gridTemplateColumns ? "flow" : ""}`
                : "",
            },
            html,
            kids,
          };
        });
      },
      { rootSel: rootSelector ?? null, htmlCap: STRUCT_HTML_CAP, max: STRUCT_MAX },
    );
  } catch {
    return [];
  }
}

/** Pass 2: lightbox / PDF / canvas on the page after operator opens one card. Small. */
export async function dumpViewerSample(page: Page): Promise<{
  imageUrls: string[];
  pdfUrls: string[];
  hasCanvas: boolean;
  url: string;
}> {
  try {
    const overlay = await harvestLightboxUrls(page);
    const rest = await page.evaluate(() => {
      const pdfs: string[] = [];
      const pdfSeen = new Set<string>();
      for (const el of Array.from(
        document.querySelectorAll("a[href], embed[src], iframe[src], object[data]"),
      )) {
        const u =
          (el as HTMLAnchorElement).href ||
          el.getAttribute("src") ||
          el.getAttribute("data") ||
          "";
        if (!/\.pdf(\?|#|$)/i.test(u) || pdfSeen.has(u)) continue;
        pdfSeen.add(u);
        pdfs.push(u);
        if (pdfs.length >= 12) break;
      }
      return {
        pdfUrls: pdfs,
        hasCanvas: document.querySelectorAll("canvas").length > 0,
        url: location.href,
      };
    });
    return {
      imageUrls: overlay.filter((u) =>
        /\.(jpe?g|png|webp)(\?|$)|flipbook|encarte|flyer/i.test(u),
      ),
      pdfUrls: rest.pdfUrls,
      hasCanvas: rest.hasCanvas,
      url: rest.url,
    };
  } catch {
    return {
      imageUrls: [],
      pdfUrls: [],
      hasCanvas: false,
      url: page.url(),
    };
  }
}
