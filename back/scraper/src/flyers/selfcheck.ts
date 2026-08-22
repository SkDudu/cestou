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
import { parseAnalyzedFlow, collapseFlyerTabClicks } from "./extraction/mimo/analyze-flow.js";
import { guardOffers } from "./extraction/offer-guards.js";
import {
  collectFlyerDocsFromJson,
  flyerKey,
  isFlyerHref,
  buildCandidates,
} from "./runner/flow-pipeline.js";
import {
  hasProvenFileDownload,
  isAppDownloadCta,
  isFlyerDownloadButton,
  mergeDownloadHints,
  parseFlyerSource,
  sanitizeItemSelectors,
} from "./runner/flyer-discover.js";
import { packTeachPayload } from "./session/click-snapshot.js";
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

const analyzed = parseAnalyzedFlow(
  JSON.stringify({
    version: 1,
    startUrl: "https://loja.example/encartes",
    notes: "ok",
    steps: [
      { type: "navigate", config: { url: "https://loja.example/encartes" } },
      { type: "click", config: { selectors: ["button:has-text(\"Continuar\")"] } },
      { type: "download-flyers", config: {} },
      { type: "extract-offers", config: {} },
    ],
  }),
  "https://fallback.example",
);
assert(analyzed.steps.every((s) => s.type !== "download-flyers"), "no download in teach");
assert(analyzed.steps.some((s) => s.type === "discover-flyer"), "discover appended");
assert(analyzed.steps[0]?.type === "navigate", "navigate first");
const disc = analyzed.steps.find((s) => s.type === "discover-flyer");
assert(disc?.config.flyerSource?.kind === "pdf-links", "default flyerSource");

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
    kind: "tabs",
    downloadStrategy: "click-download",
    downloadSelectors: ['button:has-text("Baixar")'],
  })?.downloadStrategy === "click-download",
  "click-download parse",
);

const collapsed = collapseFlyerTabClicks([
  {
    order: 0,
    type: "click",
    config: {
      selector: 'button:has-text("Jornal de Ofertas 1")',
      value: "Jornal de Ofertas 1",
      description: "Select first flyer tab",
    },
  },
  {
    order: 1,
    type: "discover-flyer",
    config: { scope: "page", duration: 3000 },
  },
]);
assert(!collapsed.some((s) => s.type === "click"), "tab click removed");
assert(
  collapsed.find((s) => s.type === "discover-flyer")?.config.flyerSource
    ?.downloadStrategy === "open-each-item",
  "tabs → open-each-item",
);
assert(
  collapsed
    .find((s) => s.type === "discover-flyer")
    ?.config.flyerSource?.itemSelectors?.some((x) =>
      x.includes("Jornal de Ofertas"),
    ),
  "generic jornal selector",
);

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
  "tabs kind forces defaults",
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
  hasProvenFileDownload([
    { text: "Download", selectors: ["a[download]"] },
  ]),
  "a[download] proven",
);
{
  const hinted = mergeDownloadHints(
    {
      kind: "tabs",
      downloadStrategy: "open-each-item",
      urlFrom: "img.src",
      itemSelectors: ['[role="tab"]'],
    },
    [{ text: "Baixar", selectors: ['button:has-text("Baixar")'] }],
  );
  assert(hinted?.downloadStrategy === "open-each-item", "no force click-download");
  assert(hinted?.downloadSelectors?.length, "keeps baixar as hint");
  const upgraded = mergeDownloadHints(
    {
      kind: "tabs",
      downloadStrategy: "open-each-item",
      urlFrom: "img.src",
    },
    [
      {
        text: "Baixar",
        href: "https://cdn.example/jornal.pdf",
        selectors: ["a[href*='.pdf']"],
      },
    ],
  );
  assert(upgraded?.downloadStrategy === "click-download", "proven PDF upgrades");
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
