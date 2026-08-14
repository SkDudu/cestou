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

# Frontend
cd ../front
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
| `npm run flows:session-worker` | Worker Playwright p/ dashboard (:8791) |
| `npm run flows:run -- --flow=<id>` | Rodar fluxo via CLI |
| `npm run flows:record` | Gravador CLI (opcional; preferir dashboard) |
| `npm run flyers:download` | Baixar páginas → Convex Storage |
| `npm run flyers:extract` | MiMo-V2.5 por página (fallback Tesseract) → offers |
| `npm run flyers:reextract` | Re-extrai com `--force` |
| `npm run mimo:test` | Smoke test da API MiMo |
| `npm run flyers:test-extraction` | Extrai uma página sem persistir |
| `npx convex run clearData:wipeAll` | Apagar tudo do banco |

```bash
# front: /admin/scraper → Iniciar worker | Abrir navegador | Rodar fluxo
npm run flows:session-worker
npm run flows:run -- --flow=<id> --ctx.storeId=355
```

Admin Flow Builder: `/admin/scraper`. **Iniciar worker** no dashboard sobe o Playwright (`POST /api/browser-worker`). Worker: `NEXT_PUBLIC_BROWSER_SESSION_URL=http://127.0.0.1:8791` (default).

Pipeline do fluxo: `discover-flyer` → `download-flyers` → `extract-offers` (MiMo) → ofertas no Convex.

---

## Frontend (`cd front`)

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Next.js admin em :3000 |
| `npm run build` | Build produção |

Rotas admin: `/admin`, `/admin/supermarkets`, `/admin/scraper`, `/admin/flyers`, `/admin/offers`, `/admin/validation`, `/admin/errors`.
