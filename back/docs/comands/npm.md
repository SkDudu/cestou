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

### Flyer pipeline (SPEC 010)

| Comando | Descrição |
|---------|-----------|
| `npm run flyers:discover` | Seed São Luiz + descobrir encarte atual |
| `npm run flyers:download` | Baixar páginas → Convex Storage |
| `npm run flyers:extract` | OCR (Tesseract) + parser → offers |
| `npm run flyers:reextract` | Re-OCR com `--force` (substitui ofertas) |
| `npm run flyers:expire` | Marcar flyers com `validUntil` passado |
| `npm run flyers:sync` | expire → discover → download → extract |

```bash
npm run flyers:sync
npm run selfcheck --workspace=scraper
```

---

## Frontend (`cd front`)

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Next.js admin em :3000 |
| `npm run build` | Build produção |

Rotas admin: `/admin`, `/admin/supermarkets`, `/admin/flyers`, `/admin/offers`, `/admin/validation`, `/admin/errors`.
