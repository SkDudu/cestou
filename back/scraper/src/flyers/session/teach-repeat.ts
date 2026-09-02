import type {
  FlyerSource,
  FlyerViewerMode,
  FlowStep,
  NetworkFlyerDoc,
  RecordedAction,
} from "../types/flows.js";
import { normalizeAction } from "../recorder/action-normalizer.js";
import {
  cardItemSelectors,
  filterFlyerDownloadButtons,
  hasProvenFileDownload,
  networkDocsAreRich,
  sanitizeDownloadSelectors,
  sanitizeFlyerSource,
  sanitizeItemSelectors,
} from "../runner/flyer-discover.js";
import type { GalleryHit, GalleryScopeDump } from "./click-snapshot.js";
import {
  DEFAULT_CAROUSEL_PAGER,
  htmlHasInlineFancyboxGrid,
  itemSelsLookLikeJournalTabs,
  normalizeJournalItemSelectors,
} from "./journal-tabs.js";
import type { SectionOpenKind } from "../extraction/mimo/section-locate.js";

export type ListingTeach = {
  listingUrl: string;
  itemSelectors: string[];
  count: number;
};

const CARD_CTA_RE = /ver\s+\S{3,}/i;

export function galleryLooksLikeNavCards(gallery?: GalleryScopeDump): boolean {
  if (!gallery) return false;
  if ((gallery.tabButtons?.length ?? 0) >= 2) return true;
  return gallery.tabButtons.some((t) => CARD_CTA_RE.test(t.text.trim()));
}

export function listingItemSelectorsFromGallery(
  gallery?: GalleryScopeDump,
): string[] {
  const fromTabs = (gallery?.tabButtons ?? []).flatMap((t) => t.selectors);
  const blob = [
    ...(gallery?.tabButtons ?? []).map((t) => t.text),
    ...fromTabs,
  ].join(" ");
  const cardCta = CARD_CTA_RE.test(blob);
  return (
    sanitizeItemSelectors(fromTabs, {
      kind: cardCta ? "image-grid" : "tabs",
    }) ?? fromTabs.map((s) => s.trim()).filter(Boolean)
  );
}

function fallbackHits(gallery?: GalleryScopeDump): GalleryHit[] {
  const out: GalleryHit[] = [];
  const seen = new Set<string>();
  const add = (h: GalleryHit) => {
    const key = h.selectors[0];
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(h);
  };
  for (const h of gallery?.hits ?? []) add(h);
  for (const t of gallery?.tabButtons ?? []) {
    if (!t.selectors[0]) continue;
    add({ kind: "tab", text: t.text, selectors: t.selectors });
  }
  for (const d of gallery?.downloadButtons ?? []) {
    if (!d.selectors[0]) continue;
    add({
      kind: /\.pdf(\?|$)/i.test(d.href ?? "") ? "pdf" : "download",
      text: d.text,
      selectors: d.selectors,
    });
  }
  const headingBlob = (gallery?.headings ?? []).join(" ");
  if (
    gallery &&
    (gallery.imageCount >= 2 || /encartes?/i.test(headingBlob))
  ) {
    add({
      kind: "image",
      text: "imagens de encarte",
      selectors: ['img[alt*="Encarte"]', 'img[src*="flipbook"]'],
    });
    if (/encartes?/i.test(headingBlob)) {
      add({
        kind: "list",
        text: "Encartes",
        selectors: ['h3:has-text("Encartes")'],
      });
    }
  }
  return out.slice(0, 12);
}

/** Pass 1: show dump hits. Operator picks which is the flyer listing. */
export function listingFromDump(args: {
  gallery?: GalleryScopeDump;
  operatorSels?: string[];
}): {
  status: "ready" | "not_found";
  itemSelectors: string[];
  humanHint: string;
  hits: GalleryHit[];
} {
  const hits = fallbackHits(args.gallery);
  for (const sel of cardItemSelectors(args.operatorSels ?? [])) {
    if (!sel) continue;
    if (hits.some((h) => h.selectors[0] === sel)) continue;
    hits.unshift({ kind: "list", text: "área marcada", selectors: [sel] });
  }
  const capped = hits.slice(0, 12);
  const itemSelectors = [
    ...new Set(capped.flatMap((h) => h.selectors).filter(Boolean)),
  ];
  if (!capped.length) {
    return {
      status: "not_found",
      itemSelectors: [],
      hits: [],
      humanHint: "Nada no dump. Role, fecha o modal, ou marca a área.",
    };
  }
  return {
    status: "ready",
    itemSelectors,
    hits: capped,
    humanHint: `${capped.length} candidato(s). Escolhe qual é a listagem de encartes.`,
  };
}

export function isViewerNoise(blob: string): boolean {
  return /lucide-x|lucide\.lucide-x|\bcanvas\b|max-h-\[80vh\]|\bfechar\b|(^|\s)path(\s|$)|[×✕✖]|aria-label=["']?(close|fechar)|elementor-lightbox|lightbox-slideshow|dialog-lightbox|swiper-slide\.elementor-lightbox|e-gallery-item/i.test(
    blob,
  );
}

export function mergeDetailHarvest(args: {
  listing: ListingTeach;
  imageUrls: string[];
  pdfUrls: string[];
  detailUrl: string;
  clickSelectors?: string[];
  hasCanvas?: boolean;
  viewerMode?: FlyerViewerMode;
  journalTabCount?: number;
  openKind?: SectionOpenKind;
  htmlSnippet?: string;
}): FlyerSource {
  const pageImgs = args.imageUrls.filter((u) =>
    /\.(jpe?g|png|webp)(\?|$)/i.test(u),
  );
  const hasImg = Boolean(args.hasCanvas) || pageImgs.length > 0;
  const hasPdf = args.pdfUrls.some((u) => /\.pdf(\?|$)/i.test(u));
  const journalTabs = (args.journalTabCount ?? 0) >= 2;
  // ponytail: listing cards stay listing cards — lightbox last-click ≠ itemSelectors
  const clickSels = (args.clickSelectors ?? []).filter(
    (s) => !isViewerNoise(s),
  );
  const itemSelectors = cardItemSelectors(
    args.listing.itemSelectors.length
      ? args.listing.itemSelectors
      : clickSels,
  );
  // ponytail: sample shapes viewerMode — never invent page counts
  let viewerMode = args.viewerMode;
  if (hasImg && viewerMode === "pdf") viewerMode = undefined;
  if (!viewerMode) {
    if (hasPdf && !hasImg) viewerMode = "pdf";
    else if (pageImgs.length >= 2) viewerMode = "img-stack";
    else if (args.hasCanvas) viewerMode = undefined;
    else viewerMode = "one-page";
  }
  if (args.hasCanvas && viewerMode === "one-page") {
    viewerMode = undefined;
  }
  if (
    args.htmlSnippet &&
    /elementor-gallery|e-gallery-item/i.test(args.htmlSnippet) &&
    hasImg
  ) {
    viewerMode = "img-stack";
  }

  if (journalTabs) {
    return sanitizeFlyerSource({
      kind: "tabs",
      downloadStrategy: "open-each-item",
      urlFrom: "click-then-network",
      itemSelectors: normalizeJournalItemSelectors(itemSelectors, {
        journalTabCount: args.journalTabCount,
      }),
      pagerSelectors: DEFAULT_CAROUSEL_PAGER,
      viewerMode: pageImgs.length >= 2 ? "img-stack" : viewerMode,
      evidence: `teach 2-pass: ${args.listing.count} tabs; viewer=${viewerMode ?? "pager"}; detalhe ${args.hasCanvas ? "canvas" : "imgs"}`,
    });
  }

  const inlineGrid =
    args.openKind === "viewer" &&
    !args.hasCanvas &&
    htmlHasInlineFancyboxGrid(args.htmlSnippet ?? "");
  if (inlineGrid) {
    return sanitizeFlyerSource({
      kind: "image-grid",
      downloadStrategy: "collect-images",
      urlFrom: "href",
      itemSelectors,
      evidence: `teach 2-pass: ${args.listing.count} inline fancybox tiles`,
    });
  }

  return sanitizeFlyerSource({
    kind: "image-grid",
    downloadStrategy: "open-each-item",
    urlFrom: "click-then-network",
    itemSelectors,
    viewerMode,
    pagerSelectors: args.hasCanvas ? DEFAULT_CAROUSEL_PAGER : undefined,
    evidence: `teach 2-pass: ${args.listing.count} cards; viewer=${viewerMode ?? "pager"}; detalhe ${args.hasCanvas ? "canvas" : hasImg ? "imgs" : hasPdf ? "pdf" : "?"}`,
  });
}

function itemSelsAreOfertaTabs(sels: string[]): boolean {
  if (
    sels.some((s) =>
      /flip-card|jet-listing|card-folheto|offers__item|article\.rounded/i.test(s),
    )
  ) {
    return false;
  }
  return sels.some(
    (s) =>
      /\.ofertas-tab\b/i.test(s) ||
      /ofertas-tab\s+button/i.test(s) ||
      /button\[data-oferta-index\]/i.test(s),
  );
}

function itemSelsAreCoverCards(sels: string[]): boolean {
  // flip/jet/card-folheto open a modal; offers__item often inline fancybox (Centerbox)
  return sels.some((s) =>
    /flip-card|jet-listing-grid__item|card-folheto/i.test(s),
  );
}

/** flyerSource on Aprovar from MiMo openKind (not always open-each-item). */
export function flyerSourceFromOpenKind(args: {
  openKind: "download" | "viewer" | "need_click";
  itemSelectors: string[];
  downloadSelectors?: string[];
  clickTargetSelectors?: string[];
  itemCount?: number;
  /** DOM count of [data-oferta-index] — beats slick slide miscount. */
  journalTabCount?: number;
  htmlSnippet?: string;
}): FlyerSource {
  const journalTabs = args.journalTabCount ?? 0;
  const itemSels = normalizeJournalItemSelectors(args.itemSelectors.filter(Boolean), {
    journalTabCount: journalTabs,
  });
  const dl = (args.downloadSelectors ?? []).filter(Boolean);
  const effectiveCount =
    journalTabs >= 2 ? journalTabs : args.itemCount;
  if (args.openKind === "download" && dl.length) {
    const pdf = dl.some((s) => /\.pdf/i.test(s));
    return sanitizeFlyerSource({
      kind: pdf ? "pdf-links" : "image-grid",
      downloadStrategy: pdf ? "direct-url" : "click-download",
      urlFrom: pdf ? "href" : "click-then-network",
      itemSelectors: itemSels,
      downloadSelectors: dl,
      evidence: "section teach — download",
    });
  }
  if (args.openKind === "viewer") {
    // DOM journalTabCount≥2 (countJournalTabs) beats selector string heuristics —
    // bare [data-oferta-index] is valid Assaí tabs; flip-cards already excluded upstream.
    const manyTabs =
      journalTabs >= 2 ||
      ((itemSelsAreOfertaTabs(itemSels) ||
        itemSelsLookLikeJournalTabs(itemSels)) &&
        (effectiveCount === undefined || effectiveCount >= 2));
    if (manyTabs) {
      return sanitizeFlyerSource({
        kind: "tabs",
        downloadStrategy: "open-each-item",
        urlFrom: "click-then-network",
        itemSelectors: itemSels,
        pagerSelectors: DEFAULT_CAROUSEL_PAGER,
        viewerMode: "img-stack",
        evidence: "section teach — viewer tabs in HTML",
      });
    }
    if (htmlHasInlineFancyboxGrid(args.htmlSnippet ?? "")) {
      return sanitizeFlyerSource({
        kind: "image-grid",
        downloadStrategy: "collect-images",
        urlFrom: "href",
        itemSelectors: itemSels,
        evidence: "section teach — inline fancybox grid",
      });
    }
    // Cover cards that open a modal/detail (São Luiz flipbook, Guará, Jet)
    if (itemSelsAreCoverCards(itemSels)) {
      return sanitizeFlyerSource({
        kind: "image-grid",
        downloadStrategy: "open-each-item",
        urlFrom: "click-then-network",
        itemSelectors: itemSels.filter((s) => !/data-oferta-index/i.test(s)),
        viewerMode: "img-stack",
        evidence: "section teach — cover cards open viewer",
      });
    }
    return sanitizeFlyerSource({
      kind: "image-grid",
      downloadStrategy: "collect-images",
      urlFrom: "href",
      itemSelectors: itemSels,
      downloadSelectors: dl.length ? dl : undefined,
      evidence: "section teach — viewer pages in HTML",
    });
  }
  return sanitizeFlyerSource({
    kind: "image-grid",
    downloadStrategy: "open-each-item",
    urlFrom: "click-then-network",
    itemSelectors: args.clickTargetSelectors?.length
      ? args.clickTargetSelectors
      : itemSels,
    evidence: "listing aprovada — open-each-item",
  });
}

const SKIP_REPLAY_CLICK =
  /ver\s+\S{3,}|baixar|download/i;

/** Teach sample: opening one listing card to harvest viewer — not part of run. */
function isTeachSampleCardClick(blob: string): boolean {
  return (
    /flip-card|img\[alt=|Costume Saudável|Encarte São Luiz|card-folheto|jet-listing|VER ENCARTE|Download em PDF|ofertasdelimpeza|\/encarte\//i.test(
      blob,
    ) || /\d{1,2}\s*[./-]\s*\d{1,2}.*\d{2,4}/.test(blob)
  );
}

/** Replayable steps from recorded clicks + known flyerSource. No MiMo. */
export function buildTeachSteps(args: {
  startUrl: string;
  actions: RecordedAction[];
  flyerSource: FlyerSource;
  scopeSelectors?: string[];
}): FlowStep[] {
  const steps: FlowStep[] = [];
  let order = 0;
  steps.push({
    order: order++,
    type: "navigate",
    config: { url: args.startUrl },
  });
  let hasScope = Boolean(args.scopeSelectors?.length);
  for (const a of args.actions) {
    if (
      a.value === "discover-flyer" ||
      a.value === "discover-store" ||
      a.value === "capture-network"
    ) {
      continue;
    }
    const n = normalizeAction(a);
    if (!n) continue;
    if (n.type === "navigate") continue;
    if (n.type === "click") {
      const blob = [
        n.config.description,
        n.config.value,
        n.config.selector,
        ...(n.config.selectors ?? []),
      ]
        .filter(Boolean)
        .join(" ");
      if (
        SKIP_REPLAY_CLICK.test(blob) ||
        isViewerNoise(blob) ||
        isTeachSampleCardClick(blob)
      ) {
        continue;
      }
    }
    // select-scope from actions — prefer listing scopeSelectors when provided
    if (n.type === "select-scope") {
      if (args.scopeSelectors?.length) continue;
      hasScope = true;
    }
    steps.push({ ...n, order: order++ });
  }
  if (args.scopeSelectors?.length && !steps.some((s) => s.type === "select-scope")) {
    steps.push({
      order: order++,
      type: "select-scope",
      config: {
        purpose: "flyer-discovery",
        selectors: args.scopeSelectors,
      },
    });
    hasScope = true;
  }
  steps.push({
    order: order++,
    type: "discover-flyer",
    config: {
      scope: hasScope ? "element" : "page",
      duration: 3000,
      flyerSource: args.flyerSource,
    },
  });
  return steps;
}

export type AnalyzedFlow = {
  version: number;
  startUrl: string;
  notes?: string;
  steps: FlowStep[];
  awaitDetail?: boolean;
  listingCount?: number;
  teachPass?: 1 | 2;
};

export type DumpRecipe = {
  status: "ready" | "need_click" | "not_found";
  flyerSource?: FlyerSource;
  humanHint: string;
};

function pagerSels(gallery?: GalleryScopeDump): string[] {
  return (gallery?.pager ?? []).flatMap((p) => p.selectors);
}

function withPager(src: FlyerSource, gallery?: GalleryScopeDump): FlyerSource {
  const extra = pagerSels(gallery);
  if (!extra.length) return src;
  return sanitizeFlyerSource({
    ...src,
    pagerSelectors: [...(src.pagerSelectors ?? []), ...extra],
  });
}

function networkRecipe(net: NetworkFlyerDoc[]): FlyerSource | undefined {
  if (!networkDocsAreRich(net)) return undefined;
  const urlIncludes: string[] = [];
  for (const n of net) {
    for (const raw of [n.sourceUrl, n.url, ...(n.pageUrls ?? [])]) {
      if (!raw) continue;
      try {
        const parts = new URL(raw).pathname.split("/").filter(Boolean);
        if (parts.length) urlIncludes.push(parts.slice(-2).join("/"));
      } catch {
        /* skip */
      }
    }
  }
  const hasPdf = net.some((n) => n.pdf || /\.pdf(\?|#|$)/i.test(n.url));
  const multi = net.some((n) => (n.pageUrls?.length ?? 0) >= 2);
  return sanitizeFlyerSource({
    kind: "api-json",
    downloadStrategy: hasPdf && !multi ? "direct-url" : "collect-images",
    urlFrom: "network",
    networkHints: {
      urlIncludes: [...new Set(urlIncludes)].slice(0, 8),
      jsonKeys: [
        "images_urls",
        "imagesUrls",
        "pages",
        "pageUrls",
        "urlFinalDocument",
        "pdfUrl",
        "flyers",
        "encartes",
      ],
    },
    viewerMode: hasPdf && !multi ? "pdf" : multi ? "img-stack" : "one-page",
    evidence: `dump: network ×${net.length}`,
  });
}

/** Teach recipe from gallery dump + network. Listing first. No MiMo. */
export function recipeFromDump(args: {
  gallery?: GalleryScopeDump;
  network: NetworkFlyerDoc[];
  operatorSels?: string[];
  operatorHint?: string;
}): DumpRecipe {
  const { gallery, network, operatorSels, operatorHint } = args;
  const downloads = filterFlyerDownloadButtons(gallery?.downloadButtons ?? []);
  const dlSels = sanitizeDownloadSelectors(
    downloads.flatMap((b) => b.selectors ?? []),
  );
  const tabItems = listingItemSelectorsFromGallery(gallery);
  const opItems = cardItemSelectors(operatorSels ?? []);
  const items = [...new Set([...tabItems, ...opItems])].filter(Boolean);
  const tabs = (gallery?.tabButtons?.length ?? 0) >= 2;

  if (items.length) {
    const cardCta = CARD_CTA_RE.test(
      (gallery?.tabButtons ?? []).map((t) => t.text).join(" "),
    );
    const src = withPager(
      sanitizeFlyerSource({
        kind: cardCta || !tabs ? "image-grid" : "tabs",
        downloadStrategy: "open-each-item",
        urlFrom: "click-then-network",
        itemSelectors: items,
        downloadSelectors: dlSels,
        evidence: `dump: ${items.length} card/tab selector(s)`,
      }),
      gallery,
    );
    return {
      status: "ready",
      flyerSource: src,
      humanHint: "Listagem no dump. Confere o highlight e Aprovar.",
    };
  }

  const net = networkRecipe(network);
  if (net) {
    return {
      status: "ready",
      flyerSource: withPager(net, gallery),
      humanHint: `Network: ${network.length} doc(s). Confere e Aprovar.`,
    };
  }

  if (hasProvenFileDownload(downloads) && dlSels?.length) {
    return {
      status: "ready",
      flyerSource: withPager(
        sanitizeFlyerSource({
          kind: tabs ? "tabs" : "pdf-links",
          downloadStrategy: "click-download",
          urlFrom: "click-then-network",
          downloadSelectors: dlSels,
          evidence: "dump: proven file download",
        }),
        gallery,
      ),
      humanHint: "Download comprovado. Confere e Aprovar.",
    };
  }

  const pdfLinks = (gallery?.links ?? []).filter((u) =>
    /\.pdf(\?|#|$)/i.test(u),
  );
  if (pdfLinks.length) {
    return {
      status: "ready",
      flyerSource: withPager(
        sanitizeFlyerSource({
          kind: "pdf-links",
          downloadStrategy: "direct-url",
          urlFrom: "href",
          evidence: `dump: ${pdfLinks.length} pdf href`,
        }),
        gallery,
      ),
      humanHint: "PDF na página. Confere e Aprovar.",
    };
  }

  if ((gallery?.iframes?.length ?? 0) > 0) {
    return {
      status: "ready",
      flyerSource: withPager(
        sanitizeFlyerSource({
          kind: "iframe",
          downloadStrategy: "harvest-after-activate",
          urlFrom: "network",
          evidence: "dump: iframe",
        }),
        gallery,
      ),
      humanHint: "Iframe/flipbook — harvest após abrir.",
    };
  }

  return {
    status: "not_found",
    humanHint: operatorHint
      ? "Dump vazio nessa dica. Role até a galeria ou marca a área."
      : "Não achei listagem. Role até a galeria ou marca a área.",
  };
}

export function applyFlyerSource(
  steps: FlowStep[],
  flyerSource: FlyerSource,
): FlowStep[] {
  let found = false;
  const next = steps.map((s) => {
    if (s.type !== "discover-flyer") return s;
    found = true;
    return { ...s, config: { ...s.config, flyerSource } };
  });
  if (found) return next;
  return [
    ...next,
    {
      order: next.length,
      type: "discover-flyer",
      config: { scope: "page", duration: 3000, flyerSource },
    },
  ];
}
