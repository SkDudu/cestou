import type { FlyerSource, FlowStep, RecordedAction } from "../types/flows.js";
import { normalizeAction } from "../recorder/action-normalizer.js";
import {
  cardItemSelectors,
  sanitizeFlyerSource,
} from "../runner/flyer-discover.js";
import type { GalleryScopeDump } from "./click-snapshot.js";

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
  return cardItemSelectors(fromTabs);
}

export function isViewerNoise(blob: string): boolean {
  return /lucide-x|lucide\.lucide-x|\bcanvas\b|max-h-\[80vh\]|\bfechar\b|(^|\s)path(\s|$)/i.test(
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
}): FlyerSource {
  const hasImg =
    Boolean(args.hasCanvas) ||
    args.imageUrls.some((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u));
  const hasPdf = args.pdfUrls.some((u) => /\.pdf(\?|$)/i.test(u));
  const clickSels = (args.clickSelectors ?? []).filter(
    (s) => !isViewerNoise(s),
  );
  const itemSelectors = cardItemSelectors([
    ...args.listing.itemSelectors,
    ...clickSels,
  ]);

  const urlIncludes: string[] = [];
  for (const u of [...args.imageUrls, ...args.pdfUrls].slice(0, 8)) {
    try {
      const path = new URL(u).pathname.split("/").filter(Boolean).pop();
      if (path && path.length > 3) urlIncludes.push(path.slice(0, 48));
    } catch {
      /* skip */
    }
  }

  return sanitizeFlyerSource({
    kind: "image-grid",
    downloadStrategy: "open-each-item",
    urlFrom: hasPdf && !hasImg ? "href" : "click-then-network",
    itemSelectors,
    downloadSelectors:
      hasPdf && !hasImg ? ['a[href*=".pdf"]', "a[download]"] : undefined,
    networkHints: urlIncludes.length
      ? { urlIncludes: [...new Set(urlIncludes)].slice(0, 4) }
      : undefined,
    evidence: `teach 2-pass: ${args.listing.count} cards; detalhe ${args.hasCanvas ? "canvas" : hasImg ? "imgs" : hasPdf ? "pdf" : "?"}`,
  });
}

const SKIP_REPLAY_CLICK =
  /ver\s+\S{3,}|baixar|download/i;

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
      if (SKIP_REPLAY_CLICK.test(blob) || isViewerNoise(blob)) continue;
    }
    if (n.type === "select-scope") hasScope = true;
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
