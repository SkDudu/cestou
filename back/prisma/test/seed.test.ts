import { describe, expect, it } from "vitest";
import { seedClientUser, seedMasterAdmin } from "../seed.js";

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

describe("seedClientUser", () => {
  it("upserts the client using a password hash", async () => {
    let received: unknown;
    const prisma = {
      user: {
        upsert: async (input: unknown) => {
          received = input;
        },
      },
    };

    await seedClientUser(prisma, {
      CLIENT_SEED_EMAIL: "client@example.test",
      CLIENT_SEED_PASSWORD: "test-password",
    });

    expect(received).toMatchObject({
      where: { email: "client@example.test" },
      create: { email: "client@example.test", role: "CLIENT" },
      update: { role: "CLIENT" },
    });
    expect(JSON.stringify(received)).not.toContain("test-password");
  });
});
