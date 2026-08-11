# SPEC 004 — Generic Supermarket Scraper Engine

**Projeto:** Smart Grocery Price Comparator
**Módulo:** Scraper Infrastructure
**Versão:** 1.0.0
**Status:** Implementation Ready

---

# 1. Objetivo

Criar uma arquitetura genérica de scraping capaz de suportar múltiplos supermercados utilizando um único engine.

O sistema deverá permitir adicionar um novo supermercado implementando apenas um **Adapter** específico.

A arquitetura deverá evitar:

* duplicação de código;
* engines independentes;
* lógica específica de supermercado no core;
* persistência específica;
* configurações duplicadas;
* múltiplos containers por supermercado.

---

# 2. Conceito principal

O sistema deverá separar:

```text
CORE
```

de:

```text
SUPERMARKET ADAPTER
```

Arquitetura:

```text
                         SCRAPER ENGINE
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
         São Luiz       Pão de Açúcar     Futuro Mercado
          Adapter           Adapter          Adapter
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                         RawProduct
                              │
                              ▼
                         Normalizer
                              │
                              ▼
                            Convex
```

O Core não deverá conhecer detalhes internos de nenhum supermercado.

---

# 3. Stack

A implementação deverá utilizar:

```text
Node.js
TypeScript
Playwright
Docker
Convex
```

Dependências adicionais poderão ser adicionadas somente quando necessárias.

---

# 4. Estrutura de diretórios

A estrutura deverá ser:

```text
scraper/
│
├── src/
│
│   ├── core/
│   │   ├── scraper-engine.ts
│   │   ├── browser-manager.ts
│   │   ├── request-client.ts
│   │   ├── retry-manager.ts
│   │   ├── rate-limiter.ts
│   │   └── logger.ts
│   │
│   ├── contracts/
│   │   ├── supermarket-adapter.ts
│   │   ├── raw-product.ts
│   │   ├── scraper-result.ts
│   │   └── scraper-context.ts
│   │
│   ├── supermarkets/
│   │   ├── sao-luiz/
│   │   │   ├── adapter.ts
│   │   │   ├── parser.ts
│   │   │   ├── mapper.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── pao-de-acucar/
│   │   │   ├── adapter.ts
│   │   │   ├── parser.ts
│   │   │   ├── mapper.ts
│   │   │   └── types.ts
│   │   │
│   │   └── index.ts
│   │
│   ├── catalog/
│   │   ├── categories.ts
│   │   └── queries.ts
│   │
│   ├── normalization/
│   │   ├── product-normalizer.ts
│   │   ├── brand-normalizer.ts
│   │   └── unit-normalizer.ts
│   │
│   ├── persistence/
│   │   └── convex.ts
│   │
│   ├── cli/
│   │   └── index.ts
│   │
│   └── index.ts
│
├── tests/
│
├── debug/
│
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env
```

---

# 5. Core

O diretório:

```text
src/core/
```

deverá conter somente funcionalidades genéricas.

Não poderá existir código como:

```ts
if (supermarket === "pao-de-acucar")
```

dentro do Core.

---

# 6. Scraper Engine

Criar:

```text
src/core/scraper-engine.ts
```

Responsabilidade:

1. receber um adapter;
2. receber queries;
3. executar buscas;
4. controlar retries;
5. controlar delay;
6. controlar concorrência;
7. processar resultados;
8. normalizar produtos;
9. persistir resultados;
10. registrar métricas.

Exemplo:

```ts
class ScraperEngine {
  async run(
    adapter: SupermarketAdapter,
    queries: ScraperQuery[],
  ): Promise<ScraperResult> {
    // generic pipeline
  }
}
```

---

# 7. Supermarket Adapter

Criar o contrato:

```text
src/contracts/supermarket-adapter.ts
```

Interface:

```ts
export interface SupermarketAdapter {
  id: string;

  name: string;

  baseUrl: string;

  strategy: ScrapingStrategy;

  search(
    query: string,
    context: ScraperContext,
  ): Promise<RawProduct[]>;

  getProduct?(
    url: string,
    context: ScraperContext,
  ): Promise<RawProduct>;

  supportsSearch: boolean;

  supportsProductPage: boolean;
}
```

---

# 8. Scraping Strategy

Definir:

```ts
export type ScrapingStrategy =
  | "api"
  | "browser"
  | "html"
  | "hybrid";
```

Significado:

### API

Quando o supermercado possui endpoint estruturado acessível.

```text
Scraper
 ↓
HTTP
 ↓
JSON
```

### Browser

Quando é necessário utilizar Playwright.

```text
Scraper
 ↓
Playwright
 ↓
Browser
 ↓
DOM
```

### HTML

Quando o conteúdo pode ser coletado diretamente.

```text
Scraper
 ↓
HTTP
 ↓
HTML
```

### Hybrid

Quando diferentes partes utilizam estratégias diferentes.

---

# 9. Raw Product

Todos os adapters deverão retornar o mesmo formato:

```ts
export interface RawProduct {
  externalId?: string;

  name: string;

  brand?: string;

  price: number;

  originalPrice?: number;

  discount?: number;

  url?: string;

  imageUrl?: string;

  quantity?: number;

  unit?: string;

  availability?: boolean;

  source: string;

  collectedAt: string;

  rawData?: unknown;
}
```

O Core não deverá conhecer o formato original retornado pelo supermercado.

---

# 10. Adapter Interno

Cada supermercado terá sua própria implementação.

Exemplo:

```text
src/supermarkets/pao-de-acucar/
```

```ts
export class PaoDeAcucarAdapter
  implements SupermarketAdapter {

  id = "pao-de-acucar";

  name = "Pão de Açúcar";

  baseUrl = "https://www.paodeacucar.com/";

  strategy = "hybrid" as const;

  supportsSearch = true;

  supportsProductPage = true;

  async search(query: string, context: ScraperContext) {
    // implementação específica
  }
}
```

---

# 11. Parser

Cada supermercado poderá possuir seu próprio parser.

Exemplo:

```text
pao-de-acucar/parser.ts
```

Responsabilidade:

```text
HTML / JSON
     ↓
Parser
     ↓
Dados específicos
```

O parser não deverá salvar dados.

---

# 12. Mapper

Cada supermercado poderá possuir um mapper:

```text
pao-de-acucar/mapper.ts
```

Responsabilidade:

```text
Dados específicos
       ↓
Mapper
       ↓
RawProduct
```

---

# 13. Normalizer global

Depois que o adapter produzir `RawProduct`, o sistema utilizará um normalizador global.

```text
RawProduct
     ↓
ProductNormalizer
     ↓
CanonicalProduct
```

O normalizador deverá ser independente do supermercado.

---

# 14. Canonical Product

Criar um formato interno:

```ts
interface CanonicalProduct {
  name: string;

  normalizedName: string;

  brand?: string;

  quantity?: number;

  unit?: string;

  supermarketId: string;

  externalId?: string;

  url?: string;

  imageUrl?: string;
}
```

---

# 15. Identificação

A identificação deverá utilizar:

```text
supermarketId
+
externalId
```

quando o supermercado fornecer um ID.

Exemplo:

```text
pao-de-acucar:3995600
```

Isso deverá impedir duplicação.

---

# 16. Fallback de identificação

Caso não exista `externalId`, o sistema deverá utilizar uma chave derivada:

```text
supermarketId
+
normalizedName
+
brand
+
quantity
+
unit
```

Exemplo:

```text
pao-de-acucar:
acucar-refinado-caravelas:
caravelas:
1:
kg
```

---

# 17. Product Repository

Criar uma camada:

```text
src/persistence/
```

O Core não deverá conhecer diretamente as mutations do Convex.

Exemplo:

```ts
interface ProductRepository {
  saveProduct(product: CanonicalProduct): Promise<void>;

  savePrice(
    productId: string,
    price: number,
    originalPrice?: number,
  ): Promise<void>;
}
```

---

# 18. Convex Adapter

Implementar:

```text
src/persistence/convex.ts
```

Esse módulo será responsável por:

* products;
* prices;
* supermarkets;
* scrapeRuns;
* scraper queries.

O restante do sistema deverá conversar através de interfaces.

---

# 19. Supermarkets Registry

Criar:

```text
src/supermarkets/index.ts
```

Exemplo:

```ts
export const supermarkets = {
  "sao-luiz": new SaoLuizAdapter(),

  "pao-de-acucar": new PaoDeAcucarAdapter(),
};
```

---

# 20. Adicionando um novo supermercado

Para adicionar um supermercado:

```text
1. Criar pasta
2. Implementar Adapter
3. Implementar Parser
4. Implementar Mapper
5. Registrar Adapter
```

Não será necessário alterar:

```text
Core
Engine
Normalizer
Convex
Docker
CLI
Queries
```

---

# 21. Exemplo: Carrefour

Para adicionar Carrefour:

```text
src/supermarkets/carrefour/
```

Criar:

```text
adapter.ts
parser.ts
mapper.ts
types.ts
```

Depois:

```ts
import { CarrefourAdapter } from "./carrefour/adapter";

export const supermarkets = {
  "sao-luiz": new SaoLuizAdapter(),
  "pao-de-acucar": new PaoDeAcucarAdapter(),
  "carrefour": new CarrefourAdapter(),
};
```

Isso deverá ser suficiente para integrar o novo supermercado.

---

# 22. Query System

As queries serão globais.

Exemplo:

```text
arroz
feijão
leite
café
escova de dente
detergente
```

O mesmo conjunto de queries poderá ser executado contra diferentes supermercados.

```text
               Queries
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   São Luiz   Pão de Açúcar Carrefour
```

---

# 23. Query Context

O Engine deverá enviar contexto ao adapter:

```ts
interface ScraperContext {
  browser?: Browser;

  page?: Page;

  timeout: number;

  delay: number;

  debug: boolean;

  maxProducts: number;

  supermarketId: string;
}
```

O adapter poderá utilizar os recursos disponíveis.

---

# 24. Browser Manager

Criar:

```text
src/core/browser-manager.ts
```

Responsabilidade:

* iniciar browser;
* criar context;
* criar pages;
* fechar browser;
* configurar user agent;
* controlar timeout.

Nenhum adapter deverá criar seu próprio browser globalmente.

---

# 25. Request Client

Criar:

```text
src/core/request-client.ts
```

Responsabilidade:

* HTTP requests;
* headers;
* timeout;
* retry;
* resposta JSON;
* resposta HTML.

Adapters poderão reutilizar esse cliente.

---

# 26. Retry Manager

Criar:

```text
src/core/retry-manager.ts
```

Deverá suportar:

```text
retry
backoff
maxAttempts
```

Exemplo:

```text
Tentativa 1
   ↓
falha
   ↓
500ms
   ↓
Tentativa 2
   ↓
falha
   ↓
1000ms
   ↓
Tentativa 3
```

---

# 27. Rate Limiter

Criar:

```text
src/core/rate-limiter.ts
```

Configuração:

```env
SCRAPER_DELAY_MS=1000
```

O sistema deverá evitar chamadas excessivamente rápidas.

---

# 28. Concorrência

O engine deverá controlar o número de tarefas simultâneas.

Configuração:

```env
SCRAPER_CONCURRENCY=2
```

Exemplo:

```text
Query 1 ──┐
Query 2 ──┤
          ├── máximo 2 simultâneas
Query 3 ──┤
Query 4 ──┘
```

---

# 29. CLI

O sistema deverá possuir uma CLI única.

Executar supermercado:

```bash
npm run scrape -- --supermarket=pao-de-acucar
```

Query:

```bash
npm run scrape -- \
  --supermarket=pao-de-acucar \
  --query="arroz"
```

Categoria:

```bash
npm run scrape -- \
  --supermarket=pao-de-acucar \
  --category=mercearia
```

Todos os supermercados:

```bash
npm run scrape -- --supermarket=all
```

---

# 30. Execução de todos

Quando:

```bash
--supermarket=all
```

o engine deverá executar:

```text
Queries
   │
   ├── São Luiz
   │
   ├── Pão de Açúcar
   │
   └── demais adapters ativos
```

---

# 31. Configuração

O `.env` deverá conter apenas configurações de infraestrutura:

```env
SCRAPER_HEADLESS=true

SCRAPER_TIMEOUT=30000

SCRAPER_DELAY_MS=1000

SCRAPER_CONCURRENCY=2

SCRAPER_MAX_PRODUCTS=100

SCRAPER_DEBUG=false

CONVEX_URL=
```

Nenhum supermercado deverá possuir configuração duplicada no `.env`.

---

# 32. Configuração específica

Caso um supermercado precise de uma configuração específica, ela deverá ficar dentro do próprio adapter.

Exemplo:

```ts
const config = {
  searchPath: "/busca",
  requiresLocation: true,
};
```

Não criar:

```env
PAO_DE_ACUCAR_SEARCH_URL=
SAO_LUIZ_SEARCH_URL=
CARREFOUR_SEARCH_URL=
```

sem necessidade.

---

# 33. Localização

Alguns supermercados podem exigir:

```text
CEP
cidade
loja
região
```

A arquitetura deverá permitir isso através do contexto:

```ts
interface ScraperLocation {
  postalCode?: string;

  city?: string;

  state?: string;

  storeId?: string;
}
```

O adapter poderá utilizar a localização quando necessário.

---

# 34. Loja específica

Para supermercados que trabalham com múltiplas lojas:

```text
São Luiz
   ├── Loja 355
   ├── Loja 102
   └── Loja 201
```

o `storeId` deverá ser preservado.

Exemplo:

```ts
{
  supermarketId: "sao-luiz",
  storeId: "355"
}
```

---

# 35. Multi-store

O modelo deverá permitir:

```text
Supermarket
     │
     ├── Store 1
     ├── Store 2
     └── Store 3
```

Isso será necessário para comparar preços regionalmente.

---

# 36. Scrape Run

Cada execução deverá gerar um registro:

```ts
interface ScrapeRun {
  id: string;

  supermarketId: string;

  startedAt: string;

  finishedAt?: string;

  status: "running" | "completed" | "failed";

  queries: number;

  productsFound: number;

  productsSaved: number;

  productsFailed: number;
}
```

---

# 37. Logs

Todos os adapters deverão utilizar o logger global:

```ts
logger.info(...)
logger.warn(...)
logger.error(...)
logger.debug(...)
```

Não utilizar:

```ts
console.log()
```

diretamente nos adapters, exceto durante diagnóstico local.

---

# 38. Debug

Configuração:

```env
SCRAPER_DEBUG=true
```

Poderá gerar:

```text
debug/
├── screenshots/
├── html/
└── network/
```

Esses arquivos deverão ser ignorados pelo Git.

---

# 39. Tratamento de erro

Uma falha em um supermercado não deverá interromper os demais.

Exemplo:

```text
São Luiz
✓ completed

Pão de Açúcar
✗ failed

Carrefour
✓ completed
```

O processo geral deverá continuar.

---

# 40. Falha de query

Uma query que falhar não deverá interromper todas as queries.

```text
arroz       ✓
feijão      ✓
leite       ✗
café        ✓
```

O resultado deverá registrar:

```text
failedQueries: ["leite"]
```

---

# 41. Normalização de preço

Todos os adapters deverão retornar preço numérico.

Entrada:

```text
R$ 12,99
```

Saída:

```ts
12.99
```

O formato de moeda original não deverá ser armazenado como preço principal.

---

# 42. Normalização de unidade

O sistema deverá normalizar:

```text
KG
Kg
kg
quilo
```

para:

```text
kg
```

Exemplo:

```text
500 G
500g
500 gramas
```

deverão resultar em:

```ts
{
  quantity: 500,
  unit: "g"
}
```

---

# 43. Deduplicação

O Engine deverá impedir que o mesmo produto seja salvo duas vezes na mesma execução.

A deduplicação deverá considerar:

```text
supermarketId
externalId
```

ou o fallback de identidade definido anteriormente.

---

# 44. Histórico

O Engine não deverá apagar preços anteriores.

Fluxo:

```text
Produto
   │
   ├── Price 01
   ├── Price 02
   ├── Price 03
   └── Price 04
```

Isso permitirá construir histórico posteriormente.

---

# 45. Promoções

Promoções deverão ser tratadas como dados de preço.

O adapter poderá retornar:

```ts
{
  price: 29.99,
  originalPrice: 39.99,
  discount: 25
}
```

O Core não deverá precisar conhecer como a promoção é apresentada pelo supermercado.

---

# 46. Observabilidade

O Engine deverá registrar:

```text
supermarket
query
duration
productsFound
productsParsed
productsSaved
productsFailed
errors
```

Exemplo:

```text
Pão de Açúcar
Query: arroz

Found: 50
Parsed: 49
Saved: 49
Failed: 1
Duration: 4.82s
```

---

# 47. Testes

Cada adapter deverá possuir testes próprios:

```text
tests/
└── supermarkets/
    ├── sao-luiz/
    └── pao-de-acucar/
```

Testar:

* busca;
* parser;
* preço;
* promoção;
* marca;
* quantidade;
* unidade;
* externalId;
* URL;
* imagem.

---

# 48. Contract Tests

Além dos testes específicos, todos os adapters deverão passar por testes de contrato.

Exemplo:

```ts
describe("SupermarketAdapter Contract", () => {
  it("should return RawProduct[]");
  it("should provide supermarket id");
  it("should provide product name");
  it("should return numeric price");
});
```

Assim, um novo supermercado só será aceito se cumprir o contrato.

---

# 49. Docker

O projeto deverá utilizar um único container:

```text
scraper-worker
```

O container deverá possuir:

```text
Node.js
TypeScript runtime
Playwright
Chromium
```

Não criar:

```text
sao-luiz-container
pao-de-acucar-container
```

---

# 50. Docker Compose

Estrutura:

```yaml
services:

  scraper:
    build: .
    env_file:
      - .env
```

Posteriormente poderão ser adicionados:

```text
scheduler
worker
queue
```

sem alterar a arquitetura dos adapters.

---

# 51. Escalabilidade futura

A arquitetura deverá permitir evoluir de:

```text
Docker
   ↓
Scraper Worker
```

para:

```text
Scheduler
    ↓
Queue
    ↓
Workers
    ├── São Luiz
    ├── Pão de Açúcar
    ├── Carrefour
    └── outros
```

Sem alterar os contratos dos adapters.

---

# 52. Segurança

Não armazenar:

* cookies desnecessários;
* tokens pessoais;
* credenciais;
* dados de usuários.

Credenciais, quando inevitáveis, deverão ficar no `.env`.

---

# 53. Regra de ouro

O Core nunca deverá conter:

```ts
if (paoDeAcucar)
if (saoLuiz)
if (carrefour)
```

A lógica específica pertence ao adapter.

---

# 54. Adicionando um supermercado — fluxo final

Quando surgir um novo supermercado:

```text
1. Criar adapter
        ↓
2. Descobrir estratégia
        ↓
3. Implementar search()
        ↓
4. Implementar parser
        ↓
5. Implementar mapper
        ↓
6. Criar testes
        ↓
7. Registrar adapter
        ↓
8. Executar contract tests
```

O restante da infraestrutura permanece intacto.

---

# 55. Exemplo completo

Com três supermercados:

```text
                        SCRAPER ENGINE
                              │
                       Product Queries
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
        São Luiz        Pão de Açúcar       Carrefour
        Adapter             Adapter          Adapter
            │                 │                 │
            ▼                 ▼                 ▼
       RawProduct        RawProduct        RawProduct
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ▼
                       ProductNormalizer
                              │
                              ▼
                      ProductRepository
                              │
                              ▼
                           Convex
```

---

# 56. Definition of Done

### Core

* [ ] Scraper Engine criado.
* [ ] Browser Manager criado.
* [ ] HTTP Client criado.
* [ ] Retry Manager criado.
* [ ] Rate Limiter criado.
* [ ] Logger criado.

### Contracts

* [ ] SupermarketAdapter criado.
* [ ] RawProduct criado.
* [ ] CanonicalProduct criado.
* [ ] ScraperContext criado.
* [ ] ScraperResult criado.

### Adapters

* [ ] São Luiz convertido para Adapter.
* [ ] Pão de Açúcar convertido para Adapter.
* [ ] Registry criado.

### Pipeline

* [ ] Query Runner implementado.
* [ ] Normalizer implementado.
* [ ] Deduplicação implementada.
* [ ] Persistence abstraction implementada.
* [ ] Convex repository implementado.

### CLI

* [ ] `--supermarket`
* [ ] `--query`
* [ ] `--category`
* [ ] `--supermarket=all`

### Infraestrutura

* [ ] Docker funcionando.
* [ ] Playwright funcionando.
* [ ] `.env` simplificado.
* [ ] Logs funcionando.
* [ ] Debug funcionando.

### Qualidade

* [ ] Contract tests.
* [ ] Adapter tests.
* [ ] Parser tests.
* [ ] Price tests.
* [ ] Deduplication tests.
* [ ] Error handling.

---

# 57. Resultado final

Depois desta SPEC, adicionar um supermercado deverá ser uma operação localizada:

```text
src/supermarkets/novo-supermercado/
```

com:

```text
adapter.ts
parser.ts
mapper.ts
types.ts
```

Depois:

```ts
register(new SupermarketAdapter());
```

Todo o restante do sistema continuará sendo reutilizado:

```text
Docker
Playwright
HTTP
Retry
Rate Limit
Queries
Categories
Normalizer
Deduplication
Convex
History
CLI
Logs
Tests
```

O objetivo é transformar o projeto de:

```text
"um scraper de supermercados"
```

em:

```text
"uma plataforma de coleta de preços com múltiplos adapters de supermercados".
```
