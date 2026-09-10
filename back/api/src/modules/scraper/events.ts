import type { createPrismaClient } from "../../../../prisma/client.js";

type PrismaClient = ReturnType<typeof createPrismaClient>;

export async function readRunEvents(
  prisma: PrismaClient,
  runId: string,
  afterSequence = 0,
) {
  return prisma.scraperRunEvent.findMany({
    where: { runId, sequence: { gt: afterSequence } },
    orderBy: { sequence: "asc" },
  });
}

export function formatSseEvent(event: {
  sequence: number;
  type: string;
  payload: unknown;
}) {
  return `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
}
