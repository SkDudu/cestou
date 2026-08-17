import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import {
  finishScraperRun,
  getScraperFlow,
  scheduleNextCheck,
  startScraperRun,
} from "../core/flyer-storage.js";
import { runFlow, type FlowRunResult } from "../runner/flow-runner.js";
import type { FlowStep, StepType } from "../types/flows.js";

export type FlowLogFn = (line: string) => void;

export type ExecuteFlowOpts = {
  onLog?: FlowLogFn;
  signal?: AbortSignal;
  pipeline?: "discovery" | "full";
};

export async function executeFlowById(
  flowId: string,
  ctx: Record<string, string>,
  onLog?: FlowLogFn | ExecuteFlowOpts,
  signal?: AbortSignal,
): Promise<FlowRunResult & { runId: string }> {
  const opts: ExecuteFlowOpts =
    typeof onLog === "function" || onLog === undefined
      ? { onLog, signal }
      : onLog;
  const pipeline = opts.pipeline ?? "full";
  const log = (line: string) => {
    flyerLog.info("FLOW", line);
    opts.onLog?.(line);
  };

  const flow = await getScraperFlow(flowId);
  if (!flow) throw new Error(`Flow not found: ${flowId}`);

  let steps: FlowStep[] = (flow.steps ?? []).map(
    (s: { order: number; type: string; config: string }) => ({
      order: s.order,
      type: s.type as StepType,
      config: JSON.parse(s.config) as FlowStep["config"],
    }),
  );

  if (pipeline === "discovery") {
    steps = steps.filter(
      (s) => s.type !== "download-flyers" && s.type !== "extract-offers",
    );
  } else if (steps.some((s) => s.type === "discover-flyer")) {
    if (!steps.some((s) => s.type === "download-flyers")) {
      steps.push({
        order: steps.length,
        type: "download-flyers",
        config: {},
      });
    }
    if (!steps.some((s) => s.type === "extract-offers")) {
      steps.push({
        order: steps.length,
        type: "extract-offers",
        config: {},
      });
    }
  }

  const fullCtx = {
    uf: flyerConfig.discoveryState,
    city: flyerConfig.discoveryCity,
    storeId: "355",
    supermarketId: String(flow.supermarketId ?? ""),
    ...ctx,
  };

  const runId = (await startScraperRun(flowId)) as string;
  log(`run ${runId} — ${flow.name} v${flow.version} pipeline=${pipeline}`);
  log(`ctx ${JSON.stringify(fullCtx)}`);
  log(`steps ${steps.length}`);

  const result = await runFlow(
    {
      id: flowId,
      name: flow.name,
      startUrl: flow.startUrl,
      supermarketId: flow.supermarketId as string | undefined,
      steps,
    },
    fullCtx,
    {
      headless: flyerConfig.browserHeadless,
      timeoutMs: flyerConfig.browserTimeout,
      maxRetries: flyerConfig.scraperMaxRetries,
      onLog: log,
      signal: opts.signal,
    },
  );

  const cancelled = result.error === "cancelled";
  const summary = result.stepLogs
    .map(
      (l) =>
        `${l.result.ok ? "✓" : "✕"} ${l.order} ${l.type}: ${l.result.message}`,
    )
    .join("\n")
    .slice(0, 8000);

  await finishScraperRun({
    id: runId,
    status: result.ok ? "success" : "failed",
    stepsExecuted: result.stepsExecuted,
    flyersFound: result.flyersFound,
    storesFound: result.storesFound,
    error: result.error,
    log: cancelled ? `cancelled\n${summary}` : summary,
  });

  log(result.ok ? "SUCCESS" : cancelled ? "STOPPED" : "FAILED");
  log(
    `steps=${result.stepsExecuted} stores=${result.storesFound} flyers=${result.flyersFound} new=${result.newFlyers} offers=${result.offersFound}`,
  );
  if (result.error) log(`error: ${result.error}`);
  for (const line of summary.split("\n")) {
    if (line) log(line);
  }

  if (result.ok && pipeline === "full") {
    const scheduled = (await scheduleNextCheck(flowId)) as {
      nextRunAt?: number;
    };
    if (scheduled?.nextRunAt) {
      log(`next site check ${new Date(scheduled.nextRunAt).toISOString()}`);
    }
  }

  return { ...result, runId };
}
