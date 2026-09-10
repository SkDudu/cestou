import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../client.js";
import { seedMasterAdmin } from "../seed.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://smart_grocery:smart_grocery@127.0.0.1:5432/smart_grocery?schema=public";
const prisma = createPrismaClient(databaseUrl);
const email = "admin-seed-integration@example.test";

describe("seedMasterAdmin integration", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("creates one master-admin row when invoked repeatedly", async () => {
    const env = { ADMIN_MASTER_EMAIL: email, ADMIN_SEED_PASSWORD: "test-password" };

    await seedMasterAdmin(prisma, env);
    await seedMasterAdmin(prisma, env);

    const users = await prisma.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email, role: "ADMIN_MASTER" });
    expect(users[0]?.passwordHash).not.toBe(env.ADMIN_SEED_PASSWORD);
  });
});
