# Cestou — Flyer-First Pipeline (SPEC 010)

## Stack

- Node.js + TypeScript
- Playwright (Flow Builder / session worker)
- Tesseract.js (OCR fallback)
- MiMo-V2.5 (extração primária de ofertas)
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

Path principal: admin `/admin/scraper` (Flow Builder).

```bash
npm run flows:session-worker   # Playwright :8791 (ou Iniciar worker no admin)
npm run flows:run -- --flow=<id>
npm run flyers:download        # baixar páginas → Convex Storage
npm run flyers:extract         # MiMo-V2.5 (fallback Tesseract) → offers
npm run flyers:reextract       # force replace ofertas
npm run mimo:test -- --image=scraper/fixtures/flyers/sao-luiz/page-01.jpeg
npm run flyers:test-extraction -- --page=3
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

Abra `/admin` — overview, supermercados, Flow Builder, encartes, ofertas, validação, erros.

## Wipe local

Banco local fica em `back/.convex/local/`. Para zerar: parar `convex dev`, apagar `back/.convex/local/default`, subir de novo. Também existe `npx convex run clearData:wipeAll` nas tabelas flyer.
