import { describe, expect, it } from "vitest";
import {
  autoValidateOffer,
  buildMatchKey,
  inferCommodityCategory,
  isPseudoBrand,
  normalizeText,
  parseQuantity,
  resolveOfferBrand,
  slugify,
  titleCase,
} from "../../scraper/src/flyers/extraction/catalog-normalization.js";

describe("catalog normalization helpers", () => {
  it("builds stable matchKey across casing", () => {
    const a = buildMatchKey("Arroz Camil Tipo 1 5kg", "Camil", "5", "kg");
    const b = buildMatchKey("ARROZ CAMIL TIPO 1 5KG", "CAMIL", "5", "KG");
    expect(a).toBe(b);
    expect(a).toContain("arroz camil tipo 1 5kg");
    expect(a).toContain("camil");
    expect(a).toContain("kg");
  });

  it("parses quantity and unit", () => {
    expect(parseQuantity("5", "kg")).toEqual({ quantityValue: 5, unitNormalized: "kg" });
    expect(parseQuantity("1,5", "lt")).toEqual({ quantityValue: 1.5, unitNormalized: "l" });
  });

  it("slugifies and title-cases", () => {
    expect(slugify("Arroz Camil 5kg")).toBe("arroz-camil-5kg");
    expect(titleCase("camil")).toBe("Camil");
    expect(normalizeText("Açúcar")).toBe("acucar");
  });

  it("auto-validates by confidence and price", () => {
    expect(autoValidateOffer({ name: "Arroz Camil 5kg", price: 24.9, extractionConfidence: 0.9 })).toBe("VALIDATED");
    expect(autoValidateOffer({ name: "Arroz", price: 0, extractionConfidence: 0.9 })).toBe("REJECTED");
    expect(autoValidateOffer({ name: "Arroz Camil 5kg", price: 9000, extractionConfidence: 0.9 })).toBe("SUSPICIOUS");
  });

  it("classifies commodities and strips fake brands", () => {
    expect(inferCommodityCategory("Banana Prata")).toBe("hortifruti");
    expect(inferCommodityCategory("Pitaia")).toBe("hortifruti");
    expect(inferCommodityCategory("Picanha kg")).toBe("carnes");
    expect(inferCommodityCategory("Coxão Mole")).toBe("carnes");
    expect(inferCommodityCategory("Fraldinha")).toBe("carnes");
    expect(inferCommodityCategory("Arroz Camil 5kg")).toBe("mercearia");
    expect(inferCommodityCategory("Leite Integral 1L")).toBe("laticinios");
    expect(inferCommodityCategory("Detergente Ype")).toBe("limpeza");
    expect(isPseudoBrand("Frutas")).toBe(true);
    expect(isPseudoBrand("Camil")).toBe(false);
    expect(resolveOfferBrand("Frutas")).toBeUndefined();
    expect(resolveOfferBrand("camil")).toBe("Camil");
  });
});

describe("product category taxonomy", () => {
  it("parses whitelist and aliases acougue → carnes", async () => {
    const { parseProductCategory } = await import(
      "../../scraper/src/config/categories.js"
    );
    expect(parseProductCategory("hortifruti")).toBe("hortifruti");
    expect(parseProductCategory("carnes")).toBe("carnes");
    expect(parseProductCategory("acougue")).toBe("carnes");
    expect(parseProductCategory("mercearia")).toBe("mercearia");
    expect(parseProductCategory("higiene_bucal")).toBeUndefined();
    expect(parseProductCategory("nope")).toBeUndefined();
  });
});
