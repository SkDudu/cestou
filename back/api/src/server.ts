import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { z } from "zod";
import { extname } from "node:path";
import { createPrismaClient } from "../../prisma/client.js";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  destroyAdminSession,
  getAdminSession,
  CLIENT_SESSION_COOKIE,
  createClientSession,
  getClientSession,
  sessionCookieOptions,
} from "./modules/auth/service.js";
import { LocalStorage, StorageError } from "./modules/storage/service.js";
import {
  cancelScraperRun,
  startScraperRun,
  type ScraperQueue,
} from "./modules/scraper/service.js";
import { formatSseEvent, readRunEvents } from "./modules/scraper/events.js";
import {
  processFlyerNormalization,
  NO_BRAND_LABEL,
  normalizeText,
  titleCase,
} from "../../scraper/src/flyers/extraction/catalog-normalization.js";
import {
  categoryLabel,
  parseProductCategory,
} from "../../scraper/src/config/categories.js";
import {
  compareShoppingList,
  findProductCandidates,
  resolveItemLabels,
} from "./modules/lists/service.js";

function mimeFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}
type PrismaClient = ReturnType<typeof createPrismaClient>;

type BuildAppOptions = {
  prisma?: PrismaClient;
  storageRoot?: string;
  queue?: ScraperQueue;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });
  const prisma =
    options.prisma ?? createPrismaClient(process.env.DATABASE_URL ?? "");
  const storage = new LocalStorage(
    options.storageRoot ?? process.env.STORAGE_ROOT ?? "/data/storage",
  );
  const queue = options.queue;

  await app.register(cookie);
  app.addContentTypeParser(
    ["application/octet-stream", "application/pdf"],
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );
  app.addContentTypeParser(
    /^image\/.+$/,
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/api/v1/auth/login", async (request, reply) => {
    const input = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse(request.body);

    if (!input.success) {
      return reply.code(400).send({ code: "INVALID_CREDENTIALS" });
    }

    const token = await createAdminSession(
      prisma,
      input.data.email,
      input.data.password,
    );
    if (!token) return reply.code(401).send({ code: "INVALID_CREDENTIALS" });

    reply.setCookie(ADMIN_SESSION_COOKIE, token, sessionCookieOptions());
    return reply.code(204).send();
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await destroyAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    reply.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.post("/api/v1/client/auth/:mode", async (request, reply) => {
    const params = z.object({ mode: z.enum(["login", "register"]) }).safeParse(request.params);
    const input = z.object({ email: z.string().email(), password: z.string().min(8) }).safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ code: "INVALID_CREDENTIALS" });
    const token = await createClientSession(prisma, input.data.email, input.data.password, params.data.mode === "register");
    if (!token) return reply.code(401).send({ code: "INVALID_CREDENTIALS" });
    reply.setCookie(CLIENT_SESSION_COOKIE, token, sessionCookieOptions());
    return reply.code(204).send();
  });

  app.get("/api/v1/client/auth/me", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    return { id: session.user.id, email: session.user.email };
  });

  app.post("/api/v1/client/auth/logout", async (request, reply) => {
    await destroyAdminSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    reply.clearCookie(CLIENT_SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.put("/api/v1/client/location", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const body = z.object({ city: z.string().min(1).max(120), state: z.string().length(2), neighborhood: z.string().max(120).optional(), lat: z.number().finite().optional(), lng: z.number().finite().optional() }).safeParse(request.body);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!body.success) return reply.code(400).send({ code: "INVALID_LOCATION" });
    await prisma.location.updateMany({ where: { userId: session.user.id, isDefault: true }, data: { isDefault: false } });
    return prisma.location.create({ data: { userId: session.user.id, label: `${body.data.city} — ${body.data.state}`, city: body.data.city, state: body.data.state.toUpperCase(), neighborhood: body.data.neighborhood, lat: body.data.lat, lng: body.data.lng, isDefault: true } });
  });

  app.get("/api/v1/client/flyers", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const now = new Date();
    return prisma.flyer.findMany({
      where: { status: { in: ["PROCESSED", "PARTIALLY_PROCESSED"] }, OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
      orderBy: { createdAt: "desc" }, take: 100,
      include: { supermarket: { select: { id: true, name: true } }, _count: { select: { offers: true } } },
    });
  });

  app.get("/api/v1/client/flyers/:flyerId", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ flyerId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_FLYER_ID" });
    const now = new Date();
    const flyer = await prisma.flyer.findUnique({
      where: { id: params.data.flyerId },
      include: {
        supermarket: { select: { id: true, name: true } },
        offers: {
          where: {
            validationStatus: "VALIDATED",
            OR: [{ validUntil: null }, { validUntil: { gte: now } }],
          },
          orderBy: { price: "asc" },
        },
      },
    });
    if (!flyer) return reply.code(404).send({ code: "FLYER_NOT_FOUND" });
    return flyer;
  });

  app.get("/api/v1/client/stores", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });

    const location = await prisma.location.findFirst({
      where: { userId: session.user.id, isDefault: true },
    });

    // Flyer data lives on supermarket; many redes still have zero filiais.
    // Ensure each active rede without filiais has a default store so client can list + favorite.
    const activeSupermarkets = await prisma.supermarket.findMany({
      where: {
        active: true,
        ...(location
          ? { city: location.city, state: location.state.toUpperCase() }
          : {}),
      },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        _count: { select: { stores: true } },
      },
    });
    for (const supermarket of activeSupermarkets) {
      if (supermarket._count.stores > 0) continue;
      await prisma.store.upsert({
        where: {
          supermarketId_slug: { supermarketId: supermarket.id, slug: "rede" },
        },
        create: {
          supermarketId: supermarket.id,
          name: supermarket.name,
          slug: "rede",
          city: supermarket.city,
          state: supermarket.state,
          active: true,
        },
        update: { active: true },
      });
    }

    const [stores, favorites] = await Promise.all([
      prisma.store.findMany({
        where: {
          active: true,
          supermarket: {
            active: true,
            ...(location
              ? { city: location.city, state: location.state.toUpperCase() }
              : {}),
          },
          ...(location
            ? { city: location.city, state: location.state.toUpperCase() }
            : {}),
        },
        orderBy: [{ supermarket: { name: "asc" } }, { name: "asc" }],
        include: {
          supermarket: { select: { id: true, name: true } },
          _count: { select: { favoriteBy: true } },
        },
      }),
      prisma.favoriteStore.findMany({
        where: { userId: session.user.id },
        select: { storeId: true },
      }),
    ]);
    const favoriteIds = new Set(favorites.map((favorite) => favorite.storeId));
    return {
      location,
      stores: stores.map((store) => ({
        ...store,
        isFavorite: favoriteIds.has(store.id),
      })),
    };
  });

  app.put("/api/v1/client/stores/:storeId/favorite", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ storeId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_STORE_ID" });
    const existing = await prisma.favoriteStore.findUnique({ where: { userId_storeId: { userId: session.user.id, storeId: params.data.storeId } } });
    if (existing) await prisma.favoriteStore.delete({ where: { userId_storeId: { userId: session.user.id, storeId: params.data.storeId } } });
    else await prisma.favoriteStore.create({ data: { userId: session.user.id, storeId: params.data.storeId } });
    return { isFavorite: !existing };
  });

  app.get("/api/v1/client/products/favorites", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    return prisma.favoriteProduct.findMany({ where: { userId: session.user.id }, include: { canonicalProduct: { include: { brand: true } } }, orderBy: { createdAt: "desc" } });
  });

  app.put("/api/v1/client/products/:productId/favorite", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ productId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_PRODUCT_ID" });
    const key = { userId: session.user.id, canonicalProductId: params.data.productId };
    const existing = await prisma.favoriteProduct.findUnique({ where: { userId_canonicalProductId: key } });
    if (existing) await prisma.favoriteProduct.delete({ where: { userId_canonicalProductId: key } });
    else await prisma.favoriteProduct.create({ data: key });
    return { isFavorite: !existing };
  });

  app.get("/api/v1/client/markets/discount-rank", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(20).optional() })
      .safeParse(request.query);
    if (!query.success) return reply.code(400).send({ code: "INVALID_QUERY" });
    const take = query.data.limit ?? 5;
    const now = new Date();
    const groups = await prisma.offer.groupBy({
      by: ["supermarketId"],
      where: {
        validationStatus: "VALIDATED",
        discountPercentage: { not: null },
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        flyer: {
          status: { in: ["PROCESSED", "PARTIALLY_PROCESSED"] },
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        },
      },
      _avg: { discountPercentage: true },
      _count: { _all: true },
    });
    const supermarkets = await prisma.supermarket.findMany({
      where: { id: { in: groups.map((group) => group.supermarketId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(supermarkets.map((row) => [row.id, row.name]));
    return groups
      .map((group) => ({
        supermarketId: group.supermarketId,
        name: nameById.get(group.supermarketId) ?? "—",
        avgDiscountPct:
          Math.round(Number(group._avg.discountPercentage ?? 0) * 10) / 10,
        offerCount: group._count._all,
      }))
      .sort((left, right) => right.avgDiscountPct - left.avgDiscountPct)
      .slice(0, take);
  });

  app.get("/api/v1/client/categories", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });

    const rows = await prisma.canonicalProduct.groupBy({
      by: ["category"],
      _count: { _all: true },
    });

    const merged = new Map<string, number>();
    for (const row of rows) {
      const raw = row.category;
      const id =
        raw == null || raw === ""
          ? ""
          : (parseProductCategory(raw) ?? raw);
      merged.set(id, (merged.get(id) ?? 0) + row._count._all);
    }

    return [...merged.entries()]
      .map(([id, count]) => ({
        id: id || null,
        name: categoryLabel(id || null) ?? "Outros",
        count,
      }))
      .sort((a, b) => {
        if (a.id == null && b.id != null) return 1;
        if (a.id != null && b.id == null) return -1;
        return a.name.localeCompare(b.name, "pt-BR");
      });
  });

  app.get("/api/v1/client/search", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const query = z
      .object({ q: z.string().max(120).optional() })
      .safeParse(request.query);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!query.success) return reply.code(400).send({ code: "INVALID_QUERY" });
    const needle = query.data.q?.trim() ?? "";
    const now = new Date();
    const rows = await prisma.offer.findMany({
      where: {
        validationStatus: "VALIDATED",
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        ...(needle.length >= 2
          ? {
              AND: [
                {
                  OR: [
                    { name: { contains: needle, mode: "insensitive" as const } },
                    {
                      normalizedName: {
                        contains: needle,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              ],
            }
          : {}),
        flyer: {
          status: { in: ["PROCESSED", "PARTIALLY_PROCESSED"] },
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        },
      },
      orderBy: { name: "asc" },
      take: 500,
      include: {
        supermarket: { select: { id: true, name: true } },
        flyer: { select: { id: true, title: true, validUntil: true, status: true } },
        canonicalProduct: {
          select: {
            id: true,
            canonicalName: true,
            category: true,
            brand: { select: { name: true } },
          },
        },
      },
    });
    return rows.sort((left, right) =>
      left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }),
    );
  });

  const listItemInclude = {
    offer: { include: { supermarket: true } },
    canonicalProduct: { include: { brand: true } },
  } as const;

  async function getOwnedList(userId: string, listId: string) {
    return prisma.shoppingList.findFirst({
      where: { id: listId, userId },
      include: { items: { orderBy: { createdAt: "asc" }, include: listItemInclude } },
    });
  }

  app.get("/api/v1/client/lists", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const lists = await prisma.shoppingList.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        items: {
          select: {
            id: true,
            queryText: true,
            quantity: true,
            offerId: true,
            canonicalProductId: true,
          },
        },
        _count: { select: { items: true } },
      },
    });
    const summaries = await Promise.all(
      lists.map(async (list) => {
        const comparison = await compareShoppingList(prisma, {
          userId: session.user.id,
          items: list.items,
          includeLines: false,
        });
        return {
          id: list.id,
          name: list.name,
          itemCount: list._count.items,
          updatedAt: list.updatedAt,
          createdAt: list.createdAt,
          needsResolve: comparison.needsResolve,
          bestSingle: comparison.bestSingle
            ? {
                supermarketName: comparison.bestSingle.supermarketName,
                total: comparison.bestSingle.total,
                coverage: comparison.bestSingle.coverage,
              }
            : null,
        };
      }),
    );
    return summaries;
  });

  app.post("/api/v1/client/lists", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const body = z
      .object({
        name: z.string().trim().min(1).max(120),
        items: z
          .array(
            z.object({
              queryText: z.string().min(1).max(200),
              offerId: z.string().uuid().optional(),
              canonicalProductId: z.string().uuid().optional(),
              quantity: z.number().int().min(1).max(99).default(1),
            }),
          )
          .default([]),
      })
      .safeParse(request.body);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!body.success) return reply.code(400).send({ code: "INVALID_LIST" });
    const list = await prisma.shoppingList.create({
      data: {
        userId: session.user.id,
        name: body.data.name,
        items: {
          create: body.data.items.map((item) => ({
            queryText: item.queryText,
            quantity: item.quantity,
            offerId: item.offerId,
            canonicalProductId: item.canonicalProductId,
          })),
        },
      },
      include: { items: { orderBy: { createdAt: "asc" }, include: listItemInclude } },
    });
    return reply.code(201).send(list);
  });

  app.get("/api/v1/client/lists/product-candidates", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const query = z.object({ q: z.string().max(120).optional() }).safeParse(request.query);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!query.success) return reply.code(400).send({ code: "INVALID_QUERY" });
    return { candidates: await findProductCandidates(prisma, query.data.q ?? "") };
  });

  // ponytail: legacy default routes — last updated list (busca/encartes)
  async function getOrCreateDefaultList(userId: string) {
    return (
      (await prisma.shoppingList.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      })) ??
      (await prisma.shoppingList.create({
        data: { userId, name: "Minha lista" },
      }))
    );
  }

  app.get("/api/v1/client/lists/default", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const list = await getOrCreateDefaultList(session.user.id);
    return getOwnedList(session.user.id, list.id);
  });

  app.post("/api/v1/client/lists/default/items", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const body = z
      .object({
        queryText: z.string().min(1).max(200),
        offerId: z.string().uuid().optional(),
        canonicalProductId: z.string().uuid().optional(),
        quantity: z.number().int().min(1).max(99).default(1),
      })
      .safeParse(request.body);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!body.success) return reply.code(400).send({ code: "INVALID_LIST_ITEM" });
    const list = await getOrCreateDefaultList(session.user.id);
    const created = await prisma.shoppingListItem.create({
      data: { listId: list.id, ...body.data },
    });
    await prisma.shoppingList.update({
      where: { id: list.id },
      data: { updatedAt: new Date() },
    });
    return reply.code(201).send(created);
  });

  app.get("/api/v1/client/lists/default/comparison", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const list = await prisma.shoppingList.findFirst({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: { items: true },
    });
    if (!list) return { itemCount: 0, markets: [], bestSingle: null, needsResolve: false };
    return compareShoppingList(prisma, {
      userId: session.user.id,
      items: list.items,
      includeLines: true,
    });
  });

  app.get("/api/v1/client/lists/default/resolve", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const list = await prisma.shoppingList.findFirst({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!list) return { items: [] };
    const unresolved = list.items.filter(
      (item) => !item.canonicalProductId && !item.offerId,
    );
    const items = [];
    for (const item of unresolved) {
      items.push({
        itemId: item.id,
        queryText: item.queryText,
        quantity: item.quantity,
        candidates: await findProductCandidates(prisma, item.queryText),
      });
    }
    return { items };
  });

  app.put("/api/v1/client/lists/default/items/:itemId/selections", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ itemId: z.string().uuid() }).safeParse(request.params);
    const body = z
      .object({
        canonicalProductIds: z.array(z.string().uuid()).default([]),
        offerIds: z.array(z.string().uuid()).default([]),
      })
      .safeParse(request.body);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_SELECTION" });
    const canonicalProductIds = [...new Set(body.data.canonicalProductIds)];
    const offerIds = [...new Set(body.data.offerIds)];
    if (canonicalProductIds.length + offerIds.length === 0) {
      return reply.code(400).send({ code: "EMPTY_SELECTION" });
    }
    const item = await prisma.shoppingListItem.findFirst({
      where: { id: params.data.itemId, list: { userId: session.user.id } },
    });
    if (!item) return reply.code(404).send({ code: "LIST_ITEM_NOT_FOUND" });
    if (item.canonicalProductId || item.offerId) {
      return reply.code(400).send({ code: "ITEM_ALREADY_RESOLVED" });
    }
    const { canonicals, offers } = await resolveItemLabels(prisma, {
      canonicalProductIds,
      offerIds,
    });
    if (canonicals.length !== canonicalProductIds.length || offers.length !== offerIds.length) {
      return reply.code(400).send({ code: "INVALID_SELECTION" });
    }
    const created = await prisma.$transaction(async (tx) => {
      await tx.shoppingListItem.delete({ where: { id: item.id } });
      const rows = [
        ...canonicals.map((product) => ({
          listId: item.listId,
          queryText: product.canonicalName,
          quantity: item.quantity,
          canonicalProductId: product.id,
        })),
        ...offers.map((offer) => ({
          listId: item.listId,
          queryText: offer.name,
          quantity: item.quantity,
          offerId: offer.id,
        })),
      ];
      return Promise.all(rows.map((data) => tx.shoppingListItem.create({ data })));
    });
    return { count: created.length, items: created };
  });


  app.get("/api/v1/client/lists/:listId", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ listId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_LIST_ID" });
    const list = await getOwnedList(session.user.id, params.data.listId);
    if (!list) return reply.code(404).send({ code: "LIST_NOT_FOUND" });
    return list;
  });

  app.patch("/api/v1/client/lists/:listId", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ listId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ name: z.string().trim().min(1).max(120) }).safeParse(request.body);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_LIST" });
    const existing = await prisma.shoppingList.findFirst({
      where: { id: params.data.listId, userId: session.user.id },
    });
    if (!existing) return reply.code(404).send({ code: "LIST_NOT_FOUND" });
    return prisma.shoppingList.update({
      where: { id: existing.id },
      data: { name: body.data.name },
      include: { items: { orderBy: { createdAt: "asc" }, include: listItemInclude } },
    });
  });

  app.delete("/api/v1/client/lists/:listId", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ listId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_LIST_ID" });
    const existing = await prisma.shoppingList.findFirst({
      where: { id: params.data.listId, userId: session.user.id },
    });
    if (!existing) return reply.code(404).send({ code: "LIST_NOT_FOUND" });
    await prisma.shoppingList.delete({ where: { id: existing.id } });
    return reply.code(204).send();
  });

  app.post("/api/v1/client/lists/:listId/duplicate", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ listId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_LIST_ID" });
    const source = await getOwnedList(session.user.id, params.data.listId);
    if (!source) return reply.code(404).send({ code: "LIST_NOT_FOUND" });
    const copy = await prisma.shoppingList.create({
      data: {
        userId: session.user.id,
        name: `${source.name} (cópia)`,
        items: {
          create: source.items.map((item) => ({
            queryText: item.queryText,
            quantity: item.quantity,
            offerId: item.offerId,
            canonicalProductId: item.canonicalProductId,
            notes: item.notes,
          })),
        },
      },
      include: { items: { orderBy: { createdAt: "asc" }, include: listItemInclude } },
    });
    return reply.code(201).send(copy);
  });

  app.post("/api/v1/client/lists/:listId/items", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ listId: z.string().uuid() }).safeParse(request.params);
    const body = z
      .object({
        queryText: z.string().min(1).max(200),
        offerId: z.string().uuid().optional(),
        canonicalProductId: z.string().uuid().optional(),
        quantity: z.number().int().min(1).max(99).default(1),
      })
      .safeParse(request.body);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_LIST_ITEM" });
    const list = await prisma.shoppingList.findFirst({
      where: { id: params.data.listId, userId: session.user.id },
    });
    if (!list) return reply.code(404).send({ code: "LIST_NOT_FOUND" });
    const created = await prisma.shoppingListItem.create({
      data: { listId: list.id, ...body.data },
      include: listItemInclude,
    });
    await prisma.shoppingList.update({
      where: { id: list.id },
      data: { updatedAt: new Date() },
    });
    return reply.code(201).send(created);
  });

  app.delete("/api/v1/client/lists/items/:itemId", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ itemId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_LIST_ITEM" });
    const item = await prisma.shoppingListItem.findFirst({
      where: { id: params.data.itemId, list: { userId: session.user.id } },
    });
    if (!item) return reply.code(404).send({ code: "LIST_ITEM_NOT_FOUND" });
    await prisma.shoppingListItem.delete({ where: { id: item.id } });
    await prisma.shoppingList.update({
      where: { id: item.listId },
      data: { updatedAt: new Date() },
    });
    return reply.code(204).send();
  });

  app.get("/api/v1/client/lists/:listId/comparison", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ listId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_LIST_ID" });
    const list = await prisma.shoppingList.findFirst({
      where: { id: params.data.listId, userId: session.user.id },
      include: { items: true },
    });
    if (!list) return reply.code(404).send({ code: "LIST_NOT_FOUND" });
    return compareShoppingList(prisma, {
      userId: session.user.id,
      items: list.items,
      includeLines: true,
    });
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const session = await getAdminSession(
      prisma,
      request.cookies[ADMIN_SESSION_COOKIE],
    );
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    return { id: session.user.id, email: session.user.email, role: session.user.role };
  });

  app.get("/api/v1/admin/dashboard/overview", async (request, reply) => {
    const session = await getAdminSession(
      prisma,
      request.cookies[ADMIN_SESSION_COOKIE],
    );
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const [supermarkets, activeFlows, runningRuns, failedFlyers, pendingOffers, workerCount] =
      await Promise.all([
        prisma.supermarket.count({ where: { active: true } }),
        prisma.scraperFlow.count({ where: { status: "ACTIVE" } }),
        prisma.scraperRun.count({ where: { status: "RUNNING" } }),
        prisma.flyer.count({ where: { status: "FAILED" } }),
        prisma.offer.count({ where: { validationStatus: "PENDING" } }),
        prisma.scraperFlow.count({ where: { status: { not: "DISABLED" } } }),
      ]);
    return { supermarkets, activeFlows, runningRuns, failedFlyers, pendingOffers, workerCount };
  });

  app.post("/api/v1/admin/storage/uploads", async (request, reply) => {
    const session = await getAdminSession(
      prisma,
      request.cookies[ADMIN_SESSION_COOKIE],
    );
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });

    const input = z
      .object({
        scope: z.enum(["flyers", "logos"]),
        filename: z.string().min(1),
      })
      .safeParse(request.query);
    if (!input.success || !Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ code: "INVALID_UPLOAD" });
    }

    const stored = await storage.writeFile({
      scope: input.data.scope,
      filename: input.data.filename,
      mimeType: request.headers["content-type"] ?? "application/octet-stream",
      body: request.body,
    });
    return reply.code(201).send(stored);
  });

  app.post("/api/v1/admin/scraper-flows/:flowId/runs", async (request, reply) => {
    const session = await getAdminSession(
      prisma,
      request.cookies[ADMIN_SESSION_COOKIE],
    );
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!queue) return reply.code(503).send({ code: "QUEUE_UNAVAILABLE" });

    const params = z.object({ flowId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_FLOW_ID" });

    try {
      const run = await startScraperRun(prisma, queue, params.data.flowId);
      return reply.code(201).send(run);
    } catch (error) {
      if (error instanceof Error && error.message === "Scraper flow not found") {
        return reply.code(404).send({ code: "SCRAPER_FLOW_NOT_FOUND" });
      }
      throw error;
    }
  });

  app.get("/api/v1/admin/scraper-flows", async (request, reply) => {
    const session = await getAdminSession(
      prisma,
      request.cookies[ADMIN_SESSION_COOKIE],
    );
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });

    return prisma.scraperFlow.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        supermarket: { select: { id: true, name: true, slug: true } },
        store: { select: { id: true, name: true, slug: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
        _count: { select: { steps: true } },
      },
    }).then((flows) => flows.map(({ runs, _count, ...flow }) => ({
      ...flow,
      latestRun: runs[0] ?? null,
      stepCount: _count.steps,
    })));
  });

  app.post("/api/v1/admin/scraper-flows", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const body = z.object({
      supermarketId: z.string().uuid(),
      storeId: z.string().uuid().optional(),
      scope: z.enum(["SUPERMARKET", "STORE"]).default("SUPERMARKET"),
      name: z.string().min(2).max(160),
      startUrl: z.string().url().optional(),
      status: z.enum(["DRAFT", "TESTING", "ACTIVE", "DISABLED"]).default("DRAFT"),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: "INVALID_SCRAPER_FLOW" });
    const supermarket = await prisma.supermarket.findUnique({ where: { id: body.data.supermarketId } });
    if (!supermarket) return reply.code(404).send({ code: "SUPERMARKET_NOT_FOUND" });

    let storeId: string | null = null;
    let storeUrl: string | null = null;
    if (body.data.scope === "STORE") {
      if (!body.data.storeId) return reply.code(400).send({ code: "STORE_REQUIRED" });
      const store = await prisma.store.findFirst({
        where: { id: body.data.storeId, supermarketId: body.data.supermarketId },
      });
      if (!store) return reply.code(404).send({ code: "STORE_NOT_FOUND" });
      storeId = store.id;
      storeUrl = store.url;
    }

    const startUrl =
      body.data.startUrl
      ?? (body.data.scope === "STORE" ? storeUrl ?? undefined : supermarket.websiteUrl ?? undefined);
    if (!startUrl) {
      return reply.code(400).send({
        code: body.data.scope === "STORE" ? "STORE_URL_REQUIRED" : "SUPERMARKET_WEBSITE_REQUIRED",
      });
    }

    const { supermarketId, name, status, scope } = body.data;
    return reply.code(201).send(
      await prisma.scraperFlow.create({
        data: {
          supermarketId,
          storeId,
          scope,
          name,
          status,
          startUrl,
          version: 1,
        },
      }),
    );
  });

  app.get("/api/v1/admin/flyers", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ code: "INVALID_LIMIT" });
    return prisma.flyer.findMany({
      take: query.data.limit,
      orderBy: { createdAt: "desc" },
      include: {
        supermarket: { select: { id: true, name: true, slug: true } },
        source: { select: { id: true, type: true, url: true } },
        _count: { select: { offers: { where: { validationStatus: "VALIDATED" } } } },
      },
    }).then((rows) => rows.map(({ _count, ...flyer }) => ({ ...flyer, validatedOfferCount: _count.offers })));
  });

  app.post("/api/v1/admin/flyers/:flyerId/normalize", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const params = z.object({ flyerId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_FLYER_ID" });
    const flyer = await prisma.flyer.findUnique({ where: { id: params.data.flyerId } });
    if (!flyer) return reply.code(404).send({ code: "FLYER_NOT_FOUND" });
    return processFlyerNormalization(prisma, flyer.id);
  });

  app.post("/api/v1/admin/normalization/backfill", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const body = z.object({ limit: z.number().int().min(1).max(200).default(50) }).safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ code: "INVALID_BACKFILL" });
    const flyerIds = await prisma.offer.findMany({
      where: {
        OR: [
          { canonicalProductId: null },
          { normalizedName: null },
          // ponytail: re-run so commodity category lands on existing canônicos
          { brand: null, brandId: null, canonicalProduct: { category: null } },
        ],
      },
      distinct: ["flyerId"],
      select: { flyerId: true },
      take: body.data.limit,
    });
    const results = [];
    for (const row of flyerIds) {
      results.push({ flyerId: row.flyerId, ...(await processFlyerNormalization(prisma, row.flyerId)) });
    }
    return { processed: results.length, results };
  });

  app.get("/api/v1/admin/flyers/:flyerId", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const params = z.object({ flyerId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_FLYER_ID" });
    const flyer = await prisma.flyer.findUnique({ where: { id: params.data.flyerId }, include: { supermarket: true, source: true, pages: { orderBy: { pageNumber: "asc" } }, offers: { orderBy: { createdAt: "desc" } } } });
    if (!flyer) return reply.code(404).send({ code: "FLYER_NOT_FOUND" });
    return flyer;
  });

  app.get("/api/v1/admin/flyers/:flyerId/pages/:pageNumber/file", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const params = z
      .object({
        flyerId: z.string().uuid(),
        pageNumber: z.coerce.number().int().positive(),
      })
      .safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_PAGE" });
    const page = await prisma.flyerPage.findUnique({
      where: {
        flyerId_pageNumber: {
          flyerId: params.data.flyerId,
          pageNumber: params.data.pageNumber,
        },
      },
    });
    if (!page?.filePath) return reply.code(404).send({ code: "PAGE_NOT_FOUND" });
    if (/^https?:\/\//i.test(page.filePath)) {
      return reply.redirect(page.filePath);
    }
    try {
      const body = await storage.readFile(page.filePath);
      return reply
        .header("content-type", mimeFromPath(page.filePath))
        .header("cache-control", "private, max-age=3600")
        .send(body);
    } catch (err) {
      if (err instanceof StorageError) return reply.code(400).send({ code: err.code });
      return reply.code(404).send({ code: "FILE_NOT_FOUND" });
    }
  });

  app.get("/api/v1/admin/supermarkets", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    return prisma.supermarket.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { stores: true, flyerSources: true, flyers: true, offers: true } } } });
  });

  app.post("/api/v1/admin/supermarkets", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const body = z.object({
      name: z.string().min(2).max(160),
      websiteUrl: z.string().url().optional(),
      networkType: z.enum(["SUPERMARKET", "WHOLESALE", "DISTRIBUTOR"]).optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: "INVALID_SUPERMARKET" });
    const base = body.data.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "market";
    let slug = base;
    for (let n = 0; await prisma.supermarket.findUnique({ where: { slug } }); n += 1) {
      slug = `${base}-${n + 1}`;
    }
    return reply.code(201).send(await prisma.supermarket.create({
      data: {
        name: body.data.name,
        slug,
        city: "Fortaleza",
        state: "CE",
        country: "BR",
        active: true,
        timezone: "America/Fortaleza",
        websiteUrl: body.data.websiteUrl,
        networkType: body.data.networkType,
      },
    }));
  });

  app.get("/api/v1/admin/supermarkets/:supermarketId", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    const params = z.object({ supermarketId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_SUPERMARKET_ID" });
    const supermarket = await prisma.supermarket.findUnique({ where: { id: params.data.supermarketId }, include: { stores: { orderBy: { name: "asc" } }, flyerSources: { orderBy: { createdAt: "desc" } }, scraperFlows: { orderBy: { updatedAt: "desc" } }, _count: { select: { flyers: true, offers: true } } } });
    if (!supermarket) return reply.code(404).send({ code: "SUPERMARKET_NOT_FOUND" });
    return supermarket;
  });

  app.post("/api/v1/admin/supermarkets/:supermarketId/stores", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    const params = z.object({ supermarketId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_SUPERMARKET_ID" });
    const body = z.object({
      name: z.string().min(2).max(160),
      url: z.string().url().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: "INVALID_STORE" });
    const supermarket = await prisma.supermarket.findUnique({ where: { id: params.data.supermarketId } });
    if (!supermarket) return reply.code(404).send({ code: "SUPERMARKET_NOT_FOUND" });
    const base = body.data.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "filial";
    let slug = base;
    for (
      let n = 0;
      await prisma.store.findUnique({
        where: { supermarketId_slug: { supermarketId: params.data.supermarketId, slug } },
      });
      n += 1
    ) {
      slug = `${base}-${n + 1}`;
    }
    return reply.code(201).send(
      await prisma.store.create({
        data: {
          supermarketId: params.data.supermarketId,
          name: body.data.name,
          slug,
          url: body.data.url,
          city: supermarket.city,
          state: supermarket.state,
          active: true,
        },
      }),
    );
  });

  app.get("/api/v1/admin/brands", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    return prisma.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { offers: true, products: true } } } });
  });

  app.post("/api/v1/admin/brands", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const body = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: "INVALID_BRAND" });
    const name = body.data.name.replace(/\s+/g, " ");
    const base =
      name
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "marca";
    let slug = base;
    for (let n = 0; await prisma.brand.findUnique({ where: { slug } }); n += 1) {
      slug = `${base}-${n + 1}`;
    }
    const existing = await prisma.brand.findFirst({
      where: { OR: [{ slug: base }, { name: { equals: name, mode: "insensitive" } }] },
      include: { _count: { select: { offers: true, products: true } } },
    });
    if (existing) return existing;
    return reply.code(201).send(
      await prisma.brand.create({
        data: { name, slug, aliases: [] },
        include: { _count: { select: { offers: true, products: true } } },
      }),
    );
  });

  app.get("/api/v1/admin/products", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    return prisma.canonicalProduct.findMany({ take: 100, orderBy: { updatedAt: "desc" }, include: { brand: true, _count: { select: { offers: true } } } });
  });

  app.get("/api/v1/admin/products/:productId", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    const params = z.object({ productId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_PRODUCT_ID" });
    const product = await prisma.canonicalProduct.findUnique({ where: { id: params.data.productId }, include: { brand: true, offers: { orderBy: { updatedAt: "desc" }, include: { supermarket: { select: { name: true } } }, take: 100 }, priceHistory: { orderBy: { createdAt: "desc" }, include: { supermarket: { select: { name: true } } }, take: 100 } } });
    if (!product) return reply.code(404).send({ code: "PRODUCT_NOT_FOUND" });
    return product;
  });

  app.get("/api/v1/admin/offers", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: z.string().uuid().optional(),
      validationStatus: z.enum(["PENDING", "VALIDATED", "REJECTED", "SUSPICIOUS"]).optional(),
      flyerId: z.string().uuid().optional(),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ code: "INVALID_PAGINATION" });
    const rows = await prisma.offer.findMany({
      take: query.data.limit + 1,
      ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
      where: {
        ...(query.data.validationStatus ? { validationStatus: query.data.validationStatus } : {}),
        ...(query.data.flyerId ? { flyerId: query.data.flyerId } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        supermarket: { select: { id: true, name: true } },
        flyer: { select: { id: true, title: true } },
        canonicalProduct: { select: { id: true, category: true } },
      },
    });
    const hasMore = rows.length > query.data.limit;
    const items = hasMore ? rows.slice(0, -1) : rows;
    return { items, hasMore, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  });

  app.get("/api/v1/admin/prices/compare", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const offers = await prisma.offer.findMany({ where: { validationStatus: "VALIDATED", canonicalProductId: { not: null } }, take: 500, orderBy: { updatedAt: "desc" }, include: { canonicalProduct: { select: { id: true, canonicalName: true } }, supermarket: { select: { id: true, name: true } } } });
    const groups = new Map<string, typeof offers>();
    for (const offer of offers) { const rows = groups.get(offer.canonicalProductId!) ?? []; rows.push(offer); groups.set(offer.canonicalProductId!, rows); }
    return [...groups.values()].map((rows) => { const prices = rows.map((offer) => Number(offer.memberPrice ?? offer.price)); return { productId: rows[0].canonicalProduct!.id, productName: rows[0].canonicalProduct!.canonicalName, marketCount: new Set(rows.map((offer) => offer.supermarketId)).size, minPrice: Math.min(...prices), maxPrice: Math.max(...prices), offers: rows.map((offer) => ({ id: offer.id, supermarketName: offer.supermarket.name, price: Number(offer.memberPrice ?? offer.price) })) }; }).filter((row) => row.marketCount > 1).sort((left, right) => (right.maxPrice - right.minPrice) - (left.maxPrice - left.minPrice));
  });

  app.get("/api/v1/admin/catalog/health", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const [totalOffers, withBrand, withCanonical, pendingValidation, suspicious, singleMarket] = await Promise.all([
      prisma.offer.count(),
      prisma.offer.count({ where: { brandId: { not: null } } }),
      prisma.offer.count({ where: { canonicalProductId: { not: null } } }),
      prisma.offer.count({ where: { validationStatus: "PENDING" } }),
      prisma.offer.count({ where: { validationStatus: "SUSPICIOUS" } }),
      prisma.canonicalProduct.findMany({ select: { id: true, _count: { select: { offers: true } } } }),
    ]);
    return { totalOffers, withBrand, withCanonical, pendingValidation, suspicious, singleMarketProducts: singleMarket.filter((product) => product._count.offers === 1).length, pctWithBrand: totalOffers ? Math.round((withBrand / totalOffers) * 100) : 0, pctWithCanonical: totalOffers ? Math.round((withCanonical / totalOffers) * 100) : 0 };
  });

  app.patch("/api/v1/admin/offers/bulk-validation", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const body = z.object({
      flyerId: z.string().uuid(),
      validationStatus: z.enum(["PENDING", "VALIDATED", "REJECTED", "SUSPICIOUS"]),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: "INVALID_OFFER_VALIDATION" });
    const result = await prisma.offer.updateMany({
      where: { flyerId: body.data.flyerId, validationStatus: "PENDING" },
      data: { validationStatus: body.data.validationStatus },
    });
    return { count: result.count };
  });

  app.patch("/api/v1/admin/offers/:offerId/validation", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const params = z.object({ offerId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ validationStatus: z.enum(["PENDING", "VALIDATED", "REJECTED", "SUSPICIOUS"]) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_OFFER_VALIDATION" });
    const offer = await prisma.offer.findUnique({ where: { id: params.data.offerId } });
    if (!offer) return reply.code(404).send({ code: "OFFER_NOT_FOUND" });
    return prisma.offer.update({ where: { id: offer.id }, data: { validationStatus: body.data.validationStatus } });
  });

  app.patch("/api/v1/admin/offers/:offerId/catalog", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    const params = z.object({ offerId: z.string().uuid() }).safeParse(request.params);
    const body = z
      .object({
        name: z.string().trim().min(1).max(200).optional(),
        brandId: z.string().uuid().nullable().optional(),
        canonicalProductId: z.string().uuid().nullable().optional(),
      })
      .safeParse(request.body);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_CATALOG_UPDATE" });
    const offer = await prisma.offer.findUnique({ where: { id: params.data.offerId } });
    if (!offer) return reply.code(404).send({ code: "OFFER_NOT_FOUND" });
    const data: {
      name?: string;
      normalizedName?: string;
      brandId?: string | null;
      brand?: string | null;
      normalizedBrand?: string | null;
      canonicalProductId?: string | null;
    } = {
      brandId: body.data.brandId,
      canonicalProductId: body.data.canonicalProductId,
    };
    if (body.data.name !== undefined) {
      data.name = body.data.name;
      data.normalizedName = normalizeText(body.data.name);
    }
    if (body.data.brandId !== undefined) {
      if (body.data.brandId === null) {
        // ponytail: sentinel so missing-brand queue drops this offer
        data.brand = NO_BRAND_LABEL;
        data.normalizedBrand = NO_BRAND_LABEL;
      } else {
        const brand = await prisma.brand.findUnique({ where: { id: body.data.brandId } });
        if (!brand) return reply.code(404).send({ code: "BRAND_NOT_FOUND" });
        data.brand = brand.name;
        data.normalizedBrand = brand.name;
      }
    }
    const updated = await prisma.offer.update({ where: { id: offer.id }, data });
    if (offer.canonicalProductId) {
      const productPatch: { brandId?: string | null; canonicalName?: string } = {};
      if (body.data.brandId !== undefined) productPatch.brandId = body.data.brandId;
      if (body.data.name !== undefined) productPatch.canonicalName = titleCase(body.data.name);
      if (Object.keys(productPatch).length) {
        await prisma.canonicalProduct.update({
          where: { id: offer.canonicalProductId },
          data: productPatch,
        });
      }
    }
    return updated;
  });

  app.get("/api/v1/admin/offers/:offerId", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const params = z.object({ offerId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_OFFER_ID" });
    const offer = await prisma.offer.findUnique({ where: { id: params.data.offerId }, include: { supermarket: true, flyer: true, brandRecord: true, canonicalProduct: true } });
    if (!offer) return reply.code(404).send({ code: "OFFER_NOT_FOUND" });
    return offer;
  });

  app.get("/api/v1/admin/scraper-runs", async (request, reply) => {
    const session = await getAdminSession(
      prisma,
      request.cookies[ADMIN_SESSION_COOKIE],
    );
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });

    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ code: "INVALID_LIMIT" });
    return prisma.scraperRun.findMany({
      take: query.data.limit,
      orderBy: { startedAt: "desc" },
      include: { flow: { include: { supermarket: { select: { id: true, name: true, slug: true } } } } },
    });
  });

  app.get("/api/v1/admin/scraper-runs/:runId", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    const params = z.object({ runId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_RUN_ID" });
    const run = await prisma.scraperRun.findUnique({ where: { id: params.data.runId }, include: { flow: { include: { supermarket: { select: { name: true } } } }, events: { orderBy: { sequence: "asc" } } } });
    if (!run) return reply.code(404).send({ code: "SCRAPER_RUN_NOT_FOUND" });
    return run;
  });

  app.get("/api/v1/admin/extraction/errors", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    return prisma.flyerError.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { supermarket: { select: { name: true } }, flyer: { select: { id: true, title: true } } } });
  });

  app.get("/api/v1/admin/extraction/errors/:errorId", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    const params = z.object({ errorId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_ERROR_ID" });
    const error = await prisma.flyerError.findUnique({ where: { id: params.data.errorId }, include: { supermarket: { select: { name: true } }, flyer: { select: { id: true, title: true } } } });
    if (!error) return reply.code(404).send({ code: "FLYER_ERROR_NOT_FOUND" });
    return error;
  });

  app.patch("/api/v1/admin/extraction/errors/:errorId", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    const params = z.object({ errorId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ status: z.string().min(1).max(32) }).safeParse(request.body);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_ERROR_UPDATE" });
    return prisma.flyerError.update({ where: { id: params.data.errorId }, data: { status: body.data.status } });
  });

  app.post("/api/v1/admin/scraper-runs/:runId/cancel", async (request, reply) => {
    const session = await getAdminSession(
      prisma,
      request.cookies[ADMIN_SESSION_COOKIE],
    );
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });

    const params = z.object({ runId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_RUN_ID" });

    const existing = await prisma.scraperRun.findUnique({ where: { id: params.data.runId } });
    if (!existing) return reply.code(404).send({ code: "SCRAPER_RUN_NOT_FOUND" });
    if (existing.status !== "RUNNING") {
      return reply.code(409).send({ code: "SCRAPER_RUN_NOT_RUNNING" });
    }

    return reply.send(await cancelScraperRun(prisma, existing.id));
  });

  app.get("/api/v1/admin/scraper-runs/:runId/events", async (request, reply) => {
    const session = await getAdminSession(
      prisma,
      request.cookies[ADMIN_SESSION_COOKIE],
    );
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });

    const params = z.object({ runId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_RUN_ID" });
    const run = await prisma.scraperRun.findUnique({ where: { id: params.data.runId } });
    if (!run) return reply.code(404).send({ code: "SCRAPER_RUN_NOT_FOUND" });

    const header = request.headers["last-event-id"];
    const parsedSequence = Number.parseInt(Array.isArray(header) ? header[0] : header ?? "0", 10);
    let latestSequence = Number.isFinite(parsedSequence) && parsedSequence >= 0 ? parsedSequence : 0;
    let closed = false;

    reply.hijack();
    reply.raw.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    });

    const publishNewEvents = async () => {
      const events = await readRunEvents(prisma, run.id, latestSequence);
      for (const event of events) {
        latestSequence = event.sequence;
        reply.raw.write(formatSseEvent(event));
      }
    };

    await publishNewEvents();
    const heartbeat = setInterval(() => {
      if (!closed) reply.raw.write(": keepalive\n\n");
    }, 15_000);
    const poll = setInterval(() => {
      void publishNewEvents().catch(() => reply.raw.end());
    }, 1_000);
    request.raw.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      clearInterval(poll);
    });
  });

  return app;
}
