import { enrichBrand, getBrandDictionary, resetBrandDictionary } from "./enrichment/brand/index.js";
import { normalizeProduct } from "./scrapers/normalizers/product.js";
import { validateRaw } from "./scrapers/parsers/validate.js";
import type { RawProduct } from "./scrapers/types/index.js";
import { runValidation } from "./validation/index.js";

const raw: RawProduct = {
  name: "ARROZ TIO JOAO BRANCO 5KG",
  price: 10.99,
  source: "demo",
  collectedAt: new Date().toISOString(),
};

console.assert(validateRaw(raw), "validate");
const n = normalizeProduct(raw);
console.assert(n.normalizedName === "arroz tio joao branco 5kg", n.normalizedName);
console.assert(n.quantity === 5 && n.unit === "kg", `${n.quantity} ${n.unit}`);

const ok = runValidation({
  name: n.name,
  brand: "Tio Joao",
  price: n.price,
  quantity: n.quantity,
  unit: n.unit,
  url: "https://example.com/p/1",
  imageUrl: "https://example.com/i.jpg",
  externalId: "1",
  supermarketId: "sm",
});
console.assert(ok.status === "validated", ok.status);
console.assert(ok.score === 100, String(ok.score));

const bad = runValidation({
  name: "X",
  price: 0,
  supermarketId: "sm",
});
console.assert(bad.status === "invalid", bad.status);
console.assert(bad.issues.some((i) => i.code === "INVALID_PRICE"), "price issue");

const promo = runValidation({
  name: "Arroz Camil 5kg",
  brand: "Camil",
  price: 30,
  originalPrice: 25,
  quantity: 5,
  unit: "kg",
  supermarketId: "sm",
  url: "https://example.com/p",
  imageUrl: "https://example.com/i.jpg",
  externalId: "2",
});
console.assert(promo.status === "suspicious", promo.status);

resetBrandDictionary();
const dict = getBrandDictionary();
const camil = enrichBrand(
  normalizeProduct({
    name: "Arroz Camil Tipo 1 5kg",
    price: 20,
    source: "sao-luiz",
    collectedAt: new Date().toISOString(),
  }),
  dict,
);
console.assert(camil.product.brand === "Camil", camil.product.brand);
console.assert(camil.extraction.source === "dictionary", camil.extraction.source);

const scraperKeeps = enrichBrand(
  normalizeProduct({
    name: "Arroz Camil Tipo 1 5kg",
    brand: "Outra",
    price: 20,
    source: "pao-de-acucar",
    collectedAt: new Date().toISOString(),
  }),
  dict,
);
console.assert(scraperKeeps.product.brand === "Outra", scraperKeeps.product.brand);
console.assert(scraperKeeps.extraction.source === "scraper", scraperKeeps.extraction.source);

const tio = enrichBrand(
  normalizeProduct({
    name: "ARROZ TIO JOÃO PARBOILIZADO 1KG",
    price: 8,
    source: "sao-luiz",
    collectedAt: new Date().toISOString(),
  }),
  dict,
);
console.assert(tio.product.brand === "Tio João", tio.product.brand);

console.log("selfcheck ok");
