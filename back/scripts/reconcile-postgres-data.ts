import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPrismaClient } from "../prisma/client.js";

const prisma = createPrismaClient(process.env.DATABASE_URL ?? "");
try {
  const [users, supermarkets, stores, sources, flyers, offers, products, runs, orphanOffers, orphanPages, duplicateFlyerHashes] = await Promise.all([
    prisma.user.count(), prisma.supermarket.count(), prisma.store.count(), prisma.flyerSource.count(), prisma.flyer.count(), prisma.offer.count(), prisma.canonicalProduct.count(), prisma.scraperRun.count(),
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "Offer" o LEFT JOIN "Flyer" f ON f.id = o."flyerId" WHERE f.id IS NULL`,
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "FlyerPage" p LEFT JOIN "Flyer" f ON f.id = p."flyerId" WHERE f.id IS NULL`,
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM (SELECT "supermarketId", "fileHash" FROM "Flyer" WHERE "fileHash" IS NOT NULL GROUP BY "supermarketId", "fileHash" HAVING count(*) > 1) duplicates`,
  ]);
  const report = { createdAt: new Date().toISOString(), entities: { users, supermarkets, stores, sources, flyers, offers, canonicalProducts: products, scraperRuns: runs }, integrity: { orphanOffers: Number(orphanOffers[0]?.count ?? 0), orphanPages: Number(orphanPages[0]?.count ?? 0), duplicateFlyerHashes: Number(duplicateFlyerHashes[0]?.count ?? 0) } };
  const directory = join(process.cwd(), "reports"); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "postgres-reconciliation.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(report.integrity).some((value) => value > 0)) process.exitCode = 1;
} finally { await prisma.$disconnect(); }
