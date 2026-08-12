import { flyerLog } from "../core/flyer-logger.js";
import { discoverAll } from "./flyer-discovery.js";
import { downloadPending } from "./flyer-download.js";
import { extractPending } from "./flyer-extraction.js";
import { expireFlyers } from "./flyer-expiration.js";

async function main() {
  flyerLog.info("DISCOVERY", "=== flyers:sync start ===");
  await expireFlyers();
  const d = await discoverAll();
  flyerLog.info("DISCOVERY", `discover: ${JSON.stringify(d)}`);
  const dl = await downloadPending();
  flyerLog.info("DOWNLOAD", `download: ${JSON.stringify(dl)}`);
  const ex = await extractPending();
  flyerLog.info("OCR", `extract: ${JSON.stringify(ex)}`);
  flyerLog.info("DISCOVERY", "=== flyers:sync done ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
