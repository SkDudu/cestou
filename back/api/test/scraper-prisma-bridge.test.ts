import { afterAll, describe, expect, it } from "vitest";
import { disconnectScraperPrisma, getScraperPrisma } from "../../scraper/src/flyers/core/postgres-client.js";

describe("scraper Prisma bridge", () => {
  afterAll(async () => {
    await disconnectScraperPrisma();
  });

  it("connects the scraper process to PostgreSQL using the generated Prisma client", async () => {
    const prisma = await getScraperPrisma() as { supermarket: { count(): Promise<number> } };

    await expect(prisma.supermarket.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
