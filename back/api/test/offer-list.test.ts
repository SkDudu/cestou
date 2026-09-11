import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { seedMasterAdmin } from "../../prisma/seed.js";
import { buildApp } from "../src/server.js";

const prisma = createPrismaClient("postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public");
const credentials = { ADMIN_MASTER_EMAIL: "admin-offer-list@example.test", ADMIN_SEED_PASSWORD: "test-password" };
let supermarketId = "";

describe("admin offer listing", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await seedMasterAdmin(prisma, credentials);
    const supermarket = await prisma.supermarket.create({ data: { name: "Offer List", slug: "offer-list", city: "Fortaleza", state: "CE", country: "BR", active: true } });
    supermarketId = supermarket.id;
    const source = await prisma.flyerSource.create({ data: { supermarketId, type: "PDF", url: "https://example.test", active: true } });
    const flyer = await prisma.flyer.create({ data: { supermarketId, sourceId: source.id, originalUrl: "https://example.test/f.pdf", status: "PROCESSED" } });
    await prisma.offer.create({ data: { flyerId: flyer.id, supermarketId, name: "Arroz", price: 10, validationStatus: "PENDING" } });
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } }); await prisma.supermarket.delete({ where: { id: supermarketId } }); await prisma.$disconnect(); });
  it("pages without repeating offers that share createdAt", async () => {
    const flyer = await prisma.flyer.findFirstOrThrow({ where: { supermarketId } });
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    await prisma.offer.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        flyerId: flyer.id,
        supermarketId,
        name: `Tie ${i}`,
        price: 1 + i,
        validationStatus: "PENDING" as const,
        createdAt,
      })),
    });
    const app = await buildApp({ prisma });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD } });
    const cookie = login.headers["set-cookie"] as string;
    const first = await app.inject({ method: "GET", url: "/api/v1/admin/offers?limit=2", headers: { cookie } });
    const page1 = first.json() as { items: Array<{ id: string }>; nextCursor: string };
    const second = await app.inject({ method: "GET", url: `/api/v1/admin/offers?limit=2&cursor=${page1.nextCursor}`, headers: { cookie } });
    const page2 = second.json() as { items: Array<{ id: string }> };
    const ids = [...page1.items, ...page2.items].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    await app.close();
  });

  it("returns a bounded cursor page", async () => {
    const app = await buildApp({ prisma });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD } });
    const response = await app.inject({ method: "GET", url: "/api/v1/admin/offers?limit=2", headers: { cookie: login.headers["set-cookie"] as string } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ name: "Arroz" })]), hasMore: expect.any(Boolean) });
    await app.close();
  });

  it("updates offer validation status", async () => {
    const offer = await prisma.offer.findFirstOrThrow({ where: { supermarketId } });
    const app = await buildApp({ prisma });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD } });
    const response = await app.inject({ method: "PATCH", url: `/api/v1/admin/offers/${offer.id}/validation`, headers: { cookie: login.headers["set-cookie"] as string }, payload: { validationStatus: "VALIDATED" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ validationStatus: "VALIDATED" });
    await app.close();
  });

  it("bulk-validates pending offers of a flyer", async () => {
    const flyer = await prisma.flyer.findFirstOrThrow({ where: { supermarketId } });
    await prisma.offer.create({ data: { flyerId: flyer.id, supermarketId, name: "Feijão", price: 8, validationStatus: "PENDING" } });
    const app = await buildApp({ prisma });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD } });
    const response = await app.inject({ method: "PATCH", url: "/api/v1/admin/offers/bulk-validation", headers: { cookie: login.headers["set-cookie"] as string }, payload: { flyerId: flyer.id, validationStatus: "VALIDATED" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ count: expect.any(Number) });
    expect((response.json() as { count: number }).count).toBeGreaterThanOrEqual(1);
    const pending = await prisma.offer.count({ where: { flyerId: flyer.id, validationStatus: "PENDING" } });
    expect(pending).toBe(0);
    await app.close();
  });
});
