import { createBoss } from "./queue.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const boss = createBoss(connectionString);
await boss.start();

for (const queue of ["scraper.run", "flyer.lifecycle", "storage.cleanup"]) {
  await boss.createQueue(queue);
}

await boss.work<{ runId: string }>("scraper.run", async () => {
  throw new Error("scraper.run handler is not implemented yet");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void boss.stop());
}

console.info("Worker started; pg-boss queues are ready.");
