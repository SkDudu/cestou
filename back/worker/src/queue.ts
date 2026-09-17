import { PgBoss } from "pg-boss";

/** pg-boss max is 24h. Local Qwen extract needs far more than default 15m. */
export const SCRAPER_RUN_EXPIRE_SECONDS = Math.min(
  86_400,
  Math.max(1, Number(process.env.SCRAPER_RUN_EXPIRE_SECONDS ?? 86_400)),
);

export function createBoss(connectionString: string) {
  return new PgBoss({ connectionString, schema: "pgboss" });
}
