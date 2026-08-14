import type { FlowStep, RecordedAction, StepType } from "../types/flows.js";

/** Prefer stable locator strategies (SPEC 015 §24). */
export function buildSelectors(info: {
  testId?: string | null;
  id?: string | null;
  name?: string | null;
  ariaLabel?: string | null;
  role?: string | null;
  tag?: string | null;
  css?: string | null;
  text?: string | null;
}): string[] {
  const out: string[] = [];
  if (info.testId) out.push(`[data-testid="${cssEscape(info.testId)}"]`);
  if (info.id) out.push(`#${cssEscape(info.id)}`);
  if (info.name && info.tag) {
    out.push(`${info.tag}[name="${cssEscape(info.name)}"]`);
  } else if (info.name) {
    out.push(`[name="${cssEscape(info.name)}"]`);
  }
  if (info.ariaLabel) {
    out.push(`[aria-label="${cssEscape(info.ariaLabel)}"]`);
  }
  if (info.role) out.push(`[role="${cssEscape(info.role)}"]`);
  const text = (info.text ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (text && text.length >= 2) {
    const esc = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    if (info.tag && /^(button|a|label|span|div|li|option)$/.test(info.tag)) {
      out.push(`${info.tag}:has-text("${esc}")`);
    }
    out.push(`text="${esc}"`);
  }
  if (info.css) out.push(info.css);
  return [...new Set(out.filter(Boolean))];
}

function cssEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function detectSemantic(
  kind: RecordedAction["kind"],
  text: string,
): string | undefined {
  const t = text.toLowerCase();
  if (/estado|uf|state/.test(t)) return "SELECT_STATE";
  if (/cidade|city/.test(t)) return "SELECT_CITY";
  if (/loja|store|filial/.test(t)) return "OPEN_STORE";
  if (/encarte|flyer|catalog|oferta|promo/.test(t)) return "OPEN_FLYERS";
  if (kind === "navigation") return "NAVIGATE";
  return undefined;
}

export function normalizeAction(action: RecordedAction): FlowStep | null {
  const semantic = action.semantic ?? detectSemantic(action.kind, action.description ?? action.value ?? "");
  let type: StepType;
  switch (action.kind) {
    case "navigation":
      type = "navigate";
      break;
    case "click":
      type = "click";
      break;
    case "change":
      type = "select";
      break;
    case "input":
      type = "input";
      break;
    case "scroll":
      type = "scroll";
      break;
    case "scope":
      type = "select-scope";
      break;
    default:
      return null;
  }

  return {
    order: 0,
    type,
    config: {
      url: action.url,
      selectors: action.selectors,
      selector: action.selectors?.[0],
      value: action.value,
      description: action.description,
      semantic,
      ...(type === "scroll" ? { direction: "down" as const, amount: 800 } : {}),
      ...(type === "select-scope"
        ? {
            purpose: action.value ?? "flyer-discovery",
            selectors: action.selectors,
            label: action.description,
            metadata: action.metadata,
          }
        : {}),
    },
  };
}

export function interpolate(
  template: string,
  ctx: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => ctx[key] ?? "");
}
