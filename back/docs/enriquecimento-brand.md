# SPEC 007 — Deterministic Brand Extraction & Product Enrichment

**Projeto:** Smart Grocery Price Comparator
**Módulo:** Product Enrichment / Brand Extraction
**Versão:** 1.0.0
**Status:** Implementation Ready
**Dependências:**

* SPEC 004 — Generic Supermarket Scraper Engine
* SPEC 005 — Scraper Validation Dashboard
* SPEC 006 — Deterministic Data Validation

---

# 1. Objetivo

Criar uma camada determinística capaz de enriquecer produtos coletados pelos scrapers, principalmente identificando a **marca a partir do nome do produto**.

O sistema deverá resolver casos como:

```text
"Arroz Camil Tipo 1 5kg"
        ↓
brand = "Camil"
```

```text
"Leite Integral Tio João 1L"
        ↓
brand = "Tio João"
```

sem utilizar IA.

---

# 2. Motivação

Foi identificado que diferentes supermercados fornecem os produtos com níveis diferentes de informação.

Exemplo:

### Pão de Açúcar

```json
{
  "name": "Arroz Camil Tipo 1 5kg",
  "brand": "Camil"
}
```

### São Luiz

```json
{
  "name": "Arroz Camil Tipo 1 5kg",
  "brand": null
}
```

Apesar do segundo produto não possuir `brand`, a informação está presente no nome.

A SPEC deverá extrair essa informação automaticamente.

---

# 3. Princípio

A ordem de enriquecimento será:

```text
1. Dado fornecido pelo supermercado
              ↓
2. Dicionário de marcas
              ↓
3. Matching determinístico
              ↓
4. Heurísticas
              ↓
5. Não encontrado
              ↓
6. IA futuramente
```

A IA **não faz parte desta SPEC**.

---

# 4. Fluxo

```text
RawProduct
    ↓
Normalizer
    ↓
Brand Enrichment
    ↓
CanonicalProduct
    ↓
Validation Engine
    ↓
Convex
```

---

# 5. Regra principal

Se o scraper já fornecer:

```ts
brand: "Camil"
```

não tentar substituir a marca através de heurística.

A informação original terá prioridade.

```text
scraper brand
      ↓
   PRIORIDADE
```

---

# 6. Brand Source

Adicionar ao produto:

```ts
brandSource:
  | "scraper"
  | "dictionary"
  | "heuristic"
  | "manual"
  | "ai";
```

Nesta SPEC serão utilizados:

```text
scraper
dictionary
heuristic
manual
```

`ai` ficará reservado para uma SPEC futura.

---

# 7. Brand Confidence

Adicionar:

```ts
brandConfidence?: number;
```

Escala:

```text
0 → 1
```

Exemplo:

```text
scraper
confidence = 1.0
```

```text
dictionary exact match
confidence = 0.98
```

```text
heuristic
confidence = 0.70
```

A confiança será determinística.

Não significa probabilidade estatística.

---

# 8. Estrutura de diretórios

Criar:

```text
src/
│
├── enrichment/
│   │
│   ├── brand/
│   │   ├── brand-extractor.ts
│   │   ├── brand-matcher.ts
│   │   ├── brand-normalizer.ts
│   │   ├── brand-dictionary.ts
│   │   ├── brand-result.ts
│   │   ├── brand-rules.ts
│   │   └── index.ts
│   │
│   └── product-enricher.ts
│
├── catalog/
│   ├── brands.ts
│   └── brand-aliases.ts
│
└── tests/
    └── enrichment/
        └── brand/
```

---

# 9. Brand Dictionary

Criar um catálogo centralizado:

```text
src/catalog/brands.ts
```

Exemplo:

```ts
export const brands = [
  "Camil",
  "Tio João",
  "Nestlé",
  "Sadia",
  "Perdigão",
  "Bauducco",
  "Itambé",
  "Ypê",
  "Colgate",
];
```

A lista deverá crescer conforme novos produtos forem coletados.

---

# 10. Não duplicar marcas

O dicionário deverá armazenar uma marca canônica.

Não criar:

```text
Camil
CAMIL
camil
CAMIl
```

Deverá existir:

```text
Camil
```

---

# 11. Normalização de marca

Criar:

```text
brand-normalizer.ts
```

Responsável por normalizar:

```text
CAMIL
camil
Camil
```

para:

```text
Camil
```

A normalização deverá ser case-insensitive.

---

# 12. Acentos

O matching deverá ignorar acentos.

Exemplo:

```text
"São Braz"
```

deverá ser encontrado mesmo se o texto apresentar:

```text
"SAO BRAZ"
```

Internamente:

```text
normalize("São Braz")
→
"sao braz"
```

---

# 13. Espaços

Normalizar espaços:

```text
"Camil   Arroz"
```

para:

```text
"Camil Arroz"
```

---

# 14. Caracteres especiais

O matcher deverá tratar adequadamente:

```text
-
/
.
,
(
)
```

sem destruir o valor original da marca.

Exemplo:

```text
"Ypê"
```

continua armazenado como:

```text
Ypê
```

mas o matching poderá utilizar:

```text
ype
```

---

# 15. Matching exato

Primeira estratégia:

```text
nome normalizado
        ↓
contém marca normalizada
```

Exemplo:

```text
Produto:
"Arroz Camil Tipo 1 5kg"

Marca:
"Camil"
```

Resultado:

```text
match = true
```

---

# 16. Matching por palavra

Evitar matches parciais perigosos.

Exemplo:

```text
Marca:
"Sol"
```

Não considerar:

```text
"Consolação"
```

como match.

O sistema deverá trabalhar com tokens ou boundaries.

---

# 17. Multi-word brands

Suportar marcas com múltiplas palavras:

```text
Tio João
São Braz
Qualitá
Casa Suíça
Pão de Açúcar
```

Exemplo:

```text
"Arroz Tio João Integral 1kg"
```

Resultado:

```text
brand = "Tio João"
```

---

# 18. Marca no início

Suportar:

```text
"Camil Arroz Tipo 1 5kg"
```

Resultado:

```text
Camil
```

---

# 19. Marca no meio

Suportar:

```text
"Arroz Tipo 1 Camil 5kg"
```

Resultado:

```text
Camil
```

---

# 20. Marca no final

Suportar:

```text
"Arroz Tipo 1 5kg Camil"
```

Resultado:

```text
Camil
```

---

# 21. Prioridade do matching

Se várias marcas forem encontradas:

```text
Produto:
"Leite Nestlé Ninho Integral"
```

O matcher deverá preferir:

1. maior número de tokens;
2. maior comprimento;
3. match mais específico.

Isso evita:

```text
"Nestlé"
```

perder para uma marca hipotética:

```text
"Nes"
```

---

# 22. Longest Match

Exemplo:

```text
Dicionário:

"Casa"
"Casa Suíça"
```

Produto:

```text
"Presunto Casa Suíça 200g"
```

Resultado:

```text
Casa Suíça
```

e não:

```text
Casa
```

---

# 23. Dictionary Source

O dicionário deverá possuir metadados:

```ts
interface BrandDictionaryEntry {
  canonicalName: string;

  aliases?: string[];

  normalizedName: string;

  active: boolean;

  source:
    | "manual"
    | "supermarket"
    | "merged";

  occurrences?: number;
}
```

---

# 24. Alias

Suportar aliases:

```ts
{
  canonicalName: "Coca-Cola",

  aliases: [
    "Coca Cola",
    "CocaCola",
    "Coca-Cola"
  ]
}
```

Todos deverão resultar em:

```text
Coca-Cola
```

---

# 25. Fonte do dicionário

O sistema deverá permitir três fontes:

```text
manual
supermarket
merged
```

### manual

Marca adicionada manualmente.

### supermarket

Marca identificada diretamente pelos scrapers.

### merged

Marca consolidada a partir de múltiplas fontes.

---

# 26. Construção automática do dicionário

Criar um processo que possa analisar produtos já coletados.

Exemplo:

```text
Products
   ↓
brand preenchida
   ↓
extract unique brands
   ↓
Brand Dictionary
```

Se existirem:

```text
Camil
Camil
Camil
Tio João
Nestlé
Nestlé
```

gerar:

```text
Camil
Tio João
Nestlé
```

---

# 27. Frequência

Registrar:

```ts
occurrences
```

Exemplo:

```text
Camil
occurrences: 1842
```

Isso ajudará posteriormente a identificar marcas relevantes.

---

# 28. Nunca criar marca automaticamente apenas por frequência

A frequência não é suficiente para declarar uma string como marca.

O processo deverá gerar:

```text
candidate brand
```

quando a origem não for confiável.

A confirmação poderá ser:

```text
manual
supermarket
future AI
```

---

# 29. Brand Candidates

Criar futuramente uma estrutura:

```text
brandCandidates
```

Exemplo:

```text
"Camil"
"Qualitá"
"Marilan"
```

com:

```text
occurrences
exampleProducts
sourceSupermarkets
```

---

# 30. Heurística

Quando o dicionário não encontrar uma marca, executar heurísticas.

A heurística deverá ser conservadora.

Não tentar adivinhar qualquer palavra como marca.

---

# 31. Heurística 1 — Capitalização

Caso o nome original preserve capitalização:

```text
"Arroz CAMIL Tipo 1 5kg"
```

poderá sugerir:

```text
CAMIL
```

Mas não deverá substituir automaticamente uma marca existente no dicionário.

---

# 32. Heurística 2 — Estrutura

Detectar padrões:

```text
Marca + Produto
Produto + Marca
Produto + Marca + Tipo
```

Exemplos:

```text
"Camil Arroz Tipo 1"
"Arroz Camil Tipo 1"
"Leite Tio João Integral"
```

---

# 33. Heurística 3 — Tokens candidatos

Gerar candidatos com base em:

* tokens iniciais;
* tokens próximos de termos de produto;
* capitalização;
* comprimento;
* exclusão de stopwords.

---

# 34. Stopwords

Criar lista:

```text
tipo
integral
tradicional
original
especial
premium
extra
natural
zero
sem
com
para
de
da
do
```

Exemplo:

```text
"Arroz Camil Tipo 1 5kg"
```

não considerar:

```text
Tipo
```

como marca.

---

# 35. Unidades

Excluir:

```text
1kg
5kg
500g
1l
500ml
12un
```

da análise de marca.

---

# 36. Números

Ignorar tokens exclusivamente numéricos:

```text
1
2
500
1000
```

---

# 37. Confidence heurística

Definir:

```text
dictionary exact:
0.98

dictionary alias:
0.95

heuristic strong:
0.80

heuristic weak:
0.60
```

Apenas resultados acima de um threshold poderão preencher automaticamente a marca.

---

# 38. Threshold

Configuração:

```env
BRAND_AUTO_ACCEPT_THRESHOLD=0.80
```

Se:

```text
confidence >= 0.80
```

preencher automaticamente.

Se:

```text
confidence < 0.80
```

não preencher.

---

# 39. Resultado do extractor

Criar:

```ts
interface BrandExtractionResult {
  brand?: string;

  source:
    | "scraper"
    | "dictionary"
    | "heuristic"
    | "none";

  confidence: number;

  matchedText?: string;

  dictionaryEntry?: string;

  reasons: string[];
}
```

---

# 40. Exemplo — scraper

Entrada:

```json
{
  "name": "Arroz Camil Tipo 1 5kg",
  "brand": "Camil"
}
```

Resultado:

```json
{
  "brand": "Camil",
  "source": "scraper",
  "confidence": 1,
  "reasons": [
    "brand provided by supermarket"
  ]
}
```

---

# 41. Exemplo — dictionary

Entrada:

```json
{
  "name": "Arroz Camil Tipo 1 5kg",
  "brand": null
}
```

Resultado:

```json
{
  "brand": "Camil",
  "source": "dictionary",
  "confidence": 0.98,
  "matchedText": "Camil",
  "reasons": [
    "brand found in dictionary"
  ]
}
```

---

# 42. Exemplo — multi-word

Entrada:

```text
"Arroz Tio João Integral 1kg"
```

Resultado:

```json
{
  "brand": "Tio João",
  "source": "dictionary",
  "confidence": 0.98
}
```

---

# 43. Exemplo — não encontrado

Entrada:

```text
"Banana Prata 1kg"
```

Resultado:

```json
{
  "brand": null,
  "source": "none",
  "confidence": 0,
  "reasons": [
    "no brand match found"
  ]
}
```

Isso não significa que o produto é inválido.

---

# 44. Não confundir categoria com marca

Exemplos:

```text
Arroz
Leite
Café
Detergente
Shampoo
```

não são marcas.

O sistema deverá manter uma lista de termos que não podem ser considerados marcas.

---

# 45. Brand Blacklist

Criar:

```text
src/catalog/brand-blacklist.ts
```

Exemplo:

```ts
export const brandBlacklist = [
  "arroz",
  "feijão",
  "leite",
  "café",
  "açúcar",
  "óleo",
  "detergente",
  "shampoo",
];
```

A lista poderá evoluir posteriormente.

---

# 46. Marca + categoria

Exemplo:

```text
"Arroz Camil"
```

não deve resultar em:

```text
brand = Arroz
```

Deverá resultar:

```text
brand = Camil
```

---

# 47. Produto sem marca real

Produtos de hortifruti:

```text
Banana Prata
Tomate
Batata Inglesa
Cebola
```

poderão permanecer:

```text
brand = null
```

Isso é esperado.

---

# 48. Enrichment Result

Criar:

```ts
interface ProductEnrichmentResult {
  product: CanonicalProduct;

  changes: ProductEnrichmentChange[];

  enrichedAt: number;

  enrichmentVersion: string;
}
```

---

# 49. Change

```ts
interface ProductEnrichmentChange {
  field: string;

  previousValue?: unknown;

  newValue?: unknown;

  source: string;

  confidence: number;

  reason: string;
}
```

Exemplo:

```json
{
  "field": "brand",
  "previousValue": null,
  "newValue": "Camil",
  "source": "dictionary",
  "confidence": 0.98,
  "reason": "Brand found in product name"
}
```

---

# 50. Não destruir Raw Product

O sistema nunca deverá modificar:

```text
rawData
```

O dado original deverá permanecer intacto.

Exemplo:

```text
RAW
brand = null

ENRICHED
brand = Camil
```

---

# 51. Canonical Product

O produto normalizado deverá conter:

```ts
{
  name,
  normalizedName,

  brand,

  brandSource,

  brandConfidence,

  quantity,
  unit,

  supermarketId,

  externalId
}
```

---

# 52. Persistência

Atualizar `products` no Convex para armazenar:

```text
brand
brandSource
brandConfidence
```

Opcionalmente:

```text
brandMatchedText
```

---

# 53. Histórico de enriquecimento

Criar:

```text
productEnrichments
```

Estrutura:

```ts
{
  productId,

  enrichmentVersion,

  changes,

  createdAt
}
```

Isso permitirá auditar:

```text
Antes:
brand = null

Depois:
brand = Camil

Source:
dictionary

Version:
brand-enrichment-v1
```

---

# 54. Versionamento

Registrar:

```text
brand-enrichment-v1
```

Quando as regras mudarem:

```text
brand-enrichment-v2
```

Isso permitirá reprocessar os produtos.

---

# 55. CLI

Criar:

```bash
npm run enrich:brands
```

Todos:

```bash
npm run enrich:brands -- --all
```

Por supermercado:

```bash
npm run enrich:brands -- \
  --supermarket=sao-luiz
```

Somente sem marca:

```bash
npm run enrich:brands -- \
  --missing-brand
```

Reprocessar versão:

```bash
npm run enrich:brands -- \
  --version=brand-enrichment-v2
```

---

# 56. Execução após scrape

O pipeline poderá executar:

```text
SCRAPER
   ↓
NORMALIZER
   ↓
BRAND ENRICHMENT
   ↓
VALIDATION
   ↓
CONVEX
```

---

# 57. Ordem de prioridade

A ordem definitiva será:

```text
1. Scraper brand
       ↓
2. Exact dictionary
       ↓
3. Alias dictionary
       ↓
4. Strong heuristic
       ↓
5. Weak heuristic
       ↓
6. No brand
```

---

# 58. Nunca sobrescrever marca confiável

Se:

```text
brandSource = scraper
```

não substituir por:

```text
dictionary
```

ou:

```text
heuristic
```

---

# 59. Manual Override

Se um administrador corrigir:

```text
brand = Camil
```

armazenar:

```text
brandSource = manual
```

Nenhuma regra automática deverá sobrescrever esse valor.

Prioridade:

```text
manual
  ↓
scraper
  ↓
dictionary
  ↓
heuristic
```

---

# 60. Dashboard

Adicionar ao dashboard:

```text
Brand Enrichment
```

Métricas:

```text
Products with brand
Products without brand
Brands extracted
Dictionary matches
Heuristic matches
Manual corrections
```

---

# 61. Filtro

Em:

```text
/admin/products
```

adicionar:

```text
Brand status
```

Opções:

```text
Has brand
Missing brand
Extracted by dictionary
Extracted by heuristic
Provided by supermarket
Manually corrected
```

---

# 62. Detalhes do produto

Mostrar:

```text
Brand

Camil

Source:
Dictionary

Confidence:
98%

Matched:
"Camil"

Version:
brand-enrichment-v1
```

---

# 63. Debug

Para produtos onde o extractor encontrou marca:

```text
Input:
Arroz Camil Tipo 1 5kg

Normalized:
arroz camil tipo 1 5kg

Candidates:
Camil

Selected:
Camil

Source:
dictionary

Confidence:
0.98
```

Isso será importante para ajustar o algoritmo.

---

# 64. Relatório

CLI deverá permitir:

```bash
npm run enrich:brands -- --report
```

Resultado:

```text
Brand Enrichment Report

Products analyzed:       12,483

Already had brand:        7,231

Dictionary matches:       4,182

Heuristic matches:          612

No brand found:             458

Auto accepted:            4,794

Candidates for review:      112
```

---

# 65. Performance

O processo deverá ser local e barato.

Não utilizar:

* API externa;
* LLM;
* embeddings;
* banco vetorial;
* requests adicionais aos supermercados.

O processamento deverá trabalhar somente sobre os dados existentes.

---

# 66. Testes

Criar:

```text
tests/enrichment/brand/
```

Testes obrigatórios:

```text
brand-normalizer.test.ts
brand-matcher.test.ts
brand-extractor.test.ts
brand-dictionary.test.ts
```

---

# 67. Testes de matching

### Caso 1

```text
Input:
Arroz Camil Tipo 1 5kg

Expected:
Camil
```

### Caso 2

```text
Input:
Camil Arroz Tipo 1 5kg

Expected:
Camil
```

### Caso 3

```text
Input:
Arroz Tipo 1 Camil 5kg

Expected:
Camil
```

### Caso 4

```text
Input:
Arroz Tio João 5kg

Expected:
Tio João
```

### Caso 5

```text
Input:
Arroz SAO BRAZ 5kg

Expected:
São Braz
```

### Caso 6

```text
Input:
Banana Prata 1kg

Expected:
null
```

---

# 68. Teste de falso positivo

### Input

```text
"Arroz Sol 5kg"
```

Se `Sol` não estiver confirmado como marca:

```text
brand = null
```

Não assumir automaticamente.

---

# 69. Teste de longest match

Dicionário:

```text
Casa
Casa Suíça
```

Input:

```text
Presunto Casa Suíça 200g
```

Expected:

```text
Casa Suíça
```

---

# 70. Teste de prioridade

Input:

```json
{
  "name": "Arroz Camil 5kg",
  "brand": "Camil"
}
```

Expected:

```text
source = scraper
confidence = 1
```

Mesmo que o dicionário também contenha Camil.

---

# 71. Teste de alias

Dicionário:

```text
canonical:
Coca-Cola

alias:
Coca Cola
```

Input:

```text
Coca Cola Original 2L
```

Expected:

```text
Coca-Cola
```

---

# 72. Integração com Validation Engine

O enriquecimento deverá acontecer **antes da validação final**.

Antes:

```text
Product
brand = null
```

Depois:

```text
Product
brand = Camil
brandSource = dictionary
```

Então:

```text
Validation
```

poderá considerar o produto enriquecido.

---

# 73. Impacto no score

Depois do enrichment:

```text
MISSING_BRAND
```

não deverá mais ser gerado se uma marca válida tiver sido extraída.

Exemplo:

```text
Antes:

brand = null
score = 95
issue = MISSING_BRAND
```

Depois:

```text
brand = Camil
brandSource = dictionary

score = 100
issues = []
```

---

# 74. Limite de confiança

Somente preencher automaticamente:

```text
confidence >= 0.80
```

Resultados abaixo disso deverão ser armazenados como candidatos, sem alterar o `brand`.

---

# 75. Brand Candidates

Quando a confiança estiver abaixo do threshold:

```text
brandCandidates
```

poderá armazenar:

```ts
{
  productId,
  candidate,
  confidence,
  source,
  createdAt
}
```

Exemplo:

```text
Produto:
"Arroz Premium XYZ 5kg"

Candidate:
XYZ

Confidence:
0.62
```

---

# 76. Dashboard — candidatos

Adicionar:

```text
/admin/validation/brands
```

Tabela:

```text
Produto
Marca sugerida
Confidence
Source
Ação
```

Ações:

```text
Accept
Reject
```

Se aceitar:

```text
brandSource = manual
```

---

# 77. Integração com múltiplos supermercados

O dicionário deverá ser global.

Exemplo:

```text
Pão de Açúcar
      ↓
Camil
      ↓
Brand Dictionary
      ↓
São Luiz
      ↓
"Arroz Camil 5kg"
      ↓
Camil
```

O conhecimento obtido de um supermercado poderá melhorar os demais.

---

# 78. Importante: não confiar cegamente em supermercado

Uma marca fornecida por um supermercado será considerada de alta confiança para o produto específico, mas não deverá automaticamente virar uma marca global sem passar pelo processo de consolidação do dicionário.

---

# 79. Futuro

Esta SPEC deverá preparar:

```text
Brand Extraction
       ↓
Product Matching
       ↓
Canonical Product
       ↓
AI
```

A IA futuramente poderá receber somente:

```text
produtos sem marca
+
candidatos de baixa confiança
+
casos ambíguos
```

---

# 80. Definition of Done

### Brand Engine

* [ ] Brand extractor implementado.
* [ ] Brand matcher implementado.
* [ ] Brand normalizer implementado.
* [ ] Brand dictionary implementado.
* [ ] Alias support implementado.
* [ ] Longest match implementado.
* [ ] Confidence implementado.
* [ ] Source tracking implementado.

### Enrichment

* [ ] Product enricher implementado.
* [ ] Brand preenchida automaticamente.
* [ ] Raw data preservado.
* [ ] Enrichment history implementado.
* [ ] Versionamento implementado.

### Dictionary

* [ ] Marcas conhecidas cadastradas.
* [ ] Marcas do Pão de Açúcar utilizadas como fonte.
* [ ] Duplicação de marcas evitada.
* [ ] Aliases suportados.
* [ ] Candidates suportados.

### Validation

* [ ] Enrichment executado antes da validation.
* [ ] Missing brand reduzido.
* [ ] Score atualizado após enrichment.

### Dashboard

* [ ] Brand source exibido.
* [ ] Confidence exibida.
* [ ] Filtro por source.
* [ ] Filtro por missing brand.
* [ ] Brand candidates.
* [ ] Manual correction.

### CLI

* [ ] `enrich:brands`.
* [ ] `--all`.
* [ ] `--supermarket`.
* [ ] `--missing-brand`.
* [ ] `--report`.
* [ ] Versionamento.

### Testes

* [ ] Exact match.
* [ ] Alias match.
* [ ] Multi-word brand.
* [ ] Accent normalization.
* [ ] Longest match.
* [ ] Heuristic match.
* [ ] False-positive prevention.
* [ ] Scraper priority.
* [ ] Manual priority.

---

# 81. Resultado esperado

Depois desta SPEC, um produto como:

```text
Arroz Camil Tipo 1 5kg
```

coletado pelo São Luiz como:

```json
{
  "name": "Arroz Camil Tipo 1 5kg",
  "brand": null
}
```

deverá passar por:

```text
Normalizer
      ↓
Brand Extractor
      ↓
Dictionary Match
      ↓
Camil
      ↓
Validation
```

e terminar como:

```json
{
  "name": "Arroz Camil Tipo 1 5kg",
  "brand": "Camil",
  "brandSource": "dictionary",
  "brandConfidence": 0.98
}
```

Sem:

```text
LLM
API
tokens
embeddings
```

---

# 82. Próxima etapa

Depois desta SPEC, o pipeline estará preparado para a primeira camada de inteligência:

```text
SCRAPER
   ↓
NORMALIZER
   ↓
BRAND ENRICHMENT
   ↓
DETERMINISTIC VALIDATION
   ↓
CONVEX
   ↓
DASHBOARD
   ↓
AI
```

A próxima SPEC deverá ser:

**SPEC 008 — AI-Assisted Product Normalization & Validation**

A IA deverá atuar apenas nos produtos que permanecerem ambíguos após todas as regras determinísticas.
