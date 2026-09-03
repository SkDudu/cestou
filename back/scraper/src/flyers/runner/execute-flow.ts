import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import {
  finishScraperRun,
  getScraperFlow,
  markExpired,
  progressScraperRun,
  recordDiscoveryResult,
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
    supermarketId: String(flow.supermarketId ?? ""),
    ...(flow.storeId && flow.scope === "store"
      ? { storeId: String(flow.storeId) }
      : {}),
    ...ctx,
  };

  const runId = (await startScraperRun(flowId)) as string;
  const lines: string[] = [];
  let lastFlush = 0;
  const snapLog = () => lines.join("\n").slice(-48_000);
  const flush = (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlush < 1500) return;
    lastFlush = now;
    const stepsExecuted = lines.filter((l) => /✓ step \d+/i.test(l)).length;
    void progressScraperRun({
      id: runId,
      log: snapLog(),
      stepsExecuted,
    }).catch(() => undefined);
  };
  const log = (line: string) => {
    flyerLog.info("FLOW", line);
    lines.push(line);
    opts.onLog?.(line);
    flush(/✓ step |✕ step |STOPPED|SUCCESS|FAILED|DUPLICATE/i.test(line));
  };

  if (pipeline === "discovery") {
    log("pipeline=discovery — só navegação/discover (sem download/extract)");
  } else if (steps.some((s) => s.type === "download-flyers")) {
    log("pipeline=full — download-flyers + extract-offers");
  }

  log(`run ${runId} — ${flow.name} v${flow.version} pipeline=${pipeline}`);
  if (pipeline === "full") {
    const expired = (await markExpired()) as { expired?: number };
    if (expired.expired) {
      log(`expire imediato: ${expired.expired} flyer(s) com validUntil < now`);
    }
  }
  log(`ctx ${JSON.stringify(fullCtx)}`);
  log(`steps ${steps.length}: ${steps.map((s) => s.type).join(" → ")}`);
  flush(true);

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
  const duplicate =
    !cancelled &&
    result.ok &&
    result.duplicates > 0 &&
    result.newFlyers === 0;
  const summary = result.stepLogs
    .map(
      (l) =>
        `${l.result.ok ? "✓" : "✕"} ${l.order} ${l.type}: ${l.result.message}`,
    )
    .join("\n")
    .slice(0, 8000);

  const status = cancelled
    ? "cancelled"
    : duplicate
      ? "duplicate"
      : result.ok
        ? "success"
        : "failed";
  const error = cancelled
    ? result.error
    : duplicate
      ? "duplicate"
      : result.error;

  log(
    result.ok
      ? duplicate
        ? "■ DUPLICATE"
        : "✓ SUCCESS"
      : cancelled
        ? "■ STOPPED"
        : "✕ FAILED",
  );
  log(
    `resumo: steps=${result.stepsExecuted} stores=${result.storesFound} flyers=${result.flyersFound} new=${result.newFlyers} dup=${result.duplicates} offers=${result.offersFound}`,
  );
  if (result.error && !cancelled && !duplicate) log(`error: ${result.error}`);
  for (const line of summary.split("\n")) {
    if (line) log(line);
  }

  if (result.ok && pipeline === "full") {
    const scheduled = (await scheduleNextCheck(flowId)) as {
      nextRunAt?: number;
    };
    if (scheduled?.nextRunAt) {
      log(`próximo check ${new Date(scheduled.nextRunAt).toISOString()}`);
    }
  }

  await finishScraperRun({
    id: runId,
    status,
    stepsExecuted: result.stepsExecuted,
    flyersFound: result.flyersFound,
    storesFound: result.storesFound,
    error,
    log: snapLog().slice(0, 100_000),
  });

  if (!cancelled && result.error?.includes("SCOPE_NOT_FOUND")) {
    await recordDiscoveryResult({
      flowId,
      ok: false,
      newFlyers: 0,
      error: result.error,
    });
  }

  return { ...result, runId, error };
}
