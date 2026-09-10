import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { readRunEvents } from "../src/modules/scraper/events.js";

const databaseUrl = "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
let supermarketId = "";
let runId = "";

describe("scraper event recovery", () => {
  beforeAll(async () => {
    const supermarket = await prisma.supermarket.create({ data: { name: "Event Test", slug: "event-test", city: "Fortaleza", state: "CE", country: "BR", active: true } });
    supermarketId = supermarket.id;
    const flow = await prisma.scraperFlow.create({ data: { supermarketId, name: "Event flow", startUrl: "https://example.test", status: "ACTIVE", version: 1 } });
    const run = await prisma.scraperRun.create({ data: { flowId: flow.id, status: "RUNNING" } });
    runId = run.id;
    await prisma.scraperRunEvent.createMany({ data: [
      { runId, sequence: 1, type: "run.started", payload: {} },
      { runId, sequence: 2, type: "step.finished", payload: { step: 1 } },
      { runId, sequence: 3, type: "run.finished", payload: {} },
    ] });
  });

  afterAll(async () => {
    await prisma.supermarket.delete({ where: { id: supermarketId } });
    await prisma.$disconnect();
  });

  it("returns only events after the client last received sequence", async () => {
    const events = await readRunEvents(prisma, runId, 1);

    expect(events.map((event) => event.sequence)).toEqual([2, 3]);
    expect(events.map((event) => event.type)).toEqual(["step.finished", "run.finished"]);
  });
});
