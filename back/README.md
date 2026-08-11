# Smart Grocery — Scraper Bootstrap (SPEC 002 + 003)

## Stack

- Node.js + TypeScript
- Playwright (Chromium)
- Convex
- Docker

## Setup

```bash
cd back
cp .env.example .env
npm install
npx convex dev   # sobe Convex local em :3210 (deixar rodando)
npx playwright install chromium
```

## Scrape (taxonomia SPEC 003)

Queries vivem em `scraper/src/config/queries.ts` — **não** no `.env`.

```bash
# São Luiz (Mercadinhos São Luiz — loja 355)
npm run scrape:sao-luiz

# Pão de Açúcar (Fortaleza CEP 60160-000)
npm run scrape:pao-de-acucar

# default = SCRAPER_SUPERMARKET no .env (sao-luiz)
npm run scrape

# smoke — uma query
npm run scrape:pao-de-acucar -- --query="arroz"
npm run scrape:sao-luiz -- --query="arroz"

# override via CLI
npm run scrape -- --supermarket=pao-de-acucar --query="leite"

# só uma categoria
npm run scrape:sao-luiz -- --category=higiene

# subcategoria
npm run scrape -- --subcategory=higiene_bucal

# só prioridade alta
npm run scrape -- --priority=1
```

## Validação determinística (SPEC 006)

Roda no scrape automaticamente. Backfill:

```bash
# só pending (default)
npm run validate

# revalidar tudo
npm run validate -- --all

# um supermercado
npm run validate -- --supermarket=sao-luiz

# sobrescrever override humano
npm run validate -- --all --force
```

## Brand enrichment (SPEC 007)

Extrai marca do nome (dicionário + heurística). Roda no scrape antes da validation.

```bash
# só sem marca (default)
npm run enrich:brands

# São Luiz
npm run enrich:brands -- --supermarket=sao-luiz --missing-brand

# reprocessar tudo
npm run enrich:brands -- --all
```

Depois do enrich, rode `npm run validate -- --all` para atualizar scores.

## Env (só runtime)

| Var | Default | Desc |
|-----|---------|------|
| `CONVEX_URL` | — | URL Convex |
| `SCRAPER_HEADLESS` | `true` | Chromium headless |
| `SCRAPER_TIMEOUT` | `60000` | Timeout ms |
| `SCRAPER_MAX_PRODUCTS` | `100` | Cap **por query** |
| `SCRAPER_DELAY_MS` | `1000` | Pausa entre queries |
| `SCRAPER_CATEGORY` | `all` | Filtro categoria |
| `SCRAPER_PRIORITY` | `all` | Filtro prioridade |
| `SCRAPER_SUPERMARKET` | `sao-luiz` | Adapter |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `error` |

## Adapters

- `sao-luiz` → [loja 355](https://mercadinhossaoluiz.com.br/loja/355) (Mercadapp)
- `pao-de-acucar` → [paodeacucar.com](https://www.paodeacucar.com) (GPA API, CEP Fortaleza)
- `demo` → books.toscrape.com

## Dashboard (SPEC 005)

```bash
cd ../front && npm install && npm run dev
# Convex must be running: npx convex dev
```

Open http://localhost:3000/admin
