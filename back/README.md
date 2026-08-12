# Cestou — Flyer-First Pipeline (SPEC 010)

## Stack

- Node.js + TypeScript
- Playwright (descoberta São Luiz / Mercadapp)
- Tesseract.js (OCR)
- Convex (dados + file storage)
- Next.js admin (`front/`)

## Setup

```bash
cd back
cp .env.example .env
npm install
npx playwright install chromium

# outro terminal
npx convex dev
```

## Flyers

```bash
npm run flyers:discover   # seed São Luiz + descobrir encarte
npm run flyers:download   # baixar páginas → Convex Storage
npm run flyers:extract    # OCR + parser → offers
npm run flyers:expire     # marcar encartes vencidos
npm run flyers:sync       # expire → discover → download → extract
```

Self-check do parser:

```bash
npm run selfcheck --workspace=scraper
```

## Admin

```bash
cd ../front
npm install
npm run dev
```

Abra `/admin` — overview, supermercados, encartes, ofertas, validação, erros.

## Wipe local

Banco local fica em `back/.convex/local/`. Para zerar: parar `convex dev`, apagar `back/.convex/local/default`, subir de novo. Também existe `npx convex run clearData:wipeAll` nas tabelas flyer.
