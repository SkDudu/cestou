import type { createPrismaClient } from "../../../../prisma/client.js";

type PrismaClient = ReturnType<typeof createPrismaClient>;

export async function appendRunEvent(
  prisma: PrismaClient,
  runId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  return prisma.$transaction(async (transaction) => {
    const previous = await transaction.scraperRunEvent.findFirst({
      where: { runId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });

    return transaction.scraperRunEvent.create({
      data: {
        runId,
        sequence: (previous?.sequence ?? 0) + 1,
        type,
        payload: payload as never,
      },
    });
  });
}
