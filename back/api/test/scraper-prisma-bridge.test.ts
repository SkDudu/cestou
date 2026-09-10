import { afterAll, describe, expect, it } from "vitest";
import { disconnectScraperPrisma, getScraperPrisma } from "../../scraper/src/flyers/core/postgres-client.js";
import { ensureSupermarket } from "../../scraper/src/flyers/core/flyer-storage.js";

describe("scraper Prisma bridge", () => {
  afterAll(async () => {
    await disconnectScraperPrisma();
  });

  it("connects the scraper process to PostgreSQL using the generated Prisma client", async () => {
    const prisma = await getScraperPrisma() as { supermarket: { count(): Promise<number> } };

    await expect(prisma.supermarket.count()).resolves.toBeGreaterThanOrEqual(0);
  });

  it("persists a scraper supermarket through the Postgres storage adapter", async () => {
    const prisma = await getScraperPrisma() as any;
    const slug = `adapter-${Date.now()}`;
    const id = await ensureSupermarket({ name: "Adapter test", slug, city: "Fortaleza", state: "CE", country: "BR" });

    await expect(prisma.supermarket.findUnique({ where: { id } })).resolves.toMatchObject({ slug });
    await prisma.supermarket.delete({ where: { id } });
  });
});
