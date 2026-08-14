import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 60;

const WORKER_URL =
  process.env.BROWSER_SESSION_URL ??
  process.env.NEXT_PUBLIC_BROWSER_SESSION_URL ??
  "http://127.0.0.1:8791";

let starting: Promise<{ ok: boolean; error?: string }> | null = null;

function scraperDir() {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "../back/scraper"),
    path.resolve(cwd, "../../back/scraper"),
    path.resolve(cwd, "back/scraper"),
  ];
  return candidates.find((d) => existsSync(path.join(d, "package.json")));
}

async function workerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${WORKER_URL}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function spawnWorker(cwd: string) {
  const log = path.join(tmpdir(), "cestou-session-worker.log");
  const fd = openSync(log, "a");
  const env = { ...process.env };
  delete env.PLAYWRIGHT_BROWSERS_PATH;
  const child = spawn("npm", ["run", "flows:session-worker"], {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", fd, fd],
    shell: true,
  });
  child.unref();
  return log;
}

async function waitUp(ms: number) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await workerUp()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function start(): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  if (await workerUp()) return { ok: true, already: true };
  const cwd = scraperDir();
  if (!cwd) {
    return { ok: false, error: "Pasta back/scraper não encontrada a partir do Next." };
  }
  spawnWorker(cwd);
  const up = await waitUp(45_000);
  if (!up) {
    return {
      ok: false,
      error: `Worker não subiu em 45s. Log: ${path.join(tmpdir(), "cestou-session-worker.log")}`,
    };
  }
  return { ok: true };
}

export async function GET() {
  return Response.json({ ok: await workerUp(), url: WORKER_URL });
}

export async function POST() {
  const p =
    starting ??
    (starting = start().finally(() => {
      starting = null;
    }));
  const result = await p;
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
