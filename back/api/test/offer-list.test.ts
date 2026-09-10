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
  it("returns a bounded cursor page", async () => {
    const app = await buildApp({ prisma });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD } });
    const response = await app.inject({ method: "GET", url: "/api/v1/admin/offers?limit=2", headers: { cookie: login.headers["set-cookie"] as string } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ name: "Arroz" })]), hasMore: expect.any(Boolean) });
    await app.close();
  });
});
