import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { seedMasterAdmin } from "../../prisma/seed.js";
import { buildApp } from "../src/server.js";

const databaseUrl = "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
const credentials = { ADMIN_MASTER_EMAIL: "admin-dashboard@example.test", ADMIN_SEED_PASSWORD: "test-password" };
let supermarketId = "";

describe("admin dashboard overview", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await seedMasterAdmin(prisma, credentials);
    const supermarket = await prisma.supermarket.create({ data: { name: "Dashboard Test", slug: "dashboard-test", city: "Fortaleza", state: "CE", country: "BR", active: true } });
    supermarketId = supermarket.id;
    const flow = await prisma.scraperFlow.create({ data: { supermarketId, name: "Dashboard flow", startUrl: "https://example.test", status: "ACTIVE", version: 1 } });
    await prisma.scraperRun.create({ data: { flowId: flow.id, status: "RUNNING" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await prisma.supermarket.delete({ where: { id: supermarketId } });
    await prisma.$disconnect();
  });

  it("returns operational counters from PostgreSQL", async () => {
    const app = await buildApp({ prisma });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD } });
    const response = await app.inject({ method: "GET", url: "/api/v1/admin/dashboard/overview", headers: { cookie: login.headers["set-cookie"] as string } });

    expect(response.statusCode).toBe(200);
    const overview = response.json();
    expect(overview.supermarkets).toBeGreaterThanOrEqual(1);
    expect(overview.activeFlows).toBeGreaterThanOrEqual(1);
    expect(overview.runningRuns).toBeGreaterThanOrEqual(1);
    await app.close();
  });
});
