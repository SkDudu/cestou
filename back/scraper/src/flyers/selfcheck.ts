/**
 * Tiny self-check for validity parsing + offer parser.
 * Run: npx tsc && node dist/flyers/selfcheck.js
 */
import { parseValidityFromTitle } from "./sources/sao-luiz/scraper.js";
import { parseOffersFromText } from "./extraction/offer-parser.js";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const v = parseValidityFromTitle(
  "Encarte São Luiz | 12 a 23/08",
  new Date(2026, 7, 12),
);
assert(v.validFrom, "validFrom");
assert(v.validUntil, "validUntil");
assert(
  new Date(v.validFrom!).getDate() === 12 &&
    new Date(v.validUntil!).getDate() === 23,
  "days",
);

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

console.log("flyers selfcheck ok", offers.length, "offers");
