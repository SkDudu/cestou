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
};

export type FlowState = {
  ctx: FlowContext;
  supermarketId?: string;
  discoveredFlyerIds: string[];
  offersFound: number;
  networkFlyers: NetworkFlyerDoc[];
  scopeSelectors?: string[];
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
};
