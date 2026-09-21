import argon2 from "argon2";
import { pathToFileURL } from "node:url";
import { createPrismaClient } from "./client.js";

export type SeedEnvironment = {
  ADMIN_MASTER_EMAIL: string;
  ADMIN_SEED_PASSWORD: string;
  CLIENT_SEED_EMAIL: string;
  CLIENT_SEED_PASSWORD: string;
};

type UserUpsert = {
  where: { email: string };
  update: { role: "ADMIN_MASTER" | "CLIENT"; passwordHash: string };
  create: {
    email: string;
    role: "ADMIN_MASTER" | "CLIENT";
    passwordHash: string;
  };
};

type SeedPrisma = {
  user: {
    upsert(input: UserUpsert): Promise<unknown>;
  };
};

export async function seedMasterAdmin(
  prisma: SeedPrisma,
  env: Pick<SeedEnvironment, "ADMIN_MASTER_EMAIL" | "ADMIN_SEED_PASSWORD">,
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

export async function seedClientUser(
  prisma: SeedPrisma,
  env: Pick<SeedEnvironment, "CLIENT_SEED_EMAIL" | "CLIENT_SEED_PASSWORD">,
) {
  const email = env.CLIENT_SEED_EMAIL.trim().toLowerCase();
  const passwordHash = await argon2.hash(env.CLIENT_SEED_PASSWORD, {
    type: argon2.argon2id,
  });

  await prisma.user.upsert({
    where: { email },
    update: { role: "CLIENT", passwordHash },
    create: { email, role: "CLIENT", passwordHash },
  });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const adminEmail = process.env.ADMIN_MASTER_EMAIL;
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;
  const clientEmail = process.env.CLIENT_SEED_EMAIL;
  const clientPassword = process.env.CLIENT_SEED_PASSWORD;
  if (
    !connectionString ||
    !adminEmail ||
    !adminPassword ||
    !clientEmail ||
    !clientPassword
  ) {
    throw new Error(
      "DATABASE_URL, ADMIN_MASTER_EMAIL, ADMIN_SEED_PASSWORD, CLIENT_SEED_EMAIL and CLIENT_SEED_PASSWORD are required",
    );
  }

  const prisma = createPrismaClient(connectionString);
  try {
    await seedMasterAdmin(prisma, {
      ADMIN_MASTER_EMAIL: adminEmail,
      ADMIN_SEED_PASSWORD: adminPassword,
    });
    await seedClientUser(prisma, {
      CLIENT_SEED_EMAIL: clientEmail,
      CLIENT_SEED_PASSWORD: clientPassword,
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  void main();
}
