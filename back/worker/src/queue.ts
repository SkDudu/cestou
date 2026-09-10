import { PgBoss } from "pg-boss";

export function createBoss(connectionString: string) {
  return new PgBoss({ connectionString, schema: "pgboss" });
}
