/**
 * Tiny self-check for offer parser + MiMo JSON + flow helpers.
 * Run: npx tsc && node dist/flyers/selfcheck.js
 */
import {
  interpolate,
  normalizeAction,
} from "./recorder/action-normalizer.js";
import { parseOffersFromText } from "./extraction/offer-parser.js";
import { parseJsonObject } from "./extraction/json-parse.js";
import { parseMimoOffers } from "./extraction/mimo/index.js";
import { parseLocateFlyers } from "./extraction/mimo/locate.js";
import { guardOffers } from "./extraction/offer-guards.js";
import {
  collectFlyerDocsFromJson,
  flyerKey,
  isFlyerHref,
} from "./runner/flow-pipeline.js";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const offers = parseOffersFromText(
  `ARROZ CAMIL
TIPO 1
5KG

DE 34,90
POR 27,99

FEIJÃO CARIOCA
1KG
R$ 8,99

AÇÚCAR CRISTAL
5kg
12,49`,
  1,
  0.9,
);

assert(offers.length >= 3, `offer count got ${offers.length}`);
const arroz = offers.find((o) => /arroz/i.test(o.name));
assert(arroz?.price === 27.99, `arroz price ${arroz?.price}`);
assert(arroz?.originalPrice === 34.9, "arroz original");
const feijao = offers.find((o) => /feij/i.test(o.name));
assert(feijao?.price === 8.99, `feijao ${feijao?.price}`);

const fenced = parseJsonObject(`\`\`\`json
{"offers":[{"name":"Arroz Camil Tipo 1","price":27.99,"originalPrice":34.9,"confidence":0.92}]}
\`\`\``) as { offers: unknown[] };
assert(Array.isArray(fenced.offers) && fenced.offers.length === 1, "fence json");

const repaired = parseJsonObject(
  `{"offers":[{"name":"Leite","price":5.49,}],}`,
) as { offers: unknown[] };
assert(repaired.offers.length === 1, "trailing comma");

let invalidJson = false;
try {
  parseJsonObject("not json");
} catch {
  invalidJson = true;
}
assert(invalidJson, "invalid json");

const vision = parseMimoOffers(
  JSON.stringify({
    confidence: 0.94,
    offers: [
      {
        name: "Arroz Camil Tipo 1",
        brand: "Camil",
        quantity: "5",
        unit: "kg",
        price: 27.99,
        originalPrice: 34.9,
        discount: 99,
        pageNumber: 2,
      },
      { name: "x", price: 1 },
      { name: "12345", price: 9.9 },
      { name: "Caro demais", price: 99999 },
      { name: "Desconhecido", brand: "unknown", price: 4.5 },
    ],
  }),
  2,
);
assert(vision.offers.length === 2, `guards got ${vision.offers.length}`);
assert(vision.offers[0]!.price === 27.99, "vision price");
assert(vision.offers[0]!.originalPrice === 34.9, "vision original");
assert(vision.offers[0]!.discountPercentage === 19.8, `discount ${vision.offers[0]!.discountPercentage}`);
assert(vision.offers[0]!.pageNumber === 2, "vision page");
assert(vision.offers[0]!.brand === "Camil", "brand title case");
assert(vision.confidence === 0.94, "page confidence");

const stringPrice = guardOffers(
  [{ name: "Leite Integral", price: "R$ 27,99", originalPrice: "34,90", unit: "KG" }],
  1,
);
assert(stringPrice.length === 1, "string price");
assert(stringPrice[0]!.price === 27.99, `parsed ${stringPrice[0]!.price}`);
assert(stringPrice[0]!.unit === "kg", `unit ${stringPrice[0]!.unit}`);
assert(stringPrice[0]!.discountPercentage === 19.8, `string discount ${stringPrice[0]!.discountPercentage}`);

const dupes = guardOffers(
  [
    { name: "Arroz Camil 5kg", brand: "Camil", quantity: "5", unit: "kg", price: 27.99 },
    { name: "Arroz Camil 5 KG", brand: "CAMIL", quantity: "5", unit: "KG", price: 27.99 },
  ],
  3,
);
assert(dupes.length === 1, `dupes got ${dupes.length}`);

assert(interpolate("loja/{{storeId}}", { storeId: "355" }) === "loja/355", "interp");
const nav = normalizeAction({
  kind: "navigation",
  url: "https://example.com",
  description: "Start",
});
assert(nav?.type === "navigate", "nav step");
const click = normalizeAction({
  kind: "click",
  selectors: ["#x"],
  description: "Abrir encartes",
});
assert(click?.config.semantic === "OPEN_FLYERS", `sem ${click?.config.semantic}`);

const scopeStep = normalizeAction({
  kind: "scope",
  selectors: ["[data-section='flyers']", "main > section:nth-of-type(2)"],
  description: "Folhetos de ofertas",
  value: "flyer-discovery",
});
assert(scopeStep?.type === "select-scope", "scope step");
assert(scopeStep?.config.purpose === "flyer-discovery", "scope purpose");
assert(
  scopeStep?.config.selectors?.[0] === "[data-section='flyers']",
  "scope selector",
);

assert(
  isFlyerHref(
    "https://apigw.cloud.carrefour.com.br/api-middleware-flyer-services/api/v2/Flyer/?id=abc",
  ),
  "flyer href",
);
assert(
  !isFlyerHref("https://cdn.vtexassets.com/arquivos/ids/123/sku.jpg"),
  "sku not flyer",
);
assert(
  flyerKey("https://x/Flyer/?id=99") === flyerKey("https://x/Flyer/thumbnail/?id=99"),
  "flyer key",
);
const harvested: Array<{ url: string; title?: string }> = [];
collectFlyerDocsFromJson(
  {
    flyers: [
      {
        name: "Super Ofertas",
        urlFinalDocument: "https://x/Flyer/?id=1",
        urlFinalDocumentThumbnail: "https://x/Flyer/thumbnail/?id=1",
      },
    ],
  },
  harvested,
);
assert(harvested.length === 1 && harvested[0]!.url.includes("Flyer/?id=1"), "json docs");

const located = parseLocateFlyers(
  `{"index":3,"selectors":["[data-section=\\"flyers\\"]","main > section:nth-of-type(2)"],"label":"Folhetos"}`,
);
assert(located.index === 3, "locate index");
assert(located.selectors[0] === '[data-section="flyers"]', "locate sel");
assert(located.label === "Folhetos", "locate label");

console.log("flyers selfcheck ok", offers.length, "rule offers");
