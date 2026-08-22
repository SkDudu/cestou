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

# Frontend admin
cd ../front-admin
npm install

# Frontend cliente
cd ../front-client
npm install
```

Convex local (deixar rodando em outro terminal):

```bash
cd back
npm run convex:dev
# ou: npx convex dev
```

---

## Backend (`cd back`)

### Convex

| Comando | Descrição |
|---------|-----------|
| `npm run convex:dev` | Convex local (:3210) |
| `npm run convex:deploy` | Deploy Convex |

### Flow Builder + extract

| Comando | Descrição |
|---------|-----------|
| `npm run flows:codegen -- <url>` | Playwright codegen (Chromium + Inspector) |
| `npm run flows:session-worker` | Worker Playwright p/ dashboard (:8791). Poller de discovery entra no mesmo processo. |
| `npm run flows:scheduler` | Poller sozinho (prod sem dashboard). Dev: não precisa se o worker já está up. |
| `npm run flows:run -- --flow=<id>` | Rodar fluxo via CLI (`--discovery` = sem download/MiMo) |
| `npm run flows:record` | Gravador CLI (opcional; preferir dashboard) |
| `npm run flyers:download` | Baixar páginas → Convex Storage |
| `npm run flyers:extract` | MiMo-V2.5 por página (fallback Tesseract) → offers |
| `npm run flyers:reextract` | Re-extrai com `--force` |
| `npm run mimo:test` | Smoke test da API MiMo |
| `npm run flyers:test-extraction` | Extrai uma página sem persistir |
| `npx convex run clearData:wipeAll` | Apagar tudo do banco |

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

Na data final, o mesmo worker faz discovery-only. Flyer igual (URL/hash) → skip. Flyer novo → baixa + MiMo → novo `validUntil`.

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
