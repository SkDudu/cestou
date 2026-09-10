import { describe, expect, it } from "vitest";
import { seedMasterAdmin } from "../seed.js";

describe("seedMasterAdmin", () => {
  it("upserts the master admin using a password hash", async () => {
    let received: unknown;
    const prisma = {
      user: {
        upsert: async (input: unknown) => {
          received = input;
        },
      },
    };

    await seedMasterAdmin(prisma, {
      ADMIN_MASTER_EMAIL: "admin@example.test",
      ADMIN_SEED_PASSWORD: "test-password",
    });

    expect(received).toMatchObject({
      where: { email: "admin@example.test" },
      create: { email: "admin@example.test", role: "ADMIN_MASTER" },
      update: { role: "ADMIN_MASTER" },
    });
    expect(JSON.stringify(received)).not.toContain("test-password");
  });
});
