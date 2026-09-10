import { createBoss } from "./queue.js";
import { createPrismaClient } from "../../prisma/client.js";
import { processScraperRun } from "./jobs/scraper-run.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const boss = createBoss(connectionString);
const prisma = createPrismaClient(connectionString);
await boss.start();

for (const queue of ["scraper.run", "flyer.lifecycle", "storage.cleanup"]) {
  await boss.createQueue(queue);
}

await boss.work<{ runId: string }>("scraper.run", async (jobs) => {
  for (const job of jobs) await processScraperRun(prisma, job.data.runId);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void Promise.all([boss.stop(), prisma.$disconnect()]));
}

console.info("Worker started; pg-boss queues are ready.");
