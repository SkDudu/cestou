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

### Scraper — build / run

| Comando | Descrição |
|---------|-----------|
| `npm run build:scraper` | Compila TypeScript do scraper |
| `npm run dev:scraper` | Sobe scraper (`start` no workspace) |
| `npm run scrape` | Scrape com `SCRAPER_SUPERMARKET` do `.env` |

### Scrape por supermercado

```bash
npm run scrape:sao-luiz
npm run scrape:pao-de-acucar
npm run scrape:atacadao
```

Smoke / filtros:

```bash
# uma query
npm run scrape:sao-luiz -- --query="arroz"
npm run scrape:pao-de-acucar -- --query="arroz"
npm run scrape:atacadao -- --query="arroz"

# override de mercado
npm run scrape -- --supermarket=atacadao --query="leite"

# categoria / subcategoria / prioridade
npm run scrape:sao-luiz -- --category=higiene
npm run scrape -- --subcategory=higiene_bucal
npm run scrape -- --priority=1
```

### Validação (SPEC 006)

```bash
npm run validate                         # só pending (default)
npm run validate -- --all                # revalidar tudo
npm run validate -- --supermarket=sao-luiz
npm run validate -- --all --force        # sobrescreve override humano
```

### Brand enrichment (SPEC 007)

```bash
npm run enrich:brands                              # só sem marca (default)
npm run enrich:brands -- --missing-brand
npm run enrich:brands -- --supermarket=sao-luiz
npm run enrich:brands -- --all
npm run enrich:brands -- --all --force
```

Depois do enrich, atualizar scores:

```bash
npm run validate -- --all
```

### Image sync (SPEC 008)

```bash
npm run sync:images                              # pending
npm run sync:images -- --limit=50                # lote
npm run sync:images -- --supermarket=atacadao
npm run sync:images -- --failed --delay=600      # retry 429
npm run sync:images -- --all --delay=500
npm run sync:images -- --force                   # re-baixa (admin)
```

---

## Workspace scraper (`cd back/scraper`)

Equivalente direto (sem o wrapper da root `back/`):

| Comando | Descrição |
|---------|-----------|
| `npm run build` | `tsc` |
| `npm run start` | Roda `dist/index.js` com `.env` |
| `npm run dev` | build + start |
| `npm run scrape` | build + scrape |
| `npm run scrape:sao-luiz` | |
| `npm run scrape:pao-de-acucar` | |
| `npm run scrape:atacadao` | |
| `npm run validate` | |
| `npm run enrich:brands` | |
| `npm run sync:images` | |
| `npm run selfcheck` | Testes locais (normalize / validate / brand) |

```bash
cd back/scraper
npm run selfcheck
```

---

## Frontend (`cd front`)

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Next.js dev (http://localhost:3000) |
| `npm run build` | Build produção |
| `npm run start` | Serve build |
| `npm run lint` | ESLint |

Dashboard: http://localhost:3000/admin  
(Convex precisa estar no ar.)

---

## Fluxo típico do dia

```bash
# Terminal 1 — Convex
cd back && npm run convex:dev

# Terminal 2 — Dashboard
cd front && npm run dev

# Terminal 3 — coleta / qualidade
cd back
npm run scrape:atacadao -- --query="arroz"
npm run enrich:brands -- --missing-brand
npm run validate -- --all
npm run sync:images -- --limit=100 --delay=500
```

---

## Flags úteis (CLI scraper)

| Flag | Usado em | Descrição |
|------|----------|-----------|
| `--query=` | scrape | Uma query da taxonomia |
| `--category=` | scrape | Filtro categoria |
| `--subcategory=` | scrape | Filtro subcategoria |
| `--priority=` | scrape | Ex.: `1` |
| `--supermarket=` | scrape / validate / enrich / sync | `sao-luiz` \| `pao-de-acucar` \| `atacadao` |
| `--all` | validate / enrich / sync | Processa tudo |
| `--force` | validate / enrich / sync | Sobrescreve proteção |
| `--missing-brand` | enrich | Só sem marca |
| `--failed` | sync:images | Inclui falhas |
| `--limit=` | sync:images | Cap de itens |
| `--delay=` | sync:images | ms entre downloads (default ~500) |
