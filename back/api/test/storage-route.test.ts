import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../prisma/client.js";
import { seedMasterAdmin } from "../../prisma/seed.js";
import { buildApp } from "../src/server.js";

const databaseUrl = "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
const credentials = { ADMIN_MASTER_EMAIL: "admin-storage@example.test", ADMIN_SEED_PASSWORD: "test-password" };
let storageRoot = "";

describe("storage upload route", () => {
  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "smart-grocery-api-storage-"));
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await seedMasterAdmin(prisma, credentials);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.ADMIN_MASTER_EMAIL } });
    await prisma.$disconnect();
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("accepts an authenticated local file upload", async () => {
    const app = await buildApp({ prisma, storageRoot });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: credentials.ADMIN_MASTER_EMAIL, password: credentials.ADMIN_SEED_PASSWORD } });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/storage/uploads?scope=flyers&filename=sample.pdf",
      headers: { cookie: login.headers["set-cookie"] as string, "content-type": "application/octet-stream" },
      payload: Buffer.from("pdf"),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ relativePath: expect.stringMatching(/^flyers\//), bytes: 3 });
    await app.close();
  });
});
