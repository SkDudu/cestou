import { flyerConfig } from "../core/flyer-config.js";
import { executeFlowById } from "../runner/execute-flow.js";

function argVal(name: string): string | undefined {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : undefined;
}

function parseCtx(): Record<string, string> {
  const ctx: Record<string, string> = {};
  for (const a of process.argv) {
    const m = a.match(/^--ctx\.(\w+)=(.+)$/);
    if (m) ctx[m[1]!] = m[2]!;
  }
  if (!ctx.uf) ctx.uf = flyerConfig.discoveryState;
  if (!ctx.city) ctx.city = flyerConfig.discoveryCity;
  if (!ctx.storeId) ctx.storeId = "355";
  return ctx;
}

export async function runFlowJob() {
  const flowId = argVal("flow");
  if (!flowId) throw new Error("Usage: flows:run -- --flow=<id>");
  const result = await executeFlowById(flowId, parseCtx(), {
    pipeline: process.argv.includes("--discovery") ? "discovery" : "full",
  });
  if (!result.ok) process.exitCode = 1;
}

const isMain =
  process.argv[1]?.endsWith("flow-run.js") ||
  process.argv[1]?.endsWith("flow-run.ts");

if (isMain) {
  runFlowJob().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
