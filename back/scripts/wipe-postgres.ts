import { pathToFileURL } from "node:url";
import { createPrismaClient } from "../prisma/client.js";
import { seedMasterAdmin } from "../prisma/seed.js";

function assertLocalDatabase(url: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("prisma:wipe blocked: NODE_ENV=production");
  }
  const host = new URL(url.replace(/^postgresql:/, "http:")).hostname;
  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");
  if (!local && process.env.ALLOW_REMOTE_WIPE !== "1") {
    throw new Error(
      `prisma:wipe blocked: host "${host}" is not local. Set ALLOW_REMOTE_WIPE=1 to override.`,
    );
  }
}

export async function wipePostgres() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  assertLocalDatabase(connectionString);

  const prisma = createPrismaClient(connectionString);
  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations'
      ORDER BY tablename
    `;

    if (tables.length === 0) {
      console.log("No tables to wipe.");
    } else {
      const list = tables.map((row) => `"${row.tablename}"`).join(", ");
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
      console.log(`Wiped ${tables.length} tables.`);
    }

    const email = process.env.ADMIN_MASTER_EMAIL;
    const password = process.env.ADMIN_SEED_PASSWORD;
    if (email && password) {
      await seedMasterAdmin(prisma, {
        ADMIN_MASTER_EMAIL: email,
        ADMIN_SEED_PASSWORD: password,
      });
      console.log(`Seeded ADMIN_MASTER (${email.trim().toLowerCase()}).`);
    } else {
      console.log("Skip seed: ADMIN_MASTER_EMAIL / ADMIN_SEED_PASSWORD missing.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  void wipePostgres();
}
