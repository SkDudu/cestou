import { chromium, type Browser } from "playwright";
import {
  downloadUrl,
  sha256,
} from "../../core/flyer-downloader.js";
import { flyerLog } from "../../core/flyer-logger.js";
import type {
  DownloadedFlyer,
  FlyerMetadata,
  FlyerScraper,
  FlyerSourceRef,
} from "../../core/flyer-types.js";

const MARKET_ID = 355;
const ENCARTES_URL = `https://mercadinhossaoluiz.com.br/loja/${MARKET_ID}/encartes`;
const FLIPBOOKS_PATH = `/mapp/v2/markets/${MARKET_ID}/flipbooks`;

type MercadappFlipbook = {
  id: number;
  name: string;
  images_urls?: string[];
};

type MercadappResponse = {
  flipbooks?: MercadappFlipbook[];
};

/** Parse "10 a 12/08" from titles like "Hortifrúti | 10 a 12/08" */
export function parseValidityFromTitle(
  title: string,
  now = new Date(),
): { validFrom?: number; validUntil?: number } {
  const m = title.match(
    /(\d{1,2})\s*a\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/i,
  );
  if (!m) return {};
  const dayFrom = Number(m[1]);
  const dayUntil = Number(m[2]);
  const month = Number(m[3]);
  let year = m[4] ? Number(m[4]) : now.getFullYear();
  if (year < 100) year += 2000;

  const from = new Date(year, month - 1, dayFrom, 0, 0, 0, 0);
  const until = new Date(year, month - 1, dayUntil, 23, 59, 59, 999);
  if (until < from) until.setMonth(until.getMonth() + 1);

  return { validFrom: from.getTime(), validUntil: until.getTime() };
}

function toSourceRef(
  fb: MercadappFlipbook,
  apiUrl: string,
): FlyerSourceRef | null {
  if (!fb.images_urls?.length) return null;
  const { validFrom, validUntil } = parseValidityFromTitle(fb.name);
  return {
    supermarketSlug: "sao-luiz",
    sourceUrl: apiUrl,
    type: "image",
    externalId: String(fb.id),
    title: fb.name,
    originalUrl: `${ENCARTES_URL}/${fb.id}`,
    pageUrls: fb.images_urls,
    validFrom,
    validUntil,
  };
}

let sharedBrowser: Browser | null = null;

async function getBrowser() {
  if (!sharedBrowser) {
    sharedBrowser = await chromium.launch({ headless: true });
  }
  return sharedBrowser;
}

export async function closeSaoLuizBrowser() {
  await sharedBrowser?.close();
  sharedBrowser = null;
}

export class SaoLuizFlyerScraper implements FlyerScraper {
  async findFlyers(): Promise<FlyerSourceRef[]> {
    flyerLog.info("DISCOVERY", `goto ${ENCARTES_URL}`);
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    try {
      const waitFlipbooks = page.waitForResponse(
        (res) =>
          res.ok() &&
          res.url().includes(FLIPBOOKS_PATH) &&
          Boolean(res.headers()["content-type"]?.includes("json")),
        { timeout: 60000 },
      );

      await page.goto(ENCARTES_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      const res = await waitFlipbooks;
      const data = (await res.json()) as MercadappResponse;
      const flipbooks = data.flipbooks ?? [];
      if (!flipbooks.length) {
        flyerLog.info("DISCOVERY", "No flipbooks found");
        return [];
      }

      const out: FlyerSourceRef[] = [];
      for (const fb of flipbooks) {
        const ref = toSourceRef(fb, res.url());
        if (!ref) {
          flyerLog.info(
            "DISCOVERY",
            `Skip flipbook ${fb.id} "${fb.name}" (no pages)`,
          );
          continue;
        }
        flyerLog.info(
          "DISCOVERY",
          `Found flipbook ${fb.id} "${fb.name}" (${ref.pageUrls?.length ?? 0} pages)`,
        );
        out.push(ref);
      }
      return out;
    } finally {
      await context.close();
    }
  }

  async downloadFlyer(source: FlyerSourceRef): Promise<DownloadedFlyer> {
    const urls = source.pageUrls ?? [];
    if (!urls.length) throw new Error("No page URLs on flyer source");

    const pages = [];
    const hashParts: Buffer[] = [];
    let totalSize = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]!;
      flyerLog.info("DOWNLOAD", `Page ${i + 1}/${urls.length}`);
      const { buffer, contentType } = await downloadUrl(url);
      pages.push({
        pageNumber: i + 1,
        buffer,
        contentType,
        url,
      });
      hashParts.push(buffer);
      totalSize += buffer.length;
    }

    return {
      source,
      pages,
      fileHash: sha256(Buffer.concat(hashParts)),
      fileType: pages[0]?.contentType ?? "image/jpeg",
      fileSize: totalSize,
    };
  }

  async extractMetadata(flyer: DownloadedFlyer): Promise<FlyerMetadata> {
    const fromTitle = parseValidityFromTitle(flyer.source.title ?? "");
    return {
      title: flyer.source.title,
      validFrom: flyer.source.validFrom ?? fromTitle.validFrom,
      validUntil: flyer.source.validUntil ?? fromTitle.validUntil,
    };
  }
}
