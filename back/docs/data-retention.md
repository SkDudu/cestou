# SPEC 009 — Data Retention & Storage Budget

**Projeto:** Smart Grocery Price Comparator / Cestou  
**Módulo:** Convex Storage / Retention Pipeline  
**Versão:** 1.0.0  
**Status:** Superseded by SPEC 010 (Flyer-First)  
**Dependências:** SPEC 004 (Scraper Engine), SPEC 005 (Dashboard), SPEC 008 (Images)

> **Nota (2026-08):** o pipeline de catálogo (`prices` / `rawProducts` / scrape search) foi removido.
> Retention de histórico de preços de catálogo não se aplica até SPEC 013 (Price History) sobre ofertas de encarte.
> Manter este doc só como referência histórica.

---

# 1. Objetivo

Manter o banco Convex pequeno o suficiente para scrape diário contínuo, sem perder o que o produto precisa:

* catálogo de produtos;
* preço **atual** por supermercado;
* histórico de preço **útil** (janela limitada);
* validação de qualidade;
* imagens deduplicadas;
* observabilidade recente (jobs / erros).

Sem warehouse externo nesta fase.

---

# 2. Problema

Scrape diário hoje grava:

| Escrita | Comportamento atual | Crescimento |
|---------|---------------------|-------------|
| `products.upsert` | dedupe por nome/barcode | lento (bom) |
| `rawProducts.insert` | upsert se `externalId` | lento se ID sempre presente |
| `prices.insert` | **sempre insert** | **linear × dias** |
| `productValidations` | 1 por raw | estável |
| `scrapingJobs` | 1 por run | linear |
| `scrapeErrors` | por falha | linear |
| `rawData` | blob em todo patch | tamanho por doc |
| imagens | dedupe por hash (SPEC 008) | estável |

**Vilões:** `prices` (volume), `rawData` (peso), jobs/errors sem teto.

Estimativa grosseira (catálogo ~9k raw):

```text
prices sem skip:  ~9k × N scrapes/dia × 7 dias  → dezenas de milhares/semana
prices com skip:  só quando preço muda            → ordem de magnitude menor
```

---

# 3. Princípios

### Regra 1 — Snapshot ≠ histórico

```text
rawProducts  = estado ATUAL (1 doc por supermarket + externalId)
prices       = histórico (append controlado + retenção)
```

### Regra 2 — Não gravar o que não muda

Preço igual ao último → **não** insert em `prices`.

### Regra 3 — Payload bruto é descartável

`rawData` serve debug do scrape. Produto final não precisa. Não persistir longo prazo.

### Regra 4 — `externalId` obrigatório no caminho feliz

Sem `externalId` → `rawProducts` vira append-only → crescimento falso. Scrapers devem sempre enviar ID estável quando o site tiver.

### Regra 5 — Retenção por tabela, não “apagar tudo”

Cada tabela tem TTL / regra própria. Catálogo e snapshot atual **não** entram em purge genérico.

---

# 4. O que manter (modelo de dados)

```text
ESSENCIAL (sempre)
  products
  rawProducts          ← preço/nome/url atuais
  productValidations
  imageAssets + _storage
  dashboardStats
  supermarkets

HISTÓRICO (limitado)
  prices               ← skip-if-same + TTL 90 dias
  scrapingJobs         ← TTL 14 dias (finished)
  scrapeErrors         ← open forever; resolved TTL 7 dias

DESCARTÁVEL
  rawData              ← não gravar OU limpar pós-validação
```

---

# 5. Escopo

## Em escopo

1. Skip insert de `prices` quando preço/originalPrice iguais ao último.
2. Parar de persistir `rawData` (ou limpar após validação).
3. Cron de purge: `prices`, `scrapingJobs`, `scrapeErrors`.
4. Documentar política de `externalId`.
5. Ajustar contadores `dashboardStats` quando purge/skip afetar totais (recompute ok).

## Fora de escopo (fase posterior)

* Warehouse / S3 archive de histórico longo.
* Downsample diário/semanal após N dias.
* Compactação de `rawProducts` órfãos sem `externalId` (migração one-shot opcional).
* Mudança de schema para `isPromotion` index (já coberto por outras specs se necessário).

---

# 6. Regras detalhadas

## 6.1 Prices — skip-if-unchanged

Antes de `prices.insert` no pipeline (`persistProduct`):

```text
last = prices by_product_supermarket order by collectedAt desc take 1

if last exists
  AND last.price === new.price
  AND last.originalPrice === new.originalPrice
then
  SKIP insert
else
  INSERT
```

Notas:

* `discount` derivado; não precisa comparar se price/originalPrice batem.
* `rawProducts` **sempre** atualiza `price` / `collectedAt` (snapshot atual).
* Histórico no dashboard/produto usa `prices` — pontos só quando muda.

## 6.2 rawData

Opção A (preferida, YAGNI):

```text
Não enviar rawData no mutation rawProducts.insert
```

Opção B:

```text
Gravar só em scrape fail / debug flag
Após validate bem-sucedido → patch rawData = undefined
```

Default desta spec: **Opção A**.

## 6.3 Retenção — TTLs

| Tabela | Condição de purge | TTL default |
|--------|-------------------|-------------|
| `prices` | `collectedAt < now - TTL` | **90 dias** |
| `scrapingJobs` | `status ∈ {completed,failed}` e `finishedAt < now - TTL` | **14 dias** |
| `scrapeErrors` | `status === "resolved"` e `createdAt < now - TTL` | **7 dias** |
| `scrapeErrors` open | **nunca** auto-purge | — |
| `rawProducts` | sem purge automático | — |
| `products` | sem purge automático | — |

Constantes em um único lugar (ex.: `back/convex/retention.ts`):

```text
PRICES_TTL_MS = 90 * 24 * 60 * 60 * 1000
JOBS_TTL_MS = 14 * 24 * 60 * 60 * 1000
RESOLVED_ERRORS_TTL_MS = 7 * 24 * 60 * 60 * 1000
```

## 6.4 Cron purge

Reusar padrão de `crons.ts` + mutations internas paginadas (igual `dashboardStats`):

```text
cron interval: diário (ex. 04:00 UTC) OU a cada 24h
  → retention.purgePrices
  → retention.purgeJobs
  → retention.purgeResolvedErrors
  → opcional: dashboardStats.kickRecompute
```

Cada purge:

* `paginate` batches (ex. 500–2000 docs);
* delete;
* se não acabou → `scheduler.runAfter(0, sameFn, { cursor })`;
* **nunca** `.collect()` full table.

Índices já existentes:

* `prices.by_collectedAt`
* `scrapingJobs.by_startedAt` (filtrar finished + status em memória no batch, ou aceitar scan por startedAt antigo)
* `scrapeErrors.by_createdAt` + filtro `status === resolved`

> Nota: se purge por `startedAt` em jobs for impreciso, ok nesta fase — jobs recentes failed/completed raros demais pra importar. Preferir índice existente a schema novo.

## 6.5 externalId

Scrapers devem preencher `externalId` sempre que o site expõe ID estável.

Sem ID:

```text
rawProducts.insert → sempre cria doc novo
→ crescimento e duplicatas
```

Dashboard / validate devem tratar “sem externalId” como incompleto (já coberto por regras de validação).

---

# 7. Fluxo alvo

```text
Scrape produto
    ↓
products.upsert
    ↓
rawProducts upsert (sem rawData)
    ↓
último price igual? ──yes──→ skip prices.insert
         │
         no
         ↓
    prices.insert
    ↓
productValidations.setFromRules

─── diário ───
cron retention
    ↓
purge prices > 90d
purge jobs finished > 14d
purge errors resolved > 7d
    ↓
(opcional) recompute dashboardStats
```

---

# 8. Impacto no dashboard / queries

* `dashboard.metrics` / `dashboardStats`: após purge, recompute restaura contadores.
* `prices.historyByProduct`: histórico mais curto (90d) — aceitável.
* `prices.listPromotions`: usa `rawProducts` (snapshot), **não** depende de histórico longo.
* Admin runs/errors: lista recente; jobs antigos somem — ok.

---

# 9. Implementação sugerida (arquivos)

```text
back/convex/retention.ts     ← constantes + internalMutations purge*
back/convex/crons.ts         ← job diário
back/convex/prices.ts        ← opcional: helper lastPrice / skip no insert
back/scraper/.../convex.ts   ← skip-if-same no persistProduct; omit rawData
back/convex/rawProducts.ts   ← args.rawData opcional; default não gravar
```

Preferência de onde fazer skip:

1. **Convex `prices.insert`** (guarda única — todos callers) — melhor.
2. Ou só no scraper `persistProduct` — mais frágil.

Esta spec manda: **skip dentro da mutation `prices.insert`** (ou mutation dedicada `prices.insertIfChanged`).

---

# 10. Acceptance criteria

- [ ] Re-scrape do mesmo produto com mesmo preço **não** cria linha nova em `prices`.
- [ ] Mudança de `price` ou `originalPrice` **cria** linha nova.
- [ ] Novos `rawProducts` **não** persistem `rawData` por default.
- [ ] Cron diário remove `prices` com `collectedAt` > 90 dias (paginado, sem 32k blow).
- [ ] Cron remove jobs finished > 14 dias.
- [ ] Cron remove errors `resolved` > 7 dias; `open` permanece.
- [ ] Dashboard overview continua funcional após purge (recompute se necessário).
- [ ] Documentado em `back/docs/comands/npm.md` (se houver comando manual de purge).

---

# 11. Ordem de entrega

| Fase | Entrega | Risco |
|------|---------|-------|
| **P0** | `prices.insertIfChanged` (ou skip no insert) | baixo |
| **P0** | omit `rawData` no pipeline | baixo |
| **P1** | `retention.ts` + cron purge prices/jobs/errors | médio (delete) |
| **P2** | recompute stats pós-purge; comando manual force purge | baixo |
| **P3** | downsample / archive externo | só se 90d ainda pesar |

---

# 12. Riscos

| Risco | Mitigação |
|-------|-----------|
| Purge apaga histórico útil demais | TTL 90d configurável; começar conservador |
| Skip errado (float) | comparar números já normalizados do pipeline |
| Contadores dashboard stale | kick recompute após purge |
| Jobs running órfãos | purge só `completed` / `failed` com `finishedAt` |

---

# 13. Fora desta spec (lembrete)

Queries admin que ainda fazem full scan (`listPromotions` collect, etc.) são problema de **read limit**, não de retenção. Tratar em specs/fixes separados quando catálogo → 32k.

---

# 14. Resumo

```text
Snapshot atual em rawProducts
Histórico só quando preço muda
Histórico max 90 dias
Jobs 14d / errors resolved 7d
Sem rawData permanente
externalId sempre
```

Isso mantém funcionamento pleno (comparar preços atuais, promoções, validação, imagens) com teto previsível sob scrape diário.
