import { spawn, execSync } from "node:child_process";
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

async function waitDown(ms: number) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!(await workerUp())) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return !(await workerUp());
}

async function start(): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  // ponytail: worker is `tsc && node dist` — already-up skip = stale JS (duplicata still failed)
  if (await workerUp()) {
    const stopped = await stop();
    if (!stopped.ok) return stopped;
  }
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

function workerPort(): number {
  try {
    return Number(new URL(WORKER_URL).port || 8791);
  } catch {
    return 8791;
  }
}

/** Kill whatever still listens on the worker port (old binary without /shutdown). */
function killListenerOnPort(port: number, force = false): void {
  try {
    execSync(
      `lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null | xargs ${force ? "kill -9" : "kill"} 2>/dev/null`,
      { stdio: "ignore" },
    );
  } catch {
    /* no listener / already dead */
  }
}

async function stop(): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  if (!(await workerUp())) return { ok: true, already: true };

  // Graceful — only exists on worker builds that include POST /shutdown
  try {
    await fetch(`${WORKER_URL}/shutdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* old worker 404 / connection reset OK */
  }

  if (await waitDown(3_000)) return { ok: true };

  const port = workerPort();
  killListenerOnPort(port, false);
  if (await waitDown(3_000)) return { ok: true };

  killListenerOnPort(port, true);
  const down = await waitDown(5_000);
  if (!down) {
    return { ok: false, error: "Worker ainda responde /health após kill" };
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

export async function DELETE() {
  const result = await stop();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
