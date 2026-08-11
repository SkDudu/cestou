# SPEC 002 — Bootstrap do Scraper

**Projeto:** Smart Grocery Price Comparator
**Módulo:** Scraper Infrastructure
**Versão:** 0.1.0
**Status:** Draft / Initial Setup

---

# 1. Objetivo

Criar a primeira infraestrutura funcional do sistema de scraping.

Ao final desta SPEC, o projeto deverá ser capaz de:

1. Executar um scraper em Docker.
2. Utilizar TypeScript + Node.js.
3. Utilizar Playwright para automação de navegador.
4. Conectar o scraper ao Convex.
5. Possuir estrutura preparada para múltiplos supermercados.
6. Persistir produtos coletados no Convex.
7. Separar coleta, parsing, normalização e persistência.
8. Permitir execução local simples.
9. Possibilitar futura execução em VPS sem alterações arquiteturais importantes.

---

# 2. Escopo

Esta SPEC contempla apenas a infraestrutura inicial.

Inclui:

* Estrutura do projeto.
* Docker.
* Docker Compose.
* Node.js.
* TypeScript.
* Playwright.
* Chromium.
* Convex.
* Variáveis de ambiente.
* Estrutura de módulos.
* Modelo inicial de dados.
* Primeiro scraper.
* Persistência no Convex.
* Logging.
* Health check básico.

Não inclui:

* Interface Web.
* Next.js.
* Sistema de autenticação.
* Redis.
* BullMQ.
* n8n.
* IA.
* Sistema avançado de matching.
* Histórico complexo.
* Otimização de compras.

Esses componentes serão adicionados posteriormente.

---

# 3. Arquitetura Inicial

A arquitetura inicial será:

```text
┌──────────────────────────────────────┐
│              LOCAL PC                │
│                                      │
│  ┌────────────────────────────────┐  │
│  │          Docker                │  │
│  │                                │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │      Scraper Worker      │  │  │
│  │  │                          │  │  │
│  │  │ Node.js                  │  │  │
│  │  │ TypeScript               │  │  │
│  │  │ Playwright               │  │  │
│  │  │ Chromium                 │  │  │
│  │  └────────────┬─────────────┘  │  │
│  │               │                │  │
│  └───────────────┼────────────────┘  │
│                  │                   │
└──────────────────┼───────────────────┘
                   │
                   │ Convex API
                   ▼
          ┌─────────────────────┐
          │       Convex        │
          │                     │
          │ Products            │
          │ Supermarkets        │
          │ Prices              │
          │ Raw Products        │
          │ Scraping Jobs       │
          └─────────────────────┘
```

---

# 4. Stack

## Runtime

```text
Node.js
```

## Linguagem

```text
TypeScript
```

## Browser Automation

```text
Playwright
```

## Browser

```text
Chromium
```

## Database / Backend

```text
Convex
```

## Container

```text
Docker
Docker Compose
```

---

# 5. Estrutura do Projeto

A estrutura inicial deverá ser:

```text
smart-grocery/
│
├── convex/
│   ├── schema.ts
│   ├── products.ts
│   ├── prices.ts
│   ├── supermarkets.ts
│   ├── rawProducts.ts
│   └── scrapingJobs.ts
│
├── scraper/
│   │
│   ├── src/
│   │   │
│   │   ├── scrapers/
│   │   │   ├── parsers/
│   │   │   ├── normalizers/
│   │   │   ├── services/
│   │   │   ├── types/
│   │   │   ├── utils/
│   │   │   ├── config/
│   │   │   └── index.ts
│   │   │
│   │   └── ...
│   │
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── .dockerignore
│
├── docker-compose.yml
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

# 6. Responsabilidade dos Diretórios

## `convex/`

Responsável pelo backend de dados do Convex.

Exemplo:

```text
convex/
├── schema.ts
├── products.ts
├── prices.ts
├── supermarkets.ts
├── rawProducts.ts
└── scrapingJobs.ts
```

---

## `scraper/src/scrapers/`

Contém os adapters específicos de cada supermercado.

Exemplo:

```text
scrapers/
├── supermarket-a/
│   ├── index.ts
│   ├── search.ts
│   └── mapper.ts
│
└── supermarket-b/
    ├── index.ts
    ├── search.ts
    └── mapper.ts
```

Cada supermercado deverá ser independente.

---

# 7. Interface dos Scrapers

Todos os scrapers deverão implementar uma interface comum.

```ts
interface SupermarketScraper {
  name: string;

  search(query: string): Promise<RawProduct[]>;

  getProduct?(url: string): Promise<RawProduct>;
}
```

Isso permitirá:

```ts
const scraper = new SupermarketAScraper();

const products = await scraper.search("arroz");
```

---

# 8. Raw Product

Os dados coletados inicialmente não deverão ser tratados como produtos definitivos.

Criar:

```ts
interface RawProduct {
  externalId?: string;

  name: string;

  brand?: string;

  price: number;

  originalPrice?: number;

  url?: string;

  imageUrl?: string;

  quantity?: number;

  unit?: string;

  source: string;

  collectedAt: string;

  rawData?: unknown;
}
```

---

# 9. Pipeline de Scraping

Todo scraper deverá seguir:

```text
SEARCH
  ↓
COLLECT
  ↓
RAW PRODUCT
  ↓
PARSE
  ↓
VALIDATE
  ↓
NORMALIZE
  ↓
PERSIST
```

Nunca misturar todas essas responsabilidades em uma única função.

---

# 10. Scraping

O scraper deverá utilizar Playwright.

Exemplo conceitual:

```ts
const browser = await chromium.launch({
  headless: true,
});

const page = await browser.newPage();

await page.goto(url);

await page.waitForLoadState("domcontentloaded");
```

A implementação deverá evitar depender de seletores excessivamente frágeis.

Preferir:

* atributos estáveis;
* data attributes;
* estrutura semântica;
* URLs;
* informações estruturadas;
* JSON disponibilizado pela página quando permitido.

---

# 11. API vs HTML

O scraper deverá seguir esta prioridade:

```text
1. Dados estruturados/API acessível de forma permitida
                ↓
2. HTML estático
                ↓
3. Playwright
```

Não utilizar Playwright indiscriminadamente.

Se uma fonte disponibilizar os produtos em formato estruturado e o acesso for permitido, preferir esse método.

Playwright deverá ser utilizado quando a execução do frontend for necessária para obter os dados.

---

# 12. Convex

O Convex será responsável pelo armazenamento dos dados utilizados pela aplicação.

O scraper utilizará o Convex como destino dos dados coletados.

Fluxo:

```text
Scraper
   ↓
Normalizer
   ↓
Convex Mutation
   ↓
Database
```

---

# 13. Schema inicial do Convex

O schema deverá contemplar inicialmente:

```text
products
supermarkets
rawProducts
prices
scrapingJobs
```

---

# 14. Products

Estrutura conceitual:

```ts
products {
  name
  normalizedName
  brand
  category
  subcategory
  quantity
  unit
  barcode
  imageUrl
  createdAt
  updatedAt
}
```

---

# 15. Supermarkets

```ts
supermarkets {
  name
  slug
  website
  active
  createdAt
}
```

---

# 16. Raw Products

```ts
rawProducts {
  supermarketId
  externalId
  name
  price
  originalPrice
  url
  imageUrl
  rawData
  collectedAt
}
```

O `rawProducts` deverá preservar o resultado original do scraper.

---

# 17. Prices

```ts
prices {
  productId
  supermarketId
  price
  originalPrice
  discount
  collectedAt
  source
}
```

O preço deverá possuir timestamp.

Nunca assumir que o preço atual é permanente.

---

# 18. Scraping Jobs

Criar uma entidade para registrar cada execução.

```ts
scrapingJobs {
  supermarketId
  type
  status
  startedAt
  finishedAt
  productsFound
  productsSaved
  error
}
```

Status:

```text
pending
running
completed
failed
```

---

# 19. Variáveis de Ambiente

Criar:

```text
.env
.env.example
```

Exemplo:

```env
CONVEX_URL=
```

Futuras variáveis poderão incluir:

```env
SCRAPER_HEADLESS=true
SCRAPER_TIMEOUT=30000
SCRAPER_MAX_PRODUCTS=100
LOG_LEVEL=info
```

Nunca commitar `.env`.

---

# 20. Dockerfile

O scraper deverá possuir um Dockerfile próprio.

Requisitos:

* Node.js LTS.
* Dependências de produção.
* Playwright.
* Chromium.
* Execução não-root quando possível.
* Processo simples de inicialização.

Estrutura:

```text
scraper/
├── Dockerfile
├── .dockerignore
├── package.json
└── src/
```

---

# 21. Docker Compose

O primeiro `docker-compose.yml` deverá conter somente o scraper.

Não adicionar PostgreSQL porque o banco utilizado será Convex.

Conceito:

```yaml
services:
  scraper:
    build:
      context: ./scraper
    env_file:
      - .env
    restart: unless-stopped
```

O Compose deverá permitir:

```bash
docker compose up --build
```

---

# 22. Execução Local

O fluxo esperado será:

```bash
git clone <repository>

cd smart-grocery

cp .env.example .env

# configurar Convex

docker compose up --build
```

O container deverá iniciar o scraper.

---

# 23. Primeiro Teste

Antes de implementar um supermercado real, criar um scraper de teste.

Objetivo:

Acessar uma página pública permitida para testes e retornar:

```text
Nome
Preço
URL
Imagem
```

Resultado esperado:

```text
Found product:

Name: Example Product
Price: R$ 10.99
URL: https://...
```

Depois persistir no Convex.

---

# 24. Primeiro Supermercado Real

Após o scraper de teste funcionar, implementar apenas **um supermercado real**.

Não iniciar múltiplos supermercados simultaneamente.

Objetivo:

```text
Search:
"arroz"
```

Retornar:

```text
Produto 1
Produto 2
Produto 3
...
```

---

# 25. Limite inicial

O primeiro scraper deverá possuir um limite configurável.

Exemplo:

```env
SCRAPER_MAX_PRODUCTS=50
```

Isso evita executar uma coleta enorme durante desenvolvimento.

---

# 26. Logging

O scraper deverá possuir logs estruturados.

Exemplo:

```text
[INFO] Scraper started
[INFO] Supermarket: supermarket-a
[INFO] Query: arroz
[INFO] Products found: 32
[INFO] Products normalized: 28
[INFO] Products saved: 28
[INFO] Scraper finished
```

Erros:

```text
[ERROR] Failed to access page
[ERROR] Failed to parse product
[ERROR] Convex mutation failed
```

---

# 27. Tratamento de erros

O scraper não deverá parar completamente por causa de um produto inválido.

Exemplo:

```text
Produto 1 → OK
Produto 2 → OK
Produto 3 → PARSE ERROR
Produto 4 → OK
Produto 5 → OK
```

O erro deverá ser registrado e a execução continuará.

---

# 28. Timeout

Todos os acessos externos deverão possuir timeout.

Exemplo:

```text
SCRAPER_TIMEOUT=30000
```

Nenhuma página poderá ficar indefinidamente aguardando resposta.

---

# 29. Browser Lifecycle

O browser deverá ser iniciado uma vez por execução do scraper, quando possível.

Evitar:

```text
Produto 1 → abre Chromium
Produto 2 → abre Chromium
Produto 3 → abre Chromium
```

Preferir:

```text
Inicia Chromium
      ↓
Página
      ↓
Produto 1
Produto 2
Produto 3
      ↓
Fecha Chromium
```

---

# 30. Segurança

Nunca armazenar:

* Cookies privados.
* Senhas.
* Tokens pessoais.
* Dados pessoais desnecessários.

O scraper deverá operar somente sobre dados públicos e fontes cujo acesso/coleta seja permitido.

Não implementar mecanismos de bypass de CAPTCHA, autenticação ou bloqueios de acesso.

---

# 31. Normalização Inicial

A primeira versão deverá possuir normalização determinística.

Exemplo:

```text
"ARROZ TIO JOAO BRANCO 5KG"
```

↓

```text
Arroz Tio João Branco 5kg
```

Normalização inicial:

* lowercase/uppercase controlado;
* remoção de espaços duplicados;
* normalização de unidades;
* normalização de quantidade;
* limpeza de caracteres;
* identificação básica de marca.

IA não será necessária nesta etapa.

---

# 32. Persistência

O scraper deverá seguir:

```text
Raw Product
     ↓
Salvar rawProducts
     ↓
Normalize
     ↓
Find/Create Product
     ↓
Create Price
```

Isso permite manter os dados brutos para futuras melhorias.

---

# 33. Idempotência

Executar o mesmo scraper duas vezes não deverá criar produtos duplicados.

O sistema deverá utilizar identificadores como:

```text
supermarketId
+
externalId
```

quando disponíveis.

Caso não exista `externalId`, utilizar combinação de campos normalizados para matching inicial.

---

# 34. Fluxo completo

```text
docker compose up
        │
        ▼
Scraper inicia
        │
        ▼
Cria scrapingJob
        │
        ▼
Abre supermercado
        │
        ▼
Executa busca
        │
        ▼
Coleta produtos
        │
        ▼
Cria rawProducts
        │
        ▼
Normaliza produtos
        │
        ▼
Busca produto existente
        │
        ├── encontrado
        │      ↓
        │    atualiza
        │
        └── não encontrado
               ↓
           cria produto
        │
        ▼
Registra preço
        │
        ▼
Finaliza scrapingJob
```

---

# 35. Definition of Done

Esta SPEC será considerada concluída quando:

* [ ] Projeto criado.
* [ ] TypeScript configurado.
* [ ] Docker configurado.
* [ ] Docker Compose funcionando.
* [ ] Playwright funcionando dentro do container.
* [ ] Chromium funcionando dentro do container.
* [ ] Convex configurado.
* [ ] Scraper consegue conectar ao Convex.
* [ ] Schema inicial criado.
* [ ] Scraper de teste funcionando.
* [ ] Dados de teste persistidos.
* [ ] Primeiro supermercado real implementado.
* [ ] Produtos reais persistidos.
* [ ] Preços persistidos.
* [ ] `rawProducts` persistidos.
* [ ] `scrapingJobs` funcionando.
* [ ] Logs implementados.
* [ ] Tratamento básico de erros implementado.
* [ ] `.env.example` criado.
* [ ] README com instruções de execução criado.

---

# 36. Resultado esperado

Ao terminar esta SPEC, deverá ser possível executar:

```bash
docker compose up --build
```

e obter:

```text
Starting scraper...

Supermarket: Example Market
Query: arroz

Products found: 37
Products normalized: 34
Products saved: 34

Scraping completed successfully.
```

No Convex:

```text
products
    └── produtos encontrados

rawProducts
    └── dados originais

prices
    └── preços coletados

scrapingJobs
    └── execução registrada
```

---

# 37. Próxima etapa

Após concluir esta infraestrutura, a próxima SPEC deverá ser:

**SPEC 003 — Implementação do Primeiro Supermarket Scraper**

Ela deverá definir:

* supermercado escolhido;
* estratégia de coleta;
* descoberta de endpoints;
* estrutura HTML;
* selectors;
* paginação;
* busca;
* parser;
* mapper;
* normalização;
* tratamento de preço;
* disponibilidade;
* imagens;
* testes;
* persistência real no Convex.

A implementação do primeiro supermercado deverá ser feita somente depois que a infraestrutura desta SPEC estiver funcionando.
