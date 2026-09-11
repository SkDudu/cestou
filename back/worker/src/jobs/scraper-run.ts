import { createPrismaClient } from "../../../prisma/client.js";
import { appendRunEvent } from "../../../api/src/modules/scraper/run-events.js";

type PrismaClient = ReturnType<typeof createPrismaClient>;

export async function processScraperRun(prisma: PrismaClient, runId: string) {
  const run = await prisma.scraperRun.findUnique({ where: { id: runId }, include: { flow: true } });
  if (!run) return;
  if (run.status === "CANCELLED") return;

  await appendRunEvent(prisma, run.id, "worker.started", { flowId: run.flowId });
  let logs = Promise.resolve();
  const onLog = (line: string) => {
    logs = logs.then(() =>
      appendRunEvent(prisma, run.id, "worker.log", { line }).then(() => undefined),
    );
  };
  try {
    const { executeFlowById } = await import("../../../scraper/src/flyers/runner/execute-flow.js");
    const result = await executeFlowById(run.flowId, {}, { runId: run.id, onLog });
    await logs;
    await appendRunEvent(prisma, run.id, "worker.completed", { status: result.ok ? "SUCCESS" : "FAILED" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker failure";
    await prisma.scraperRun.update({ where: { id: run.id }, data: { status: "FAILED", error: message, finishedAt: new Date() } });
    await logs.catch(() => undefined);
    await appendRunEvent(prisma, run.id, "worker.failed", { message });
    throw error;
  }
}
