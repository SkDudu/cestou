import { flyerLog } from "../core/flyer-logger.js";
import { BrowserManager } from "../browser/manager.js";
import type { FlowContext, FlowState, FlowStep } from "../types/flows.js";
import { attachNetworkHarvester } from "./flow-pipeline.js";
import { runStep, type StepResult } from "./step-runner.js";

export type FlowDefinition = {
  id: string;
  name: string;
  startUrl: string;
  steps: FlowStep[];
  supermarketId?: string;
};

export type FlowRunResult = {
  ok: boolean;
  stepsExecuted: number;
  storesFound: number;
  flyersFound: number;
  offersFound: number;
  newFlyers: number;
  error?: string;
  stepLogs: Array<{ order: number; type: string; result: StepResult }>;
};

export async function runFlow(
  flow: FlowDefinition,
  ctx: FlowContext,
  opts: {
    headless: boolean;
    timeoutMs: number;
    maxRetries: number;
    onLog?: (line: string) => void;
    signal?: AbortSignal;
  },
): Promise<FlowRunResult> {
  const say = (line: string) => {
    if (opts.onLog) opts.onLog(line);
    else flyerLog.info("FLOW", line);
  };

  const aborted = () => Boolean(opts.signal?.aborted);
  const mgr = new BrowserManager({
    headless: opts.headless,
    timeoutMs: opts.timeoutMs,
  });
  const stepLogs: FlowRunResult["stepLogs"] = [];
  let storesFound = 0;
  let flyersFound = 0;
  let offersFound = 0;
  let newFlyers = 0;

  const state: FlowState = {
    ctx: { ...ctx, startUrl: flow.startUrl },
    supermarketId: flow.supermarketId ?? ctx.supermarketId,
    discoveredFlyerIds: [],
    offersFound: 0,
    networkFlyers: [],
  };

  const onAbort = () => {
    say("stop requested — closing browser…");
    void mgr.close();
  };
  opts.signal?.addEventListener("abort", onAbort);

  let harvestDispose: (() => void) | undefined;

  try {
    if (aborted()) {
      return {
        ok: false,
        stepsExecuted: 0,
        storesFound: 0,
        flyersFound: 0,
        offersFound: 0,
        newFlyers: 0,
        error: "cancelled",
        stepLogs,
      };
    }

    say("launching Chromium…");
    await mgr.launch();
    if (aborted()) throw new Error("cancelled");
    const page = await mgr.createPage();
    const harvest = attachNetworkHarvester(page);
    harvestDispose = harvest.dispose;
    state.networkFlyers = harvest.flyers;

    const first = flow.steps[0];
    if (!first || first.type !== "navigate") {
      const url = flow.startUrl.replace(
        /\{\{(\w+)\}\}/g,
        (_, k: string) => ctx[k] ?? "",
      );
      say(`boot ${url}`);
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: opts.timeoutMs,
      });
    }

    for (const step of flow.steps) {
      if (aborted()) throw new Error("cancelled");
      if (step.type === "select-scope") say("[SCOPE] Resolving element");
      if (step.type === "discover-flyer") say("[FLYER] Searching scoped DOM");
      say(`→ step ${step.order} ${step.type}`);
      const result = await runStep(page, step, state, {
        timeoutMs: opts.timeoutMs,
        maxRetries: opts.maxRetries,
      });
      if (aborted()) throw new Error("cancelled");
      stepLogs.push({ order: step.order, type: step.type, result });
      storesFound += result.storesFound ?? 0;
      flyersFound += result.flyersFound ?? 0;
      offersFound += result.offersFound ?? 0;
      newFlyers += result.newFlyers ?? 0;
      if (!result.ok) {
        say(`✕ ${step.type}: ${result.message}`);
        return {
          ok: false,
          stepsExecuted: stepLogs.length,
          storesFound,
          flyersFound,
          offersFound,
          newFlyers,
          error: `Step ${step.order} (${step.type}): ${result.message}`,
          stepLogs,
        };
      }
      say(`✓ ${step.type}: ${result.message}`);
    }

    await page.close().catch(() => undefined);
    return {
      ok: true,
      stepsExecuted: stepLogs.length,
      storesFound,
      flyersFound,
      offersFound: offersFound || state.offersFound,
      newFlyers,
      stepLogs,
    };
  } catch (err) {
    if (aborted() || /cancelled/i.test(String(err))) {
      say("STOPPED");
      return {
        ok: false,
        stepsExecuted: stepLogs.length,
        storesFound,
        flyersFound,
        offersFound,
        newFlyers,
        error: "cancelled",
        stepLogs,
      };
    }
    throw err;
  } finally {
    harvestDispose?.();
    opts.signal?.removeEventListener("abort", onAbort);
    await mgr.close();
    say("browser closed");
  }
}
