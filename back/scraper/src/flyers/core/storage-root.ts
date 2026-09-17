import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `back/` root — works from scraper modules under `src/flyers/**`. */
const BACK_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");

/**
 * Resolve STORAGE_ROOT for host + Docker.
 * Docker Compose uses `/data/storage` (bind-mounted to `back/storage`).
 * Host scripts with the same `.env` fall back to `back/storage` when `/data/storage` is absent.
 */
export function resolveStorageRoot(): string {
  const configured = process.env.STORAGE_ROOT?.trim();
  if (configured && existsSync(configured)) return configured;

  const hostMirror = resolve(BACK_ROOT, "storage");
  if (existsSync(hostMirror)) return hostMirror;

  return configured || hostMirror;
}
