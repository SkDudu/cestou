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
import { parseSectionLocate } from "./extraction/mimo/section-locate.js";
import { guardOffers } from "./extraction/offer-guards.js";
import {
  detectEligibilityPhrases,
  resolveEligibility,
} from "./extraction/eligibility.js";
import {
  collectFlyerDocsFromJson,
  flyerKey,
  isFlyerHref,
  isFlyerPageImageUrl,
  isPdfDocumentUrl,
  buildCandidates,
} from "./runner/flow-pipeline.js";
import {
  hasProvenFileDownload,
  isAppDownloadCta,
  isFlyerDownloadButton,
  parseFlyerSource,
  sanitizeItemSelectors,
  hasTextNeedles,
  cardItemSelectors,
  skipStaleFlyerTitle,
  listingSelectorsReadyToLoop,
  networkDocsAreRich,
  candidatesFromNetwork,
  dropSkipped,
  pruneBarePageImageDocs,
  urlsFromBackgroundImageCss,
} from "./runner/flyer-discover.js";
import { packTeachPayload } from "./session/click-snapshot.js";
import {
  galleryLooksLikeNavCards,
  mergeDetailHarvest,
  buildTeachSteps,
  applyFlyerSource,
  isViewerNoise,
  recipeFromDump,
  listingFromDump,
  flyerSourceFromOpenKind,
} from "./session/teach-repeat.js";
import { SCOPE_NOT_FOUND } from "./runner/flow-pipeline.js";
import {
  parseValidity,
  shouldExtractNow,
} from "./core/validity.js";

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
const ocrClub = parseOffersFromText(
  `ARROZ CAMIL
5KG
R$ 19,90
EXCLUSIVO CLIENTE CLUBE`,
  1,
  0.9,
);
assert(
  ocrClub.some((o) => o.eligibility === "LOYALTY_PROGRAM"),
  `ocr club ${ocrClub[0]?.eligibility}`,
);
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

const truncated = parseJsonObject(
  `{"offers":[{"name":"Leite","price":5.49},{"name":"Pao","price":3.2`,
) as { offers: unknown[] };
assert(truncated.offers.length === 1, `salvage got ${truncated.offers.length}`);
assert((truncated.offers[0] as { name: string }).name === "Leite", "salvage first");

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
      { name: "Caro demais", price: 250000 },
      { name: "TV Samsung 50", price: 12999, originalPrice: 14999 },
      { name: "Desconhecido", brand: "unknown", price: 4.5 },
    ],
  }),
  2,
);
assert(vision.offers.length === 3, `guards got ${vision.offers.length}`);
assert(vision.offers[0]!.price === 27.99, "vision price");
assert(vision.offers[0]!.originalPrice === 34.9, "vision original");
assert(vision.offers[0]!.discountPercentage === 19.8, `discount ${vision.offers[0]!.discountPercentage}`);
assert(vision.offers[0]!.pageNumber === 2, "vision page");
assert(vision.offers[0]!.brand === "Camil", "brand title case");
assert(vision.confidence === 0.94, "page confidence");
assert(
  parseMimoOffers(
    JSON.stringify({
      offers: [{ name: "Arroz Camil Tipo 1", price: 27.99 }],
      validFrom: "13/08",
      validUntil: "20/08",
      confidence: 0.9,
    }),
    1,
  ).validUntil === "20/08",
  "mimo period",
);

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

{
  const cashNx = guardOffers(
    [
      {
        name: "TV Samsung 50",
        price: 129.9,
        cashPrice: 1299,
        installmentCount: 10,
        installmentAmount: 129.9,
        installmentInterestFree: true,
      },
      { name: "TV Samsung 50", price: 1299 },
    ],
    1,
  );
  assert(cashNx.length === 1, `cash+nx rows ${cashNx.length}`);
  assert(cashNx[0]!.price === 1299, `cash price ${cashNx[0]!.price}`);
  assert(cashNx[0]!.cashPrice === 1299, "cashPrice");
  assert(cashNx[0]!.installmentCount === 10, "count");
  assert(cashNx[0]!.installmentAmount === 129.9, "amount");
  assert(cashNx[0]!.installmentInterestFree === true, "sem juros");

  const onlyNx = guardOffers(
    [
      {
        name: "Geladeira Brastemp",
        price: 199.9,
        installmentCount: 12,
        installmentAmount: 199.9,
      },
    ],
    1,
  );
  assert(onlyNx[0]!.price === 2398.8, `nx total ${onlyNx[0]!.price}`);
  assert(onlyNx[0]!.cashPrice === undefined, "no cash");

  const nxNoPrice = guardOffers(
    [
      {
        name: "Geladeira Brastemp",
        installmentCount: 12,
        installmentAmount: 199.9,
      },
    ],
    1,
  );
  assert(nxNoPrice.length === 1, "nx without price");
  assert(nxNoPrice[0]!.price === 2398.8, `nx fill ${nxNoPrice[0]!.price}`);

  const fakeDe = guardOffers(
    [
      {
        name: "Microondas",
        price: 799,
        originalPrice: 799,
        installmentCount: 10,
        installmentAmount: 79.9,
      },
    ],
    1,
  );
  assert(fakeDe[0]!.originalPrice === undefined, "Nx total is not DE");

  const dePorNx = guardOffers(
    [
      {
        name: "Fogao",
        price: 999,
        originalPrice: 1499,
        cashPrice: 999,
        installmentCount: 10,
        installmentAmount: 99.9,
        evidence: { text: "DE R$ 1.499,00 POR R$ 999,00 10x de 99,90", page: 1 },
      },
    ],
    1,
  );
  assert(dePorNx[0]!.originalPrice === 1499, "keep DE/POR");

  const pix = resolveEligibility({
    haystack: "TV 1299 à vista no pix ou 10x de 129,90",
    ai: {
      eligibility: "PAYMENT_METHOD",
      conditions: [{ type: "PAYMENT_METHOD", name: "PIX" }],
      confidence: 0.95,
      evidence: { text: "à vista no pix", page: 1 },
    },
  });
  assert(pix.eligibility === "PAYMENT_METHOD", "pix still payment");
  assert(
    !detectEligibilityPhrases("10x de R$ 129,90 à vista").some(
      (h) => h.type === "PAYMENT_METHOD",
    ),
    "Nx is not PAYMENT_METHOD",
  );

  const ocrPay = parseOffersFromText(
    `TV SAMSUNG 50
R$ 1.299,00 à vista
10x de R$ 129,90 sem juros`,
    1,
    0.9,
  );
  const tv = ocrPay.find((o) => /tv/i.test(o.name));
  assert(tv?.price === 1299, `ocr cash ${tv?.price}`);
  assert(tv?.installmentCount === 10, `ocr n ${tv?.installmentCount}`);
  assert(tv?.installmentAmount === 129.9, `ocr amt ${tv?.installmentAmount}`);
  assert(tv?.installmentInterestFree === true, "ocr sem juros");
}

{
  const club = detectEligibilityPhrases(
    "ARROZ CAMIL 5KG R$ 19,90 EXCLUSIVO CLIENTE CLUBE",
  );
  assert(
    club.some((h) => h.type === "LOYALTY_PROGRAM"),
    "club phrase",
  );
  const visa = detectEligibilityPhrases(
    "Aceitamos cartões Visa, Mastercard e Hipercard",
  );
  assert(
    !visa.some((h) => h.type === "STORE_CARD"),
    "institutional card is not store card",
  );
  assert(
    detectEligibilityPhrases("Leve 3 e pague").some(
      (h) => h.type === "QUANTITY_REQUIRED",
    ),
    "leve N",
  );
  assert(
    !detectEligibilityPhrases("cartão de crédito").some(
      (h) => h.type === "STORE_CARD",
    ),
    "bare credit card",
  );
  const invented = resolveEligibility({
    haystack: "Arroz Camil 19,90",
    ai: { eligibility: "LOYALTY_PROGRAM", confidence: 0.99 },
  });
  assert(invented.eligibility === "UNKNOWN", `invent ${invented.eligibility}`);
  const ruled = resolveEligibility({
    haystack: "EXCLUSIVO CLIENTE CLUBE",
    pageNumber: 3,
    ai: { eligibility: "ALL_CUSTOMERS", confidence: 0.99 },
  });
  assert(ruled.eligibility === "LOYALTY_PROGRAM", "rules beat AI ALL");
  assert(ruled.eligibilityConfidence >= 0.9, "rules high conf");
  assert(ruled.eligibilityEvidence?.page === 3, "rule page");
  const both = resolveEligibility({
    haystack: "Cliente Clube pagando com cartão do supermercado",
    ai: {
      eligibility: "LOYALTY_PROGRAM",
      conditions: [
        { type: "LOYALTY_PROGRAM", name: "Clube São Luiz" },
        { type: "PAYMENT_METHOD", name: "Cartão da loja" },
      ],
      confidence: 0.97,
      evidence: { text: "Cliente Clube pagando com cartão do supermercado", page: 1 },
    },
  });
  assert(both.conditions.length >= 2, `multi ${both.conditions.length}`);
}

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
  !isFlyerHref("https://frangolandia.com/encartes/"),
  "listing index not flyer",
);
assert(
  !isFlyerHref("https://frangolandia.com/encartes/#content"),
  "skip-to-content not flyer",
);
assert(
  isFlyerHref("https://frangolandia.com/encartes/festival-bebe/"),
  "encarte page is flyer",
);
assert(
  isFlyerHref("https://frangolandia.com/encarte/pra-torar-2/"),
  "singular /encarte/ is flyer href",
);
assert(
  isFlyerHref("https://frangolandia.com/encarte/4299/"),
  "singular /encarte/id is flyer href",
);
assert(
  isFlyerHref(
    "https://frangolandia.com/wp-content/uploads/2026/07/Encarte-FDS-Pra-Torar-28-a-30.08.pdf",
  ),
  "frango detail pdf is flyer",
);
assert(isPdfDocumentUrl("https://cdn.x/jornal.pdf"), "pdf url");
assert(isPdfDocumentUrl("https://cdn.x/file?name=a.pdf#page=2"), "pdf hash");
assert(!isPdfDocumentUrl("https://cdn.x/jornal.jpg"), "jpg not pdf");
assert(isPdfDocumentUrl("blob:https://loja.example/abc-pdf-viewer"), "blob labeled pdf");
assert(
  !isFlyerHref("https://loja.example/politica-de-privacidade.pdf"),
  "privacy pdf not flyer",
);
assert(
  !isPdfDocumentUrl("https://loja.example/cookies-policy.pdf"),
  "cookie pdf not flyer doc",
);
assert(
  !isFlyerHref("https://loja.example/termos-de-uso.pdf"),
  "terms pdf not flyer",
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
{
  const pagesHarvest: Array<{
    url: string;
    pageUrls?: string[];
    title?: string;
  }> = [];
  collectFlyerDocsFromJson(
    {
      encartes: [
        {
          title: "Encarte São Luiz",
          images_urls: [
            "https://cdn.example/encarte/pagina-1.jpg",
            "https://cdn.example/encarte/pagina-2.jpg",
            "https://cdn.example/encarte/pagina-3.jpg",
          ],
        },
      ],
    },
    pagesHarvest,
  );
  assert(pagesHarvest.length === 1, "images_urls doc");
  assert(pagesHarvest[0]!.pageUrls?.length === 3, "images_urls pages kept");
  assert(
    isFlyerPageImageUrl("https://cdn.example/encarte/pagina-1.jpg"),
    "page image url",
  );
  const galleryBg = urlsFromBackgroundImageCss(
    'url("https://frangolandia.com/wp-content/uploads/2026/08/WhatsApp-Image-2026-08-28-at-14.58.25-2.jpeg")',
  );
  assert(
    galleryBg[0]?.includes("WhatsApp-Image-2026-08-28-at-14.58.25-2.jpeg"),
    "elementor gallery background-image url",
  );
  assert(
    networkDocsAreRich([
      {
        url: pagesHarvest[0]!.url,
        pageUrls: pagesHarvest[0]!.pageUrls,
        title: pagesHarvest[0]!.title,
      },
    ]),
    "network rich",
  );
  const cands = candidatesFromNetwork(
    [
      {
        url: pagesHarvest[0]!.url,
        pageUrls: pagesHarvest[0]!.pageUrls,
        title: "Encarte São Luiz",
      },
    ],
    {
      kind: "api-json",
      downloadStrategy: "collect-images",
      urlFrom: "network",
    },
  );
  assert(cands.length === 1 && cands[0]!.pageUrls.length === 3, "net candidates");
  const mixed = candidatesFromNetwork(
    [
      {
        url: "https://cdn.example/encarte/pagina-1.jpg",
        pageUrls: [
          "https://cdn.example/encarte/pagina-1.jpg",
          "https://cdn.example/encarte/pagina-2.jpg",
          "https://cdn.example/encarte/pagina-3.jpg",
        ],
        title: "Encarte A",
      },
      {
        url: "https://cdn.example/encarte/b-1.jpg",
        pageUrls: [
          "https://cdn.example/encarte/b-1.jpg",
          "https://cdn.example/encarte/b-2.jpg",
        ],
        title: "Encarte B",
      },
      { url: "https://cdn.example/encarte/pagina-2.jpg" },
      { url: "https://cdn.example/encarte/pagina-3.jpg" },
      { url: "https://cdn.example/encarte/b-2.jpg" },
    ],
    {
      kind: "api-json",
      downloadStrategy: "collect-images",
      urlFrom: "network",
    },
  );
  assert(mixed.length === 2, "cdn pages not extra flyers");
  assert(
    mixed.every((c) => (c.pageUrls.length ?? 0) >= 2),
    "grouped keep pages",
  );
  const bareOnly: Array<{ url: string; title?: string }> = [];
  collectFlyerDocsFromJson(
    {
      items: Array.from({ length: 20 }, (_, i) => ({
        url: `https://cdn.example/encarte/pagina-${i + 1}.jpg`,
      })),
    },
    bareOnly,
  );
  assert(bareOnly.length === 0, "bare page url objects not flyers");
  assert(
    pruneBarePageImageDocs([
      { url: "https://cdn.example/encarte/pagina-1.jpg" },
      {
        url: "https://cdn.example/encarte/a.jpg",
        title: "A",
        pageUrls: [
          "https://cdn.example/encarte/a.jpg",
          "https://cdn.example/encarte/b.jpg",
        ],
      },
    ]).length === 1,
    "prune bare",
  );
}

const locatedNav = parseLocateFlyers(
  `{"status":"need_click","humanHint":"Abre um encarte","itemSelectors":["a:has-text(\\"Ver \\")"],"flyerSource":{"kind":"image-grid","downloadStrategy":"open-each-item","urlFrom":"click-then-network","itemSelectors":["a:has-text(\\"Ver \\")"]}}`,
);
assert(locatedNav.status === "need_click", "locate need_click");
assert(locatedNav.humanHint.includes("encarte"), "locate hint");

const locatedCands = parseLocateFlyers(
  `{"status":"need_click","humanHint":"Abre um card da listagem","candidates":[{"index":1,"selectors":["[role=tablist]"],"label":"Abas","why":"lista de encartes"}]}`,
);
assert(locatedCands.candidates.length === 1, "locate cands");
assert(locatedCands.candidates[0]?.label === "Abas", "locate cand label");
assert(locatedCands.candidates[0]?.selectors[0] === "[role=tablist]", "locate cand sel");

const sectionHit = parseSectionLocate(
  `{"status":"ready","label":"Seção principal de ofertas","why":"h4 ENCARTES","sectionSelectors":["section.offers"],"itemSelectors":[".offers__item"],"htmlSnippet":"<section class=\\"offers\\">"}`,
);
assert(sectionHit.status === "ready", "section locate ready");
assert(sectionHit.sectionSelectors[0] === "section.offers", "section sel");
assert(sectionHit.itemSelectors[0] === ".offers__item", "item sel");
assert(sectionHit.openKind === "need_click", "openKind default need_click");
const sectionDl = parseSectionLocate(
  `{"status":"ready","label":"Encartes","why":"pdf","sectionSelectors":["section.offers"],"itemSelectors":[".offers__item"],"openKind":"download","downloadSelectors":["a[href*='.pdf']"]}`,
);
assert(sectionDl.openKind === "download", "openKind download");
const sectionView = parseSectionLocate(
  `{"status":"ready","label":"Encartes","why":"fancybox","sectionSelectors":["section.offers"],"itemSelectors":[".offers__item"],"openKind":"viewer"}`,
);
assert(sectionView.openKind === "viewer", "openKind viewer");
const sectionFancy = parseSectionLocate(
  `{"status":"ready","label":"Tabloides","why":"slick+fancybox jpeg","sectionSelectors":["section.bloco-ofertas-tabloide"],"itemSelectors":["button[data-oferta-index]"],"openKind":"viewer","downloadSelectors":["a.download"]}`,
);
assert(sectionFancy.openKind === "viewer", "openKind fancybox jpeg = viewer");
assert(sectionFancy.itemSelectors[0] === "button[data-oferta-index]", "tabs = items");
const srcViewer = flyerSourceFromOpenKind({
  openKind: "viewer",
  itemSelectors: ["button[data-oferta-index]"],
  downloadSelectors: ["a.download"],
  itemCount: 3,
});
assert(srcViewer.kind === "tabs", "viewer+oferta-index → tabs");
assert(srcViewer.downloadStrategy === "open-each-item", "viewer tabs → open-each-item");
assert(!srcViewer.downloadSelectors?.length, "no Baixar página as whole-flyer");
const srcViewerOne = flyerSourceFromOpenKind({
  openKind: "viewer",
  itemSelectors: ["button[data-oferta-index]"],
  itemCount: 1,
});
assert(srcViewerOne.downloadStrategy === "collect-images", "1 tab → collect-images");
const srcViewerGrid = flyerSourceFromOpenKind({
  openKind: "viewer",
  itemSelectors: [".offers__item"],
});
assert(srcViewerGrid.downloadStrategy === "collect-images", "viewer grid → collect-images");
const srcDl = flyerSourceFromOpenKind({
  openKind: "download",
  itemSelectors: [".item"],
  downloadSelectors: ["a[href*='.pdf']"],
});
assert(srcDl.downloadStrategy === "direct-url", "pdf download → direct-url");
const srcNeed = flyerSourceFromOpenKind({
  openKind: "need_click",
  itemSelectors: [".card"],
});
assert(srcNeed.downloadStrategy === "open-each-item", "need_click → open-each-item");

const located = parseLocateFlyers(
  `{"index":3,"selectors":["[data-section=\\"flyers\\"]","main > section:nth-of-type(2)"],"label":"Folhetos"}`,
);
assert(located.status === "not_found", "locate default status");
assert(located.index === 3, "locate index");
assert(located.selectors[0] === '[data-section="flyers"]', "locate sel");
assert(located.label === "Folhetos", "locate label");

const until = parseValidity("20/08/2026", "America/Fortaleza", "until");
assert(until !== undefined, "parse until");
const untilDate = new Date(until!);
assert(
  untilDate.getUTCHours() === 2 && untilDate.getUTCMinutes() === 59,
  `until utc ${untilDate.toISOString()}`,
);
const from = parseValidity("13/08/2026 00:00", "America/Fortaleza", "from");
assert(from !== undefined && from < until!, "from before until");
const shortUntil = parseValidity("20/08", "America/Fortaleza", "until");
assert(shortUntil !== undefined, "short until");
const isoZ = parseValidity("2026-08-20T23:59:59-03:00");
assert(isoZ === until || Math.abs((isoZ ?? 0) - (until ?? 0)) < 2000, "iso offset");

assert(shouldExtractNow({}), "no date extract");
assert(shouldExtractNow({ validFrom: Date.now() - 1000 }), "past extract");
assert(
  !shouldExtractNow({ validFrom: Date.now() + 48 * 60 * 60 * 1000 }),
  "far upcoming skip",
);
assert(
  shouldExtractNow({ validFrom: Date.now() + 2 * 60 * 60 * 1000 }),
  "window extract",
);
assert(
  !shouldExtractNow({ validUntil: Date.now() - 1000 }),
  "expired until skip",
);
assert(
  shouldExtractNow({
    validFrom: Date.now() - 1000,
    validUntil: Date.now() + 86_400_000,
  }),
  "vigente extract",
);

const withDates = buildCandidates(
  [],
  [
    {
      url: "https://apigw.example/Flyer/?id=NEW1",
      title: "Super",
      validFrom: "13/08/2026",
      validUntil: "20/08/2026",
    },
  ],
);
assert(withDates[0]?.validUntil === "20/08/2026", "candidate until");
assert(withDates[0]?.externalId === "NEW1", "candidate externalId");

{
  const emptyList = listingFromDump({});
  assert(emptyList.status === "not_found", "listing empty → not_found");
  const listed = listingFromDump({
    gallery: {
      tabButtons: [
        { text: "Ver Encarte", selectors: ['a:has-text("Ver Encarte")'] },
      ],
      downloadButtons: [],
      pager: [],
      links: [],
      iframes: [],
      headings: [],
      imageCount: 3,
    },
  });
  assert(listed.status === "ready", "listing cards ready");
  assert(
    listed.itemSelectors.includes('a:has-text("Ver Encarte")'),
    "listing copies Ver Encarte",
  );
  const slDump = listingFromDump({
    gallery: {
      tabButtons: [],
      downloadButtons: [],
      pager: [],
      links: [],
      iframes: [],
      headings: ["Encartes"],
      imageCount: 4,
    },
  });
  assert(slDump.status === "ready", "heading Encartes + imgs → candidates");
  assert(
    slDump.hits.some((h) => h.kind === "image" || h.kind === "list"),
    "sao luiz dump shows image/list hits",
  );
  const pdfHit = listingFromDump({
    gallery: {
      tabButtons: [],
      downloadButtons: [],
      pager: [],
      links: [],
      iframes: [],
      headings: [],
      imageCount: 0,
      hits: [
        {
          kind: "pdf",
          text: "folheto.pdf",
          selectors: ['a[href*=".pdf"]'],
        },
      ],
    },
  });
  assert(pdfHit.status === "ready", "pdf hit is a candidate");
  assert(pdfHit.hits[0]?.kind === "pdf", "pdf kind kept");
  const empty = recipeFromDump({ gallery: undefined, network: [] });
  assert(empty.status === "not_found", "dump empty → not_found");
  const cards = recipeFromDump({
    gallery: {
      tabButtons: [
        { text: "Ver Encarte", selectors: ['a:has-text("Ver Encarte")'] },
      ],
      downloadButtons: [],
      pager: [],
      links: [],
      iframes: [],
      headings: [],
      imageCount: 3,
    },
    network: [],
  });
  assert(cards.status === "ready", "Ver Encarte loop-ready");
  assert(cards.flyerSource?.downloadStrategy === "open-each-item", "cards → open-each-item");
  assert(
    cards.flyerSource?.itemSelectors?.includes('a:has-text("Ver Encarte")'),
    "dump copies Ver Encarte",
  );
  assert(
    !cards.flyerSource?.itemSelectors?.includes('a:has-text("Ver Folheto")'),
    "dump does not invent Ver Folheto",
  );
}

const fs = parseFlyerSource({
  kind: "tabs",
  downloadStrategy: "open-each-item",
  itemSelectors: ["[role=tab]"],
  urlFrom: "img.src",
  evidence: "assai tabs",
});
assert(fs?.kind === "tabs", "parse kind");
assert(fs?.downloadStrategy === "open-each-item", "parse strategy");
assert(parseFlyerSource({ kind: "nope" }) === undefined, "reject bad source");
assert(
  parseFlyerSource({
    kind: "carousel",
    downloadStrategy: "open-each-item",
    pagerSelectors: [".swiper-button-next"],
  })?.pagerSelectors?.includes(".swiper-button-next"),
  "pagerSelectors parse",
);
assert(skipStaleFlyerTitle("Encartes anteriores"), "archive title skip");
assert(skipStaleFlyerTitle("Ofertas de 01/01/2020 a 05/01/2020"), "expired range skip");
assert(!skipStaleFlyerTitle("Ofertas da semana"), "current title keep");
{
  const nowSep1 = Date.parse("2026-09-01T15:00:00-03:00");
  assert(
    !skipStaleFlyerTitle(
      "Ver encarte OFERTAS DE REINAUGURAÇÃO COMETA MONTESE Ofertas válidas de 27/08 a 02/09 somente na loja Montese.",
      nowSep1,
    ),
    "range until tomorrow keep",
  );
  assert(
    !skipStaleFlyerTitle(
      "Ofertas válidas de 27 / 08 a 02 / 09 na loja Montese.",
      nowSep1,
    ),
    "range slash spaces keep",
  );
  assert(
    skipStaleFlyerTitle(
      "Ofertas válidas de 20/08 a 28/08 somente na loja Montese.",
      nowSep1,
    ),
    "range until last week skip",
  );
  assert(
    skipStaleFlyerTitle(
      "Ver encarte OFERTAS DE REINAUGURAÇÃO COMETA MONTESE Ofertas válidas de 27/08 a 02/09 somente na loja Montese.".slice(
        0,
        80,
      ),
      nowSep1,
    ),
    "80-char cut loses until → stale",
  );
  assert(
    !skipStaleFlyerTitle(
      "Ver encarte OFERTAS DE REINAUGURAÇÃO COMETA MONTESE Ofertas válidas de 27/08 a 02/09 somente na loja Montese.".slice(
        0,
        150,
      ),
      nowSep1,
    ),
    "150-char keep until",
  );
}
{
  const dropped = dropSkipped(
    [
      { originalUrl: "https://x/Flyer/?id=1", title: "Super" },
      { originalUrl: "https://x/banner", title: "App iFood" },
    ],
    ["https://x/banner", "App iFood"],
  );
  assert(dropped.length === 1 && dropped[0]!.title === "Super", "dropSkipped");
  const parsedSkip = parseFlyerSource({
    kind: "api-json",
    downloadStrategy: "collect-images",
    urlFrom: "network",
    skipKeys: ["https://x/banner", "App iFood"],
  });
  assert(parsedSkip?.skipKeys?.length === 2, "parse skipKeys");
}
assert(
  listingSelectorsReadyToLoop(['a:has-text("Ver encarte")']),
  "generic Ver loop-ready",
);
assert(
  listingSelectorsReadyToLoop(["[data-oferta-index]"]),
  "oferta-index loop-ready",
);

{
  const tabs = recipeFromDump({
    gallery: {
      tabButtons: [
        {
          text: "Jornal de Ofertas 1",
          selectors: ['button:has-text("Jornal de Ofertas 1")'],
        },
        {
          text: "Jornal de Ofertas 2",
          selectors: ['button:has-text("Jornal de Ofertas 2")'],
        },
      ],
      downloadButtons: [],
      pager: [],
      links: [],
      iframes: [],
      headings: [],
      imageCount: 0,
    },
    network: [],
  });
  assert(tabs.flyerSource?.downloadStrategy === "open-each-item", "tabs → open-each-item");
  assert(
    tabs.flyerSource?.itemSelectors?.some((x) => x.includes("Jornal de Ofertas")),
    "generic jornal selector",
  );

  const proven = recipeFromDump({
    gallery: {
      tabButtons: [],
      downloadButtons: [
        {
          text: "Download PDF",
          href: "https://cdn.example/jornal.pdf",
          opensTab: true,
          selectors: ['a:has-text("Download PDF")'],
        },
      ],
      pager: [],
      links: [],
      iframes: [],
      headings: [],
      imageCount: 0,
    },
    network: [],
  });
  assert(proven.status === "ready", "proven download ready");
  assert(proven.flyerSource?.downloadStrategy === "click-download", "proven → click-download");

  const pdfHref = recipeFromDump({
    gallery: {
      tabButtons: [],
      downloadButtons: [],
      pager: [],
      links: ["https://cdn.example/jornal.pdf"],
      iframes: [],
      headings: [],
      imageCount: 0,
    },
    network: [],
  });
  assert(pdfHref.flyerSource?.kind === "pdf-links", "pdf href → pdf-links");
  assert(pdfHref.flyerSource?.downloadStrategy === "direct-url", "pdf href → direct-url");

  const cardsBeatPdf = recipeFromDump({
    gallery: {
      tabButtons: [
        { text: "Ver Encarte", selectors: ['a:has-text("Ver Encarte")'] },
      ],
      downloadButtons: [],
      pager: [],
      links: ["https://cdn.example/jornal.pdf"],
      iframes: [],
      headings: [],
      imageCount: 3,
    },
    network: [],
  });
  assert(
    cardsBeatPdf.flyerSource?.downloadStrategy === "open-each-item",
    "listing cards beat stray pdf href",
  );

  const htmlLink = recipeFromDump({
    gallery: {
      tabButtons: [],
      downloadButtons: [],
      pager: [],
      links: ["https://frangolandia.com/encartes/festival/"],
      iframes: [],
      headings: [],
      imageCount: 0,
    },
    network: [],
  });
  assert(htmlLink.status === "not_found", "html listing href is not a pdf");

  const net = recipeFromDump({
    gallery: undefined,
    network: [
      {
        url: "https://api.example/Flyer/?id=1",
        title: "Super",
        pageUrls: [
          "https://cdn.example/p1.jpg",
          "https://cdn.example/p2.jpg",
        ],
      },
    ],
  });
  assert(net.status === "ready", "network rich → ready");
  assert(net.flyerSource?.kind === "api-json", "network → api-json");
  assert(net.flyerSource?.urlFrom === "network", "network urlFrom");
}

assert(
  hasTextNeedles(['a:has-text("Ver ofertas")', "img.x"])[0] === "Ver ofertas",
  "hasTextNeedles",
);
assert(
  cardItemSelectors(['a:has-text("Abrir catálogo")'])[0] ===
    'a:has-text("Abrir catálogo")',
  "cardItemSelectors keeps dump CTA",
);

assert(
  galleryLooksLikeNavCards({
    tabButtons: [{ text: "Ver Encarte", selectors: ['a:has-text("Ver Encarte")'] }],
    downloadButtons: [],
    links: [],
    iframes: [],
    headings: [],
    pager: [],
    imageCount: 0,
  }),
  "gallery nav cards",
);
const mergedTeach = mergeDetailHarvest({
  listing: {
    listingUrl: "https://frangolandia.com/encartes/",
    itemSelectors: [".elementor-widget-image img"],
    count: 3,
  },
  imageUrls: ["https://cdn.example/flyer-page-1.jpg"],
  pdfUrls: [],
  detailUrl: "https://frangolandia.com/encartes/festival/",
  clickSelectors: ["img.attachment-full"],
});
assert(mergedTeach.downloadStrategy === "open-each-item", "2-pass strategy");
assert(mergedTeach.evidence?.includes("3 cards"), "2-pass count in evidence");
assert(!mergedTeach.networkHints, "sample flyer no filename hints");
assert(mergedTeach.urlFrom === "click-then-network", "sample not href gospel");
assert(mergedTeach.viewerMode === "one-page", "1 sample img → one-page");
assert(
  mergeDetailHarvest({
    listing: {
      listingUrl: "https://frangolandia.com/encartes/",
      itemSelectors: ['a[href*="/encarte/"]'],
      count: 7,
    },
    imageUrls: ["https://cdn.x/p1.jpg", "https://cdn.x/p2.jpg"],
    pdfUrls: ["https://cdn.x/a.pdf"],
    detailUrl: "https://frangolandia.com/encarte/beauty/",
    clickSelectors: [
      "#elementor-lightbox-slideshow-36f1215 .swiper-slide.elementor-lightbox-item",
    ],
  }).itemSelectors?.[0] === 'a[href*="/encarte/"]',
  "lightbox click not listing cards",
);
assert(
  parseFlyerSource({
    kind: "image-grid",
    downloadStrategy: "open-each-item",
    viewerMode: "lazy-scroll",
  })?.viewerMode === "lazy-scroll",
  "viewerMode parse",
);
assert(
  mergeDetailHarvest({
    listing: {
      listingUrl: "https://x.example/",
      itemSelectors: ["a.card"],
      count: 2,
    },
    imageUrls: [
      "https://cdn.example/p1.jpg",
      "https://cdn.example/p2.jpg",
    ],
    pdfUrls: [],
    detailUrl: "https://x.example/v",
  }).viewerMode === "img-stack",
  "2 sample imgs → img-stack",
);
{
  const fakePdfTeach = mergeDetailHarvest({
    listing: {
      listingUrl: "https://frangolandia.com/encartes/",
      itemSelectors: [".elementor-widget-image img"],
      count: 7,
    },
    imageUrls: ["https://cdn.example/capa.webp"],
    pdfUrls: ["https://frangolandia.com/encartes/"],
    detailUrl: "https://frangolandia.com/encartes/",
  });
  assert(!fakePdfTeach.downloadSelectors?.length, "listing /encartes/ is not pdf");
  assert(fakePdfTeach.evidence?.includes("imgs"), "2-pass detalhe imgs");
  assert(
    mergeDetailHarvest({
      listing: {
        listingUrl: "https://x.example/",
        itemSelectors: ["a.card"],
        count: 2,
      },
      imageUrls: ["https://cdn.example/p1.jpg", "https://cdn.example/p2.jpg"],
      pdfUrls: ["https://x.example/dead.pdf"],
      detailUrl: "https://x.example/v",
      hasCanvas: true,
      viewerMode: "pdf",
    }).viewerMode === "img-stack",
    "img/canvas beats pdf hint",
  );
}

{
  const taught = buildTeachSteps({
    startUrl: "https://frangolandia.com/encartes/",
    actions: [
      {
        kind: "click",
        selectors: ["#uf"],
        description: "CE",
      },
      {
        kind: "click",
        selectors: ['a:has-text("Ver Encarte")'],
        description: "Ver Encarte",
      },
    ],
    flyerSource: {
      kind: "image-grid",
      downloadStrategy: "open-each-item",
      urlFrom: "click-then-network",
    },
  });
  assert(taught[0]?.type === "navigate", "teach starts navigate");
  assert(
    taught.some((s) => s.type === "discover-flyer"),
    "teach ends discover",
  );
  assert(
    !taught.some(
      (s) =>
        s.type === "click" && /ver encarte/i.test(s.config.description ?? ""),
    ),
    "teach drops Ver Encarte click",
  );
  const patched = applyFlyerSource(taught, {
    kind: "image-grid",
    downloadStrategy: "open-each-item",
    urlFrom: "href",
  });
  assert(
    patched.find((s) => s.type === "discover-flyer")?.config.flyerSource
      ?.urlFrom === "href",
    "applyFlyerSource",
  );
}

{
  const noisy = buildTeachSteps({
    startUrl: "https://cometasupermercados.com.br/encartes",
    actions: [
      {
        kind: "click",
        selectors: ["svg.lucide.lucide-x"],
        description: "path",
      },
      {
        kind: "click",
        selectors: ["canvas.max-w-full.max-h-[80vh]"],
        description: "canvas",
      },
      {
        kind: "click",
        selectors: ["button.aspect-\\[2\\/3\\]"],
        description: "capa",
      },
    ],
    flyerSource: {
      kind: "image-grid",
      downloadStrategy: "open-each-item",
      urlFrom: "click-then-network",
    },
  });
  assert(
    !noisy.some((s) =>
      s.type === "click" &&
      /lucide|canvas|path/i.test(
        `${s.config.selector ?? ""} ${s.config.description ?? ""}`,
      ),
    ),
    "teach drops lucide-x/canvas/path",
  );
  assert(
    noisy.some((s) => s.type === "click" && /aspect/i.test(s.config.selector ?? "")),
    "teach keeps capa click",
  );
  assert(isViewerNoise("svg.lucide-x"), "noise lucide");
  assert(isViewerNoise("canvas.max-h-[80vh]"), "noise canvas");
  assert(
    isViewerNoise('div:has-text("Costume Saudável | 26/08 a 06/09 ×")'),
    "noise modal close ×",
  );
  assert(
    isViewerNoise(
      "#elementor-lightbox-slideshow-36f1215 .swiper-slide.elementor-lightbox-item",
    ),
    "noise elementor lightbox slide",
  );
}

{
  const canvasTeach = mergeDetailHarvest({
    listing: {
      listingUrl: "https://cometasupermercados.com.br/encartes",
      itemSelectors: ["button.aspect-\\[2\\/3\\]"],
      count: 12,
    },
    imageUrls: [],
    pdfUrls: ["https://cometasupermercados.com.br/encartes/morto.pdf"],
    detailUrl: "https://cometasupermercados.com.br/encartes",
    clickSelectors: ["svg.lucide.lucide-x", "canvas.max-w-full"],
    hasCanvas: true,
  });
  assert(!canvasTeach.downloadSelectors?.length, "canvas detalhe not dead pdf");
  assert(canvasTeach.evidence?.includes("canvas"), "2-pass detalhe canvas");
  assert(
    !canvasTeach.itemSelectors?.some((s) => /lucide|canvas/i.test(s)),
    "itemSelectors drop viewer noise",
  );
}

assert(SCOPE_NOT_FOUND.startsWith("SCOPE_NOT_FOUND"), "scope err const");

{
  const galleryOnly = recipeFromDump({
    gallery: {
      tabButtons: [
        { text: "Ver Encarte", selectors: ['a:has-text("Ver Encarte")'] },
      ],
      downloadButtons: [],
      pager: [],
      links: [],
      iframes: [],
      headings: [],
      imageCount: 0,
    },
    network: [],
  });
  assert(
    galleryOnly.flyerSource?.downloadStrategy === "open-each-item",
    "gallery tab CTA forces loop",
  );
}

const dirty = sanitizeItemSelectors(
  [
    '[role="tab"]',
    "[data-oferta-index]",
    'button:has-text("Jornal de Ofertas")',
    'text="Jornal de Ofertas 1"',
    "button.selecionado",
    '[data-oferta-index="\\33 1"]',
    'button:has-text("Jornal de Ofertas 1")',
    'button:has-text("Jornal de Ofertas 2")',
    'button:has-text("Jornal de Ofertas 3")',
  ],
  { kind: "tabs" },
);
assert(dirty?.length && dirty.length <= 6, "sanitize cap");
assert(!dirty?.some((s) => /Ofertas 1|Ofertas 2|selecionado|text=/.test(s)), "no instance tabs");
assert(
  dirty?.some((s) => s.includes('has-text("Jornal de Ofertas")')),
  "kept generic jornal",
);
assert(
  dirty?.includes('[role="tab"]') && dirty?.includes("[data-oferta-index]"),
  "tabs keep present defaults",
);
assert(
  !sanitizeItemSelectors(["button[data-oferta-index]"], { kind: "tabs" })?.includes(
    '[role="tab"]',
  ),
  "oferta tabs no role=tab inject",
);
const gbarCta = sanitizeItemSelectors(
  [
    '[aria-label="Ver encarte Folheto Eletro e Lazer - De 18 a 30/08 (CE)"]',
    '[aria-label="Ver\\ encarte\\ Folheto\\ Eletro"]',
    'a:has-text("Ver encarte Folheto Eletro")',
  ],
  { kind: "image-grid" },
);
assert(
  gbarCta?.includes('[aria-label^="Ver encarte"]'),
  `gbar aria prefix ${gbarCta?.join(",")}`,
);
assert(
  gbarCta?.some((s) => s.includes('has-text("Ver encarte")')),
  "gbar has-text prefix",
);
assert(
  !gbarCta?.some((s) => /Eletro|30\/08/.test(s)),
  "gbar no unique flyer name",
);
const pdfSels = sanitizeItemSelectors(
  [
    '[role="tab"]',
    "[data-oferta-index]",
    'a:has-text("Folhetos")',
    'button:has-text("Mostrar mais folhetos")',
  ],
  { kind: "pdf-links" },
);
assert(!pdfSels?.includes('[role="tab"]'), "pdf-links drops role=tab");
assert(!pdfSels?.includes("[data-oferta-index]"), "pdf-links drops oferta-index");
assert(pdfSels?.some((s) => s.includes("Folhetos")), "keeps folhetos link");
assert(isAppDownloadCta("Baixe nosso novo app e ganhe descontos"), "app cta");
assert(!isFlyerDownloadButton("Baixe o app"), "app not flyer dl");
assert(isFlyerDownloadButton("Baixar página"), "baixar página ok");
assert(isFlyerDownloadButton("Download", "https://x/a.pdf"), "pdf href ok");
assert(
  hasProvenFileDownload([
    { text: "Baixar PDF", opensTab: true, selectors: ['a:has-text("Baixar PDF")'] },
  ]),
  "new-tab Baixar proven",
);
assert(
  hasProvenFileDownload([
    { text: "Download", href: "https://x/encarte.jpg", selectors: ["a"] },
  ]),
  "image href proven",
);
assert(
  !hasProvenFileDownload([{ text: "Baixar", selectors: ['button:has-text("Baixar")'] }]),
  "text-only Baixar not proven file",
);
assert(
  hasProvenFileDownload([
    { text: "Baixar", href: "https://x/a.pdf", selectors: ["a[href*='.pdf']"] },
  ]),
  "pdf href proven",
);
assert(
  !hasProvenFileDownload([
    { text: "Download", selectors: ["a[download]"] },
  ]),
  "a[download] not proven file (viewer liar)",
);
{
  const liar = recipeFromDump({
    gallery: {
      tabButtons: [
        { text: "Jornal 1", selectors: ['[role="tab"]'] },
        { text: "Jornal 2", selectors: ['[role="tab"]'] },
      ],
      downloadButtons: [
        { text: "Baixar", selectors: ['button:has-text("Baixar")'] },
      ],
      pager: [],
      links: [],
      iframes: [],
      headings: [],
      imageCount: 0,
    },
    network: [],
  });
  assert(liar.flyerSource?.downloadStrategy === "open-each-item", "no force click-download");
  const upgraded = recipeFromDump({
    gallery: {
      tabButtons: [
        { text: "Jornal 1", selectors: ['[role="tab"]'] },
        { text: "Jornal 2", selectors: ['[role="tab"]'] },
      ],
      downloadButtons: [
        {
          text: "Baixar",
          href: "https://cdn.example/jornal.pdf",
          selectors: ["a[href*='.pdf']"],
        },
      ],
      pager: [],
      links: [],
      iframes: [],
      headings: [],
      imageCount: 0,
    },
    network: [],
  });
  assert(upgraded.flyerSource?.downloadStrategy === "open-each-item", "listing beats proven PDF");
}
assert(
  parseFlyerSource({
    kind: "tabs",
    downloadStrategy: "click-download",
    itemSelectors: [
      'button:has-text("Jornal de Ofertas 1")',
      '[data-oferta-index="31"]',
    ],
    downloadSelectors: ["a[download]", 'a:has-text("Baixar página")'],
  })?.itemSelectors?.every((s) => !/\d+"\]/.test(s) && !/Ofertas \d/.test(s)),
  "parse sanitizes items",
);
assert(
  !parseFlyerSource({
    kind: "pdf-links",
    downloadStrategy: "direct-url",
    itemSelectors: ['[role="tab"]', 'a:has-text("Folhetos")'],
    downloadSelectors: ['a:has-text("Baixe nosso novo app")'],
  })?.downloadSelectors?.length,
  "app download selectors dropped",
);
assert(
  parseFlyerSource({
    kind: "pdf-links",
    downloadStrategy: "direct-url",
    itemSelectors: ['[role="tab"]', 'a:has-text("Folhetos")'],
  })?.itemSelectors?.every((s) => !/role.?=.?tab|data-oferta-index/.test(s)),
  "pdf-links strips tab defaults",
);

const packed = packTeachPayload({
  startUrl: "https://loja.example",
  currentUrl: "https://loja.example/encartes",
  networkFlyers: [],
  actions: [
    {
      kind: "click",
      description: "cookie",
      selectors: ["#lgpd"],
      snapshot: { html: "x".repeat(20_000) },
    },
    {
      kind: "click",
      description: "Abrir encartes",
      semantic: "OPEN_FLYERS",
      selectors: ["#encartes"],
      snapshot: { html: "<div>encartes</div>" },
    },
  ],
  gallery: {
    downloadButtons: [
      { text: "Baixar", selectors: ['button:has-text("Baixar")'] },
    ],
    tabButtons: [{ text: "Jornal 1", selectors: ['[role="tab"]'] }],
    pager: [],
    links: ["https://loja.example/flyer.pdf"],
    iframes: [],
    headings: ["Encartes"],
    imageCount: 2,
  },
});
assert(packed.gallery?.downloadButtons[0]?.text === "Baixar", "pack keeps downloads");
assert(packed.gallery?.tabButtons.length === 1, "pack keeps tabs");
assert(packed.gallery?.links.length === 1, "pack keeps pdf links");
assert(!packed.actions[0]?.html, "cookie html dropped");
assert(packed.actions[1]?.html === "<div>encartes</div>", "flyer html kept");

console.log("flyers selfcheck ok", offers.length, "rule offers");
