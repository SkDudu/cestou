import { flyerLog } from "../core/flyer-logger.js";
import { markExpired } from "../core/flyer-storage.js";

export async function expireFlyers() {
  const result = await markExpired();
  flyerLog.info("VALIDATION", `Expired ${result.expired} flyers`);
  return result;
}

const isMain =
  process.argv[1]?.endsWith("flyer-expiration.js") ||
  process.argv[1]?.endsWith("flyer-expiration.ts");

if (isMain) {
  expireFlyers().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}