import { afterAll, describe, expect, it } from "vitest";
import { createBoss } from "../src/queue.js";

const databaseUrl = "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const boss = createBoss(databaseUrl);

afterAll(async () => {
  await boss.stop();
});

describe("pg-boss", () => {
  it("creates and processes a named queue", async () => {
    await boss.start();
    const queue = `test.queue.${Date.now()}`;
    await boss.createQueue(queue);
    const completed = new Promise<string>((resolve) => {
      void boss.work<{ runId: string }>(queue, async ([job]) => {
        resolve(job.data.runId);
      });
    });

    await boss.send(queue, { runId: "run-id" });
    await expect(completed).resolves.toBe("run-id");
  });
});
