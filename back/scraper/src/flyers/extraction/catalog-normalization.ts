/**
 * Fase 2 — normalize offers, ensure brand, match/create CanonicalProduct, priceHistory, auto-validate.
 * Port of former Convex `normalization.processFlyer`.
 */

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
};

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
    slugSeed: string;
  },
): Promise<{ row: CanonicalRow; created: boolean }> {
  const existing = await prisma.canonicalProduct.findUnique({ where: { matchKey: args.matchKey } });
  if (existing) return { row: existing, created: false };

  const slug = await uniqueCanonicalSlug(prisma, slugify(args.slugSeed));
  try {
    const created = await prisma.canonicalProduct.create({
      data: {
        canonicalName: args.canonicalName,
        slug,
        brandId: args.brandId ?? null,
        quantity: args.quantity,
        unit: args.unit ?? null,
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
    const normalizedBrand = offer.brand ? titleCase(offer.brand.trim()) : undefined;
    const { quantityValue, unitNormalized } = parseQuantity(offer.quantity, offer.unit);

    let brandId = offer.brandId;
    if (!brandId && normalizedBrand) {
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
        normalizedBrand: normalizedBrand ?? null,
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
