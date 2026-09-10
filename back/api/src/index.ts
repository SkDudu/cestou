import { buildApp } from "./server.js";
import { createBoss } from "../../worker/src/queue.js";

async function start() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const boss = createBoss(connectionString);
  await boss.start();
  const app = await buildApp({ queue: boss });
  const port = Number(process.env.API_PORT ?? 4000);

  const stop = async () => {
    await app.close();
    await boss.stop();
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
  await app.listen({ host: "0.0.0.0", port });
}

void start();
