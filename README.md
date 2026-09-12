# 🛒 Cestou — Plataforma de Inteligência em Ofertas

Sistema completo de raspagem de encartes, extração de ofertas e dashboard administrativo para supermercados.

**Branch Ativo:** `dev` | **Stack Principal:** TypeScript, Node.js, Next.js, Playwright, Prisma, PostgreSQL

---

## 📋 Sobre o Projeto

**Cestou** é uma plataforma de inteligência em ofertas de supermercados composta por três camadas principais:

1. **Backend (`/back`)** — Scraper de encartes, extração de ofertas com IA e API
2. **Admin (`/front-admin`)** — Dashboard interno para validação de dados
3. **Cliente (`/front-client`)** — App para usuários finais navegarem ofertas

### Stack por Componente

| Componente | Tecnologias | Função |
|-----------|-------------|--------|
| **Backend** | Node.js, TypeScript, Prisma, PostgreSQL, Fastify | Scraping, extração, API |
| **Admin** | Next.js 16, React 19, Tailwind, Radix UI | Validação de dados |
| **Cliente** | Next.js 16, React 19, Tailwind | Browse de ofertas |
| **IA/Visão** | MiMo-V2.5, Tesseract.js, Playwright | Extração de ofertas |
| **Banco** | PostgreSQL, Prisma, pg-boss | Dados e fila de jobs |

---

## 🚀 Setup Rápido

### Pré-requisitos
- Node.js 18+
- PostgreSQL 14+
- Playwright

### Backend

```bash
cd back
cp .env.example .env
npm install
npx playwright install chromium
npm run prisma:migrate
npm run api:dev          # Terminal 1
npm run worker:start     # Terminal 2
```

### Admin Dashboard

```bash
cd front-admin
cp .env.example .env.local
npm install
npm run dev
```

Acesse: **http://localhost:3000/admin**

### App Cliente (opcional)

```bash
cd front-client
npm install
npm run dev
```

Acesse: **http://localhost:3001**

---

## 🔧 Comandos Principais

### Pipeline de Encartes

```bash
cd back

# Iniciar worker de sessão (necessário para Flow Builder)
npm run flows:session-worker

# Executar um flow de scraping
npm run flows:run -- --flow=<id>

# Baixar PDFs dos encartes
npm run flyers:download

# Extrair ofertas com MiMo-V2.5
npm run flyers:extract

# Forçar re-extração
npm run flyers:reextract

# Testar MiMo com imagem de exemplo
npm run mimo:test -- --image=scraper/fixtures/flyers/sao-luiz/page-01.jpeg

# Testar pipeline de extração
npm run flyers:test-extraction -- --page=3
```

### Banco de Dados

```bash
cd back

npm run prisma:migrate    # Executar migrações
npm run prisma:seed       # Popular dados iniciais
npm run prisma:generate   # Gerar cliente Prisma
npm run typecheck         # Verificar tipos
npm run test              # Rodar testes
```

---

## 📁 Estrutura do Projeto

```
cestou/
├── back/                    # Backend principal
│   ├── api/                 # Servidor Fastify
│   ├── worker/              # Job worker
│   ├── scraper/             # Lógica de scraping (workspace)
│   ├── prisma/              # Schema e migrações
│   └── .env.example         # Template de env
│
├── front-admin/             # Dashboard admin (Next.js)
│   ├── app/                 # Páginas e layouts
│   └── components/          # Componentes reutilizáveis
│
├── front-client/            # App cliente (Next.js)
│   ├── app/                 # Páginas
│   └── components/          # Componentes
│
└── docs/                    # Documentação
```

---

## 🔐 Variáveis de Ambiente

### Backend (`.env`)

```dotenv
DATABASE_URL=postgresql://user:pass@localhost:5432/cestou

# MiMo Vision API
MIMO_API_KEY=sua_chave
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_MODEL=mimo-v2.5

# Scraper config
FLYER_ALLOWED_HOSTS=mercadapp.com.br,carrefour.com.br
FLYER_DOWNLOAD_TIMEOUT=30000

# Browser
BROWSER_HEADLESS=true
BROWSER_SESSION_HOST=127.0.0.1
BROWSER_SESSION_PORT=8791

LOG_LEVEL=info
```

Veja `back/.env.example` para a lista completa.

### Admin & Cliente

```dotenv
# .env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

---

## 📊 Fluxo de Dados

```
Flow Builder (Admin)
        ↓
Playwright Session Worker
        ↓
Download encartes
        ↓
Extração com MiMo-V2.5
        ↓
PostgreSQL
        ↓
API Endpoints
        ↓
Admin + Cliente
```

---

## 🧪 Testes

```bash
cd back

npm run test          # Rodar testes
npm run test:watch   # Modo watch
npm run typecheck    # Verificação de tipos
```

---

## 🛠️ Workflow de Desenvolvimento

1. **Criar novo Flow** → Admin Dashboard `/admin/flows` (com session worker ativo)
2. **Novo Supermercado** → Atualizar `FLYER_ALLOWED_HOSTS`, criar flow, testar
3. **Modificar Schema** → Editar `prisma/schema.prisma` → `npm run prisma:migrate`

---

## 🚨 Troubleshooting

| Problema | Solução |
|----------|---------|
| Playwright não instala | `npx playwright install --with-deps chromium` |
| Conexão BD falha | Verificar PostgreSQL: `psql postgres` |
| Session worker não responde | Verificar porta 8791 e rodar `npm run flows:session-worker` |
| Porta em uso | Mudar `BROWSER_SESSION_PORT` no `.env` |

---

## 📚 Documentação Adicional

- [`back/README.md`](./back/README.md) — Detalhes do backend
- [`front-admin/README.md`](./front-admin/README.md) — Dashboard
- [`front-client/README.md`](./front-client/README.md) — App cliente

---

**Atualizado:** 2026-09-12 | **Branch:** `dev`
