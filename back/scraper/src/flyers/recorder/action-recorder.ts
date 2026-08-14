import type { Page } from "playwright";
import { detectSemantic } from "./action-normalizer.js";
import type { RecordedAction } from "../types/flows.js";

/**
 * Inject click/input/change listeners into the page.
 * Calls window.__cestouRecord(action) — bound via page.exposeFunction.
 */
export async function attachDomRecorder(page: Page): Promise<void> {
  await page.exposeFunction("__cestouRecord", (action: RecordedAction) => {
    // overwritten by session; placeholder for typecheck when re-bound
    void action;
  });

  await page.addInitScript(() => {
    function infoFromEl(el: Element | null) {
      if (!el || !(el instanceof HTMLElement)) return null;
      const tag = el.tagName.toLowerCase();
      return {
        testId: el.getAttribute("data-testid"),
        id: el.id || null,
        name: el.getAttribute("name"),
        ariaLabel: el.getAttribute("aria-label"),
        role: el.getAttribute("role"),
        tag,
        css: tag + (el.className ? "." + String(el.className).trim().split(/\s+/).slice(0, 2).join(".") : ""),
        text: (el.innerText || el.textContent || "").trim().slice(0, 80),
      };
    }

    function selectorsFrom(info: ReturnType<typeof infoFromEl>): string[] {
      if (!info) return [];
      const out: string[] = [];
      if (info.testId) out.push(`[data-testid="${info.testId}"]`);
      if (info.id) out.push(`#${CSS.escape(info.id)}`);
      if (info.name) out.push(`${info.tag}[name="${info.name}"]`);
      if (info.ariaLabel) out.push(`[aria-label="${info.ariaLabel}"]`);
      return out;
    }

    document.addEventListener(
      "click",
      (ev) => {
        const el = ev.target as Element | null;
        const info = infoFromEl(el);
        const w = window as unknown as {
          __cestouRecord?: (a: unknown) => void;
        };
        w.__cestouRecord?.({
          kind: "click",
          selectors: selectorsFrom(info),
          description: info?.text,
          value: info?.text,
        });
      },
      true,
    );

    document.addEventListener(
      "change",
      (ev) => {
        const el = ev.target as HTMLInputElement | HTMLSelectElement | null;
        if (!el) return;
        const info = infoFromEl(el);
        const kind = el.tagName === "SELECT" ? "change" : "input";
        const w = window as unknown as {
          __cestouRecord?: (a: unknown) => void;
        };
        w.__cestouRecord?.({
          kind,
          selectors: selectorsFrom(info),
          value: el.value,
          description: info?.text || el.name || el.id,
        });
      },
      true,
    );
  });
}

export function enrichAction(action: RecordedAction): RecordedAction {
  let selectors = action.selectors?.length ? [...action.selectors] : [];
  const text = (action.description ?? action.value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (!selectors.length && text.length >= 2) {
    const esc = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    selectors = [`text="${esc}"`];
  }
  return {
    ...action,
    selectors,
    semantic:
      action.semantic ??
      detectSemantic(action.kind, action.description ?? action.value ?? ""),
  };
}
