import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { appendRunEvent } from "../src/modules/scraper/run-events.js";

const databaseUrl = "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
let supermarketId = "";
let runId = "";

describe("appendRunEvent", () => {
  beforeAll(async () => {
    const supermarket = await prisma.supermarket.create({
      data: { name: "Events Test", slug: "events-test", city: "Fortaleza", state: "CE", country: "BR", active: true },
    });
    supermarketId = supermarket.id;
    const flow = await prisma.scraperFlow.create({
      data: { supermarketId, name: "Events flow", startUrl: "https://example.test", status: "DRAFT", version: 1 },
    });
    const run = await prisma.scraperRun.create({ data: { flowId: flow.id, status: "RUNNING" } });
    runId = run.id;
  });

  afterAll(async () => {
    await prisma.supermarket.delete({ where: { id: supermarketId } });
    await prisma.$disconnect();
  });

  it("assigns monotonic sequences within one run", async () => {
    const first = await appendRunEvent(prisma, runId, "step.started", { step: 1 });
    const second = await appendRunEvent(prisma, runId, "progress", { percent: 20 });

    expect([first.sequence, second.sequence]).toEqual([1, 2]);
  });
});
