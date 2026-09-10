import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { seedMasterAdmin } from "../../prisma/seed.js";
import { buildApp } from "../src/server.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
const credentials = {
  ADMIN_MASTER_EMAIL: "admin-auth-integration@example.test",
  ADMIN_SEED_PASSWORD: "test-password",
};

describe("admin authentication", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await seedMasterAdmin(prisma, credentials);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await prisma.$disconnect();
  });

  it("sets an HttpOnly session cookie for valid credentials", async () => {
    const app = await buildApp({ prisma });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: credentials.ADMIN_MASTER_EMAIL,
        password: credentials.ADMIN_SEED_PASSWORD,
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    await app.close();
  });

  it("rejects an admin route without a session", async () => {
    const app = await buildApp({ prisma });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/dashboard/overview",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
