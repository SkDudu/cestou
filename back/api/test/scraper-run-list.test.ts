import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { seedMasterAdmin } from "../../prisma/seed.js";
import { buildApp } from "../src/server.js";

const databaseUrl = "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
const credentials = { ADMIN_MASTER_EMAIL: "admin-run-list@example.test", ADMIN_SEED_PASSWORD: "test-password" };
let supermarketId = "";

describe("admin scraper run listing", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await seedMasterAdmin(prisma, credentials);
    const supermarket = await prisma.supermarket.create({ data: { name: "Run List", slug: "run-list", city: "Fortaleza", state: "CE", country: "BR", active: true } });
    supermarketId = supermarket.id;
    const flow = await prisma.scraperFlow.create({ data: { supermarketId, name: "Extraction flow", startUrl: "https://example.test", status: "ACTIVE", version: 1 } });
    await prisma.scraperRun.create({ data: { flowId: flow.id, status: "FAILED", error: "network failed", finishedAt: new Date() } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await prisma.supermarket.delete({ where: { id: supermarketId } });
    await prisma.$disconnect();
  });

  it("returns recent runs with their flow and supermarket", async () => {
    const app = await buildApp({ prisma });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD } });
    const response = await app.inject({ method: "GET", url: "/api/v1/admin/scraper-runs?limit=10", headers: { cookie: login.headers["set-cookie"] as string } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.arrayContaining([expect.objectContaining({ status: "FAILED", flow: expect.objectContaining({ name: "Extraction flow", supermarket: expect.objectContaining({ name: "Run List" }) }) })]));
    await app.close();
  });
});
