import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  extractPageOffers,
  parseProviderArg,
} from "../extraction/offer-extractor.js";
import { detectContentType } from "../core/flyer-downloader.js";
import { rasterizePdf } from "../core/pdf-raster.js";
import { getFlyer, listForExtract } from "../core/flyer-storage.js";
import { resolveStorageRoot } from "../core/storage-root.js";

function argValue(name: string): string | undefined {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag?.slice(name.length + 3);
}

async function downloadPageBuffer(url: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Page fetch HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(join(resolveStorageRoot(), url));
}

async function main() {
  const provider = parseProviderArg();
  let flyerId = argValue("flyer");
  const pageNum = Number(argValue("page") ?? 1);
  const titleHint = argValue("title");

  if (!flyerId) {
    const flyers = await listForExtract(true);
    const match = titleHint
      ? flyers.find((f: { title?: string }) =>
          (f.title ?? "").toLowerCase().includes(titleHint.toLowerCase()),
        )
      : flyers[0];
    if (!match) throw new Error("No flyer found — pass --flyer=<id>");
    flyerId = match._id as string;
  }

  const flyer = await getFlyer(flyerId);
  if (!flyer) throw new Error(`Flyer not found: ${flyerId}`);
  const page = flyer.pages?.find(
    (p: { pageNumber: number }) => p.pageNumber === pageNum,
  );
  if (!page?.url) throw new Error(`Page ${pageNum} not stored`);

  const buffer = await downloadPageBuffer(page.url);
  const detected = detectContentType(buffer) ?? "application/octet-stream";
  const images =
    detected === "application/pdf"
      ? await rasterizePdf(buffer)
      : [{ buffer, contentType: detected }];
  if (!images.length) throw new Error("No images after rasterize");

  const img = images[Math.min(pageNum, images.length) - 1]!;
  const result = await extractPageOffers(
    {
      flyerId,
      pageNumber: pageNum,
      imageUrl:
        detected.startsWith("image/") ? page.url : undefined,
      imageBuffer: img.buffer,
      contentType: img.contentType,
    },
    provider,
  );

  const suspicious = result.offers.filter((o) => {
    const decimals = o.price.toString().split(".")[1]?.length ?? 0;
    return decimals > 2;
  });
  const valid = result.offers.length - suspicious.length;

  console.log(`Flyer: ${flyer.title ?? flyerId}`);
  console.log(`Página: ${pageNum}${detected === "application/pdf" ? ` (pdf→${images.length} jpeg)` : ""}`);
  console.log(`Provider: ${result.provider}/${result.status}`);
  console.log(`Offers detected: ${result.offers.length}`);
  console.log(`Valid: ${valid}`);
  console.log(`Suspicious: ${suspicious.length}`);
  console.log(JSON.stringify(result.offers, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
