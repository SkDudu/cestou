import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { z } from "zod";
import { createPrismaClient } from "../../prisma/client.js";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  destroyAdminSession,
  getAdminSession,
  CLIENT_SESSION_COOKIE,
  createClientSession,
  getClientSession,
} from "./modules/auth/service.js";
import { LocalStorage } from "./modules/storage/service.js";
import {
  cancelScraperRun,
  startScraperRun,
  type ScraperQueue,
} from "./modules/scraper/service.js";
import { formatSseEvent, readRunEvents } from "./modules/scraper/events.js";

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

    reply.setCookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
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
    reply.setCookie(CLIENT_SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
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
    const flyer = await prisma.flyer.findUnique({ where: { id: params.data.flyerId }, include: { supermarket: { select: { id: true, name: true } }, offers: { where: { validationStatus: "VALIDATED" }, orderBy: { price: "asc" } } } });
    if (!flyer) return reply.code(404).send({ code: "FLYER_NOT_FOUND" });
    return flyer;
  });

  app.get("/api/v1/client/stores", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const [location, stores, favorites] = await Promise.all([
      prisma.location.findFirst({ where: { userId: session.user.id, isDefault: true } }),
      prisma.store.findMany({ where: { active: true }, orderBy: [{ supermarket: { name: "asc" } }, { name: "asc" }], include: { supermarket: { select: { id: true, name: true } }, _count: { select: { favoriteBy: true } } } }),
      prisma.favoriteStore.findMany({ where: { userId: session.user.id }, select: { storeId: true } }),
    ]);
    const favoriteIds = new Set(favorites.map((favorite) => favorite.storeId));
    return { location, stores: stores.map((store) => ({ ...store, isFavorite: favoriteIds.has(store.id) })) };
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

  app.get("/api/v1/client/search", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const query = z.object({ q: z.string().min(2).max(120) }).safeParse(request.query);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!query.success) return reply.code(400).send({ code: "INVALID_QUERY" });
    const needle = query.data.q.trim();
    return prisma.offer.findMany({ where: { validationStatus: "VALIDATED", OR: [{ name: { contains: needle, mode: "insensitive" } }, { normalizedName: { contains: needle, mode: "insensitive" } }] }, orderBy: { price: "asc" }, take: 100, include: { supermarket: { select: { id: true, name: true } }, canonicalProduct: { select: { id: true, canonicalName: true, brand: { select: { name: true } } } } } });
  });

  app.get("/api/v1/client/lists/default", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const list = await prisma.shoppingList.findFirst({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" } })
      ?? await prisma.shoppingList.create({ data: { userId: session.user.id, name: "Minha lista" } });
    return prisma.shoppingList.findUniqueOrThrow({ where: { id: list.id }, include: { items: { orderBy: { createdAt: "desc" }, include: { offer: { include: { supermarket: true } }, canonicalProduct: true } } } });
  });

  app.post("/api/v1/client/lists/default/items", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const body = z.object({ queryText: z.string().min(1).max(200), offerId: z.string().uuid().optional(), canonicalProductId: z.string().uuid().optional(), quantity: z.number().int().min(1).max(99).default(1) }).safeParse(request.body);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!body.success) return reply.code(400).send({ code: "INVALID_LIST_ITEM" });
    const list = await prisma.shoppingList.findFirst({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" } })
      ?? await prisma.shoppingList.create({ data: { userId: session.user.id, name: "Minha lista" } });
    return reply.code(201).send(await prisma.shoppingListItem.create({ data: { listId: list.id, ...body.data } }));
  });

  app.delete("/api/v1/client/lists/items/:itemId", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    const params = z.object({ itemId: z.string().uuid() }).safeParse(request.params);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success) return reply.code(400).send({ code: "INVALID_LIST_ITEM" });
    const item = await prisma.shoppingListItem.findFirst({ where: { id: params.data.itemId, list: { userId: session.user.id } } });
    if (!item) return reply.code(404).send({ code: "LIST_ITEM_NOT_FOUND" });
    await prisma.shoppingListItem.delete({ where: { id: item.id } });
    return reply.code(204).send();
  });

  app.get("/api/v1/client/lists/default/comparison", async (request, reply) => {
    const session = await getClientSession(prisma, request.cookies[CLIENT_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const list = await prisma.shoppingList.findFirst({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, include: { items: true } });
    if (!list || list.items.length === 0) return { itemCount: 0, markets: [] };
    const productIds = list.items.flatMap((item) => item.canonicalProductId ? [item.canonicalProductId] : []);
    const pinnedOfferIds = list.items.flatMap((item) => item.offerId ? [item.offerId] : []);
    const offers = await prisma.offer.findMany({ where: { validationStatus: "VALIDATED", OR: [{ canonicalProductId: { in: productIds } }, { id: { in: pinnedOfferIds } }] }, include: { supermarket: { select: { id: true, name: true } } } });
    const favoriteStores = await prisma.favoriteStore.findMany({ where: { userId: session.user.id }, select: { storeId: true } });
    const favoriteIds = new Set(favoriteStores.map((favorite) => favorite.storeId));
    const candidateOffers = favoriteIds.size ? offers.filter((offer) => favoriteIds.has(offer.supermarketId)) : offers;
    const markets = [...new Map(candidateOffers.map((offer) => [offer.supermarketId, offer.supermarket])).entries()].map(([supermarketId, supermarket]) => {
      const lines = list.items.map((item) => {
        const matches = candidateOffers.filter((offer) => offer.supermarketId === supermarketId && (offer.id === item.offerId || (!!item.canonicalProductId && offer.canonicalProductId === item.canonicalProductId)));
        const offer = matches.sort((left, right) => Number(left.memberPrice ?? left.price) - Number(right.memberPrice ?? right.price))[0];
        return { itemId: item.id, queryText: item.queryText, offerId: offer?.id ?? null, price: offer ? Number(offer.memberPrice ?? offer.price) * item.quantity : null };
      });
      const coverage = lines.filter((line) => line.price !== null).length;
      return { supermarketId, supermarketName: supermarket.name, coverage, complete: coverage === lines.length, total: lines.reduce((sum, line) => sum + (line.price ?? 0), 0), lines };
    }).sort((left, right) => left.total - right.total || right.coverage - left.coverage);
    return { itemCount: list.items.length, markets, bestSingle: markets.find((market) => market.complete) ?? null };
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
      name: z.string().min(2).max(160),
      startUrl: z.string().url().optional(),
      status: z.enum(["DRAFT", "TESTING", "ACTIVE", "DISABLED"]).default("DRAFT"),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: "INVALID_SCRAPER_FLOW" });
    const supermarket = await prisma.supermarket.findUnique({ where: { id: body.data.supermarketId } });
    if (!supermarket) return reply.code(404).send({ code: "SUPERMARKET_NOT_FOUND" });
    const startUrl = body.data.startUrl ?? supermarket.websiteUrl ?? undefined;
    if (!startUrl) return reply.code(400).send({ code: "SUPERMARKET_WEBSITE_REQUIRED" });
    const { supermarketId, name, status } = body.data;
    return reply.code(201).send(await prisma.scraperFlow.create({ data: { supermarketId, name, status, startUrl, version: 1 } }));
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

  app.get("/api/v1/admin/flyers/:flyerId", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const params = z.object({ flyerId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_FLYER_ID" });
    const flyer = await prisma.flyer.findUnique({ where: { id: params.data.flyerId }, include: { supermarket: true, source: true, pages: { orderBy: { pageNumber: "asc" } }, offers: { orderBy: { createdAt: "desc" } } } });
    if (!flyer) return reply.code(404).send({ code: "FLYER_NOT_FOUND" });
    return flyer;
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

  app.get("/api/v1/admin/brands", async (request, reply) => {
    const session = await getAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    return prisma.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { offers: true, products: true } } } });
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
      include: { supermarket: { select: { id: true, name: true } }, flyer: { select: { id: true, title: true } } },
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
    const body = z.object({ brandId: z.string().uuid().nullable().optional(), canonicalProductId: z.string().uuid().nullable().optional() }).safeParse(request.body);
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_CATALOG_UPDATE" });
    const offer = await prisma.offer.findUnique({ where: { id: params.data.offerId } });
    if (!offer) return reply.code(404).send({ code: "OFFER_NOT_FOUND" });
    return prisma.offer.update({ where: { id: offer.id }, data: body.data });
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
