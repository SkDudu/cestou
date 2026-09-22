import { flyerLog } from "../core/flyer-logger.js";
import { BrowserManager } from "../browser/manager.js";
import { detectContentType, validateBuffer } from "../core/flyer-downloader.js";
import type { FlowContext, FlowState, FlowStep } from "../types/flows.js";
import { attachNetworkHarvester } from "./flow-pipeline.js";
import { dismissBlockingDialogs, runStep, type StepResult } from "./step-runner.js";

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
  duplicates: number;
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
    /** Discovery: extract-offers only runs when download-flyers got pages. */
    requireDownloadForExtract?: boolean;
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
  let duplicates = 0;

  const state: FlowState = {
    ctx: { ...ctx, startUrl: flow.startUrl },
    supermarketId: flow.supermarketId ?? ctx.supermarketId,
    discoveredFlyerIds: [],
    offersFound: 0,
    networkFlyers: [],
    downloadedThisRun: 0,
    requireDownloadForExtract: opts.requireDownloadForExtract === true,
    onLog: say,
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
        duplicates: 0,
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
    state.capturedPages = new Map();
    state.browserFetch = async (url: string) => {
      const res = await page.context().request.get(url, { timeout: 30_000 });
      if (!res.ok()) {
        throw new Error(`HTTP ${res.status()} for ${url}`);
      }
      const buffer = Buffer.from(await res.body());
      if (!buffer.length) throw new Error("Empty file");
      const hint =
        res.headers()["content-type"]?.split(";")[0]?.trim() ||
        "application/octet-stream";
      const contentType = validateBuffer(buffer, hint);
      return {
        buffer,
        contentType: contentType ?? detectContentType(buffer) ?? hint,
      };
    };

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
      await dismissBlockingDialogs(page, say, 12_000);
    }

    for (const step of flow.steps) {
      if (aborted()) throw new Error("cancelled");
      const label =
        step.config.description ||
        step.config.label ||
        step.config.semantic ||
        "";
      say(
        `→ step ${step.order}/${flow.steps.length} ${step.type}${label ? ` — ${label}` : ""}`,
      );
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
      duplicates += result.duplicates ?? 0;
      if (!result.ok) {
        say(`✕ step ${step.order} ${step.type}: ${result.message}`);
        return {
          ok: false,
          stepsExecuted: stepLogs.length,
          storesFound,
          flyersFound,
          offersFound,
          newFlyers,
          duplicates,
          error: `Step ${step.order} (${step.type}): ${result.message}`,
          stepLogs,
        };
      }
      say(`✓ step ${step.order} ${step.type}: ${result.message}`);
    }

    say(
      `pipeline browser ok — flyers novos=${newFlyers} achados=${flyersFound} ofertas=${offersFound || state.offersFound}`,
    );
    await page.close().catch(() => undefined);
    return {
      ok: true,
      stepsExecuted: stepLogs.length,
      storesFound,
      flyersFound,
      offersFound: offersFound || state.offersFound,
      newFlyers,
      duplicates,
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
        duplicates,
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
