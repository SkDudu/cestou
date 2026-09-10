# Fastify, Prisma e PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Convex with a Docker-based Fastify, Prisma, PostgreSQL, pg-boss and SSE backend, then remove every Convex dependency from the scraper, admin and client.

**Architecture:** Fastify is the HTTP boundary and authenticates administrators with server-side sessions. Prisma owns relational data and migrations in PostgreSQL; pg-boss workers own asynchronous scraper work and schedules; API and worker share a local Docker volume for files. The admin and client use typed REST; only scraper-run progress uses SSE.

**Tech Stack:** Node.js 22, TypeScript, Fastify, Prisma, PostgreSQL 16, pg-boss, Argon2id, Zod, Vitest, Supertest/`fastify.inject`, Docker Compose, Next.js.

**Spec:** `docs/superpowers/specs/2026-09-10-fastify-prisma-postgres-design.md`

## Global Constraints

- Development is local-only and Docker Compose runs `postgres`, `api`, and `worker`.
- PostgreSQL is the single source of truth; pg-boss uses a dedicated schema in that same database.
- Use UUID primary keys, foreign keys, explicit delete behavior, and all indexes listed in the spec.
- Use `STORAGE_ROOT=/data/storage` as a shared Docker volume; store only relative paths in the database.
- Validate every external request with Zod; do not load whole tables in request paths.
- Admin sessions use `HttpOnly`, `SameSite=Lax` cookies and Argon2id password hashes.
- Read the master email/password from `ADMIN_MASTER_EMAIL` and `ADMIN_SEED_PASSWORD`; never commit or print their values.
- REST performs commands; SSE only publishes `ScraperRunEvent` updates and supports `Last-Event-ID` recovery.
- No Convex import, package, environment variable, script or setup instruction remains after Task 12.

---

### Task 1: Establish the Dockerized backend workspace

**Files:**
- Create: `back/Dockerfile`
- Modify: `back/docker-compose.yml`
- Modify: `back/package.json`
- Create: `back/.env.example`
- Modify: `back/.gitignore`
- Create: `back/api/src/server.ts`
- Create: `back/worker/src/worker.ts`
- Create: `back/api/test/health.test.ts`

**Interfaces:**
- Produces `npm run docker:up`, `npm run api:dev`, and `npm run worker:dev`.
- Produces `GET /health` with `{ status: "ok" }`.

- [ ] **Step 1: Write the failing health test**

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server";

describe("GET /health", () => {
  it("returns the process health", async () => {
    const app = await buildApp({ databaseUrl: "postgresql://unused" });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix back run test -- api/test/health.test.ts`

Expected: FAIL because `buildApp` does not exist.

- [ ] **Step 3: Add the minimal Fastify server and package scripts**

```ts
export async function buildApp() {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}
```

Add Docker Compose services `postgres`, `api`, and `worker`, named volumes `postgres-data` and `storage-data`, a PostgreSQL healthcheck, and `depends_on: condition: service_healthy` for API/worker. The Dockerfile must use Node 22, install from lockfile, run TypeScript, and set `STORAGE_ROOT=/data/storage`.

- [ ] **Step 4: Run the test and local Compose smoke check**

Run: `npm --prefix back run test -- api/test/health.test.ts && docker compose -f back/docker-compose.yml config`

Expected: test PASS and Compose config validates with three services.

- [ ] **Step 5: Commit**

```bash
git add back/Dockerfile back/docker-compose.yml back/package.json back/.env.example back/.gitignore back/api back/worker
git commit -m "feat: add Docker Fastify backend foundation"
```

### Task 2: Model the PostgreSQL schema, migrations and master-admin seed

**Files:**
- Create: `back/prisma/schema.prisma`
- Create: `back/prisma/seed.ts`
- Create: `back/prisma/migrations/<timestamp>_initial/migration.sql`
- Create: `back/prisma/test/schema.test.ts`
- Modify: `back/package.json`

**Interfaces:**
- Produces Prisma models for every entity in `docs/convex-removal-inventory.md`.
- Produces `seedMasterAdmin(prisma, env)` with idempotent behavior.

- [ ] **Step 1: Write a failing seed test**

```ts
it("creates the configured master once and hashes its password", async () => {
  await seedMasterAdmin(prisma, { ADMIN_MASTER_EMAIL: "admin@example.test", ADMIN_SEED_PASSWORD: "test-secret" });
  await seedMasterAdmin(prisma, { ADMIN_MASTER_EMAIL: "admin@example.test", ADMIN_SEED_PASSWORD: "test-secret" });
  const users = await prisma.user.findMany();
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject({ email: "admin@example.test", role: "ADMIN_MASTER" });
  expect(users[0].passwordHash).not.toBe("test-secret");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix back run test -- prisma/test/schema.test.ts`

Expected: FAIL because models and seed do not exist.

- [ ] **Step 3: Implement schema and migration**

Define `User`, `Session`, every 22 domain entity, `ScraperRunEvent`, enums for existing status fields, UUID defaults, relationships, composite unique constraints and indexes from the spec. Implement:

```ts
export async function seedMasterAdmin(prisma: PrismaClient, env: SeedEnv) {
  const passwordHash = await argon2.hash(env.ADMIN_SEED_PASSWORD, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email: env.ADMIN_MASTER_EMAIL.toLowerCase() },
    update: { role: "ADMIN_MASTER", passwordHash },
    create: { email: env.ADMIN_MASTER_EMAIL.toLowerCase(), passwordHash, role: "ADMIN_MASTER" },
  });
}
```

- [ ] **Step 4: Apply migration and run seed test**

Run: `docker compose -f back/docker-compose.yml up -d postgres && npm --prefix back run prisma:migrate && npm --prefix back run test -- prisma/test/schema.test.ts`

Expected: migration succeeds and test PASS.

- [ ] **Step 5: Commit**

```bash
git add back/prisma back/package.json
git commit -m "feat: add Prisma PostgreSQL domain schema"
```

### Task 3: Implement Fastify database, validation, auth and admin authorization

**Files:**
- Create: `back/api/src/plugins/prisma.ts`
- Create: `back/api/src/plugins/auth.ts`
- Create: `back/api/src/modules/auth/routes.ts`
- Create: `back/api/src/modules/auth/service.ts`
- Create: `back/api/test/auth.test.ts`
- Modify: `back/api/src/server.ts`

**Interfaces:**
- Produces `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Produces `requireAdmin(request)` that accepts only `ADMIN_MASTER` sessions.

- [ ] **Step 1: Write failing login and authorization tests**

```ts
it("sets an HttpOnly session cookie for valid credentials", async () => {
  const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "admin@example.test", password: "test-secret" } });
  expect(response.statusCode).toBe(204);
  expect(response.headers["set-cookie"]).toContain("HttpOnly");
});

it("rejects an admin route without a session", async () => {
  const response = await app.inject({ method: "GET", url: "/api/v1/admin/dashboard/overview" });
  expect(response.statusCode).toBe(401);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix back run test -- api/test/auth.test.ts`

Expected: FAIL with 404 or missing auth plugin.

- [ ] **Step 3: Implement sessions and route protection**

Validate login payload with Zod, verify Argon2id, generate a cryptographically random token, store only its SHA-256 hash in `Session`, and serialize the raw token in the cookie. Authenticate on each request by hashing the cookie token and loading a non-expired session.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm --prefix back run test -- api/test/auth.test.ts && npm --prefix back run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add back/api
git commit -m "feat: add Fastify admin authentication"
```

### Task 4: Add local file storage with transactional metadata

**Files:**
- Create: `back/api/src/modules/storage/service.ts`
- Create: `back/api/src/modules/storage/routes.ts`
- Create: `back/api/test/storage.test.ts`
- Modify: `back/api/src/server.ts`
- Modify: `back/prisma/schema.prisma`

**Interfaces:**
- Produces `writeFile(input): Promise<{ relativePath, sha256, bytes, mimeType }>`.
- Produces protected `POST /api/v1/admin/storage/uploads` and `GET /api/v1/admin/storage/:path`.

- [ ] **Step 1: Write failing storage tests**

```ts
it("writes below STORAGE_ROOT and rejects path traversal", async () => {
  const saved = await storage.writeFile({ scope: "flyers", filename: "sample.pdf", mimeType: "application/pdf", body: Buffer.from("pdf") });
  expect(saved.relativePath).toMatch(/^flyers\//);
  await expect(storage.readFile("../../secret")).rejects.toMatchObject({ code: "INVALID_PATH" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix back run test -- api/test/storage.test.ts`

Expected: FAIL because storage service does not exist.

- [ ] **Step 3: Implement safe storage**

Normalize and validate file extension/MIME, calculate SHA-256 while writing, build paths from UUIDs, reject absolute paths and `..`, and ensure resolved paths remain inside `STORAGE_ROOT`. Persist only `relativePath`, hash, size and MIME fields on flyers/pages.

- [ ] **Step 4: Run test and Compose volume check**

Run: `npm --prefix back run test -- api/test/storage.test.ts && docker compose -f back/docker-compose.yml up -d api`

Expected: PASS and API starts with the shared `storage-data` volume.

- [ ] **Step 5: Commit**

```bash
git add back/api/src/modules/storage back/prisma/schema.prisma back/api/test/storage.test.ts back/api/src/server.ts
git commit -m "feat: add local flyer file storage"
```

### Task 5: Add pg-boss queue, worker jobs, schedules and persistent run events

**Files:**
- Create: `back/worker/src/queue.ts`
- Create: `back/worker/src/jobs/scraper-run.ts`
- Create: `back/worker/src/schedules.ts`
- Create: `back/api/src/modules/scraper/run-events.ts`
- Create: `back/api/test/scraper-run-events.test.ts`
- Modify: `back/worker/src/worker.ts`
- Modify: `back/prisma/schema.prisma`

**Interfaces:**
- Produces `enqueueScraperRun({ runId }): Promise<void>`.
- Produces `appendRunEvent(prisma, runId, type, payload): Promise<ScraperRunEvent>`.
- Produces queues `scraper.run`, `flyer.lifecycle`, `storage.cleanup` and scheduled jobs.

- [ ] **Step 1: Write a failing idempotency/event test**

```ts
it("assigns monotonic event sequence per run", async () => {
  const first = await appendRunEvent(prisma, run.id, "step.started", { step: 1 });
  const second = await appendRunEvent(prisma, run.id, "progress", { percent: 20 });
  expect([first.sequence, second.sequence]).toEqual([1, 2]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix back run test -- api/test/scraper-run-events.test.ts`

Expected: FAIL because the event model/service is absent.

- [ ] **Step 3: Implement queue and job semantics**

Create pg-boss with a dedicated `pgboss` schema. Use a transaction to create `ScraperRun`, append its initial event and enqueue `scraper.run`. Each worker handler acquires its run, checks cancellation between stages, appends event records, retries with bounded exponential backoff and marks terminal state once. Register schedules with stable names.

- [ ] **Step 4: Run integration test**

Run: `docker compose -f back/docker-compose.yml up -d postgres && npm --prefix back run test -- api/test/scraper-run-events.test.ts`

Expected: PASS; the second event sequence is 2.

- [ ] **Step 5: Commit**

```bash
git add back/worker back/api/src/modules/scraper back/api/test/scraper-run-events.test.ts back/prisma/schema.prisma
git commit -m "feat: add pg-boss scraper job infrastructure"
```

### Task 6: Implement scraper/admin routes and SSE recovery

**Files:**
- Create: `back/api/src/modules/scraper/routes.ts`
- Create: `back/api/src/modules/scraper/service.ts`
- Create: `back/api/test/scraper-routes.test.ts`
- Create: `back/api/test/sse.test.ts`
- Modify: `back/api/src/server.ts`

**Interfaces:**
- Produces `POST /api/v1/admin/scraper-flows/:id/runs`, `POST /api/v1/admin/scraper-runs/:id/cancel`, and `GET /api/v1/admin/scraper-runs/:id/events`.
- SSE emits `id: <sequence>` and JSON event payloads.

- [ ] **Step 1: Write failing route and SSE tests**

```ts
it("creates a run and enqueues it", async () => {
  const response = await authed.inject({ method: "POST", url: `/api/v1/admin/scraper-flows/${flow.id}/runs` });
  expect(response.statusCode).toBe(202);
  expect(response.json()).toMatchObject({ status: "running" });
});

it("replays only missed SSE events", async () => {
  const response = await authed.inject({ method: "GET", url: `/api/v1/admin/scraper-runs/${run.id}/events`, headers: { "last-event-id": "1" } });
  expect(response.body).toContain("id: 2");
  expect(response.body).not.toContain("id: 1");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix back run test -- api/test/scraper-routes.test.ts api/test/sse.test.ts`

Expected: FAIL with 404.

- [ ] **Step 3: Implement services and routes**

Use cursor/event sequence lookup for SSE replay, set `Content-Type: text/event-stream`, disable buffering, emit heartbeat comments, and close connections on client disconnect. Protect every route with `requireAdmin`.

- [ ] **Step 4: Run route tests**

Run: `npm --prefix back run test -- api/test/scraper-routes.test.ts api/test/sse.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add back/api/src/modules/scraper back/api/test
git commit -m "feat: add scraper REST and SSE endpoints"
```

### Task 7: Port the scraper persistence adapter and job pipeline

**Files:**
- Create: `back/scraper/src/flyers/core/api-client.ts`
- Modify: `back/scraper/src/flyers/core/flyer-storage.ts`
- Modify: `back/scraper/src/flyers/core/flyer-config.ts`
- Modify: `back/scraper/src/flyers/jobs/flow-scheduler.ts`
- Modify: `back/scraper/src/flyers/runner/execute-flow.ts`
- Modify: `back/scraper/src/flyers/runner/flow-pipeline.ts`
- Create: `back/scraper/src/flyers/core/api-client.test.ts`

**Interfaces:**
- Consumes Fastify routes from Tasks 4–6.
- Produces `ApiClient` methods matching scraper needs: sources, flyers, pages, offers, runs and file upload.

- [ ] **Step 1: Write a failing API client contract test**

```ts
it("uploads a flyer then attaches its returned file metadata", async () => {
  await client.uploadFlyerFile({ flyerId: "flyer-id", contentType: "application/pdf", bytes: Buffer.from("pdf") });
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/admin/flyers/flyer-id/file"), expect.objectContaining({ method: "POST" }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=scraper -- api-client.test.ts`

Expected: FAIL because the client is absent.

- [ ] **Step 3: Implement HTTP adapter and remove Convex calls**

Replace `ConvexHttpClient`, `anyApi`, generated API types and `CONVEX_URL` with a typed fetch client using `API_URL`. Map each existing helper to its REST route and keep the existing exported `flyer-storage` function signatures until pipeline tests pass. Change scheduler invocation to pg-boss/API scheduling, not Convex cron.

- [ ] **Step 4: Run scraper tests and a local run**

Run: `npm run test --workspace=scraper && npm run typecheck --workspace=scraper`

Expected: PASS with no `convex` import in `back/scraper`.

- [ ] **Step 5: Commit**

```bash
git add back/scraper
git commit -m "feat: migrate scraper storage to Fastify API"
```

### Task 8: Convert the admin foundation, auth and scraper views to REST/SSE

**Files:**
- Create: `front-admin/src/lib/api-client.ts`
- Create: `front-admin/src/lib/api-hooks.ts`
- Create: `front-admin/src/lib/use-scraper-run-events.ts`
- Create: `front-admin/src/components/AdminAuthGate.tsx`
- Delete: `front-admin/src/components/ConvexClientProvider.tsx`
- Modify: `front-admin/src/app/layout.tsx`
- Modify: `front-admin/src/app/admin/scraper/page.tsx`
- Modify: `front-admin/src/app/admin/scraper/[id]/page.tsx`
- Modify: `front-admin/src/app/admin/scraper/[id]/run/page.tsx`
- Modify: `front-admin/src/app/admin/extraction/page.tsx`
- Modify: `front-admin/src/app/admin/extraction/[runId]/page.tsx`
- Test: `front-admin/src/lib/api-client.test.ts`

**Interfaces:**
- Consumes `/api/v1/auth/*`, scraper REST routes and SSE from Tasks 3 and 6.
- Produces `api.get<T>()`, `api.post<T>()`, cursor-list hooks and `useScraperRunEvents(runId)`.

- [ ] **Step 1: Write failing client/SSE hook tests**

```ts
it("sends cookies and converts API errors", async () => {
  await expect(api.get("/api/v1/admin/dashboard/overview")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

it("invalidates the run query after a completion event", () => {
  renderHook(() => useScraperRunEvents("run-id"));
  emitEvent("run.completed", { runId: "run-id" });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["scraper-run", "run-id"] });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix front-admin run test -- api-client.test.ts`

Expected: FAIL because REST client and hook are absent.

- [ ] **Step 3: Implement API provider and migrate scraper/extraction screens**

Use a query-cache library already approved for the app or a focused local hook wrapper. Set `credentials: "include"`; redirect 401 responses to the login screen. Use `EventSource` for run events, query the current run on reconnect, and close on component cleanup. Replace all Convex usage in specified files.

- [ ] **Step 4: Run UI tests, lint and build**

Run: `npm --prefix front-admin run test && npm --prefix front-admin run lint && npm --prefix front-admin run build`

Expected: PASS and no Convex import in the migrated views.

- [ ] **Step 5: Commit**

```bash
git add front-admin
git commit -m "feat: migrate admin scraper screens to REST SSE"
```

### Task 9: Convert remaining admin domains to indexed REST endpoints

**Files:**
- Create: `back/api/src/modules/{dashboard,catalog,flyers,offers,networks}/routes.ts`
- Create: `back/api/src/modules/{dashboard,catalog,flyers,offers,networks}/service.ts`
- Create: `back/api/test/{dashboard,catalog,flyers,offers,networks}.test.ts`
- Modify: all remaining `front-admin/src/app/admin/**/*.tsx`
- Modify: all remaining `front-admin/src/components/admin/**/*.tsx` that import Convex

**Interfaces:**
- Produces paginated `/api/v1/admin/offers`, filtered flyer/catalog endpoints, dashboard aggregates and network CRUD.
- Consumes the REST client from Task 8.

- [ ] **Step 1: Write failing pagination and aggregate tests**

```ts
it("returns offers with a stable cursor and never returns all rows", async () => {
  const response = await authed.inject({ method: "GET", url: "/api/v1/admin/offers?limit=2" });
  expect(response.json()).toMatchObject({ items: expect.any(Array), hasMore: true, nextCursor: expect.any(String) });
  expect(response.json().items).toHaveLength(2);
});

it("computes dashboard counts with grouped database queries", async () => {
  const response = await authed.inject({ method: "GET", url: "/api/v1/admin/dashboard/overview" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toHaveProperty("offersPending");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix back run test -- api/test/offers.test.ts api/test/dashboard.test.ts`

Expected: FAIL with missing routes.

- [ ] **Step 3: Implement routes, Prisma queries and UI conversion**

Use `findMany({ take: limit + 1, cursor, orderBy })` for lists, Prisma aggregates/group-by or parameterized SQL for time series/comparisons, and transactions for multi-record mutations. Convert dashboard, validation, flyers, offers, brands, products, prices, supermarkets and modal components. Preserve every control documented in the Convex inventory.

- [ ] **Step 4: Run all admin/backend checks**

Run: `npm --prefix back run test && npm --prefix front-admin run lint && npm --prefix front-admin run build`

Expected: PASS; `rg 'convex' front-admin/src` returns no output.

- [ ] **Step 5: Commit**

```bash
git add back/api front-admin
git commit -m "feat: migrate admin data domains to Fastify"
```

### Task 10: Migrate client auth and app-client API consumers

**Files:**
- Create: `back/api/src/modules/client/{routes,service}.ts`
- Create: `back/api/test/client-api.test.ts`
- Create: `front-client/src/lib/api-client.ts`
- Create: `front-client/src/components/SessionProvider.tsx`
- Delete: `front-client/src/components/ConvexClientProvider.tsx`
- Modify: `front-client/src/components/{AuthGate,AuthForm,AppShell}.tsx`
- Modify: `front-client/src/app/{page,busca/page,encartes/page,encartes/[id]/page,favoritos/page,lista/page,lista/comparar/page,mercados/page,onboarding/page}.tsx`

**Interfaces:**
- Produces authenticated client routes for profile, location, favorites, lists, offers, flyers and stores.
- Produces a client session UI independent of `@convex-dev/auth`.

- [ ] **Step 1: Write failing client authorization tests**

```ts
it("isolates a shopping list to its authenticated client", async () => {
  const otherUserResponse = await otherClient.inject({ method: "GET", url: `/api/v1/client/lists/${list.id}` });
  expect(otherUserResponse.statusCode).toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix back run test -- api/test/client-api.test.ts`

Expected: FAIL because client routes are absent.

- [ ] **Step 3: Implement client routes and UI migration**

Use the same session infrastructure with `CLIENT` authorization, scoped Prisma queries by `userId`, and REST client hooks with cookies. Port search, favorites, locations, encartes, stores and shopping-list flows. Do not expose admin endpoints to client sessions.

- [ ] **Step 4: Run tests and frontend verification**

Run: `npm --prefix back run test -- api/test/client-api.test.ts && npm --prefix front-client run lint && npm --prefix front-client run build`

Expected: PASS; `rg 'convex' front-client/src` returns no output.

- [ ] **Step 5: Commit**

```bash
git add back/api front-client
git commit -m "feat: migrate client app off Convex"
```

### Task 11: Import, reconcile and benchmark migrated data

**Files:**
- Create: `back/scripts/import-convex-data.ts`
- Create: `back/scripts/reconcile-convex-data.ts`
- Create: `back/scripts/benchmark-api.ts`
- Create: `back/scripts/test/import-convex-data.test.ts`
- Create: `docs/migration/postgres-data-reconciliation.md`
- Modify: `back/package.json`

**Interfaces:**
- Produces `npm run data:import`, `npm run data:reconcile`, `npm run benchmark:api`.
- Produces a reconciliation report with row counts, orphan count, duplicate count and file count per entity.

- [ ] **Step 1: Write a failing importer idempotency test**

```ts
it("imports the same exported flyer twice without duplicate rows", async () => {
  await importConvexData(prisma, fixture);
  await importConvexData(prisma, fixture);
  expect(await prisma.flyer.count()).toBe(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix back run test -- scripts/test/import-convex-data.test.ts`

Expected: FAIL because importer is absent.

- [ ] **Step 3: Implement import, reconciliation and benchmark scripts**

Map Convex IDs to UUIDs in a durable mapping table/file during import, import parent records before children, copy files into `STORAGE_ROOT`, verify hashes, and use upserts. Benchmark dashboard overview, paginated offers, compare-markets, price history and batch offer insert; report p50/p95 and rows returned.

- [ ] **Step 4: Run fixture import, reconciliation and benchmark**

Run: `npm --prefix back run test -- scripts/test/import-convex-data.test.ts && npm --prefix back run data:reconcile && npm --prefix back run benchmark:api`

Expected: importer PASS; reconciliation has zero unexpected orphans/duplicates; benchmark report is written.

- [ ] **Step 5: Commit**

```bash
git add back/scripts docs/migration back/package.json
git commit -m "feat: add Convex data migration verification"
```

### Task 12: Remove Convex and verify the final Docker-only backend

**Files:**
- Delete: `back/convex/`
- Delete: `back/convex.json`
- Modify: `back/package.json`
- Modify: `back/package-lock.json`
- Modify: `back/scraper/package.json`
- Modify: `back/scraper/package-lock.json`
- Modify: `front-admin/package.json`
- Modify: `front-admin/package-lock.json`
- Modify: `front-client/package.json`
- Modify: `front-client/package-lock.json`
- Modify: `back/README.md`, `front-admin/README.md`, `front-client/README.md`, and Convex references under `back/docs/` and `docs/`
- Modify: `.env.example` files and `.gitignore` files
- Create: `docs/migration/convex-removal-checklist.md`

**Interfaces:**
- Removes `convex`, `@convex-dev/auth`, generated types, providers, scripts and every runtime dependency.
- Retains only historical migration references in `docs/convex-removal-inventory.md` and migration documentation.

- [ ] **Step 1: Write the failing removal verification script**

```ts
const forbidden = ["convex/react", "convex/browser", "convex/server", "@convex-dev/auth", "NEXT_PUBLIC_CONVEX_URL", "CONVEX_URL"];
for (const token of forbidden) {
  expect(scanProject({ exclude: ["docs/convex-removal-inventory.md", "docs/migration/"] })).not.toContain(token);
}
```

- [ ] **Step 2: Run it to verify it fails before removal**

Run: `npm --prefix back run verify:no-convex`

Expected: FAIL and list current references.

- [ ] **Step 3: Remove all Convex artifacts and update docs**

Delete only the exact files listed above after Tasks 1–11 pass. Run npm uninstall in each package, regenerate lockfiles, remove providers and env fallbacks, and replace setup docs with Docker/Fastify/Prisma instructions. Do not remove historical migration inventory.

- [ ] **Step 4: Run the final verification suite**

Run: `npm --prefix back run verify:no-convex && docker compose -f back/docker-compose.yml up --build -d && npm --prefix back run prisma:migrate && npm --prefix back run test && npm --prefix back run typecheck && npm --prefix front-admin run lint && npm --prefix front-admin run build && npm --prefix front-client run lint && npm --prefix front-client run build`

Expected: every command PASS; `rg -i convex` finds only intentionally retained migration history.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove Convex backend"
```

## Final Review Checklist

- [ ] Verify Docker starts Postgres, API and worker from a clean clone using only `.env` based on `.env.example`.
- [ ] Verify master admin login without revealing credentials in output or source control.
- [ ] Verify a scraper flow reports progress through SSE, can be cancelled, and survives worker retry.
- [ ] Verify files persist across API/worker restarts and remain inside the storage volume.
- [ ] Verify admin and client functionality against PostgreSQL with no Convex package installed.
- [ ] Compare benchmark p50/p95 and payload sizes against baseline findings from the Convex inventory.
