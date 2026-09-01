// Cursor agent sandbox sets PLAYWRIGHT_BROWSERS_PATH to a cache without arm64 Chromium.
if (process.env.PLAYWRIGHT_BROWSERS_PATH?.includes("cursor-sandbox-cache")) {
  delete process.env.PLAYWRIGHT_BROWSERS_PATH;
}

import { startSessionServer } from "../session/session-server.js";

startSessionServer();
