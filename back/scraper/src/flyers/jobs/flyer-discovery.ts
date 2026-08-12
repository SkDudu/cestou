import { getFlyerScraper, listFlyerScraperSlugs } from "../sources/index.js";
import {
  ensureFlyerSource,
  ensureSupermarket,
  createDiscoveredFlyer,
  getSupermarketBySlug,
  insertFlyerError,
} from "../core/flyer-storage.js";
import { flyerLog } from "../core/flyer-logger.js";
import { closeSaoLuizBrowser } from "../sources/sao-luiz/scraper.js";

const SAO_LUIZ = {
  name: "São Luiz",
  slug: "sao-luiz",
  city: "Fortaleza",
  state: "CE",
  country: "BR",
  websiteUrl: "https://mercadinhossaoluiz.com.br/loja/355",
  sourceUrl: "https://merconnect.mercadapp.com.br/mapp/v2/markets/355/flipbooks",
};

export async function seedSaoLuiz() {
  const supermarketId = await ensureSupermarket({
    name: SAO_LUIZ.name,
    slug: SAO_LUIZ.slug,
    city: SAO_LUIZ.city,
    state: SAO_LUIZ.state,
    country: SAO_LUIZ.country,
    websiteUrl: SAO_LUIZ.websiteUrl,
  });
  const sourceId = await ensureFlyerSource({
    supermarketId,
    type: "image",
    url: SAO_LUIZ.sourceUrl,
    active: true,
  });
  return { supermarketId, sourceId };
}

export async function discoverAll() {
  await seedSaoLuiz();
  const slugs = listFlyerScraperSlugs();
  let created = 0;

  for (const slug of slugs) {
    const scraper = getFlyerScraper(slug);
    if (!scraper) continue;
    const sm = await getSupermarketBySlug(slug);
    if (!sm) {
      flyerLog.error("DISCOVERY", `Supermarket missing: ${slug}`);
      continue;
    }

    try {
      const foundList = await scraper.findFlyers();
      if (!foundList.length) {
        flyerLog.info("DISCOVERY", `${slug}: nothing found`);
        continue;
      }

      for (const found of foundList) {
        const sourceId = await ensureFlyerSource({
          supermarketId: sm._id,
          type: found.type,
          url: found.sourceUrl,
          active: true,
        });

        const flyerId = await createDiscoveredFlyer({
          supermarketId: sm._id,
          sourceId,
          title: found.title,
          originalUrl: found.originalUrl,
          validFrom: found.validFrom,
          validUntil: found.validUntil,
        });

        flyerLog.info(
          "DISCOVERY",
          `${slug}: flyer ${flyerId} (${found.title ?? found.originalUrl})`,
        );
        created++;
      }
    } catch (err) {
      flyerLog.error("DISCOVERY", `${slug}: ${String(err)}`);
      await insertFlyerError({
        supermarketId: sm._id,
        stage: "DISCOVERY",
        message: String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  }

  await closeSaoLuizBrowser();
  return { created };
}

const isMain =
  process.argv[1]?.endsWith("flyer-discovery.js") ||
  process.argv[1]?.endsWith("flyer-discovery.ts");

if (isMain) {
  discoverAll()
    .then((result) => {
      flyerLog.info("DISCOVERY", `Done. created/ensured=${result.created}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
