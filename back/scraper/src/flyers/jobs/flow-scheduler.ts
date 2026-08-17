import { flyerConfig } from "../core/flyer-config.js";
import { flyerLog } from "../core/flyer-logger.js";
import {
  listDueFlows,
  recordDiscoveryResult,
  scheduleNextCheck,
} from "../core/flyer-storage.js";
import { downloadPending } from "./flyer-download.js";
import { extractPending } from "./flyer-extraction.js";
import { executeFlowById } from "../runner/execute-flow.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCtx(): Record<string, string> {
  return {
    uf: flyerConfig.discoveryState,
    city: flyerConfig.discoveryCity,
    storeId: "355",
  };
}

export async function runSchedulerTick() {
  const due = (await listDueFlows()) as Array<{
    _id: string;
    name?: string;
  }>;
  flyerLog.info("SCHEDULER", `due flows=${due.length}`);
  if (!due.length) return;
  const withNew: string[] = [];
  for (const flow of due) {
    try {
      const result = await executeFlowById(flow._id, parseCtx(), {
        pipeline: "discovery",
      });
      await recordDiscoveryResult({
        flowId: flow._id,
        ok: result.ok,
        newFlyers: result.newFlyers,
        error: result.error,
      });
      if (result.ok && result.newFlyers > 0) withNew.push(flow._id);
    } catch (err) {
      flyerLog.error("SCHEDULER", String(err));
      await recordDiscoveryResult({
        flowId: flow._id,
        ok: false,
        newFlyers: 0,
        error: String(err),
      });
    }
  }
  await downloadPending();
  await extractPending();
  for (const id of withNew) {
    const scheduled = (await scheduleNextCheck(id)) as { nextRunAt?: number };
    if (scheduled?.nextRunAt) {
      flyerLog.info(
        "SCHEDULER",
        `next check ${id} ${new Date(scheduled.nextRunAt).toISOString()}`,
      );
    }
  }
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
