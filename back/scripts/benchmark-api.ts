import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPrismaClient } from "../prisma/client.js";

const prisma = createPrismaClient(process.env.DATABASE_URL ?? "");
const measure = async (name: string, operation: () => Promise<unknown>) => {
  const samples: number[] = [];
  for (let index = 0; index < 12; index += 1) {
    const start = performance.now(); await operation(); samples.push(performance.now() - start);
  }
  samples.sort((left, right) => left - right);
  return { name, p50Ms: Number(samples[Math.floor(samples.length * 0.5)].toFixed(2)), p95Ms: Number(samples[Math.floor(samples.length * 0.95)].toFixed(2)), samples };
};

try {
  const report = { createdAt: new Date().toISOString(), benchmarks: await Promise.all([
    measure("dashboard", () => Promise.all([prisma.supermarket.count(), prisma.scraperFlow.count(), prisma.scraperRun.count(), prisma.flyer.count({ where: { status: "FAILED" } })])),
    measure("offers-page", () => prisma.offer.findMany({ take: 51, orderBy: { createdAt: "desc" }, include: { supermarket: { select: { name: true } } } })),
    measure("price-comparison", () => prisma.offer.findMany({ take: 500, where: { validationStatus: "VALIDATED", canonicalProductId: { not: null } }, include: { canonicalProduct: { select: { canonicalName: true } }, supermarket: { select: { name: true } } } })),
    measure("price-history", () => prisma.priceHistory.findMany({ take: 100, orderBy: { createdAt: "desc" }, include: { supermarket: { select: { name: true } } } })),
  ]) };
  const directory = join(process.cwd(), "reports"); await mkdir(directory, { recursive: true });
  const destination = join(directory, "api-benchmark.json"); await writeFile(destination, JSON.stringify(report, null, 2));
  console.log(`Benchmark report written to ${destination}`);
} finally { await prisma.$disconnect(); }
