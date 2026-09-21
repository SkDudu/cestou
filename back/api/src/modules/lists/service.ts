import { normalizeText } from "../../../../scraper/src/flyers/extraction/catalog-normalization.js";
import type { PrismaClient } from "../../../../generated/prisma/client.js";

type Prisma = PrismaClient;

export type ProductCandidate = {
  key: string;
  canonicalProductId: string | null;
  offerId: string | null;
  label: string;
  brand: string | null;
  offerCount: number;
  minPrice: number;
};

export type ComparisonLine = {
  itemId: string;
  queryText: string;
  offerId: string | null;
  offerName: string | null;
  price: number | null;
};

export type ComparisonMarket = {
  supermarketId: string;
  supermarketName: string;
  coverage: number;
  complete: boolean;
  total: number;
  lines: ComparisonLine[];
};

export type ComparisonResult = {
  itemCount: number;
  markets: ComparisonMarket[];
  bestSingle: ComparisonMarket | null;
  needsResolve: boolean;
  unresolvedCount?: number;
};

type ListItemRow = {
  id: string;
  queryText: string;
  quantity: number;
  offerId: string | null;
  canonicalProductId: string | null;
};

const flyerActive = (now: Date) => ({
  status: { in: ["PROCESSED", "PARTIALLY_PROCESSED"] as const },
  OR: [{ validUntil: null }, { validUntil: { gte: now } }],
});

export async function findProductCandidates(
  prisma: Prisma,
  needleRaw: string,
): Promise<ProductCandidate[]> {
  const needle = needleRaw.trim();
  if (needle.length < 2) return [];
  const now = new Date();
  const offers = await prisma.offer.findMany({
    where: {
      validationStatus: "VALIDATED",
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      AND: [
        {
          OR: [
            { name: { contains: needle, mode: "insensitive" } },
            { normalizedName: { contains: needle, mode: "insensitive" } },
          ],
        },
      ],
      flyer: flyerActive(now),
    },
    include: {
      canonicalProduct: {
        select: {
          id: true,
          canonicalName: true,
          brand: { select: { name: true } },
        },
      },
    },
    take: 500,
  });

  const byCanonical = new Map<string, ProductCandidate>();
  const byOfferName = new Map<string, ProductCandidate>();
  for (const offer of offers) {
    const price = Number(offer.memberPrice ?? offer.price);
    if (offer.canonicalProductId && offer.canonicalProduct) {
      const existing = byCanonical.get(offer.canonicalProductId);
      if (existing) {
        existing.offerCount += 1;
        existing.minPrice = Math.min(existing.minPrice, price);
      } else {
        byCanonical.set(offer.canonicalProductId, {
          key: `canonical:${offer.canonicalProductId}`,
          canonicalProductId: offer.canonicalProductId,
          offerId: null,
          label: offer.canonicalProduct.canonicalName,
          brand: offer.canonicalProduct.brand?.name ?? offer.brand,
          offerCount: 1,
          minPrice: price,
        });
      }
      continue;
    }
    const nameKey = (offer.normalizedName ?? normalizeText(offer.name)).trim();
    if (!nameKey) continue;
    const existing = byOfferName.get(nameKey);
    if (existing) {
      existing.offerCount += 1;
      if (price < existing.minPrice) {
        existing.minPrice = price;
        existing.offerId = offer.id;
        existing.label = offer.name;
        existing.brand = offer.brand;
      }
    } else {
      byOfferName.set(nameKey, {
        key: `offer:${offer.id}`,
        canonicalProductId: null,
        offerId: offer.id,
        label: offer.name,
        brand: offer.brand,
        offerCount: 1,
        minPrice: price,
      });
    }
  }
  return [...byCanonical.values(), ...byOfferName.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
  );
}

function offerMatchesItem(
  offer: {
    id: string;
    name: string;
    normalizedName: string | null;
    canonicalProductId: string | null;
  },
  item: ListItemRow,
): boolean {
  if (item.canonicalProductId) {
    return (
      offer.canonicalProductId === item.canonicalProductId ||
      offer.id === item.offerId
    );
  }
  if (item.offerId && offer.id === item.offerId) return true;
  const needle = item.queryText.trim().toLowerCase();
  if (needle.length < 2) return false;
  return (
    offer.name.toLowerCase().includes(needle) ||
    (offer.normalizedName?.toLowerCase().includes(needle) ?? false)
  );
}

export async function compareShoppingList(
  prisma: Prisma,
  args: {
    userId: string;
    items: ListItemRow[];
    includeLines?: boolean;
  },
): Promise<ComparisonResult> {
  const { userId, items } = args;
  const includeLines = args.includeLines !== false;
  if (items.length === 0) {
    return { itemCount: 0, markets: [], bestSingle: null, needsResolve: false };
  }
  // ponytail: free-text items OK — match offer name; needsResolve = hint only
  const unresolvedCount = items.filter(
    (item) => !item.canonicalProductId && !item.offerId,
  ).length;

  const productIds = [
    ...new Set(
      items.flatMap((item) =>
        item.canonicalProductId ? [item.canonicalProductId] : [],
      ),
    ),
  ];
  const pinnedOfferIds = [
    ...new Set(items.flatMap((item) => (item.offerId ? [item.offerId] : []))),
  ];
  const textNeedles = [
    ...new Set(
      items
        .filter((item) => !item.canonicalProductId)
        .map((item) => item.queryText.trim())
        .filter((needle) => needle.length >= 2),
    ),
  ];
  const matchOr = [
    ...(productIds.length ? [{ canonicalProductId: { in: productIds } }] : []),
    ...(pinnedOfferIds.length ? [{ id: { in: pinnedOfferIds } }] : []),
    ...textNeedles.flatMap((needle) => [
      { name: { contains: needle, mode: "insensitive" as const } },
      { normalizedName: { contains: needle, mode: "insensitive" as const } },
    ]),
  ];
  if (matchOr.length === 0) {
    return {
      itemCount: items.length,
      markets: [],
      bestSingle: null,
      needsResolve: unresolvedCount > 0,
      unresolvedCount: unresolvedCount || undefined,
    };
  }

  const now = new Date();
  const offers = await prisma.offer.findMany({
    where: {
      validationStatus: "VALIDATED",
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      AND: [{ OR: matchOr }],
      flyer: flyerActive(now),
    },
    include: { supermarket: { select: { id: true, name: true } } },
  });

  const favoriteStores = await prisma.favoriteStore.findMany({
    where: { userId },
    include: { store: { select: { supermarketId: true } } },
  });
  const favoriteSupermarketIds = new Set(
    favoriteStores.map((favorite) => favorite.store.supermarketId),
  );
  const candidateOffers = favoriteSupermarketIds.size
    ? offers.filter((offer) => favoriteSupermarketIds.has(offer.supermarketId))
    : offers;

  const markets = [
    ...new Map(
      candidateOffers.map((offer) => [offer.supermarketId, offer.supermarket]),
    ).entries(),
  ]
    .map(([supermarketId, supermarket]) => {
      const lines = items.map((item) => {
        const matches = candidateOffers.filter(
          (offer) =>
            offer.supermarketId === supermarketId &&
            offerMatchesItem(offer, item),
        );
        const offer = matches.sort(
          (left, right) =>
            Number(left.memberPrice ?? left.price) -
            Number(right.memberPrice ?? right.price),
        )[0];
        return {
          itemId: item.id,
          queryText: item.queryText,
          offerId: offer?.id ?? null,
          offerName: offer?.name ?? null,
          price: offer
            ? Number(offer.memberPrice ?? offer.price) * item.quantity
            : null,
        };
      });
      const coverage = lines.filter((line) => line.price !== null).length;
      return {
        supermarketId,
        supermarketName: supermarket.name,
        coverage,
        complete: coverage === lines.length,
        total: lines.reduce((sum, line) => sum + (line.price ?? 0), 0),
        lines: includeLines ? lines : [],
      };
    })
    .sort(
      (left, right) =>
        right.coverage - left.coverage || left.total - right.total,
    );

  return {
    itemCount: items.length,
    markets,
    bestSingle: markets.find((market) => market.complete) ?? null,
    needsResolve: unresolvedCount > 0,
    unresolvedCount: unresolvedCount || undefined,
  };
}

export async function resolveItemLabels(
  prisma: Prisma,
  args: {
    canonicalProductIds: string[];
    offerIds: string[];
  },
) {
  const [canonicals, offers] = await Promise.all([
    args.canonicalProductIds.length
      ? prisma.canonicalProduct.findMany({
          where: { id: { in: args.canonicalProductIds } },
          select: { id: true, canonicalName: true },
        })
      : Promise.resolve([]),
    args.offerIds.length
      ? prisma.offer.findMany({
          where: { id: { in: args.offerIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  return { canonicals, offers };
}
