import type { Page } from "playwright";
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
export type GalleryScopeDump = {
  downloadButtons: Array<{ text: string; selectors: string[]; href?: string }>;
  tabButtons: Array<{ text: string; selectors: string[] }>;
  links: string[];
  iframes: string[];
  headings: string[];
  imageCount: number;
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

/**
 * Page-wide index of flyer tabs / downloads / pdf links.
 * // ponytail: no outerHTML — arrays are what MiMo copies; HTML blew the old 40k cap
 */
export async function dumpGalleryScope(
  page: Page,
  _scopeSelector?: string,
): Promise<GalleryScopeDump | undefined> {
  try {
    return await page.evaluate(() => {
      const APP_CTA_RE =
        /\bapp\b|aplicativo|play\s*store|app\s*store|google\s*play|apple\s*store|ganhe\s+desconto/i;
      const MORE_RE = /mostrar\s+mais|ver\s+mais|carregar\s+mais|load\s+more|ver\s+todos/i;
      const HREF_RE =
        /\.pdf(\?|$)|\/Flyer\/|flipbook|encarte|jornal|download|baixar/i;
      const IMG_RE = /jornal|encarte|flyer|oferta|folheto|catalog/i;
      const CLICKABLE =
        "a, button, [role=button], [role=tab], [aria-selected], [data-oferta-index], [download], .swiper-pagination-bullet";
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
      function isFlyerTab(
        el: Element,
        text: string,
        className: string,
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
        const title = el.getAttribute("title");
        if (title && title.length < 80) out.push(`[title="${cssEsc(title)}"]`);
        const role = el.getAttribute("role");
        if (role) out.push(`${tag}[role="${cssEsc(role)}"]`);
        if (el.hasAttribute("download")) out.push(`${tag}[download]`);
        const hrefAttr = el.getAttribute("href");
        if (hrefAttr && /\.pdf/i.test(hrefAttr)) out.push(`${tag}[href*=".pdf"]`);
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
        score: number;
      }> = [];
      const tabs: Array<{ text: string; selectors: string[]; score: number }> =
        [];
      const seen = new Set<string>();

      for (const el of collectClickables(document)) {
        const text = labelOf(el);
        const href = hrefOf(el);
        const className = String((el as HTMLElement).className || "");
        const role = el.getAttribute("role");
        const hasDownload = el.hasAttribute("download");
        const hasIndex = el.hasAttribute("data-oferta-index");
        const isBullet = /swiper-pagination-bullet/.test(className);
        const isDl = isFlyerDownload(text, href, hasDownload);
        const isTab = isFlyerTab(el, text, className);
        if (!isDl && !isTab) continue;
        const sels = selectorsFor(el);
        if (!sels.length) continue;
        const key = `${el.tagName}:${sels[0]}:${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (isDl) {
          let score = 0;
          if (hasDownload) score += 4;
          if (/\.pdf(\?|$)/i.test(href)) score += 4;
          if (/baixar|download|pdf/i.test(text)) score += 3;
          if (/download/i.test(className)) score += 2;
          downloads.push({
            text: text || "download",
            selectors: sels,
            href: href || undefined,
            score,
          });
        } else {
          let score = 0;
          if (role === "tab") score += 4;
          if (hasIndex) score += 4;
          if (isBullet) score += 3;
          if (/jornal|encarte/i.test(text)) score += 2;
          if (el.closest("[role=tablist]")) score += 1;
          tabs.push({ text: text || "tab", selectors: sels, score });
        }
      }

      downloads.sort((a, b) => b.score - a.score);
      tabs.sort((a, b) => b.score - a.score);

      const links: string[] = [];
      const linkSeen = new Set<string>();
      for (const a of Array.from(document.querySelectorAll("a[href]"))) {
        const href = (a as HTMLAnchorElement).href;
        if (!href || linkSeen.has(href) || !HREF_RE.test(href)) continue;
        linkSeen.add(href);
        links.push(href);
        if (links.length >= 30) break;
      }

      const iframes = [...new Set(
        Array.from(document.querySelectorAll("iframe[src]"))
          .map((f) => (f as HTMLIFrameElement).src)
          .filter(Boolean),
      )].slice(0, 12);

      const headings: string[] = [];
      for (const h of Array.from(document.querySelectorAll("h1, h2, h3"))) {
        const t = (h.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
        if (!t) continue;
        headings.push(t);
        if (headings.length >= 12) break;
      }

      let imageCount = 0;
      for (const img of Array.from(document.querySelectorAll("img[src]"))) {
        const blob = `${img.getAttribute("src") ?? ""} ${img.getAttribute("alt") ?? ""}`;
        if (IMG_RE.test(blob)) imageCount++;
      }

      return {
        downloadButtons: downloads.slice(0, 20).map((d) => ({
          text: d.text,
          selectors: d.selectors,
          href: d.href,
        })),
        tabButtons: tabs.slice(0, 40).map((t) => ({
          text: t.text,
          selectors: t.selectors,
        })),
        links,
        iframes,
        headings,
        imageCount,
      };
    });
  } catch {
    return undefined;
  }
}
