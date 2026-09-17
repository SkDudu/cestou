import { createBoss, SCRAPER_RUN_EXPIRE_SECONDS } from "./queue.js";
import { createPrismaClient } from "../../prisma/client.js";
import { processScraperRun } from "./jobs/scraper-run.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const boss = createBoss(connectionString);
const prisma = createPrismaClient(connectionString);
await boss.start();

await boss.createQueue("scraper.run", {
  expireInSeconds: SCRAPER_RUN_EXPIRE_SECONDS,
});
// createQueue is ON CONFLICT DO NOTHING — bump expire on existing queues too
await boss.updateQueue("scraper.run", {
  expireInSeconds: SCRAPER_RUN_EXPIRE_SECONDS,
});

for (const queue of ["flyer.lifecycle", "storage.cleanup"]) {
  await boss.createQueue(queue);
}

await boss.work<{ runId: string }>("scraper.run", async (jobs) => {
  for (const job of jobs) await processScraperRun(prisma, job.data.runId);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void Promise.all([boss.stop(), prisma.$disconnect()]));
}

console.info("Worker started; pg-boss queues are ready.");
