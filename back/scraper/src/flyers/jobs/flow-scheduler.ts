import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import {
  listDueFlows,
  markExpired,
  recordDiscoveryResult,
} from "../core/flyer-storage.js";
import { downloadPending } from "./flyer-download.js";
import { extractPending } from "./flyer-extraction.js";
import { executeFlowById } from "../runner/execute-flow.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCtx(): Record<string, string> {
  return {};
}

/** ponytail: hung Playwright used to leave scraperRuns `running` for days */
const SCHEDULER_RUN_MS = 20 * 60 * 1000;

export async function runSchedulerTick() {
  // ponytail: expire→nextRunAt before listDue so same tick can discover
  const expired = (await markExpired()) as { expired?: number; scheduled?: number };
  if (expired.expired || expired.scheduled) {
    flyerLog.info(
      "SCHEDULER",
      `expire=${expired.expired ?? 0} scheduled=${expired.scheduled ?? 0}`,
    );
  }
  const due = (await listDueFlows()) as Array<{
    _id: string;
    name?: string;
  }>;
  flyerLog.info("SCHEDULER", `due flows=${due.length}`);
  for (const flow of due) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), SCHEDULER_RUN_MS);
    try {
      const result = await executeFlowById(flow._id, parseCtx(), {
        pipeline: "discovery",
        signal: ac.signal,
      });
      const scheduled = (await recordDiscoveryResult({
        flowId: flow._id,
        ok: result.ok,
        newFlyers: result.newFlyers,
        error: result.error,
      })) as { nextRunAt?: number } | null;
      if (scheduled?.nextRunAt) {
        flyerLog.info(
          "SCHEDULER",
          `next check ${flow._id} ${new Date(scheduled.nextRunAt).toISOString()}`,
        );
      }
    } catch (err) {
      flyerLog.error("SCHEDULER", String(err));
      const scheduled = (await recordDiscoveryResult({
        flowId: flow._id,
        ok: false,
        newFlyers: 0,
        error: String(err),
      })) as { nextRunAt?: number } | null;
      if (scheduled?.nextRunAt) {
        flyerLog.info(
          "SCHEDULER",
          `next check ${flow._id} ${new Date(scheduled.nextRunAt).toISOString()}`,
        );
      }
    } finally {
      clearTimeout(t);
    }
  }
  await downloadPending();
  await extractPending();
}

export async function runSchedulerLoop(isBusy?: () => boolean) {
  const poll = Math.max(15_000, flyerConfig.schedulerPollMs);
  flyerLog.info("SCHEDULER", `poll ${poll}ms`);
  for (;;) {
    try {
      if (isBusy?.()) {
        flyerLog.info("SCHEDULER", "skip tick — run in progress");
      } else {
        await runSchedulerTick();
      }
    } catch (err) {
      flyerLog.error("SCHEDULER", String(err));
    }
    await sleep(poll);
  }
}

const isMain =
  process.argv[1]?.endsWith("flow-scheduler.js") ||
  process.argv[1]?.endsWith("flow-scheduler.ts");

if (isMain) {
  runSchedulerLoop().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
