import { buildApp } from "./server.js";

async function start() {
  const app = await buildApp();
  const port = Number(process.env.API_PORT ?? 4000);

  await app.listen({ host: "0.0.0.0", port });
}

void start();
