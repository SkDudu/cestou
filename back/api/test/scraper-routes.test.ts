import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { seedMasterAdmin } from "../../prisma/seed.js";
import { buildApp } from "../src/server.js";

const databaseUrl = "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
const credentials = { ADMIN_MASTER_EMAIL: "admin-scraper-routes@example.test", ADMIN_SEED_PASSWORD: "test-password" };
let supermarketId = "";
let flowId = "";

describe("admin scraper run routes", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await seedMasterAdmin(prisma, credentials);
    const supermarket = await prisma.supermarket.create({ data: { name: "Route Test", slug: "route-test", city: "Fortaleza", state: "CE", country: "BR", active: true } });
    supermarketId = supermarket.id;
    const flow = await prisma.scraperFlow.create({ data: { supermarketId, name: "Route flow", startUrl: "https://example.test", status: "ACTIVE", version: 1 } });
    flowId = flow.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await prisma.supermarket.delete({ where: { id: supermarketId } });
    await prisma.$disconnect();
  });

  it("starts and cancels a scraper run as an authenticated admin", async () => {
    const sent: Array<{ name: string; data?: Record<string, unknown> }> = [];
    const app = await buildApp({ prisma, queue: { send: async (name, data) => { sent.push({ name, data }); return "test-job"; } } });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD } });
    const cookie = login.headers["set-cookie"] as string;

    const started = await app.inject({ method: "POST", url: `/api/v1/admin/scraper-flows/${flowId}/runs`, headers: { cookie } });
    expect(started.statusCode).toBe(201);
    expect(sent).toHaveLength(1);

    const cancelled = await app.inject({ method: "POST", url: `/api/v1/admin/scraper-runs/${started.json().id}/cancel`, headers: { cookie } });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({ status: "CANCELLED" });
    await app.close();
  });

  it("patches scraper flow status and schedules ACTIVE when nextRunAt is null", async () => {
    await prisma.scraperFlow.update({
      where: { id: flowId },
      data: { status: "DRAFT", nextRunAt: null },
    });
    const app = await buildApp({ prisma, queue: { send: async () => "test-job" } });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD },
    });
    const cookie = login.headers["set-cookie"] as string;

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/scraper-flows/${flowId}`,
      headers: { cookie },
      payload: { status: "ACTIVE" },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ id: flowId, status: "ACTIVE" });
    expect(patched.json().nextRunAt).toBeTruthy();

    await prisma.scraperFlow.update({
      where: { id: flowId },
      data: { status: "ACTIVE" },
    });
    await app.close();
  });
});
