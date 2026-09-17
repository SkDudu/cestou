# Cestou — Backend

## Stack atual (fonte da verdade)

```text
Docker Compose (back/)
├── postgres   → PostgreSQL 16  (:5432)     ← banco
├── api        → Fastify + Prisma (:4000)
└── worker     → pg-boss + scraper jobs
         │
         └── volume storage-data → /data/storage  ← arquivos (só no Docker)
```

- **Banco:** PostgreSQL no Docker (Prisma).  
- **Arquivos:** volume nomeado `storage-data` (não fica pasta no repo).  
- **Visão local:** LM Studio no **Mac**; worker alcança via `host.docker.internal:1234`.  
- **Convex:** removido.

## Setup

```bash
cd back
cp .env.example .env
npm install
npx playwright install chromium

docker compose up -d --build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Smoke extract (Qwen / LM Studio)

LM Studio ligado no Mac. Encarte já baixado no volume.

```bash
cd back
npm run flyers:test-extraction:docker -- --page=1
npm run flyers:reextract:docker -- --flyer=<uuid> --page=1
```

Isso: sync src → worker → Node no container (volume `storage-data`) + LM Studio no Mac.  
Sem pasta `back/storage/` no repo.

Visão local: [`docs/local-qwen25-vl-lm-studio.md`](docs/local-qwen25-vl-lm-studio.md).  
Comandos: [`docs/comands/npm.md`](docs/comands/npm.md).

## Teach / locate (Fase 2)

```bash
cd back && npm run flows:session-worker   # Mac host + LM Studio :1234
```

Admin `/admin/scraper` → teach → **Detectar de novo** → Aprovar.  
Session-worker usa `MIMO_BASE_URL` (127.0.0.1), não o volume Docker.

## Admin

```bash
cd ../front-admin && npm install && npm run dev
```

## Wipe

```bash
cd back
npm run prisma:wipe
# arquivos: docker volume rm back_storage-data  (apaga encartes)
```
