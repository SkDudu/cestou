import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { buildApp } from "../src/server.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
const email = "client-multi-lists@example.test";
const password = "test-password";
const ids: {
  supermarketIds: string[];
  flyerIds: string[];
  productIds: string[];
} = { supermarketIds: [], flyerIds: [], productIds: [] };

describe("client multi shopping lists", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const market = await prisma.supermarket.create({
      data: {
        name: "Multi List Market",
        slug: `multi-list-${Date.now()}`,
        city: "Fortaleza",
        state: "CE",
        country: "BR",
        active: true,
      },
    });
    ids.supermarketIds = [market.id];
    const source = await prisma.flyerSource.create({
      data: {
        supermarketId: market.id,
        type: "PDF",
        url: "https://example.test",
        active: true,
      },
    });
    const flyer = await prisma.flyer.create({
      data: {
        supermarketId: market.id,
        sourceId: source.id,
        originalUrl: "https://example.test/f.pdf",
        status: "PROCESSED",
      },
    });
    ids.flyerIds = [flyer.id];
    const carne = await prisma.canonicalProduct.create({
      data: {
        canonicalName: "Carne bovina kg",
        slug: `carne-multi-${Date.now()}`,
        matchKey: `carne-multi-${Date.now()}`,
      },
    });
    const leite = await prisma.canonicalProduct.create({
      data: {
        canonicalName: "Leite em pó multi 400g",
        slug: `leite-multi-${Date.now()}`,
        matchKey: `leite-multi-${Date.now()}`,
      },
    });
    ids.productIds = [carne.id, leite.id];
    await prisma.offer.createMany({
      data: [
        {
          flyerId: flyer.id,
          supermarketId: market.id,
          name: "Carne bovina kg",
          price: 30,
          validationStatus: "VALIDATED",
          canonicalProductId: carne.id,
        },
        {
          flyerId: flyer.id,
          supermarketId: market.id,
          name: "Leite em pó multi 400g",
          price: 15,
          validationStatus: "VALIDATED",
          canonicalProductId: leite.id,
        },
      ],
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

  it("creates two lists, compares, duplicates and deletes", async () => {
    const app = await buildApp({ prisma });
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/client/auth/register",
      payload: { email, password },
    });
    expect(register.statusCode).toBe(204);
    const cookie = register.headers["set-cookie"] as string;

    const candidates = await app.inject({
      method: "GET",
      url: "/api/v1/client/lists/product-candidates?q=leite",
      headers: { cookie },
    });
    expect(candidates.statusCode).toBe(200);
    expect(
      (candidates.json() as { candidates: unknown[] }).candidates.length,
    ).toBeGreaterThan(0);

    const list1 = await app.inject({
      method: "POST",
      url: "/api/v1/client/lists",
      headers: { cookie },
      payload: {
        name: "Lista 1",
        items: [
          {
            queryText: "Carne bovina kg",
            canonicalProductId: ids.productIds[0],
          },
          {
            queryText: "Leite em pó multi 400g",
            canonicalProductId: ids.productIds[1],
          },
        ],
      },
    });
    expect(list1.statusCode).toBe(201);
    const list1Id = (list1.json() as { id: string }).id;

    const list2 = await app.inject({
      method: "POST",
      url: "/api/v1/client/lists",
      headers: { cookie },
      payload: {
        name: "Lista 2",
        items: [
          {
            queryText: "Leite em pó multi 400g",
            canonicalProductId: ids.productIds[1],
          },
        ],
      },
    });
    expect(list2.statusCode).toBe(201);

    const all = await app.inject({
      method: "GET",
      url: "/api/v1/client/lists",
      headers: { cookie },
    });
    expect(all.statusCode).toBe(200);
    const summaries = all.json() as Array<{
      name: string;
      itemCount: number;
      bestSingle: { total: number } | null;
    }>;
    expect(summaries.length).toBeGreaterThanOrEqual(2);
    const s1 = summaries.find((row) => row.name === "Lista 1");
    expect(s1?.itemCount).toBe(2);
    expect(s1?.bestSingle?.total).toBeCloseTo(45);

    const comparison = await app.inject({
      method: "GET",
      url: `/api/v1/client/lists/${list1Id}/comparison`,
      headers: { cookie },
    });
    expect(comparison.statusCode).toBe(200);
    expect(comparison.json()).toMatchObject({
      itemCount: 2,
      needsResolve: false,
      bestSingle: { total: 45 },
    });

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/v1/client/lists/${list1Id}`,
      headers: { cookie },
      payload: { name: "Lista 1 churrasco" },
    });
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as { name: string }).name).toBe("Lista 1 churrasco");

    const dup = await app.inject({
      method: "POST",
      url: `/api/v1/client/lists/${list1Id}/duplicate`,
      headers: { cookie },
    });
    expect(dup.statusCode).toBe(201);
    expect((dup.json() as { name: string; items: unknown[] }).items.length).toBe(
      2,
    );

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/client/lists/${list1Id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);

    await app.close();
  });
});
