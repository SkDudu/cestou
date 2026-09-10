import { createPrismaClient } from "../../../prisma/client.js";
import { appendRunEvent } from "../../../api/src/modules/scraper/run-events.js";

type PrismaClient = ReturnType<typeof createPrismaClient>;

export async function processScraperRun(prisma: PrismaClient, runId: string) {
  const run = await prisma.scraperRun.findUnique({ where: { id: runId }, include: { flow: true } });
  if (!run) return;
  if (run.status === "CANCELLED") return;

  await appendRunEvent(prisma, run.id, "worker.started", { flowId: run.flowId });
  try {
    // The legacy Playwright pipeline is invoked in the next adapter step with this persisted run ID.
    await prisma.scraperRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date() } });
    await appendRunEvent(prisma, run.id, "worker.completed", {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker failure";
    await prisma.scraperRun.update({ where: { id: run.id }, data: { status: "FAILED", error: message, finishedAt: new Date() } });
    await appendRunEvent(prisma, run.id, "worker.failed", { message });
    throw error;
  }
}
