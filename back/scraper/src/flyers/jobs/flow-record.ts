import readline from "node:readline";
import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import {
  getScraperFlow,
  replaceScraperSteps,
} from "../core/flyer-storage.js";
import { normalizeAction } from "../recorder/action-normalizer.js";
import { enrichAction } from "../recorder/action-recorder.js";
import { BrowserManager } from "../browser/manager.js";
import type { RecordedAction, StepType } from "../types/flows.js";

function argVal(name: string): string | undefined {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : undefined;
}

function waitEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

export async function recordFlowJob() {
  const flowId = argVal("flow");
  if (!flowId) throw new Error("Usage: flows:record -- --flow=<id>");

  const flow = await getScraperFlow(flowId);
  if (!flow) throw new Error(`Flow not found: ${flowId}`);

  const actions: RecordedAction[] = [];
  const mgr = new BrowserManager({
    headless: false,
    timeoutMs: flyerConfig.browserTimeout,
  });

  try {
    await mgr.launch();
    const page = await mgr.createPage();

    // Re-bind expose each navigation — Playwright exposeFunction is per-page
    await page.exposeFunction("__cestouRecord", (raw: RecordedAction) => {
      const action = enrichAction(raw);
      // Deduplicate rapid duplicate clicks
      const last = actions[actions.length - 1];
      if (
        last &&
        last.kind === action.kind &&
        last.value === action.value &&
        JSON.stringify(last.selectors) === JSON.stringify(action.selectors)
      ) {
        return;
      }
      actions.push(action);
      flyerLog.info(
        "RECORD",
        `${actions.length}. ${action.kind} ${action.semantic ?? ""} ${action.description ?? action.value ?? ""}`.trim(),
      );
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
          const info = infoFromEl(ev.target as Element);
          (
            window as unknown as { __cestouRecord?: (a: unknown) => void }
          ).__cestouRecord?.({
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
          (
            window as unknown as { __cestouRecord?: (a: unknown) => void }
          ).__cestouRecord?.({
            kind: el.tagName === "SELECT" ? "change" : "input",
            selectors: selectorsFrom(info),
            value: el.value,
            description: info?.text || el.name || el.id,
          });
        },
        true,
      );
    });

    flyerLog.info("RECORD", `Opening ${flow.startUrl}`);
    actions.push({
      kind: "navigation",
      url: flow.startUrl,
      description: "Start URL",
    });
    await page.goto(flow.startUrl, {
      waitUntil: "domcontentloaded",
      timeout: flyerConfig.browserNavigationTimeout,
    });

    flyerLog.info(
      "RECORD",
      "Navegue no browser. Enter neste terminal para parar e salvar.",
    );
    await waitEnter("> ");

    const steps = actions
      .map((a) => normalizeAction(a))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s, i) => ({
        type: s.type as StepType,
        config: JSON.stringify(s.config),
        order: i,
      }));

    // Always append discover-flyer marker if user didn't add semantic OPEN_FLYERS
    if (!steps.some((s) => s.type === "discover-flyer")) {
      steps.push({
        type: "discover-flyer",
        config: JSON.stringify({ scope: "page" }),
        order: steps.length,
      });
    }

    await replaceScraperSteps(flowId, steps);
    flyerLog.info("RECORD", `Saved ${steps.length} steps → flow ${flowId}`);
  } finally {
    await mgr.close();
  }
}

const isMain =
  process.argv[1]?.endsWith("flow-record.js") ||
  process.argv[1]?.endsWith("flow-record.ts");

if (isMain) {
  recordFlowJob().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
