import argon2 from "argon2";
import { pathToFileURL } from "node:url";
import { createPrismaClient } from "./client.js";

export type SeedEnvironment = {
  ADMIN_MASTER_EMAIL: string;
  ADMIN_SEED_PASSWORD: string;
};

type UserUpsert = {
  where: { email: string };
  update: { role: "ADMIN_MASTER"; passwordHash: string };
  create: { email: string; role: "ADMIN_MASTER"; passwordHash: string };
};

type SeedPrisma = {
  user: {
    upsert(input: UserUpsert): Promise<unknown>;
  };
};

export async function seedMasterAdmin(
  prisma: SeedPrisma,
  env: SeedEnvironment,
) {
  const email = env.ADMIN_MASTER_EMAIL.trim().toLowerCase();
  const passwordHash = await argon2.hash(env.ADMIN_SEED_PASSWORD, {
    type: argon2.argon2id,
  });

  await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN_MASTER", passwordHash },
    create: { email, role: "ADMIN_MASTER", passwordHash },
  });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const email = process.env.ADMIN_MASTER_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!connectionString || !email || !password) {
    throw new Error("DATABASE_URL, ADMIN_MASTER_EMAIL and ADMIN_SEED_PASSWORD are required");
  }

  const prisma = createPrismaClient(connectionString);
  try {
    await seedMasterAdmin(prisma, {
      ADMIN_MASTER_EMAIL: email,
      ADMIN_SEED_PASSWORD: password,
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  void main();
}
