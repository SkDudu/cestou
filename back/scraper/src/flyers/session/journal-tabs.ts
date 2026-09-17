import type { Page } from "playwright";
import type { SectionOpenKind } from "../extraction/mimo/section-locate.js";

const SLIDE_SEL_RE = /slick-slide|swiper-slide/i;
const BROAD_ENCARTE_LINK_RE = /href\*=["'][^"']*\/encarte\//i;

/** Jet Engine / card grids beat raw /encarte/ hrefs (Frangolândia etc.). */
const LISTING_CARD_SELECTORS = [
  ".jet-listing-grid__item",
  ".jet-engine-listing-overlay-wrap",
  ".offers__item",
  '[class*="offers__item"]',
  "article.rounded-2xl",
  "article",
  ".flip-card.card",
  ".flip-card",
];

export function listingSelectorScore(sel: string, count: number): number {
  let score = count;
  if (/jet-listing-grid__item/i.test(sel)) score += 10_000;
  // Overlay wrap is often 1:1 with item — but alone on detail DOM = false single card.
  if (/jet-engine-listing-overlay/i.test(sel)) {
    score += count >= 2 ? 8_000 : -5_000;
  }
  if (/flip-card|offers__item|article\.rounded/i.test(sel)) score += 5_000;
  if (BROAD_ENCARTE_LINK_RE.test(sel)) score -= 3_000;
  if (isCarouselSlideSelector(sel)) score -= 5_000;
  if (/data-oferta-index/.test(sel)) score -= 500;
  return score;
}

/** Put real card grid sels first (Jet item > overlay-wrap > rest). */
export function preferListingCardSelectors(sels: string[]): string[] {
  if (!sels.length) return sels;
  const rank = (s: string) => {
    if (/jet-listing-grid__item/i.test(s)) return 0;
    if (/jet-engine-listing-overlay/i.test(s)) return 2;
    if (/flip-card|card-folheto|offers__item/i.test(s)) return 1;
    return 3;
  };
  return [...sels].sort((a, b) => rank(a) - rank(b));
}

function preferCardSelectors(
  candidates: Array<{ sel: string; n: number }>,
): { sel: string; n: number } | undefined {
  if (!candidates.length) return undefined;
  return [...candidates].sort(
    (a, b) => listingSelectorScore(b.sel, b.n) - listingSelectorScore(a.sel, a.n),
  )[0];
}

/** Carousel page slides — not separate encartes. */
export function isCarouselSlideSelector(sel: string): boolean {
  return SLIDE_SEL_RE.test(sel);
}

export function itemSelsLookLikeJournalTabs(sels: string[]): boolean {
  // Card grids (São Luiz flipbook, Jet, Guará) are not Assaí journal tabs
  if (
    sels.some((s) =>
      /flip-card|jet-listing|card-folheto|offers__item|article\.rounded/i.test(s),
    )
  ) {
    return false;
  }
  if (sels.some((s) => /\.ofertas-tab|button\[data-oferta-index\]/i.test(s))) {
    return true;
  }
  if (sels.some((s) => /\[role=["']?tab|tablist/i.test(s))) return true;
  // Bare [data-oferta-index] alone is too weak (MiMo invents it on card listings)
  return false;
}

function stripOfertaUnlessScoped(
  sels: string[],
  journalTabCount: number,
): string[] {
  if (journalTabCount >= 2) return sels;
  return sels.filter(
    (s) =>
      s !== "[data-oferta-index]" &&
      !/^button\[data-oferta-index\]/.test(s) &&
      !/^\[data-oferta-index\]/.test(s),
  );
}

/** Real Assaí-style journal tab controls — not flip-cards / cover grids. */
export async function countJournalTabs(
  page: Page,
  scopeSelector?: string,
): Promise<number> {
  const root = scopeSelector
    ? page.locator(scopeSelector).first()
    : page.locator("body");
  const tabSels = [
    ".ofertas-tab [data-oferta-index]",
    ".ofertas-tab button",
    "button[data-oferta-index]",
    '[role="tablist"] [role="tab"]',
    '[role=tablist] [role=tab]',
  ];
  let best = 0;
  for (const sel of tabSels) {
    try {
      const n = await root.locator(sel).count();
      if (n > best) best = n;
    } catch {
      /* */
    }
  }
  // Bare [data-oferta-index] only if no card-grid listing in scope
  if (best < 2) {
    try {
      const cards = await root.locator(
        ".flip-card, .flip-card.card, .jet-listing-grid__item, .card-folheto, .offers__item",
      ).count();
      if (cards >= 2) return 0;
      const bare = await root.locator("[data-oferta-index]").count();
      if (bare >= 2) best = bare;
    } catch {
      /* */
    }
  }
  return best;
}

/** Prefer journal tab buttons over slick/swiper slides when counting list items. */
export async function countJournalItems(
  page: Page,
  sels: string[],
  scopeSelector?: string,
): Promise<number> {
  const tabs = await countJournalTabs(page, scopeSelector);
  if (tabs >= 2) return tabs;
  const root = scopeSelector
    ? page.locator(scopeSelector).first()
    : page.locator("body");
  let best = 0;
  for (const sel of stripOfertaUnlessScoped(sels, 0)) {
    if (isCarouselSlideSelector(sel)) continue;
    try {
      const loc = scopeSelector ? root.locator(sel) : page.locator(sel);
      const n = await loc.count();
      if (n > best) best = n;
    } catch {
      /* bad sel */
    }
  }
  return best;
}

export function normalizeJournalItemSelectors(
  sels: string[],
  opts?: { journalTabCount?: number },
): string[] {
  const tabN = opts?.journalTabCount ?? 0;
  const cleaned = stripOfertaUnlessScoped(
    sels
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !isCarouselSlideSelector(s)),
    tabN,
  );
  if (tabN >= 2) {
    return [...new Set(["[data-oferta-index]", ...cleaned])];
  }
  return cleaned.length ? [...new Set(cleaned)] : [...new Set(sels)];
}

export const DEFAULT_CAROUSEL_PAGER = [
  ".slick-next:not(.slick-disabled)",
  ".swiper-button-next:not(.swiper-button-disabled)",
  'button[aria-label*="próxima" i]',
  'button[aria-label*="proxima" i]',
  'button[aria-label*="Next" i]',
  '[aria-label*="próxima" i]',
  '[aria-label*="proxima" i]',
  // Narrow next controls only — never bare [class*=slider] button (hits header chrome)
  ".slider-next",
  '[class*="slider-next"]',
  '[class*="SliderNext"]',
];

/** Drop catch-alls that click page chrome (Cometa YouTube header, etc.). */
export function sanitizePagerSelectors(
  sels: string[] | undefined,
): string[] | undefined {
  if (!sels?.length) return undefined;
  const cleaned = sels.filter(
    (s) =>
      !/\[class\*=["']?slider["']?\]\s*button/i.test(s) &&
      !/youtube|instagram|facebook|linkedin|tiktok|whatsapp/i.test(s),
  );
  return cleaned.length ? [...new Set(cleaned)] : undefined;
}

/** Listing thumbs / folheto links only — not inline full pages (fancybox/slick hrefs). */
export function refineOpenKindFromHtml(
  openKind: SectionOpenKind,
  html: string,
): SectionOpenKind {
  if (openKind === "need_click") return openKind;

  const hasInlineFullPages =
    (/data-fancybox/i.test(html) &&
      /\.(jpe?g|png|webp)(\?|"|'|#)/i.test(html)) ||
    /slick-slide[\s\S]{0,500}href=["'][^"']+\.(jpe?g|png|webp)/i.test(html);

  if (hasInlineFullPages) return openKind === "download" ? "download" : "viewer";

  const hasListingNav =
    /\/folhet[oós]?\//i.test(html) ||
    /(?:href|data-url)=["'][^"']*\/encarte\//i.test(html) ||
    /jet-listing-grid/i.test(html);
  const thumbOnlyListing =
    /\/Flyer\/thumbnail/i.test(html) || (hasListingNav && !hasInlineFullPages);

  // Model often says viewer/download on cover-card listings (Qwen copies prompt examples).
  if (thumbOnlyListing && hasListingNav) return "need_click";

  if (openKind === "download") {
    const hasRealDownload =
      /href=["'][^"']*\.pdf(\?|#|"|')/i.test(html) ||
      /\sdownload(=|\s|>)/i.test(html);
    if (!hasRealDownload) return "need_click";
  }

  return openKind;
}

export function htmlHasInlineFancyboxGrid(html: string): boolean {
  return (
    /data-fancybox/i.test(html) &&
    (/offers__item|__item"|gallery/i.test(html) ||
      /img[^>]+data-fancybox[^>]+src=["'][^"']+\.(jpe?g|png|webp)/i.test(html))
  );
}

/** MiMo sometimes returns [data-oferta-index] when scope has none — reconcile with DOM. */
export async function resolveTeachItemSelectors(
  page: Page,
  scopeSelector: string | undefined,
  mimoSels: string[],
): Promise<{ selectors: string[]; journalTabCount: number }> {
  const root = scopeSelector
    ? page.locator(scopeSelector).first()
    : page.locator("body");
  let journalTabCount = await countJournalTabs(page, scopeSelector);
  // Card grid in scope beats stray/invented oferta-index tabs
  try {
    const cards = await root
      .locator(
        ".flip-card.card, .flip-card, .jet-listing-grid__item, .card-folheto",
      )
      .count();
    if (cards >= 2 && journalTabCount > 0 && journalTabCount !== cards) {
      // flip cards present and tab count isn't clearly the same control set
      const realTabs = await root.locator(
        ".ofertas-tab button, button[data-oferta-index]",
      ).count();
      if (realTabs < 2) journalTabCount = 0;
    }
  } catch {
    /* */
  }

  let sels = stripOfertaUnlessScoped(mimoSels, journalTabCount);
  if (journalTabCount >= 2) {
    return {
      selectors: normalizeJournalItemSelectors(sels, { journalTabCount }),
      journalTabCount,
    };
  }

  const domCandidates: Array<{ sel: string; n: number }> = [];
  const tryCount = async (sel: string) => {
    try {
      const n = await root.locator(sel).count();
      if (n >= 1) domCandidates.push({ sel, n });
    } catch {
      /* */
    }
  };
  await Promise.all([
    ...LISTING_CARD_SELECTORS.map((s) => tryCount(s)),
    tryCount('a[href*="/folheto/"]'),
    tryCount('a[href*="/encarte/"]'),
    tryCount("button[data-oferta-index]"),
    ...sels.map((s) => tryCount(s)),
  ]);
  const pick = preferCardSelectors(
    domCandidates.filter((c) => c.n >= 2).length
      ? domCandidates.filter((c) => c.n >= 2)
      : domCandidates.filter((c) => c.n >= 1),
  );
  if (pick) {
    sels = [...new Set([pick.sel, ...sels.filter((s) => s !== pick.sel)])];
    return {
      selectors: sels
        .filter((s) => !isCarouselSlideSelector(s))
        .filter((s) => !BROAD_ENCARTE_LINK_RE.test(s) || s === pick.sel),
      journalTabCount: 0,
    };
  }

  return {
    selectors: sels.filter((s) => !isCarouselSlideSelector(s)),
    journalTabCount: 0,
  };
}

/** Listing cards that open a viewer in another route/tab. */
export async function augmentListingLinkSelectors(
  page: Page,
  sels: string[],
  scopeSelector?: string,
): Promise<string[]> {
  const root = scopeSelector
    ? page.locator(scopeSelector).first()
    : page.locator("body");
  try {
    const jet = await root.locator(".jet-listing-grid__item").count();
    if (jet >= 2) {
      return [
        ...new Set([
          ".jet-listing-grid__item",
          ...sels.filter((s) => !BROAD_ENCARTE_LINK_RE.test(s)),
        ]),
      ];
    }
  } catch {
    /* */
  }
  const pairs: Array<{ sel: string; n: number }> = [];
  for (const sel of [
    'a[href*="/folheto/"]',
    'a[href*="/encarte/"]',
    'a[href*="/Flyer/?id="]',
  ]) {
    try {
      const n = await root.locator(sel).count();
      if (n >= 2) pairs.push({ sel, n });
    } catch {
      /* skip */
    }
  }
  pairs.sort((a, b) => b.n - a.n);
  const best = pairs[0];
  if (!best) return sels;
  const skipProduct = (s: string) =>
    /product-card|product-link|sku|vtexassets/i.test(s);
  return [
    ...new Set([best.sel, ...sels.filter((s) => !skipProduct(s))]),
  ];
}

/** Runtime: journal tabs beat carousel slides; drop bogus oferta outside scope. */
export async function resolveDiscoverItemSelectors(
  page: Page,
  sels: string[] | undefined,
  scopeSelector?: string,
): Promise<string[]> {
  const root = scopeSelector
    ? page.locator(scopeSelector).first()
    : page.locator("body");
  // Cover-card listings (São Luiz): prefer flip/jet cards even if teach saved tabs
  const coverSels = (sels ?? []).filter((s) =>
    /flip-card|jet-listing-grid__item|card-folheto|offers__item|jet-engine-listing-overlay/i.test(
      s,
    ),
  );
  if (coverSels.length) {
    const preferred = preferListingCardSelectors(coverSels);
    for (const sel of preferred) {
      try {
        if ((await root.locator(sel).count()) >= 2) {
          return [...new Set(preferred)];
        }
      } catch {
        /* */
      }
    }
    for (const sel of preferred) {
      try {
        if ((await root.locator(sel).count()) >= 1) {
          return [...new Set(preferred)];
        }
      } catch {
        /* */
      }
    }
  }
  try {
    for (const cardSel of [
      ".flip-card.card",
      ".flip-card",
      ".jet-listing-grid__item",
      ".card-folheto",
    ]) {
      const n = await root.locator(cardSel).count();
      if (n >= 2) return [cardSel];
    }
  } catch {
    /* */
  }
  let oferta = await countJournalTabs(page, scopeSelector);
  const base = stripOfertaUnlessScoped(
    sels?.length ? [...sels] : ['[role="tab"]', "[data-oferta-index]"],
    oferta,
  );
  if (oferta >= 2) {
    return normalizeJournalItemSelectors(base, { journalTabCount: oferta });
  }
  const resolved = await resolveTeachItemSelectors(
    page,
    scopeSelector,
    base,
  );
  const withoutBroad = resolved.selectors.filter(
    (s) =>
      !BROAD_ENCARTE_LINK_RE.test(s) ||
      resolved.selectors.some((x) => /jet-listing-grid__item/i.test(x)),
  );
  return withoutBroad.length ? withoutBroad : resolved.selectors;
}
