import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { cancelScraperRun, startScraperRun } from "../src/modules/scraper/service.js";

const databaseUrl = "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
let supermarketId = "";
let flowId = "";

describe("scraper run service", () => {
  beforeAll(async () => {
    const supermarket = await prisma.supermarket.create({ data: { name: "Run Test", slug: "run-test", city: "Fortaleza", state: "CE", country: "BR", active: true } });
    supermarketId = supermarket.id;
    const flow = await prisma.scraperFlow.create({ data: { supermarketId, name: "Run flow", startUrl: "https://example.test", status: "ACTIVE", version: 1 } });
    flowId = flow.id;
  });

  afterAll(async () => {
    await prisma.supermarket.delete({ where: { id: supermarketId } });
    await prisma.$disconnect();
  });

  it("creates a run, persists an event and queues it", async () => {
    const sent: Array<{ name: string; data: object; options?: object }> = [];
    const run = await startScraperRun(prisma, {
      send: async (name, data, options) => {
        sent.push({ name, data: data ?? {}, options });
        return "job-id";
      },
    }, flowId);

    expect(run.status).toBe("RUNNING");
    expect(sent).toEqual([
      {
        name: "scraper.run",
        data: { runId: run.id },
        options: { expireInSeconds: 86_400 },
      },
    ]);
    expect(await prisma.scraperRunEvent.count({ where: { runId: run.id, type: "run.started" } })).toBe(1);
  });

  it("cancels a running run and records the terminal event", async () => {
    const run = await prisma.scraperRun.create({ data: { flowId, status: "RUNNING" } });
    const cancelled = await cancelScraperRun(prisma, run.id);

    expect(cancelled.status).toBe("CANCELLED");
    expect(await prisma.scraperRunEvent.count({ where: { runId: run.id, type: "run.cancelled" } })).toBe(1);
  });
});
