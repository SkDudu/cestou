# SPEC 003 — Taxonomia de Produtos e Queries do Scraper

**Projeto:** Smart Grocery Price Comparator
**Módulo:** Scraper Query System
**Versão:** 0.1.0
**Status:** Draft / Implementation Ready

---

# 1. Objetivo

Criar um sistema estruturado para definir, organizar e executar as consultas utilizadas pelos scrapers.

O sistema deverá substituir a utilização de uma lista extensa diretamente no `.env`.

Em vez de:

```env
SCRAPER_QUERIES=arroz,feijao,leite,cafe,...
```

o projeto deverá possuir uma taxonomia organizada por:

* Categoria
* Subcategoria
* Query
* Prioridade
* Status
* Frequência de coleta

---

# 2. Motivação

O scraper terá que pesquisar centenas de tipos de produtos.

Uma lista única no `.env` apresenta problemas:

* difícil manutenção;
* difícil organização;
* impossível controlar categorias;
* difícil definir prioridade;
* difícil controlar frequência;
* difícil adicionar novos produtos;
* difícil executar somente uma categoria;
* difícil acompanhar cobertura do catálogo.

A solução será centralizar essas informações no código/configuração do scraper.

---

# 3. Arquitetura

```text
                    Query Catalog
                         │
              ┌──────────┴──────────┐
              │                     │
          Categories             Queries
              │                     │
              └──────────┬──────────┘
                         │
                         ▼
                  Scraper Scheduler
                         │
                         ▼
                    Scraper
                         │
                         ▼
                  Supermarket
```

---

# 4. Estrutura de arquivos

Criar:

```text
scraper/
└── src/
    ├── config/
    │   ├── categories.ts
    │   ├── queries.ts
    │   └── scraper.config.ts
    │
    ├── types/
    │   └── query.types.ts
    │
    ├── services/
    │   ├── query.service.ts
    │   └── category.service.ts
    │
    └── index.ts
```

---

# 5. Categorias principais

O catálogo inicial deverá contemplar:

```text
mercearia
laticinios
carnes
frios
hortifruti
bebidas
congelados
padaria
doces
limpeza
higiene
bebes
pet
utilidades
descartaveis
papelaria
churrasco
inseticidas
farmacia
```

> Nota: `higiene_bucal` é **subcategoria** de `higiene`, não categoria top-level.
> Código canônico: `scraper/src/config/categories.ts`. Legacy `acougue` → `carnes`.

A lista deverá ser extensível.

---

# 6. Estrutura de Categoria

Cada categoria deverá possuir:

```ts
interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  enabled: boolean;
  priority: number;
}
```

Exemplo:

```ts
{
  id: "higiene",
  name: "Higiene Pessoal",
  slug: "higiene",
  description: "Produtos de higiene e cuidados pessoais",
  enabled: true,
  priority: 1
}
```

---

# 7. Subcategorias

As categorias poderão possuir subcategorias.

Exemplo:

```text
higiene
├── cabelo
├── corpo
├── higiene_bucal
├── barbear
└── cuidados_pessoais
```

Outro exemplo:

```text
mercearia
├── arroz
├── feijao
├── massas
├── farinhas
├── temperos
├── molhos
├── enlatados
└── conservas
```

---

# 8. Query

Cada query deverá possuir uma estrutura própria.

```ts
interface ScraperQuery {
  id: string;

  query: string;

  categoryId: string;

  subcategoryId?: string;

  enabled: boolean;

  priority: number;

  maxProducts?: number;

  frequency?: "high" | "medium" | "low";
}
```

---

# 9. Exemplo de Query

```ts
{
  id: "higiene-escova-dente",
  query: "escova de dente",
  categoryId: "higiene",
  subcategoryId: "higiene_bucal",
  enabled: true,
  priority: 1,
  maxProducts: 100,
  frequency: "medium"
}
```

---

# 10. Arquivo `categories.ts`

Deverá centralizar as categorias.

Exemplo:

```ts
export const PRODUCT_CATEGORIES = [
  {
    id: "mercearia",
    name: "Mercearia",
    slug: "mercearia",
    enabled: true,
    priority: 1,
  },

  {
    id: "laticinios",
    name: "Laticínios",
    slug: "laticinios",
    enabled: true,
    priority: 1,
  },

  {
    id: "carnes",
    name: "Carnes",
    slug: "carnes",
    enabled: true,
    priority: 1,
  },

  {
    id: "hortifruti",
    name: "Hortifruti",
    slug: "hortifruti",
    enabled: true,
    priority: 1,
  },

  {
    id: "bebidas",
    name: "Bebidas",
    slug: "bebidas",
    enabled: true,
    priority: 1,
  },

  {
    id: "limpeza",
    name: "Limpeza",
    slug: "limpeza",
    enabled: true,
    priority: 1,
  },

  {
    id: "higiene",
    name: "Higiene Pessoal",
    slug: "higiene",
    enabled: true,
    priority: 1,
  },

  {
    id: "bebes",
    name: "Bebês",
    slug: "bebes",
    enabled: true,
    priority: 2,
  },

  {
    id: "pet",
    name: "Pet",
    slug: "pet",
    enabled: true,
    priority: 2,
  },

  {
    id: "utilidades",
    name: "Utilidades",
    slug: "utilidades",
    enabled: true,
    priority: 3,
  },
];
```

---

# 11. Arquivo `queries.ts`

Todas as queries deverão ser organizadas por categoria.

Exemplo:

```ts
export const SCRAPER_QUERIES: ScraperQuery[] = [

  // MERCEARIA

  {
    id: "mercearia-arroz",
    query: "arroz",
    categoryId: "mercearia",
    enabled: true,
    priority: 1,
    frequency: "high",
  },

  {
    id: "mercearia-feijao",
    query: "feijão",
    categoryId: "mercearia",
    enabled: true,
    priority: 1,
    frequency: "high",
  },

  // HIGIENE BUCAL

  {
    id: "higiene-escova-dente",
    query: "escova de dente",
    categoryId: "higiene",
    subcategoryId: "higiene_bucal",
    enabled: true,
    priority: 1,
    frequency: "medium",
  },

  {
    id: "higiene-pasta-dente",
    query: "pasta de dente",
    categoryId: "higiene",
    subcategoryId: "higiene_bucal",
    enabled: true,
    priority: 1,
    frequency: "medium",
  },

  {
    id: "higiene-fio-dental",
    query: "fio dental",
    categoryId: "higiene",
    subcategoryId: "higiene_bucal",
    enabled: true,
    priority: 2,
    frequency: "low",
  },
];
```

---

# 12. Organização das Queries

As queries deverão ser agrupadas por categoria.

Exemplo:

```text
MERCEARIA

arroz
feijão
lentilha
macarrão
farinha
farofa
açúcar
sal
café
óleo
azeite
vinagre
molhos
temperos
enlatados
conservas
```

```text
LATICÍNIOS

leite
leite em pó
manteiga
margarina
queijo
requeijão
cream cheese
iogurte
bebida láctea
```

```text
HIGIENE BUCAL

escova de dente
escova de dente infantil
pasta de dente
fio dental
enxaguante bucal
refil de escova de dente
```

```text
LIMPEZA

detergente
sabão em pó
sabão líquido
sabão em barra
amaciante
desinfetante
água sanitária
alvejante
tira manchas
limpador multiuso
limpa vidros
limpa pisos
esponja
esponja de aço
```

A lista deverá continuar cobrindo todas as categorias definidas.

---

# 13. Prioridade

Cada query deverá possuir prioridade.

```text
1 = Alta
2 = Média
3 = Baixa
```

Exemplo:

```ts
{
  query: "arroz",
  priority: 1
}
```

```ts
{
  query: "vela",
  priority: 3
}
```

Isso permitirá futuramente executar:

```bash
npm run scrape -- --priority=1
```

---

# 14. Frequência

As queries deverão possuir uma frequência lógica.

```text
high
medium
low
```

Sugestão inicial:

### High

Produtos com alta variação de preço:

```text
arroz
feijão
leite
café
carne
frango
óleo
açúcar
```

### Medium

Produtos de consumo regular:

```text
detergente
shampoo
pasta de dente
papel higiênico
biscoito
```

### Low

Produtos com menor frequência de alteração:

```text
utilidades
papelaria
acessórios
```

---

# 15. Configuração via `.env`

O `.env` não deverá conter a lista de produtos.

Deverá conter apenas parâmetros de execução.

Exemplo:

```env
SCRAPER_HEADLESS=true

SCRAPER_MAX_PRODUCTS=100

SCRAPER_DELAY_MS=1000

SCRAPER_TIMEOUT=30000

SCRAPER_CATEGORY=all

SCRAPER_PRIORITY=all
```

---

# 16. Execução por categoria

O scraper deverá futuramente permitir:

```bash
npm run scrape -- --category=mercearia
```

ou:

```bash
npm run scrape -- --category=higiene
```

Exemplo:

```bash
npm run scrape -- --category=higiene
```

Resultado:

```text
Category: Higiene

Queries:

✓ shampoo
✓ condicionador
✓ sabonete
✓ pasta de dente
✓ escova de dente
✓ fio dental
✓ enxaguante bucal
...
```

---

# 17. Execução por query

Também deverá ser possível executar uma única query:

```bash
npm run scrape -- --query="escova de dente"
```

Resultado:

```text
Query: escova de dente

Searching supermarket...

Products found: 47
Products saved: 45
```

Isso será essencial durante o desenvolvimento do scraper.

---

# 18. Execução completa

Para executar todas:

```bash
npm run scrape
```

Fluxo:

```text
Categories
    ↓
Enabled queries
    ↓
Priority
    ↓
Scraper
    ↓
Products
```

---

# 19. Filtros

O sistema deverá suportar:

```text
--category
--subcategory
--query
--priority
--frequency
```

Exemplos:

```bash
npm run scrape -- --category=higiene
```

```bash
npm run scrape -- --subcategory=higiene_bucal
```

```bash
npm run scrape -- --query="escova de dente"
```

```bash
npm run scrape -- --priority=1
```

---

# 20. Controle de Queries

Uma query poderá ser desativada sem ser removida.

```ts
{
  id: "produto-x",
  query: "produto x",
  enabled: false
}
```

Isso permite preservar o histórico da configuração.

---

# 21. Normalização de Queries

A query utilizada para busca não deverá necessariamente ser igual ao nome final do produto.

Exemplo:

```text
Query:

"escova de dente"
```

Pode retornar:

```text
Colgate Zig Zag Adulto
Oral-B Indicator
Colgate Twister
Oral-B Pro Series
Escova Dental Infantil
```

O scraper deverá armazenar os produtos individualmente.

---

# 22. Query não representa produto

É importante manter:

```text
Query
   ≠
Produto
```

Uma query é apenas uma forma de descoberta.

Exemplo:

```text
Query:
"café"
```

Pode encontrar:

```text
Café Santa Clara 500g
Café Pilão 500g
Café 3 Corações 500g
Café Melitta 500g
Café Extra Forte 500g
```

Cada resultado deverá virar um produto independente.

---

# 23. Descoberta futura

O sistema deverá permitir posteriormente adicionar queries automaticamente.

Exemplo:

```text
Usuário pesquisa:

"escova de dente infantil"
```

Se essa query não estiver cadastrada:

```text
Search Analytics
        ↓
Query não cadastrada
        ↓
Sugestão para catálogo
```

Isso poderá ajudar a expandir automaticamente a cobertura do scraper.

---

# 24. Estatísticas futuras

O sistema deverá ser preparado para registrar:

```text
query
productsFound
productsSaved
productsUpdated
productsFailed
executionTime
```

Exemplo:

```text
Query: escova de dente

Found: 82
New: 12
Updated: 70
Failed: 0
Time: 4.2s
```

---

# 25. Cobertura do catálogo

Futuramente poderemos medir:

```text
Mercearia
██████████████████░░ 90%

Higiene
██████████████░░░░░░ 70%

Limpeza
████████████████░░░░ 80%

Pet
████████░░░░░░░░░░░░ 40%
```

Isso permitirá saber quais categorias ainda precisam de queries.

---

# 26. Banco Convex

A taxonomia deverá futuramente poder ser persistida no Convex.

Estrutura:

```text
categories
subcategories
scraperQueries
```

Porém, na primeira versão, a fonte poderá permanecer no código.

Migração para Convex deverá acontecer quando houver necessidade de gerenciamento dinâmico.

---

# 27. Estratégia inicial

A primeira versão deverá seguir:

```text
Código
 ↓
Queries estáticas
 ↓
Scraper
 ↓
Convex
```

Não adicionar complexidade desnecessária.

Posteriormente:

```text
Convex
 ↓
Query Manager
 ↓
Scraper
```

---

# 28. Regras

### Regra 1

Não colocar centenas de queries no `.env`.

### Regra 2

Não criar uma query para cada marca.

Errado:

```text
cafe_pilao
cafe_3_coracoes
cafe_melitta
```

Correto:

```text
cafe
```

As marcas serão descobertas nos resultados.

### Regra 3

Não criar queries para tamanhos específicos inicialmente.

Evitar:

```text
arroz_5kg
arroz_1kg
arroz_2kg
```

Usar:

```text
arroz
```

### Regra 4

Variantes importantes podem possuir queries específicas.

Exemplo:

```text
leite
leite_zero_lactose
leite_em_po
```

---

# 29. Definition of Done

Esta SPEC será considerada concluída quando:

* [ ] `categories.ts` criado.
* [ ] `queries.ts` criado.
* [ ] Interfaces TypeScript criadas.
* [ ] Categorias principais cadastradas.
* [ ] Subcategorias principais cadastradas.
* [ ] Queries de supermercado cadastradas.
* [ ] Higiene bucal incluída.
* [ ] Escova de dente incluída.
* [ ] Fio dental incluído.
* [ ] Enxaguante bucal incluído.
* [ ] Limpeza incluída.
* [ ] Bebê incluído.
* [ ] Pet incluído.
* [ ] Hortifruti incluído.
* [ ] Carnes incluído.
* [ ] Laticínios incluído.
* [ ] Bebidas incluído.
* [ ] Utilidades incluído.
* [ ] Prioridade implementada.
* [ ] Frequência implementada.
* [ ] Filtro por categoria implementado.
* [ ] Filtro por query implementado.
* [ ] Filtro por prioridade implementado.
* [ ] `.env` simplificado.
* [ ] Scraper consegue executar uma categoria.
* [ ] Scraper consegue executar uma query individual.

---

# 30. Resultado esperado

A partir desta SPEC, poderemos executar:

```bash
npm run scrape
```

para todo o catálogo.

Ou:

```bash
npm run scrape -- --category=higiene
```

Ou especificamente:

```bash
npm run scrape -- --query="escova de dente"
```

E o resultado seguirá:

```text
Query
 ↓
Supermarket
 ↓
Products
 ↓
Raw Product
 ↓
Normalize
 ↓
Match
 ↓
Convex
```

A taxonomia será a base para posteriormente construir:

* comparação de preços;
* histórico;
* promoções;
* listas de compras;
* alertas;
* IA;
* recomendação de produtos;
* otimização da lista;
* identificação de oportunidades de economia.
