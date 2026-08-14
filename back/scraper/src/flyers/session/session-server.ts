import http from "node:http";
import { flyerLog } from "../core/flyer-logger.js";
import { executeFlowById } from "../runner/execute-flow.js";
import {
  addSemantic,
  clearScopeHighlight,
  clickAt,
  confirmScope,
  createSession,
  destroySession,
  getSession,
  hoverScope,
  locateFlyersWithMimo,
  pickScope,
  pressKey,
  probeScope,
  saveSession,
  scrollSession,
  setRecording,
  subscribe,
  sweepExpired,
  typeText,
} from "./session-manager.js";

function corsOrigin() {
  return process.env.BROWSER_SESSION_CORS_ORIGIN ?? "http://localhost:3000";
}

function setCors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin());
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function checkToken(req: http.IncomingMessage): boolean {
  const token = process.env.BROWSER_SESSION_TOKEN;
  if (!token) return true;
  const h = req.headers.authorization ?? "";
  return h === `Bearer ${token}`;
}

function startSse(res: http.ServerResponse) {
  setCors(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": corsOrigin(),
  });
  return (ev: unknown) => {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  };
}

export function startSessionServer() {
  const host = process.env.BROWSER_SESSION_HOST ?? "127.0.0.1";
  const port = Number(process.env.BROWSER_SESSION_PORT ?? 8791);
  let runBusy = false;
  let activeAbort: AbortController | null = null;

  const server = http.createServer(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/health") {
        sendJson(res, 200, { ok: true, runBusy });
        return;
      }

      if (!checkToken(req)) {
        sendJson(res, 401, { error: "Unauthorized" });
        return;
      }

      if (req.method === "POST" && path === "/runs/stop") {
        if (!activeAbort) {
          sendJson(res, 200, { ok: true, stopped: false });
          return;
        }
        activeAbort.abort();
        sendJson(res, 200, { ok: true, stopped: true });
        return;
      }

      if (req.method === "POST" && path === "/runs") {
        const body = (await readJson(req)) as {
          flowId?: string;
          ctx?: Record<string, string>;
        };
        if (!body.flowId) {
          sendJson(res, 400, { error: "flowId required" });
          return;
        }
        if (runBusy) {
          sendJson(res, 409, { error: "Another run is in progress" });
          return;
        }
        runBusy = true;
        activeAbort = new AbortController();
        const signal = activeAbort.signal;
        const send = startSse(res);
        send({ type: "log", line: "starting…", ts: Date.now() });
        try {
          const result = await executeFlowById(
            body.flowId,
            body.ctx ?? {},
            (line) => send({ type: "log", line, ts: Date.now() }),
            signal,
          );
          send({
            type: "done",
            ok: result.ok,
            runId: result.runId,
            stepsExecuted: result.stepsExecuted,
            storesFound: result.storesFound,
            flyersFound: result.flyersFound,
            offersFound: result.offersFound,
            error: result.error,
            ts: Date.now(),
          });
        } catch (err) {
          send({
            type: "done",
            ok: false,
            error: String(err),
            ts: Date.now(),
          });
        } finally {
          activeAbort = null;
          runBusy = false;
          res.end();
        }
        return;
      }

      if (req.method === "POST" && path === "/sessions") {
        const body = (await readJson(req)) as {
          flowId?: string;
          startUrl?: string;
        };
        if (!body.flowId || !body.startUrl) {
          sendJson(res, 400, { error: "flowId and startUrl required" });
          return;
        }
        const session = await createSession({
          flowId: body.flowId,
          startUrl: body.startUrl,
        });
        sendJson(res, 200, {
          sessionId: session.sessionId,
          status: session.status,
          currentUrl: session.currentUrl,
          eventsUrl: `http://${host}:${port}/sessions/${session.sessionId}/events`,
        });
        return;
      }

      const m = path.match(/^\/sessions\/([^/]+)(?:\/(.+))?$/);
      if (!m) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      const sessionId = m[1]!;
      const action = m[2];

      if (req.method === "GET" && !action) {
        const s = getSession(sessionId);
        if (!s) {
          sendJson(res, 404, { error: "Session not found" });
          return;
        }
        sendJson(res, 200, {
          sessionId: s.sessionId,
          flowId: s.flowId,
          status: s.status,
          currentUrl: s.currentUrl,
          recording: s.recording,
          actions: s.actions,
        });
        return;
      }

      if (req.method === "GET" && action === "events") {
        const s = getSession(sessionId);
        if (!s) {
          sendJson(res, 404, { error: "Session not found" });
          return;
        }
        const send = startSse(res);
        const unsub = subscribe(sessionId, send);
        const ping = setInterval(() => {
          res.write(`: ping\n\n`);
        }, 15000);
        req.on("close", () => {
          clearInterval(ping);
          unsub();
        });
        return;
      }

      if (req.method === "POST" && action === "stop") {
        await destroySession(sessionId);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && action === "record/start") {
        await setRecording(sessionId, true);
        sendJson(res, 200, { recording: true });
        return;
      }

      if (req.method === "POST" && action === "record/stop") {
        await setRecording(sessionId, false);
        sendJson(res, 200, { recording: false });
        return;
      }

      if (req.method === "POST" && action === "hover") {
        const body = (await readJson(req)) as { x?: number; y?: number };
        if (body.x == null || body.y == null) {
          await clearScopeHighlight(sessionId);
          sendJson(res, 200, { ok: true, cleared: true });
          return;
        }
        const pick = await hoverScope(sessionId, body.x, body.y);
        sendJson(res, 200, pick);
        return;
      }

      if (req.method === "POST" && action === "pick-scope") {
        const body = (await readJson(req)) as {
          x?: number;
          y?: number;
          ancestorIndex?: number;
        };
        const pick = await pickScope(sessionId, body);
        sendJson(res, 200, pick);
        return;
      }

      if (req.method === "POST" && action === "locate-flyers") {
        await readJson(req);
        const result = await locateFlyersWithMimo(sessionId);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && action === "probe-scope") {
        const body = (await readJson(req)) as {
          selectors?: string[];
          purpose?: string;
        };
        if (!body.selectors?.length) {
          sendJson(res, 400, { error: "selectors required" });
          return;
        }
        const result = await probeScope(sessionId, body.selectors);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && action === "confirm-scope") {
        const body = (await readJson(req)) as {
          selectors?: string[];
          label?: string;
          purpose?: string;
          metadata?: {
            tagName?: string;
            id?: string;
            className?: string;
            textPreview?: string;
            childCount?: number;
            linkCount?: number;
            imageCount?: number;
          };
        };
        if (!body.selectors?.length) {
          sendJson(res, 400, { error: "selectors required" });
          return;
        }
        const result = await confirmScope(sessionId, {
          selectors: body.selectors,
          label: body.label,
          purpose: body.purpose,
          metadata: body.metadata,
        });
        sendJson(res, 200, { saved: true, ...result });
        return;
      }

      if (req.method === "POST" && action === "click") {
        const body = (await readJson(req)) as { x?: number; y?: number };
        if (body.x == null || body.y == null) {
          sendJson(res, 400, { error: "x,y required" });
          return;
        }
        await clickAt(sessionId, body.x, body.y);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && action === "type") {
        const body = (await readJson(req)) as { text?: string };
        await typeText(sessionId, body.text ?? "");
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && action === "press") {
        const body = (await readJson(req)) as { key?: string };
        await pressKey(sessionId, body.key ?? "Enter");
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && action === "scroll") {
        const body = (await readJson(req)) as { dy?: number };
        await scrollSession(sessionId, body.dy ?? 400);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && action === "semantic") {
        const body = (await readJson(req)) as {
          step?: "discover-flyer" | "discover-store" | "capture-network";
        };
        if (!body.step) {
          sendJson(res, 400, { error: "step required" });
          return;
        }
        await addSemantic(sessionId, body.step);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && action === "save") {
        const result = await saveSession(sessionId);
        sendJson(res, 200, { saved: true, ...result });
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      flyerLog.error("SESSION", String(err));
      if (!res.headersSent) sendJson(res, 500, { error: String(err) });
      else res.end();
    }
  });

  setInterval(() => sweepExpired(), 30_000);

  server.listen(port, host, () => {
    flyerLog.info(
      "SESSION",
      `Browser session worker on http://${host}:${port}`,
    );
  });

  return server;
}
