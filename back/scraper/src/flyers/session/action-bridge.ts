import type { Page } from "playwright";
import type { RecordedAction } from "../types/flows.js";
import { enrichAction } from "../recorder/action-recorder.js";

/** Inject click/change listeners; calls page-bound __cestouRecord. */
export async function injectRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    function infoFromEl(el: Element | null) {
      if (!el || !(el instanceof HTMLElement)) return null;
      const tag = el.tagName.toLowerCase();
      const cls = String(el.className || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(".");
      return {
        testId: el.getAttribute("data-testid"),
        id: el.id || null,
        name: el.getAttribute("name"),
        ariaLabel: el.getAttribute("aria-label"),
        role: el.getAttribute("role"),
        tag,
        css: tag + (cls ? "." + cls : ""),
        text: (el.innerText || el.textContent || "").trim().slice(0, 80),
      };
    }

    function selectorsFrom(start: Element | null): {
      selectors: string[];
      text: string;
    } {
      let el: Element | null = start;
      for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
        const info = infoFromEl(el);
        if (!info) continue;
        const out: string[] = [];
        if (info.testId) out.push(`[data-testid="${info.testId}"]`);
        if (info.id) {
          try {
            out.push(`#${CSS.escape(info.id)}`);
          } catch {
            out.push(`#${info.id}`);
          }
        }
        if (info.name) out.push(`${info.tag}[name="${info.name}"]`);
        if (info.ariaLabel) out.push(`[aria-label="${info.ariaLabel}"]`);
        const text = info.text.replace(/\s+/g, " ").trim().slice(0, 60);
        if (text.length >= 2) {
          const esc = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          if (/^(button|a|label|span|div|li|option)$/.test(info.tag)) {
            out.push(`${info.tag}:has-text("${esc}")`);
          }
          out.push(`text="${esc}"`);
        }
        if (info.css && info.css.includes(".")) out.push(info.css);
        if (out.length) return { selectors: out, text: info.text };
      }
      return { selectors: [], text: "" };
    }

    document.addEventListener(
      "click",
      (ev) => {
        const t = ev.target as Element | null;
        if (
          t instanceof HTMLSelectElement ||
          t instanceof HTMLOptionElement ||
          (t && t.closest("select"))
        ) {
          return; // change handler records selects
        }
        const { selectors, text } = selectorsFrom(t);
        (
          window as unknown as { __cestouRecord?: (a: unknown) => void }
        ).__cestouRecord?.({
          kind: "click",
          selectors,
          description: text,
          value: text,
          url: location.href,
        });
      },
      true,
    );
    document.addEventListener(
      "change",
      (ev) => {
        const el = ev.target as HTMLInputElement | HTMLSelectElement | null;
        if (!el) return;
        if (el instanceof HTMLSelectElement) {
          const selected = el.selectedOptions[0];
          const label = (selected?.textContent ?? "").trim();
          const tag = "select";
          const cls = String(el.className || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .join(".");
          const css = tag + (cls ? "." + cls : "");
          const selectors: string[] = [];
          if (el.id) {
            try {
              selectors.push(`#${CSS.escape(el.id)}`);
            } catch {
              selectors.push(`#${el.id}`);
            }
          }
          if (el.name) selectors.push(`select[name="${el.name}"]`);
          if (el.getAttribute("aria-label")) {
            selectors.push(
              `select[aria-label="${el.getAttribute("aria-label")}"]`,
            );
          }
          // disambiguate identical class lists (UF vs Cidade)
          if (css.includes(".")) {
            const same = Array.from(document.querySelectorAll(css));
            const idx = same.indexOf(el);
            if (idx >= 0) selectors.push(`${css} >> nth=${idx}`);
            selectors.push(css);
          }
          (
            window as unknown as { __cestouRecord?: (a: unknown) => void }
          ).__cestouRecord?.({
            kind: "change",
            selectors,
            value: el.value || label,
            description: label || el.name || el.id,
            url: location.href,
          });
          return;
        }
        const { selectors, text } = selectorsFrom(el);
        (
          window as unknown as { __cestouRecord?: (a: unknown) => void }
        ).__cestouRecord?.({
          kind: "input",
          selectors,
          value: el.value,
          description: text || el.name || el.id,
          url: location.href,
        });
      },
      true,
    );
  });
}

export async function bindRecorder(
  page: Page,
  onAction: (a: RecordedAction) => void,
): Promise<void> {
  await page.exposeFunction("__cestouRecord", (raw: RecordedAction) => {
    onAction(enrichAction(raw));
  });
  await injectRecorder(page);
}

/** Element under point → synthetic recorded click (after mouse.click). */
export async function recordElementAt(
  page: Page,
  x: number,
  y: number,
): Promise<RecordedAction | null> {
  const raw = await page.evaluate(
    ({ x, y }) => {
      function pick(start: Element | null) {
        let el: Element | null = start;
        for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
          if (!(el instanceof HTMLElement)) continue;
          const tag = el.tagName.toLowerCase();
          const testId = el.getAttribute("data-testid");
          const id = el.id || null;
          const name = el.getAttribute("name");
          const ariaLabel = el.getAttribute("aria-label");
          const text = (el.innerText || el.textContent || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 80);
          const selectors: string[] = [];
          if (testId) selectors.push(`[data-testid="${testId}"]`);
          if (id) {
            try {
              selectors.push(`#${CSS.escape(id)}`);
            } catch {
              selectors.push(`#${id}`);
            }
          }
          if (name) selectors.push(`${tag}[name="${name}"]`);
          if (ariaLabel) selectors.push(`[aria-label="${ariaLabel}"]`);
          if (text.length >= 2) {
            const esc = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            if (/^(button|a|label|span|div|li|option)$/.test(tag)) {
              selectors.push(`${tag}:has-text("${esc}")`);
            }
            selectors.push(`text="${esc}"`);
          }
          if (selectors.length) {
            return { selectors, text, url: location.href };
          }
        }
        return null;
      }
      return pick(document.elementFromPoint(x, y));
    },
    { x, y },
  );
  if (!raw) return null;
  return enrichAction({
    kind: "click",
    selectors: raw.selectors,
    description: raw.text,
    value: raw.text,
    url: raw.url,
  });
}
