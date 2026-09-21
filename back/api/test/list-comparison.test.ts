import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { buildApp } from "../src/server.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
const email = "client-list-comparison@example.test";
const password = "test-password";
const ids: { supermarketIds: string[]; flyerIds: string[] } = {
  supermarketIds: [],
  flyerIds: [],
};

describe("client list comparison", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const cheap = await prisma.supermarket.create({
      data: {
        name: "Compare Cheap",
        slug: `compare-cheap-${Date.now()}`,
        city: "Fortaleza",
        state: "CE",
        country: "BR",
        active: true,
      },
    });
    const pricey = await prisma.supermarket.create({
      data: {
        name: "Compare Pricey",
        slug: `compare-pricey-${Date.now()}`,
        city: "Fortaleza",
        state: "CE",
        country: "BR",
        active: true,
      },
    });
    ids.supermarketIds = [cheap.id, pricey.id];
    for (const supermarketId of ids.supermarketIds) {
      const source = await prisma.flyerSource.create({
        data: {
          supermarketId,
          type: "PDF",
          url: "https://example.test",
          active: true,
        },
      });
      const flyer = await prisma.flyer.create({
        data: {
          supermarketId,
          sourceId: source.id,
          originalUrl: "https://example.test/f.pdf",
          status: "PROCESSED",
        },
      });
      ids.flyerIds.push(flyer.id);
    }
    await prisma.offer.create({
      data: {
        flyerId: ids.flyerIds[0],
        supermarketId: cheap.id,
        name: "Alho 200g",
        normalizedName: "alho 200g",
        price: 4.5,
        validationStatus: "VALIDATED",
      },
    });
    await prisma.offer.create({
      data: {
        flyerId: ids.flyerIds[1],
        supermarketId: pricey.id,
        name: "Alho 200g",
        normalizedName: "alho 200g",
        price: 7.9,
        validationStatus: "VALIDATED",
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.offer.deleteMany({
      where: { supermarketId: { in: ids.supermarketIds } },
    });
    await prisma.flyer.deleteMany({
      where: { supermarketId: { in: ids.supermarketIds } },
    });
    await prisma.flyerSource.deleteMany({
      where: { supermarketId: { in: ids.supermarketIds } },
    });
    await prisma.supermarket.deleteMany({
      where: { id: { in: ids.supermarketIds } },
    });
    await prisma.$disconnect();
  });

  it("resolves free-text item then compares selected offer cluster", async () => {
    const app = await buildApp({ prisma });
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/client/auth/register",
      payload: { email, password },
    });
    expect(register.statusCode).toBe(204);
    const cookie = register.headers["set-cookie"] as string;

    const add = await app.inject({
      method: "POST",
      url: "/api/v1/client/lists/default/items",
      headers: { cookie },
      payload: { queryText: "Alho" },
    });
    expect(add.statusCode).toBe(201);
    const draft = add.json() as { id: string };

    const resolve = await app.inject({
      method: "GET",
      url: "/api/v1/client/lists/default/resolve",
      headers: { cookie },
    });
    const resolveBody = resolve.json() as {
      items: Array<{
        candidates: Array<{ offerId: string | null; label: string }>;
      }>;
    };
    const offerId = resolveBody.items[0]?.candidates[0]?.offerId;
    expect(offerId).toBeTruthy();

    await app.inject({
      method: "PUT",
      url: `/api/v1/client/lists/default/items/${draft.id}/selections`,
      headers: { cookie },
      payload: { offerIds: [offerId] },
    });

    const comparison = await app.inject({
      method: "GET",
      url: "/api/v1/client/lists/default/comparison",
      headers: { cookie },
    });
    expect(comparison.statusCode).toBe(200);
    const body = comparison.json() as {
      needsResolve: boolean;
      markets: Array<{ supermarketName: string; total: number; complete: boolean }>;
      bestSingle: { supermarketName: string; total: number } | null;
    };
    expect(body.needsResolve).toBe(false);
    expect(body.markets.length).toBe(2);
    expect(body.bestSingle?.supermarketName).toBe("Compare Cheap");
    expect(body.bestSingle?.total).toBeCloseTo(4.5);
    await app.close();
  });
});
