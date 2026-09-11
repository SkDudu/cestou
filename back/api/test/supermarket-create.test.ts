import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { seedMasterAdmin } from "../../prisma/seed.js";
import { buildApp } from "../src/server.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
const credentials = {
  ADMIN_MASTER_EMAIL: "admin-supermarket-create@example.test",
  ADMIN_SEED_PASSWORD: "test-password",
};

describe("POST /api/v1/admin/supermarkets", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await seedMasterAdmin(prisma, credentials);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await prisma.$disconnect();
  });

  it("creates a supermarket for an authenticated admin", async () => {
    const app = await buildApp({ prisma });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD },
    });
    const cookie = login.headers["set-cookie"] as string;
    const name = `Create Test ${Date.now()}`;
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/supermarkets",
      headers: { cookie },
      payload: { name, networkType: "SUPERMARKET" },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { id: string; slug: string; city: string };
    expect(body.slug).toMatch(/^create-test-/);
    expect(body.city).toBe("Fortaleza");
    await prisma.supermarket.delete({ where: { id: body.id } });
    await app.close();
  });

  it("rejects create without a session", async () => {
    const app = await buildApp({ prisma });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/supermarkets",
      payload: { name: "No Session" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
