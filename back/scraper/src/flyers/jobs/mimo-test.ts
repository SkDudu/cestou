import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { flyerConfig } from "../core/flyer-config.js";
import { MimoVisionExtractor, parseMimoOffers } from "../extraction/mimo/index.js";

function argValue(name: string): string | undefined {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag?.slice(name.length + 3);
}

async function main() {
  if (!flyerConfig.mimoApiKey) {
    throw new Error("MIMO_API_KEY missing");
  }

  const imagePath =
    argValue("image") ??
    resolve(
      process.cwd(),
      "fixtures/flyers/sao-luiz/page-01.jpeg",
    );

  const buffer = await readFile(imagePath);
  const extractor = new MimoVisionExtractor();
  const result = await extractor.extractOffers({
    flyerId: "test",
    pageNumber: Number(argValue("page") ?? 1),
    imageBuffer: buffer,
    contentType: "image/jpeg",
  });

  let valid = result.offers;
  try {
    valid = parseMimoOffers(result.rawResponse, Number(argValue("page") ?? 1))
      .offers;
  } catch {
    // already guarded in extractor
  }

  console.log(JSON.stringify({ offers: result.offers, confidence: result.pageConfidence }, null, 2));
  console.log(
    `Offers found: ${result.offers.length} valid=${valid.length} model=${result.model} ${result.latencyMs}ms tokens=${result.usage?.totalTokens ?? "?"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
