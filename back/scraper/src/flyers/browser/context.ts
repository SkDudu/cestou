import type {
  BrowserContext,
  BrowserContextOptions,
  LaunchOptions,
  Page,
} from "playwright";

const DENIED_PERMISSIONS = [
  "geolocation",
  "notifications",
  "camera",
  "microphone",
  "clipboard-read",
  "clipboard-write",
] as const;

/** tsx keepNames wraps evaluate() fns with __name; Chromium does not define it. */
export const TSX_KEEP_NAMES_SHIM =
  "globalThis.__name=globalThis.__name||function(fn){return fn};";

export async function installTsxKeepNamesShim(context: BrowserContext) {
  await context.addInitScript(TSX_KEEP_NAMES_SHIM);
}

export function buildLaunchOptions(
  opts: { headless: boolean } & LaunchOptions = { headless: true },
): LaunchOptions {
  const { headless, args = [], ...rest } = opts;
  return {
    ...rest,
    headless,
    // ponytail: Chromium auto-denies permission UI (geo/mic/notif/…)
    args: ["--deny-permission-prompts", ...args],
  };
}

export function buildContextOptions(): BrowserContextOptions {
  return {
    viewport: { width: 1280, height: 720 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
  };
}

function httpOrigin(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.origin;
  } catch {
    return undefined;
  }
}

/** Deny Chromium permission prompts — not DOM dialogs. Needs http(s) origin. */
export async function denyNativePermissionPrompts(
  context: BrowserContext,
  page: Page,
  origin?: string,
) {
  const resolved = httpOrigin(origin) ?? httpOrigin(page.url());
  if (!resolved) return; // about:blank / opaque → CDP throws

  const cdp = await context.newCDPSession(page);
  for (const name of DENIED_PERMISSIONS) {
    await cdp.send("Browser.setPermission", {
      permission: { name },
      setting: "denied",
      origin: resolved,
    });
  }
}
