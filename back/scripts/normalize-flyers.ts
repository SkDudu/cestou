/**
 * Backfill: normalize + canonical match for flyers with unmatched offers.
 * Usage: npx tsx --env-file=.env scripts/normalize-flyers.ts [--limit=50] [--flyerId=<uuid>]
 */
import { createPrismaClient } from "../prisma/client.js";
import { processFlyerNormalization } from "../scraper/src/flyers/extraction/catalog-normalization.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const args = process.argv.slice(2);
  const flyerIdArg = args.find((a) => a.startsWith("--flyerId="))?.slice("--flyerId=".length);
  const limit = Number(args.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? 50);

  const prisma = createPrismaClient(connectionString);
  try {
    if (flyerIdArg) {
      const result = await processFlyerNormalization(prisma, flyerIdArg);
      console.log(JSON.stringify({ flyerId: flyerIdArg, ...result }, null, 2));
      return;
    }

    const flyerIds = await prisma.offer.findMany({
      where: { OR: [{ canonicalProductId: null }, { normalizedName: null }] },
      distinct: ["flyerId"],
      select: { flyerId: true },
      take: Number.isFinite(limit) ? limit : 50,
    });

    let created = 0;
    let resolved = 0;
    for (const row of flyerIds) {
      const result = await processFlyerNormalization(prisma, row.flyerId);
      created += result.created;
      resolved += result.resolved;
      console.log(
        `${row.flyerId}: normalized=${result.normalized} created=${result.created} resolved=${result.resolved} auto=${JSON.stringify(result.autoValidation)}`,
      );
    }
    console.log(`Done. flyers=${flyerIds.length} canonicalCreated=${created} offersLinked=${resolved}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
