/**
 * Fase 2 — normalize offers, ensure brand, match/create CanonicalProduct, priceHistory, auto-validate.
 * Port of former Convex `normalization.processFlyer`.
 */

import {
  parseProductCategory,
  type ProductCategoryId,
} from "../../config/categories.js";

type PrismaLike = {
  offer: {
    findMany(args: unknown): Promise<OfferRow[]>;
    update(args: unknown): Promise<unknown>;
  };
  brand: {
    findMany(args?: unknown): Promise<BrandRow[]>;
    findUnique(args: unknown): Promise<BrandRow | null>;
    create(args: unknown): Promise<BrandRow>;
  };
  canonicalProduct: {
    findUnique(args: unknown): Promise<CanonicalRow | null>;
    create(args: unknown): Promise<CanonicalRow>;
    update(args: unknown): Promise<CanonicalRow>;
  };
  priceHistory: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<unknown>;
  };
};

type OfferRow = {
  id: string;
  flyerId: string;
  supermarketId: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  unit: string | null;
  price: { toString(): string } | number | string;
  originalPrice: { toString(): string } | number | string | null;
  extractionConfidence: number | null;
  eligibility: string | null;
  conditions: unknown;
  brandId: string | null;
  normalizedName: string | null;
  validationStatus: string;
  validFrom: Date | null;
  validUntil: Date | null;
  rawText: string | null;
};

type BrandRow = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
};

type CanonicalRow = {
  id: string;
  matchKey: string;
  slug: string;
  category?: string | null;
};

/** @deprecated Prefer ProductCategoryId — alias kept for older call sites. */
export type CommodityCategory = ProductCategoryId;

/** Operator marked "no brand applies" — keeps offer out of missing-brand queue. */
export const NO_BRAND_LABEL = "(sem marca)";

// ponytail: keyword heuristic fallback when MiMo omits category
const HORTIFRUTI_RE =
  /\b(banana|maca|laranja|limao|mamao|abacaxi|melao|melancia|uva|morango|kiwi|pera|manga|goiaba|maracuja|abacate|coco|caju|tangerina|mexerica|bergamota|caqui|figo|ameixa|pessego|nectarina|tomate|batata|cebola|alho|cenoura|alface|couve|brocolis|repolho|abobrinha|berinjela|pimentao|pepino|chuchu|quiabo|maxixe|inhame|aipim|mandioca|beterraba|rabanete|nabo|espinafre|rucula|agriao|salsa|cebolinha|coentro|vagem|ervilha|cogumelo|hortela|hortifruti|fruta|frutas|verdura|verduras|legume|legumes|milho verde|couve flor|repolho roxo|pitaia|dragon fruit|nectarina|ameixa|physalis)\b/;
const CARNES_RE =
  /\b(carne|carnes|bife|bifes|alcatra|picanha|costela|costelas|contrafile|file|filezinho|file mignon|frango|galinha|peito|coxa|coxao|sobrecoxa|asa|peru|bacon|linguica|salsicha|hamburguer|moida|patinho|acem|maminha|cupim|peixe|salmao|tilapia|camarao|lombo|pernil|acougue|bovina|suina|aves|fraldinha|lagarto|musculo|paleta|ancho|chorizo|panceta|toucinho|rabada|ossobuco|figado|figadinho|coracao|miudos|iscas|bisteca|costelinha|banha|carneiro|cordeiro|caprino|bucho|dobradinha|kibe|quibe|almondega|nugget|empanado|sashimi|atum|bacalhau|sardinha|merluza|pescada|polvo|lula|mexilhao|ostras?)\b/;
const FRIOS_RE =
  /\b(presunto|mortadela|salame|apresuntado|blanquet|peito de peru|coppa|pastrami|roast beef)\b/;
const LATICINIOS_RE =
  /\b(leite|iogurte|queijo|manteiga|margarina|requeijao|cream cheese|nata|coalhada|mussarela|muçarela|prato|coalho|ricota|cottage|creme de leite|leite condensado|leite em po)\b/;
const BEBIDAS_RE =
  /\b(refrigerante|suco|agua mineral|agua com gas|cerveja|vinho|vodka|whisky|whiskey|energetico|isotonico|cha mate|cha gelado|refrigerante|coca cola|guarana|sprite|fanta)\b/;
const CONGELADOS_RE =
  /\b(congelad|sorvete|acai|lasanha|pizza|hamburguer congel)\b/;
const PADARIA_RE =
  /\b(pao|paozinho|torrada|bolo|croissant|baguete|ciabatta|sonho|rosca|bisnaga)\b/;
const DOCES_RE =
  /\b(chocolate|bombom|bala|balas|chiclete|doce de leite|goiabada|gelatina|pudim|wafer|bis|snickers|kit kat|prestigio)\b/;
const LIMPEZA_RE =
  /\b(detergente|sabao liquido|sabao em po|amaciante|agua sanitaria|desinfetante|multiuso|limpador|esponja|palha de aco|veja|ype|arieli)\b/;
const HIGIENE_RE =
  /\b(shampoo|condicionador|sabonete|pasta de dente|creme dental|desodorante|papel higienico|absorvente|fio dental|enxaguante|perfume|hidratante|protetor solar|algodao)\b/;
const BEBES_RE =
  /\b(fralda|lenco umedecido|papinha|formula infantil|mamadeira|chupeta)\b/;
const PET_RE =
  /\b(racao|petisco|areia para gato|areia sanitaria|coleira|ossinho)\b/;
const DESCARTAVEIS_RE =
  /\b(descartavel|guardanapo|filme pvc|papel aluminio|saco de lixo|copo plastico|prato plastico)\b/;
const CHURRASCO_RE =
  /\b(carvao|espeto|acendedor|tabua de carne)\b/;
const INSETICIDAS_RE =
  /\b(inseticida|repelente|matador de inseto|baygon)\b/;
const FARMACIA_RE =
  /\b(remedio|vitamina|dipirona|paracetamol|dorflex|analgesico|antisseptico|band.?aid)\b/;
const MERCEARIA_RE =
  /\b(arroz|feijao|macarrao|massa|farinha|acucar|oleo|azeite|tempero|molho|cafe|cha|biscoito|bolacha|achocolatado|aveia|granola|milho|ervilha|extrato de tomate|seleta|catchup|ketchup|mostarda|maionese|vinagre|sal |salgadinho|batata palha)\b/;
const UTILIDADES_RE =
  /\b(panela|utensilio|copo de vidro|talher|garfo|faca|colher|tigela|pote hermetico)\b/;
const PAPELARIA_RE =
  /\b(caderno|caneta|lapis|borracha|cola escolar|sulfite)\b/;
const PSEUDO_BRAND_RE =
  /^(frutas?|verduras?|legumes?|hortifruti|carnes?|acougue|peixaria|padaria|in natura|sem marca)$/;

const UNIT_MAP: Record<string, string> = {
  lt: "l",
  litro: "l",
  litros: "l",
  und: "un",
  unid: "un",
  unidade: "un",
  unidades: "un",
  kilo: "kg",
  kilos: "kg",
  kgs: "kg",
};
const VALID_UNITS = new Set(["kg", "g", "l", "ml", "un", "cx", "pct", "pack", "fd"]);

const PRICE_MIN = 0.1;
const PRICE_MAX = 5000;
const HIGH_CONFIDENCE = 0.8;
const LOW_CONFIDENCE = 0.5;
const MIN_NAME_LENGTH = 4;

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[\s/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function normalizeUnit(unit: string): string | undefined {
  const u = unit.toLowerCase().replace(/\.$/, "").trim();
  const mapped = UNIT_MAP[u] ?? u;
  return VALID_UNITS.has(mapped) ? mapped : undefined;
}

export function parseQuantity(
  qty: string | null | undefined,
  unit: string | null | undefined,
): { quantityValue: number | undefined; unitNormalized: string | undefined } {
  if (qty) {
    const num = Number(qty.replace(",", "."));
    return {
      quantityValue: Number.isFinite(num) ? num : undefined,
      unitNormalized: unit ? normalizeUnit(unit) : undefined,
    };
  }
  return { quantityValue: undefined, unitNormalized: unit ? normalizeUnit(unit) : undefined };
}

export function buildMatchKey(
  name: string,
  brand: string | undefined,
  qty: string | null | undefined,
  unit: string | null | undefined,
): string {
  const parts = [normalizeText(name)];
  if (brand) parts.push(normalizeText(brand));
  if (qty) parts.push(qty.replace(",", "."));
  if (unit) {
    const u = normalizeUnit(unit);
    if (u) parts.push(u);
  }
  return parts.join("|");
}

export function slugify(text: string): string {
  return normalizeText(text).replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function isPseudoBrand(brand: string | null | undefined): boolean {
  if (!brand?.trim()) return false;
  return PSEUDO_BRAND_RE.test(normalizeText(brand));
}

export function isIntentionalNoBrand(brand: string | null | undefined): boolean {
  if (!brand?.trim()) return false;
  const n = normalizeText(brand);
  return n === "sem marca" || brand.trim() === NO_BRAND_LABEL;
}

export function isCommodityCategory(category: string | null | undefined): boolean {
  const parsed = parseProductCategory(category);
  return parsed === "hortifruti" || parsed === "carnes";
}

export function inferCommodityCategory(
  name: string,
  brand?: string | null,
): ProductCategoryId | null {
  const hay = normalizeText([name, brand ?? ""].filter(Boolean).join(" "));
  if (!hay) return null;
  // more specific first
  if (BEBES_RE.test(hay)) return "bebes";
  if (PET_RE.test(hay)) return "pet";
  if (FARMACIA_RE.test(hay)) return "farmacia";
  if (INSETICIDAS_RE.test(hay)) return "inseticidas";
  if (CHURRASCO_RE.test(hay)) return "churrasco";
  if (FRIOS_RE.test(hay)) return "frios";
  if (HORTIFRUTI_RE.test(hay)) return "hortifruti";
  if (CARNES_RE.test(hay)) return "carnes";
  if (LATICINIOS_RE.test(hay)) return "laticinios";
  if (BEBIDAS_RE.test(hay)) return "bebidas";
  if (CONGELADOS_RE.test(hay)) return "congelados";
  if (PADARIA_RE.test(hay)) return "padaria";
  if (DOCES_RE.test(hay)) return "doces";
  if (LIMPEZA_RE.test(hay)) return "limpeza";
  if (HIGIENE_RE.test(hay)) return "higiene";
  if (DESCARTAVEIS_RE.test(hay)) return "descartaveis";
  if (PAPELARIA_RE.test(hay)) return "papelaria";
  if (UTILIDADES_RE.test(hay)) return "utilidades";
  if (MERCEARIA_RE.test(hay)) return "mercearia";
  return null;
}

export function resolveOfferBrand(
  brand: string | null | undefined,
): string | undefined {
  if (!brand?.trim() || isPseudoBrand(brand) || isIntentionalNoBrand(brand)) {
    return undefined;
  }
  return titleCase(brand.trim());
}

function categoryFromRawText(rawText: string | null | undefined): ProductCategoryId | null {
  if (!rawText) return null;
  try {
    const parsed = JSON.parse(rawText) as { category?: unknown };
    return parseProductCategory(parsed.category) ?? null;
  } catch {
    /* ignore */
  }
  return null;
}

function toNumber(value: { toString(): string } | number | string | null | undefined): number {
  if (value == null) return NaN;
  return Number(typeof value === "object" ? value.toString() : value);
}

function firstConditionName(conditions: unknown): string | undefined {
  if (!Array.isArray(conditions) || !conditions.length) return undefined;
  const first = conditions[0];
  if (first && typeof first === "object" && "name" in first) {
    const name = (first as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return undefined;
}

function isMemberEligibility(eligibility: string | null): boolean {
  return Boolean(eligibility) && eligibility !== "ALL_CUSTOMERS";
}

type AutoResult = "VALIDATED" | "SUSPICIOUS" | "REJECTED";

export function autoValidateOffer(offer: {
  name: string;
  price: number;
  extractionConfidence?: number | null;
  normalizedName?: string | null;
}): AutoResult {
  const name = offer.normalizedName ?? offer.name;
  const conf = offer.extractionConfidence ?? 0.7;
  if (name.length < MIN_NAME_LENGTH || offer.price <= 0) return "REJECTED";
  if (conf < LOW_CONFIDENCE) return "REJECTED";
  const priceOk = offer.price >= PRICE_MIN && offer.price <= PRICE_MAX;
  if (conf >= HIGH_CONFIDENCE && priceOk) return "VALIDATED";
  if (!priceOk) return "SUSPICIOUS";
  if (conf >= LOW_CONFIDENCE) return "VALIDATED";
  return "SUSPICIOUS";
}

async function ensureBrand(
  prisma: PrismaLike,
  cache: Map<string, string>,
  brands: BrandRow[],
  name: string,
): Promise<string> {
  const slug = slugify(name);
  const cached = cache.get(slug);
  if (cached) return cached;

  const bySlug = brands.find((b) => b.slug === slug);
  if (bySlug) {
    cache.set(slug, bySlug.id);
    return bySlug.id;
  }

  const norm = normalizeText(name);
  for (const b of brands) {
    if ((b.aliases ?? []).some((a) => normalizeText(a) === norm)) {
      cache.set(slug, b.id);
      return b.id;
    }
  }

  const existing = await prisma.brand.findUnique({ where: { slug } });
  if (existing) {
    brands.push(existing);
    cache.set(slug, existing.id);
    return existing.id;
  }

  const created = await prisma.brand.create({
    data: { name, slug, aliases: [] },
  });
  brands.push(created);
  cache.set(slug, created.id);
  return created.id;
}

async function uniqueCanonicalSlug(prisma: PrismaLike, base: string): Promise<string> {
  let slug = base.slice(0, 180) || "produto";
  for (let n = 0; ; n += 1) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const hit = await prisma.canonicalProduct.findUnique({ where: { slug: candidate } });
    if (!hit) return candidate;
  }
}

async function ensureCanonical(
  prisma: PrismaLike,
  args: {
    matchKey: string;
    canonicalName: string;
    brandId: string | null | undefined;
    quantity: string | null;
    unit: string | null | undefined;
    category: ProductCategoryId | null;
    slugSeed: string;
  },
): Promise<{ row: CanonicalRow; created: boolean }> {
  const existing = await prisma.canonicalProduct.findUnique({ where: { matchKey: args.matchKey } });
  if (existing) {
    const needsFill = Boolean(args.category && !existing.category);
    const needsMigrate = existing.category === "acougue";
    if (needsFill && args.category) {
      const updated = await prisma.canonicalProduct.update({
        where: { id: existing.id },
        data: { category: args.category },
      });
      return { row: updated, created: false };
    }
    if (needsMigrate) {
      const updated = await prisma.canonicalProduct.update({
        where: { id: existing.id },
        data: { category: args.category ?? "carnes" },
      });
      return { row: updated, created: false };
    }
    return { row: existing, created: false };
  }

  const slug = await uniqueCanonicalSlug(prisma, slugify(args.slugSeed));
  try {
    const created = await prisma.canonicalProduct.create({
      data: {
        canonicalName: args.canonicalName,
        slug,
        brandId: args.brandId ?? null,
        quantity: args.quantity,
        unit: args.unit ?? null,
        category: args.category,
        matchKey: args.matchKey,
      },
    });
    return { row: created, created: true };
  } catch {
    const raced = await prisma.canonicalProduct.findUnique({ where: { matchKey: args.matchKey } });
    if (raced) return { row: raced, created: false };
    throw new Error(`failed to create canonical for matchKey=${args.matchKey}`);
  }
}

export async function processFlyerNormalization(
  prisma: PrismaLike,
  flyerId: string,
): Promise<{
  normalized: number;
  resolved: number;
  created: number;
  autoValidation: { validated: number; suspicious: number; rejected: number; total: number };
}> {
  const offers = await prisma.offer.findMany({ where: { flyerId } });
  const brands = await prisma.brand.findMany();
  const brandCache = new Map<string, string>();

  let normalized = 0;
  let resolved = 0;
  let created = 0;
  let validated = 0;
  let suspicious = 0;
  let rejected = 0;

  for (const offer of offers) {
    const normalizedName = normalizeText(offer.name);
    const intentionalNoBrand = isIntentionalNoBrand(offer.brand);
    const normalizedBrand = resolveOfferBrand(offer.brand);
    const category =
      categoryFromRawText(offer.rawText) ??
      inferCommodityCategory(offer.name, offer.brand);
    const { quantityValue, unitNormalized } = parseQuantity(offer.quantity, offer.unit);

    let brandId = offer.brandId;
    if (intentionalNoBrand || isPseudoBrand(offer.brand)) {
      brandId = null;
    } else if (!brandId && normalizedBrand) {
      brandId = await ensureBrand(prisma, brandCache, brands, normalizedBrand);
    }

    const member = isMemberEligibility(offer.eligibility);
    const membershipName = member
      ? (firstConditionName(offer.conditions) ?? offer.eligibility ?? undefined)
      : undefined;

    await prisma.offer.update({
      where: { id: offer.id },
      data: {
        normalizedName,
        brand: intentionalNoBrand
          ? NO_BRAND_LABEL
          : (normalizedBrand ?? null),
        normalizedBrand: intentionalNoBrand
          ? NO_BRAND_LABEL
          : (normalizedBrand ?? null),
        quantityValue: quantityValue ?? null,
        unitNormalized: unitNormalized ?? null,
        brandId: brandId ?? null,
        requiresMembership: member,
        memberPrice: member ? offer.price : null,
        publicPrice: member ? (offer.originalPrice ?? offer.price) : offer.price,
        membershipName: membershipName ?? null,
      },
    });
    normalized += 1;

    const matchKey = buildMatchKey(offer.name, normalizedBrand, offer.quantity, offer.unit);
    const { row: canonical, created: wasCreated } = await ensureCanonical(prisma, {
      matchKey,
      canonicalName: titleCase(offer.name),
      brandId,
      quantity: offer.quantity,
      unit: unitNormalized ?? offer.unit,
      category,
      slugSeed: `${normalizedBrand ?? ""} ${offer.name} ${offer.quantity ?? ""} ${offer.unit ?? ""}`,
    });
    if (wasCreated) created += 1;

    await prisma.offer.update({
      where: { id: offer.id },
      data: { canonicalProductId: canonical.id },
    });
    resolved += 1;

    const existingPrice = await prisma.priceHistory.findFirst({ where: { offerId: offer.id } });
    if (!existingPrice) {
      await prisma.priceHistory.create({
        data: {
          canonicalProductId: canonical.id,
          supermarketId: offer.supermarketId,
          offerId: offer.id,
          price: offer.price,
          originalPrice: offer.originalPrice,
          memberPrice: member ? offer.price : null,
          requiresMembership: member || null,
          membershipName: membershipName ?? null,
          validFrom: offer.validFrom,
          validUntil: offer.validUntil,
        },
      });
    }

    if (offer.validationStatus === "PENDING") {
      const result = autoValidateOffer({
        name: offer.name,
        price: toNumber(offer.price),
        extractionConfidence: offer.extractionConfidence,
        normalizedName,
      });
      await prisma.offer.update({
        where: { id: offer.id },
        data: { validationStatus: result },
      });
      if (result === "VALIDATED") validated += 1;
      else if (result === "SUSPICIOUS") suspicious += 1;
      else rejected += 1;
    }
  }

  return {
    normalized,
    resolved,
    created,
    autoValidation: { validated, suspicious, rejected, total: offers.length },
  };
}
