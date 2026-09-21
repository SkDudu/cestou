# Comandos npm — Cestou / Smart Grocery

Todos os scripts npm do monorepo. Rodar a partir do diretório indicado.

---

## Setup (primeira vez)

```bash
# Backend
cd back
cp .env.example .env
npm install
npx playwright install chromium
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# Frontend admin
cd ../front-admin
npm install

# Frontend cliente
cd ../front-client
npm install
```

Postgres local via `DATABASE_URL` no `back/.env` (default: `127.0.0.1:5432/smart_grocery`).

---

## Backend (`cd back`)

### API + worker

| Comando | Descrição |
|---------|-----------|
| `npm run api:dev` | API Fastify com watch (:4000) |
| `npm run api:start` | API Fastify |
| `npm run worker:start` | Worker pg-boss |

### Prisma / banco

| Comando | Descrição |
|---------|-----------|
| `npm run prisma:generate` | Gera o client Prisma |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:seed` | Cria/atualiza `ADMIN_MASTER` + `CLIENT` (env) |
| `npm run prisma:wipe` | **Limpa todos os dados** (TRUNCATE) e re-seed admin + client |
| `npm run prisma:reset` | Drop schema + migrations + seed (`migrate reset --force`) |

```bash
# Limpar banco local (dados só; schema fica)
npm run prisma:wipe

# Nuclear: dropar tudo e reaplicar migrations
npm run prisma:reset
```

`prisma:wipe` só roda em host local (`localhost` / `127.0.0.1`). Para remoto: `ALLOW_REMOTE_WIPE=1`. Bloqueado se `NODE_ENV=production`.

### Utilitários

| Comando | Descrição |
|---------|-----------|
| `npm run data:reconcile` | Contagens + integridade Postgres → `reports/` |
| `npm run verify:no-convex` | Garante que não restou Convex |
| `npm run benchmark:api` | Benchmark da API |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |

### Flow Builder + extract

| Comando | Descrição |
|---------|-----------|
| `npm run flows:codegen -- <url>` | Playwright codegen (Chromium + Inspector) |
| `npm run flows:session-worker` | Worker Playwright p/ dashboard (:8791). Poller de discovery entra no mesmo processo. |
| `npm run flows:scheduler` | Poller sozinho (prod sem dashboard). Dev: não precisa se o worker já está up. |
| `npm run flows:run -- --flow=<id>` | Rodar fluxo via CLI (`--discovery` = sem download/MiMo) |
| `npm run flows:record` | Gravador CLI (opcional; preferir dashboard) |
| `npm run flyers:download` | Baixar páginas → storage local |
| `npm run flyers:extract` | MiMo-V2.5 por página (fallback Tesseract) → offers |
| `npm run flyers:reextract` | Re-extrai com `--force` |
| `npm run mimo:test` | Smoke test da API MiMo |
| `npm run flyers:test-extraction` | Extrai uma página sem persistir |

```bash
# front: /admin/scraper → Iniciar worker | Abrir codegen | Rodar fluxo
cd back
npm run flows:codegen -- https://mercadinhossaoluiz.com.br/loja/355/encartes
```

São Luiz: no codegen, **clica Continuar** (modal não some sozinho). Copia o click. Steps do flow: navigate `/encartes` → o run já espera/clica Continuar → wait galeria → `discover-flyer`. Sem `select-scope` obrigatório.

```bash
npm run flows:session-worker
npm run flows:run -- --flow=<id> --ctx.storeId=355
```

Admin Flow Builder: `/admin/scraper`. **Iniciar worker** no dashboard sobe o Playwright (`POST /api/browser-worker`). Worker: `NEXT_PUBLIC_BROWSER_SESSION_URL=http://127.0.0.1:8791` (default).

Pipeline manual (dashboard / `flows:run`): `discover-flyer` → `download-flyers` → `extract-offers` (MiMo) → `nextRunAt = validUntil` do flyer.

Na data final, o mesmo worker faz discovery + download (sem MiMo). Flyer igual (URL/hash) → skip. Flyer novo → baixa; `extractPending` no mesmo tick → MiMo → novo `validUntil`. Check periódico: no máximo a cada 6h.

`npm run flows:scheduler` só se quiser poller sem o worker do dashboard.

---

## Frontend admin (`cd front-admin`)

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Next.js admin em :3000 |
| `npm run build` | Build produção |

Rotas admin: `/admin`, `/admin/supermarkets`, `/admin/scraper`, `/admin/flyers`, `/admin/offers`, `/admin/validation`, `/admin/errors`.

---

## Frontend cliente (`cd front-client`)

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Next.js cliente em :3001 |
| `npm run build` | Build produção |

Spec: `docs/cliente-mvp.md`.
