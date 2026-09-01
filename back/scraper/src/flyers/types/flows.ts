export type StepType =
  | "navigate"
  | "click"
  | "select"
  | "input"
  | "wait"
  | "scroll"
  | "select-scope"
  | "discover-store"
  | "discover-flyer"
  | "capture-network"
  | "download-flyers"
  | "extract-offers";

export type FlowContext = Record<string, string>;

export type NetworkFlyerDoc = {
  url: string;
  title?: string;
  thumbnail?: string;
  validFrom?: string;
  validUntil?: string;
  /** Set when response Content-Type was PDF (URL may lack .pdf). */
  pdf?: boolean;
  /** Page image/PDF URLs from API JSON (prefer over single url). */
  pageUrls?: string[];
  /** Response URL that produced this doc — for networkHints.urlIncludes. */
  sourceUrl?: string;
};

export type FlowState = {
  ctx: FlowContext;
  supermarketId?: string;
  discoveredFlyerIds: string[];
  offersFound: number;
  networkFlyers: NetworkFlyerDoc[];
  scopeSelectors?: string[];
  /** Stream progress to dashboard / SSE during a run. */
  onLog?: (line: string) => void;
  /**
   * Buffers captured via Playwright download event during discover
   * (keyed by flyer id after persist).
   */
  capturedPages?: Map<
    string,
    Array<{ buffer: Buffer; contentType: string; url?: string }>
  >;
  /** Cookie-aware HTTPS fetch from the live browser context. */
  browserFetch?: (url: string) => Promise<{
    buffer: Buffer;
    contentType: string;
  }>;
};

export type ScopeMetadata = {
  tagName?: string;
  id?: string;
  className?: string;
  textPreview?: string;
  childCount?: number;
  linkCount?: number;
  imageCount?: number;
};

/** How flyers appear on this site — set by MiMo at teach time, not global regex. */
export type FlyerSourceKind =
  | "tabs"
  | "carousel"
  | "react-viewer"
  | "pdf-links"
  | "api-json"
  | "iframe"
  | "image-grid";

export type FlyerDownloadStrategy =
  | "direct-url"
  | "collect-images"
  | "open-each-item"
  | "harvest-after-activate"
  | "click-download";

/** How pages load inside an open flyer viewer (teach pass2 / runtime). */
export type FlyerViewerMode =
  | "one-page"
  | "img-stack"
  | "lazy-scroll"
  | "pdf";

export type FlyerSource = {
  kind: FlyerSourceKind;
  itemSelectors?: string[];
  /** Buttons/links that download the flyer PDF (Assaí "Baixar" etc.). */
  downloadSelectors?: string[];
  /** Next/ver-mais/swiper arrows — discover clicks these to load more items or pages. */
  pagerSelectors?: string[];
  urlFrom?: "href" | "img.src" | "data-attr" | "network" | "click-then-network";
  networkHints?: {
    urlIncludes?: string[];
    jsonKeys?: string[];
  };
  downloadStrategy: FlyerDownloadStrategy;
  /**
   * Viewer page pattern (modal). Not flyer count — runtime still counts.
   * one-page = single image/canvas; img-stack = many img URLs in DOM;
   * lazy-scroll = new img src after scroll; pdf = file PDF.
   */
  viewerMode?: FlyerViewerMode;
  evidence?: string;
  /** originalUrl / title rejected in teach test — discover skips these. */
  skipKeys?: string[];
};

/** Compact DOM dump for MiMo teach — not full page/webpack. */
export type ClickSnapshot = {
  html?: string;
  css?: {
    id?: string;
    className?: string;
    display?: string;
    position?: string;
    sheets?: string[];
  };
  js?: string[];
  links?: string[];
};

export type StepConfig = {
  url?: string;
  selector?: string;
  selectors?: string[];
  value?: string;
  description?: string;
  strategy?: "selector" | "timeout" | "networkidle";
  timeoutMs?: number;
  direction?: "down" | "up";
  amount?: number;
  scope?: string;
  duration?: number;
  semantic?: string;
  purpose?: string;
  label?: string;
  metadata?: ScopeMetadata;
  /** Teach-time manifesto for discover-flyer. */
  flyerSource?: FlyerSource;
};

export type FlowStep = {
  order: number;
  type: StepType;
  config: StepConfig;
};

export type RecordedAction = {
  kind: "click" | "input" | "change" | "navigation" | "scroll" | "scope";
  url?: string;
  selectors?: string[];
  value?: string;
  description?: string;
  semantic?: string;
  metadata?: ScopeMetadata;
  snapshot?: ClickSnapshot;
};
