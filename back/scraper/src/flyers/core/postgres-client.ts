import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type PrismaClient = {
  $disconnect(): Promise<void>;
};

let client: PrismaClient | null = null;

function generatedClientPath() {
  const root = process.env.SMART_GROCERY_ROOT;
  const candidates = [
    root ? resolve(root, "generated/prisma/client.js") : "",
    resolve(process.cwd(), "generated/prisma/client.js"),
    resolve(process.cwd(), "../generated/prisma/client.js"),
  ].filter(Boolean);
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error("Prisma client was not generated; run npm run prisma:generate");
  return path;
}

export async function getScraperPrisma() {
  if (client) return client;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const [{ PrismaPg }, generated] = await Promise.all([
    import("@prisma/adapter-pg"),
    import(pathToFileURL(generatedClientPath()).href),
  ]);
  const PrismaClientConstructor = generated.PrismaClient as new (options: unknown) => PrismaClient;
  client = new PrismaClientConstructor({
    adapter: new PrismaPg({ connectionString }),
  });
  return client;
}

export async function disconnectScraperPrisma() {
  await client?.$disconnect();
  client = null;
}
