import type { Page } from "playwright";

export type ScopeBox = { x: number; y: number; width: number; height: number };

export type ScopeNode = {
  tagName: string;
  selectors: string[];
  label: string;
  box: ScopeBox;
  linkCount: number;
  imageCount: number;
  textCount: number;
  childCount: number;
  id?: string;
  className?: string;
  textPreview?: string;
};

export type ScopePick = ScopeNode & {
  ancestors: ScopeNode[];
};

const INSPECT = ({ x, y }: { x: number; y: number }) => {
  const TINY = new Set([
    "IMG",
    "SPAN",
    "SVG",
    "PATH",
    "BUTTON",
    "I",
    "USE",
    "INPUT",
    "BR",
  ]);
  const UTIL =
    /^(w-|h-|p-|m-|flex|grid|text-|bg-|rounded|shadow|overflow|relative|absolute|mx-|my-|md:|sm:|lg:|xl:|col-|row-|gap-|items-|justify-|hidden|block|font-|mb-|mt-|ml-|mr-|px-|py-|pt-|pb-|pl-|pr-|border|cursor|transition|hover:|focus:|group|max-|min-|z-|top-|left-|right-|bottom-|inset-|object-|aspect-|opacity-|pointer-|select-|whitespace-|leading-|tracking-|uppercase|truncate|ring-|from-|to-|via-|animate-|decoration-)/;

  function cssEsc(s: string) {
    try {
      return CSS.escape(s);
    } catch {
      return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }
  }

  function counts(el: Element) {
    return {
      linkCount: el.querySelectorAll("a[href]").length,
      imageCount: el.querySelectorAll("img").length,
      textCount: (el.textContent ?? "").trim().length,
      childCount: el.childElementCount,
    };
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
        a.name !== "data-testid" &&
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
    const name = el.getAttribute("name");
    if (name) out.push(`${tag}[name="${cssEsc(name)}"]`);
    const aria = el.getAttribute("aria-label");
    if (aria && aria.length < 80) out.push(`[aria-label="${cssEsc(aria)}"]`);
    const stable = [...el.classList].filter(
      (c) => c.length > 2 && c.length < 40 && !UTIL.test(c),
    );
    if (stable.length) {
      out.push(`${tag}.${stable.slice(0, 2).map(cssEsc).join(".")}`);
    }
    const parent = el.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === el.tagName);
      const idx = same.indexOf(el) + 1;
      const pTag = parent.tagName.toLowerCase();
      out.push(`${pTag} > ${tag}:nth-of-type(${idx})`);
    }
    return [...new Set(out.filter(Boolean))].slice(0, 8);
  }

  function boxOf(el: Element): ScopeBox {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }

  function labelOf(el: Element) {
    const t = (el.getAttribute("aria-label") ?? el.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    return t.slice(0, 60);
  }

  function nodeOf(el: Element): ScopeNode {
    const html = el as HTMLElement;
    const c = counts(el);
    return {
      tagName: el.tagName,
      selectors: selectorsFor(el),
      label: labelOf(el),
      box: boxOf(el),
      ...c,
      id: html.id || undefined,
      className: html.className ? String(html.className).slice(0, 120) : undefined,
      textPreview: labelOf(el),
    };
  }

  function flyerLinks(el: Element) {
    return [...el.querySelectorAll("a[href]")].filter((a) =>
      /Flyer|flipbook|\/flip|encartes|\.pdf/i.test(a.getAttribute("href") ?? ""),
    ).length;
  }

  function promote(start: Element): Element {
    let el: Element = start;
    if (TINY.has(el.tagName)) {
      let cur: Element | null = el.parentElement;
      while (cur && cur !== document.body) {
        if (
          /^(SECTION|ARTICLE|MAIN|UL|OL|NAV)$/.test(cur.tagName) ||
          cur.getAttribute("role") === "list" ||
          flyerLinks(cur) >= 2
        ) {
          return cur;
        }
        cur = cur.parentElement;
      }
    }
    return el;
  }

  const raw = document.elementFromPoint(x, y);
  if (!raw) return null;
  const el = promote(raw);
  const ancestors: ScopeNode[] = [];
  let p: Element | null = el.parentElement;
  while (p && p !== document.body && ancestors.length < 8) {
    if (!TINY.has(p.tagName)) ancestors.push(nodeOf(p));
    p = p.parentElement;
  }
  return { ...nodeOf(el), ancestors };
};

export async function inspectScopeAt(
  page: Page,
  x: number,
  y: number,
): Promise<ScopePick | null> {
  return page.evaluate(INSPECT, { x, y });
}

export async function highlightScope(page: Page, box: ScopeBox | null) {
  await page.evaluate((b) => {
    let el = document.getElementById("__cestou_scope");
    if (!b) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "__cestou_scope";
      el.style.cssText =
        "position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #38bdf8;background:rgba(56,189,248,.12);";
      document.body.appendChild(el);
    }
    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;
    el.style.width = `${b.width}px`;
    el.style.height = `${b.height}px`;
  }, box);
}

export async function probeFlyersInScope(
  page: Page,
  selectors: string[],
): Promise<{
  selectorUsed?: string;
  found: boolean;
  flyers: Array<{ url: string; title?: string }>;
  tagName?: string;
  linkCount?: number;
  imageCount?: number;
}> {
  const result = await page.evaluate((sels: string[]) => {
    const flyerRe =
      /\/Flyer\/\?id=|\/flyer\/|flipbook|\/flip|api-middleware-flyer-services|\/encartes\/|\.pdf(\?|$)/i;
    let root: Element | null = null;
    let used: string | undefined;
    for (const sel of sels) {
      try {
        const n = document.querySelector(sel);
        if (n) {
          root = n;
          used = sel;
          break;
        }
      } catch {
        /* ignore */
      }
    }
    if (!root) return { found: false, flyers: [] as Array<{ url: string; title?: string }> };
    const seen = new Set<string>();
    const flyers: Array<{ url: string; title?: string }> = [];
    for (const a of Array.from(root.querySelectorAll("a[href]"))) {
      const href = a.getAttribute("href") ?? "";
      if (!flyerRe.test(href)) continue;
      let abs = href;
      try {
        abs = new URL(href, location.href).href;
      } catch {
        continue;
      }
      if (seen.has(abs)) continue;
      seen.add(abs);
      flyers.push({
        url: abs,
        title: (a.getAttribute("title") ?? a.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80),
      });
    }
    return {
      found: true,
      selectorUsed: used,
      flyers,
      tagName: root.tagName,
      linkCount: root.querySelectorAll("a[href]").length,
      imageCount: root.querySelectorAll("img").length,
    };
  }, selectors);
  return result;
}

export type FlyerDomCandidate = {
  index: number;
  tagName: string;
  selectors: string[];
  flyerHrefs: string[];
  text: string;
  linkCount: number;
  imageCount: number;
  area: number;
};

export async function dumpFlyerCandidates(
  page: Page,
): Promise<FlyerDomCandidate[]> {
  return page.evaluate(() => {
    const flyerRe =
      /\/Flyer\/\?id=|\/flyer\/|flipbook|\/flip|api-middleware-flyer-services|\/encartes\/|\.pdf(\?|$)/i;
    const uiHintRe =
      /tab|carousel|swiper|slider|encarte|flyer|oferta|jornal|folheto|catalog|flipbook|gallery|galeria/i;
    const UTIL =
      /^(w-|h-|p-|m-|flex|grid|text-|bg-|rounded|shadow|overflow|relative|absolute|mx-|my-|md:|sm:|lg:|xl:|col-|row-|gap-|items-|justify-|hidden|block|font-|mb-|mt-|ml-|mr-|px-|py-|pt-|pb-|pl-|pr-|border|cursor|transition|hover:|focus:|group|max-|min-|z-|top-|left-|right-|bottom-|inset-|object-|aspect-|opacity-|pointer-|select-|whitespace-|leading-|tracking-|uppercase|truncate|ring-|from-|to-|via-|animate-|decoration-)/;

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
          a.name !== "data-testid" &&
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
      if (role) out.push(`[role="${cssEsc(role)}"]`);
      const stable = [...el.classList].filter(
        (c) => c.length > 2 && c.length < 40 && !UTIL.test(c),
      );
      if (stable.length) {
        out.push(`${tag}.${stable.slice(0, 2).map(cssEsc).join(".")}`);
      }
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === el.tagName);
        const idx = same.indexOf(el) + 1;
        out.push(`${parent.tagName.toLowerCase()} > ${tag}:nth-of-type(${idx})`);
      }
      return [...new Set(out.filter(Boolean))].slice(0, 6);
    }

    function flyerHrefs(el: Element): string[] {
      const hrefs: string[] = [];
      const seen = new Set<string>();
      const nodes =
        el.tagName === "A"
          ? [el]
          : Array.from(el.querySelectorAll("a[href]"));
      for (const a of nodes) {
        const href = a.getAttribute("href") ?? "";
        if (!flyerRe.test(href)) continue;
        let abs = href;
        try {
          abs = new URL(href, location.href).href;
        } catch {
          continue;
        }
        if (seen.has(abs)) continue;
        seen.add(abs);
        hrefs.push(abs);
        if (hrefs.length >= 8) break;
      }
      return hrefs;
    }

    function looksLikeFlyerUi(el: Element): boolean {
      const blob = [
        el.id,
        el.className?.toString?.() ?? "",
        el.getAttribute("aria-label") ?? "",
        el.getAttribute("data-testid") ?? "",
        el.getAttribute("role") ?? "",
      ].join(" ");
      if (uiHintRe.test(blob)) return true;
      if (el.getAttribute("role") === "tablist") return true;
      if (el.querySelector("[role=tab], [data-oferta-index], .swiper-slide")) {
        return true;
      }
      const imgs = el.querySelectorAll("img[src]").length;
      return imgs >= 3 && el.getBoundingClientRect().height > 120;
    }

    const set = new Set<Element>();
    for (const el of document.querySelectorAll(
      "section, article, ul, ol, main, [role=list], [role=tablist], [role=tabpanel]",
    )) {
      set.add(el);
    }
    for (const a of document.querySelectorAll("a[href]")) {
      if (!flyerRe.test(a.getAttribute("href") ?? "")) continue;
      let p: Element | null = a;
      for (let i = 0; i < 6 && p && p !== document.body; i++) {
        set.add(p);
        p = p.parentElement;
      }
    }
    for (const el of document.querySelectorAll(
      "[data-oferta-index], [class*='swiper'], [class*='carousel'], [class*='encarte'], [class*='flyer'], [class*='oferta']",
    )) {
      let p: Element | null = el;
      for (let i = 0; i < 5 && p && p !== document.body; i++) {
        set.add(p);
        p = p.parentElement;
      }
    }

    const raw = [...set]
      .filter((el) => el !== document.body && el !== document.documentElement)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const hrefs = flyerHrefs(el);
        return {
          tagName: el.tagName,
          selectors: selectorsFor(el),
          flyerHrefs: hrefs,
          text: (el.getAttribute("aria-label") ?? el.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 70),
          linkCount: el.querySelectorAll("a[href]").length,
          imageCount: el.querySelectorAll("img[src]").length,
          area: Math.max(0, Math.round(r.width * r.height)),
          uiHint: looksLikeFlyerUi(el),
        };
      })
      .filter(
        (c) =>
          c.selectors.length &&
          (c.flyerHrefs.length || c.uiHint || (c.imageCount >= 3 && c.area > 20000)),
      );

    raw.sort(
      (a, b) =>
        b.flyerHrefs.length - a.flyerHrefs.length ||
        Number(b.uiHint) - Number(a.uiHint) ||
        b.imageCount - a.imageCount ||
        a.area - b.area,
    );

    return raw.slice(0, 30).map((c, i) => ({
      index: i + 1,
      tagName: c.tagName,
      selectors: c.selectors,
      flyerHrefs: c.flyerHrefs,
      text: c.text,
      linkCount: c.linkCount,
      imageCount: c.imageCount,
      area: c.area,
    }));
  });
}

export function formatFlyerCandidates(cands: FlyerDomCandidate[]): string {
  return cands
    .map(
      (c) =>
        `#${c.index} ${c.tagName} selectors=${JSON.stringify(c.selectors)} flyerLinks=${c.flyerHrefs.length} images=${c.imageCount} text=${JSON.stringify(c.text)}`,
    )
    .join("\n");
}

export async function inspectBySelector(
  page: Page,
  selector: string,
): Promise<ScopePick | null> {
  return page.evaluate((sel) => {
    const UTIL =
      /^(w-|h-|p-|m-|flex|grid|text-|bg-|rounded|shadow|overflow|relative|absolute|mx-|my-|md:|sm:|lg:|xl:|col-|row-|gap-|items-|justify-|hidden|block|font-|mb-|mt-|ml-|mr-|px-|py-|pt-|pb-|pl-|pr-|border|cursor|transition|hover:|focus:|group|max-|min-|z-|top-|left-|right-|bottom-|inset-|object-|aspect-|opacity-|pointer-|select-|whitespace-|leading-|tracking-|uppercase|truncate|ring-|from-|to-|via-|animate-|decoration-)/;
    const TINY = new Set(["IMG", "SPAN", "SVG", "PATH", "BUTTON", "I", "USE", "BR"]);

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
      if (html.id && html.id.length < 60 && !/[:.]/.test(html.id)) {
        out.push(`#${cssEsc(html.id)}`);
      }
      const stable = [...el.classList].filter(
        (c) => c.length > 2 && c.length < 40 && !UTIL.test(c),
      );
      if (stable.length) {
        out.push(`${tag}.${stable.slice(0, 2).map(cssEsc).join(".")}`);
      }
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === el.tagName);
        const idx = same.indexOf(el) + 1;
        out.push(`${parent.tagName.toLowerCase()} > ${tag}:nth-of-type(${idx})`);
      }
      return [...new Set(out.filter(Boolean))].slice(0, 8);
    }

    function boxOf(el: Element) {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }

    function nodeOf(el: Element) {
      const html = el as HTMLElement;
      const label = (el.getAttribute("aria-label") ?? el.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
      return {
        tagName: el.tagName,
        selectors: selectorsFor(el),
        label,
        box: boxOf(el),
        linkCount: el.querySelectorAll("a[href]").length,
        imageCount: el.querySelectorAll("img").length,
        textCount: (el.textContent ?? "").trim().length,
        childCount: el.childElementCount,
        id: html.id || undefined,
        className: html.className
          ? String(html.className).slice(0, 120)
          : undefined,
        textPreview: label,
      };
    }

    let root: Element | null = null;
    try {
      root = document.querySelector(sel);
    } catch {
      return null;
    }
    if (!root) return null;
    const ancestors: ReturnType<typeof nodeOf>[] = [];
    let p: Element | null = root.parentElement;
    while (p && p !== document.body && ancestors.length < 8) {
      if (!TINY.has(p.tagName)) ancestors.push(nodeOf(p));
      p = p.parentElement;
    }
    return { ...nodeOf(root), ancestors };
  }, selector);
}
