import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { buildApp } from "../src/server.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
const email = "client-list-resolve@example.test";
const password = "test-password";
const ids: { supermarketIds: string[]; flyerIds: string[]; productIds: string[] } = {
  supermarketIds: [],
  flyerIds: [],
  productIds: [],
};

describe("client list resolve + comparison", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const cheap = await prisma.supermarket.create({
      data: {
        name: "Resolve Cheap",
        slug: `resolve-cheap-${Date.now()}`,
        city: "Fortaleza",
        state: "CE",
        country: "BR",
        active: true,
      },
    });
    const pricey = await prisma.supermarket.create({
      data: {
        name: "Resolve Pricey",
        slug: `resolve-pricey-${Date.now()}`,
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
    const liquid = await prisma.canonicalProduct.create({
      data: {
        canonicalName: "Leite integral 1L",
        slug: `leite-integral-${Date.now()}`,
        matchKey: `leite-integral-${Date.now()}`,
      },
    });
    const powder = await prisma.canonicalProduct.create({
      data: {
        canonicalName: "Leite em pó 400g",
        slug: `leite-po-${Date.now()}`,
        matchKey: `leite-po-${Date.now()}`,
      },
    });
    ids.productIds = [liquid.id, powder.id];
    await prisma.offer.create({
      data: {
        flyerId: ids.flyerIds[0],
        supermarketId: cheap.id,
        name: "Leite integral 1L",
        normalizedName: "leite integral 1l",
        price: 4.5,
        validationStatus: "VALIDATED",
        canonicalProductId: liquid.id,
      },
    });
    await prisma.offer.create({
      data: {
        flyerId: ids.flyerIds[1],
        supermarketId: pricey.id,
        name: "Leite integral 1L",
        normalizedName: "leite integral 1l",
        price: 5.9,
        validationStatus: "VALIDATED",
        canonicalProductId: liquid.id,
      },
    });
    await prisma.offer.create({
      data: {
        flyerId: ids.flyerIds[0],
        supermarketId: cheap.id,
        name: "Leite em pó 400g",
        normalizedName: "leite em po 400g",
        price: 12,
        validationStatus: "VALIDATED",
        canonicalProductId: powder.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.offer.deleteMany({
      where: { supermarketId: { in: ids.supermarketIds } },
    });
    await prisma.canonicalProduct.deleteMany({
      where: { id: { in: ids.productIds } },
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

  it("blocks compare until variants selected, then compares choices", async () => {
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
      payload: { queryText: "leite" },
    });
    expect(add.statusCode).toBe(201);
    const draft = add.json() as { id: string };

    const blocked = await app.inject({
      method: "GET",
      url: "/api/v1/client/lists/default/comparison",
      headers: { cookie },
    });
    const blockedBody = blocked.json() as {
      needsResolve: boolean;
      markets: unknown[];
    };
    expect(blockedBody.needsResolve).toBe(true);
    expect(blockedBody.markets.length).toBeGreaterThan(0);

    const resolve = await app.inject({
      method: "GET",
      url: "/api/v1/client/lists/default/resolve",
      headers: { cookie },
    });
    expect(resolve.statusCode).toBe(200);
    const resolveBody = resolve.json() as {
      items: Array<{
        itemId: string;
        candidates: Array<{ canonicalProductId: string | null; label: string }>;
      }>;
    };
    expect(resolveBody.items[0]?.candidates.length).toBeGreaterThanOrEqual(2);

    const liquidId = ids.productIds[0];
    expect(
      resolveBody.items[0].candidates.some((c) => c.canonicalProductId === liquidId),
    ).toBe(true);

    const select = await app.inject({
      method: "PUT",
      url: `/api/v1/client/lists/default/items/${draft.id}/selections`,
      headers: { cookie },
      payload: { canonicalProductIds: [liquidId] },
    });
    expect(select.statusCode).toBe(200);

    const comparison = await app.inject({
      method: "GET",
      url: "/api/v1/client/lists/default/comparison",
      headers: { cookie },
    });
    expect(comparison.statusCode).toBe(200);
    const body = comparison.json() as {
      needsResolve: boolean;
      bestSingle: { supermarketName: string; total: number } | null;
      markets: Array<{
        supermarketName: string;
        total: number;
        complete: boolean;
        lines: Array<{ offerName: string | null }>;
      }>;
    };
    expect(body.needsResolve).toBe(false);
    const cheap = body.markets.find((m) => m.supermarketName === "Resolve Cheap");
    const pricey = body.markets.find((m) => m.supermarketName === "Resolve Pricey");
    expect(cheap?.complete).toBe(true);
    expect(cheap?.total).toBeCloseTo(4.5);
    expect(pricey?.total).toBeCloseTo(5.9);
    expect(body.bestSingle?.total).toBeLessThanOrEqual(4.5);
    expect(
      body.markets
        .filter((m) => m.supermarketName.startsWith("Resolve "))
        .every((market) =>
          market.lines.every((line) =>
            (line.offerName ?? "").toLowerCase().includes("integral"),
          ),
        ),
    ).toBe(true);
    await app.close();
  });
});
