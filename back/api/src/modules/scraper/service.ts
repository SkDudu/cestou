import type { createPrismaClient } from "../../../../prisma/client.js";
import { SCRAPER_RUN_EXPIRE_SECONDS } from "../../../../worker/src/queue.js";
import { appendRunEvent } from "./run-events.js";

type PrismaClient = ReturnType<typeof createPrismaClient>;

export interface ScraperQueue {
  send(
    name: string,
    data?: Record<string, unknown>,
    options?: { expireInSeconds?: number },
  ): Promise<string | null>;
}

export async function startScraperRun(
  prisma: PrismaClient,
  queue: ScraperQueue,
  flowId: string,
) {
  const flow = await prisma.scraperFlow.findUnique({ where: { id: flowId } });
  if (!flow) {
    throw new Error("Scraper flow not found");
  }

  const run = await prisma.scraperRun.create({
    data: { flowId: flow.id, status: "RUNNING", startedAt: new Date() },
  });

  await appendRunEvent(prisma, run.id, "run.started", { flowId: flow.id });
  await queue.send(
    "scraper.run",
    { runId: run.id },
    { expireInSeconds: SCRAPER_RUN_EXPIRE_SECONDS },
  );

  return run;
}

export async function cancelScraperRun(prisma: PrismaClient, runId: string) {
  const run = await prisma.scraperRun.update({
    where: { id: runId },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });

  await appendRunEvent(prisma, run.id, "run.cancelled", {});
  return run;
}
