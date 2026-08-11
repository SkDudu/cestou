# SPEC 006 — Deterministic Data Validation

**Projeto:** Smart Grocery Price Comparator
**Módulo:** Data Quality / Validation Engine
**Versão:** 1.0.0
**Status:** Implementation Ready
**Dependências:** SPEC 004 — Generic Supermarket Scraper Engine
**Dependências:** SPEC 005 — Scraper Validation Dashboard

---

# 1. Objetivo

Criar um mecanismo determinístico de validação dos produtos coletados pelos scrapers.

O sistema deverá analisar automaticamente cada produto utilizando regras objetivas antes de qualquer processamento por IA.

O objetivo é:

* eliminar produtos claramente inválidos;
* validar automaticamente produtos confiáveis;
* identificar produtos suspeitos;
* identificar dados incompletos;
* reduzir a quantidade de produtos que futuramente precisarão passar pela IA;
* fornecer explicações claras para cada decisão.

---

# 2. Regra principal

A validação deverá ser:

```text
Determinística
Reproduzível
Explicável
Sem IA
```

Dado o mesmo produto e as mesmas regras:

```text
Produto A + Rules v1
        ↓
mesmo resultado
```

A validação não deverá depender de:

* LLM;
* API externa;
* modelo de machine learning;
* histórico humano;
* comportamento probabilístico.

---

# 3. Fluxo

O pipeline deverá ser:

```text
Scraper
   ↓
RawProduct
   ↓
Normalizer
   ↓
CanonicalProduct
   ↓
Validation Engine
   ↓
Validation Result
   ↓
Convex
   ↓
Dashboard
```

---

# 4. Resultado possível

O Validation Engine deverá retornar:

```text
validated
suspicious
invalid
pending
```

### validated

Produto passou pelas regras obrigatórias.

### suspicious

Produto possui alguma inconsistência que não permite invalidá-lo automaticamente.

### invalid

Produto possui uma inconsistência objetiva que torna o dado inválido.

### pending

Não existem informações suficientes para tomar uma decisão.

---

# 5. Estrutura

Criar:

```text
src/
│
├── validation/
│   │
│   ├── validation-engine.ts
│   │
│   ├── validation-result.ts
│   │
│   ├── validation-context.ts
│   │
│   ├── rules/
│   │   ├── required-fields.rule.ts
│   │   ├── price.rule.ts
│   │   ├── discount.rule.ts
│   │   ├── quantity.rule.ts
│   │   ├── unit.rule.ts
│   │   ├── image.rule.ts
│   │   ├── url.rule.ts
│   │   ├── external-id.rule.ts
│   │   ├── duplicate.rule.ts
│   │   └── suspicious-price.rule.ts
│   │
│   └── index.ts
│
└── persistence/
    └── validation-repository.ts
```

---

# 6. Validation Rule

Todas as regras deverão seguir o mesmo contrato.

Criar:

```ts
export interface ValidationRule {
  id: string;

  name: string;

  severity: "info" | "warning" | "error";

  validate(
    product: CanonicalProduct,
    context: ValidationContext
  ): ValidationIssue | null;
}
```

---

# 7. Validation Issue

Criar:

```ts
export interface ValidationIssue {
  ruleId: string;

  severity: "info" | "warning" | "error";

  code: string;

  message: string;

  field?: string;

  value?: unknown;
}
```

Exemplo:

```ts
{
  ruleId: "price-positive",
  severity: "error",
  code: "INVALID_PRICE",
  message: "Product price must be greater than zero",
  field: "price",
  value: 0
}
```

---

# 8. Validation Result

Criar:

```ts
export interface ValidationResult {
  status:
    | "validated"
    | "suspicious"
    | "invalid"
    | "pending";

  issues: ValidationIssue[];

  score: number;

  validatedAt: number;

  rulesVersion: string;
}
```

---

# 9. Score

Criar um score de qualidade entre:

```text
0 — 100
```

Exemplo:

```text
100 → excelente
90  → muito bom
75  → aceitável
50  → suspeito
0   → inválido
```

O score não deverá substituir o status.

---

# 10. Campos obrigatórios

Um produto deverá possuir obrigatoriamente:

```text
name
price
supermarketId
```

Caso algum esteja ausente:

```text
invalid
```

Exemplo:

```text
name = ""
price = 7.99
```

Resultado:

```text
invalid
```

---

# 11. Nome

Validar:

* não vazio;
* não somente espaços;
* comprimento mínimo;
* comprimento máximo.

Configuração:

```ts
MIN_PRODUCT_NAME_LENGTH = 3;

MAX_PRODUCT_NAME_LENGTH = 250;
```

Exemplos inválidos:

```text
""
"  "
"X"
```

Exemplos aceitáveis:

```text
"Arroz"
"Leite Integral"
"Arroz Camil Tipo 1 5kg"
```

---

# 12. Preço

O preço deverá:

```text
ser number
ser finito
ser > 0
```

Invalidar:

```text
0
-10
NaN
Infinity
```

---

# 13. Preço máximo

Criar uma regra de preço suspeito.

Não invalidar automaticamente preços altos.

Exemplo:

```text
price = R$ 9999,99
```

deverá resultar em:

```text
suspicious
```

e não:

```text
invalid
```

Motivo:

Um supermercado pode realmente vender produtos caros.

---

# 14. Configuração de preço

Criar configuração:

```ts
MAX_SUSPICIOUS_PRICE = 1000;
```

Esse valor deverá ser configurável.

Importante:

Essa regra é apenas um alerta.

---

# 15. Promoção

Se existir:

```text
originalPrice
```

validar:

```text
originalPrice > price
```

Exemplo válido:

```text
price: 7.99
originalPrice: 9.99
```

Exemplo inválido:

```text
price: 9.99
originalPrice: 7.99
```

Resultado:

```text
suspicious
```

---

# 16. Desconto

Se existir:

```text
discount
```

validar:

```text
0 < discount < 100
```

Exemplos:

```text
20 ✓
50 ✓
99 ✓
0 ✗
120 ✗
-10 ✗
```

---

# 17. Consistência do desconto

Quando existir:

```text
price
originalPrice
discount
```

calcular:

```text
calculatedDiscount =
((originalPrice - price) / originalPrice) * 100
```

Permitir pequena margem:

```text
DISCOUNT_TOLERANCE = 1
```

Exemplo:

```text
Original: R$ 10
Atual: R$ 8
Desconto informado: 20%

✓ válido
```

---

# 18. Quantidade

Se existir:

```text
quantity
```

deverá:

```text
ser number
ser > 0
```

Invalidar:

```text
0
-1
NaN
```

---

# 19. Unidade

Unidades suportadas inicialmente:

```text
kg
g
mg
l
ml
un
pack
```

O sistema deverá aceitar aliases após normalização.

Exemplo:

```text
KG
Kg
quilo
```

deverão chegar ao validator como:

```text
kg
```

---

# 20. Quantidade + unidade

Se:

```text
quantity
```

existir, mas:

```text
unit
```

não existir:

```text
suspicious
```

Exemplo:

```text
quantity: 5
unit: undefined
```

Motivo:

```text
QUANTITY_WITHOUT_UNIT
```

---

# 21. Imagem

Validar:

```text
imageUrl
```

Se não existir:

```text
suspicious
```

Não invalidar.

Motivo:

```text
MISSING_IMAGE
```

Alguns supermercados podem não fornecer imagens.

---

# 22. URL

Validar:

```text
url
```

Caso não exista:

```text
warning
```

Caso exista, verificar se possui formato válido.

Exemplo:

```text
https://www.supermercado.com/produto/123
```

---

# 23. External ID

Validar:

```text
externalId
```

Se existir:

```text
supermarketId + externalId
```

deverá ser único.

Caso não exista:

```text
warning
```

Não invalidar automaticamente.

---

# 24. Duplicidade

Criar regra:

```text
duplicate-product
```

Primeiro tentar:

```text
supermarketId + externalId
```

Depois fallback:

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

Se houver duplicidade:

```text
suspicious
```

---

# 25. Não fazer merge automático

A SPEC não deverá implementar merge automático.

Exemplo:

```text
Arroz Camil 5kg
Arroz Camil Tipo 1 5 Kg
```

Não assumir automaticamente que são o mesmo produto.

Apenas sinalizar:

```text
possible duplicate
```

---

# 26. Marca

A marca não deverá ser obrigatória.

Exemplo:

```text
name: "Leite Integral 1L"
brand: undefined
```

Resultado:

```text
suspicious
```

ou apenas:

```text
warning
```

dependendo do score.

Não invalidar.

---

# 27. Produto genérico

Produtos genéricos como:

```text
Banana
Tomate
Batata
Cebola
```

não deverão ser considerados inválidos apenas por não possuírem marca.

---

# 28. Nome suspeito

Detectar nomes excessivamente curtos:

```text
"X"
"AB"
"123"
```

e nomes compostos somente por números.

Resultado:

```text
suspicious
```

---

# 29. Nome com preço

Detectar possíveis erros de scraping:

```text
"Arroz R$ 9,99"
```

ou:

```text
"Leite 10,99"
```

Isso não deverá invalidar automaticamente.

Resultado:

```text
suspicious
```

Motivo:

```text
PRICE_IN_PRODUCT_NAME
```

---

# 30. Disponibilidade

Se:

```text
availability === false
```

não invalidar o produto.

O produto continua válido como item do catálogo.

O preço deverá continuar armazenado.

---

# 31. Imagem quebrada

Nesta fase, não será necessário baixar todas as imagens para verificar HTTP status.

Caso exista uma URL:

```text
imageUrl
```

considerar válida estruturalmente.

Uma verificação real de imagem poderá ser adicionada posteriormente.

---

# 32. URL do produto

O mesmo princípio vale para:

```text
productUrl
```

Nesta versão validar apenas estrutura.

Não fazer requests extras para cada produto.

---

# 33. Regras e severidade

Tabela:

| Regra                  | Severidade | Resultado  |
| ---------------------- | ---------- | ---------- |
| Nome ausente           | error      | invalid    |
| Preço ausente          | error      | invalid    |
| Supermercado ausente   | error      | invalid    |
| Preço <= 0             | error      | invalid    |
| Preço muito alto       | warning    | suspicious |
| Promoção inconsistente | warning    | suspicious |
| Desconto inválido      | warning    | suspicious |
| Quantidade inválida    | error      | invalid    |
| Unidade desconhecida   | warning    | suspicious |
| Imagem ausente         | info       | score      |
| URL ausente            | info       | score      |
| External ID ausente    | info       | score      |
| Possível duplicata     | warning    | suspicious |
| Marca ausente          | info       | score      |
| Nome suspeito          | warning    | suspicious |

---

# 34. Prioridade das regras

O status final deverá seguir:

```text
Se existir ERROR
        ↓
    INVALID

Senão se existir WARNING crítico
        ↓
    SUSPICIOUS

Senão se dados insuficientes
        ↓
    PENDING

Senão
        ↓
    VALIDATED
```

---

# 35. Score

Implementar score inicial:

```text
100
```

Penalidades:

```text
ERROR      -40
WARNING    -15
INFO        -5
```

Limitar:

```text
0 <= score <= 100
```

---

# 36. Exemplos

## Produto perfeito

```json
{
  "name": "Arroz Camil Tipo 1 5kg",
  "brand": "Camil",
  "price": 29.99,
  "originalPrice": 34.99,
  "discount": 14.29,
  "quantity": 5,
  "unit": "kg",
  "imageUrl": "https://...",
  "url": "https://...",
  "externalId": "123",
  "supermarketId": "sao-luiz"
}
```

Resultado:

```text
validated
score: 100
```

---

# 37. Produto sem imagem

```text
Arroz Camil 5kg
R$ 29,99
```

Resultado:

```text
validated
score: 95
```

Não invalidar.

---

# 38. Produto sem preço

```text
Arroz Camil 5kg
price: undefined
```

Resultado:

```text
invalid
```

---

# 39. Preço suspeito

```text
Arroz Camil 5kg
R$ 999,99
```

Resultado:

```text
suspicious
```

---

# 40. Promoção inconsistente

```text
price: 10
originalPrice: 8
discount: 20
```

Resultado:

```text
suspicious
```

---

# 41. Produto duplicado

```text
externalId: 123
```

já existe no mesmo supermercado.

Resultado:

```text
suspicious
```

---

# 42. Validation Engine

Criar:

```text
src/validation/validation-engine.ts
```

Exemplo:

```ts
class ValidationEngine {
  constructor(
    private rules: ValidationRule[]
  ) {}

  validate(
    product: CanonicalProduct,
    context: ValidationContext
  ): ValidationResult {

    const issues = this.rules
      .map(rule => rule.validate(product, context))
      .filter(Boolean);

    return this.buildResult(issues);
  }
}
```

---

# 43. Rule Registry

Criar:

```text
src/validation/index.ts
```

Exemplo:

```ts
export const validationRules = [
  requiredFieldsRule,
  priceRule,
  discountRule,
  quantityRule,
  unitRule,
  imageRule,
  urlRule,
  externalIdRule,
  duplicateRule,
  suspiciousPriceRule,
];
```

---

# 44. Validation Context

Criar:

```ts
interface ValidationContext {
  supermarketId: string;

  existingExternalIds: Set<string>;

  existingProductKeys: Set<string>;

  priceThresholds?: {
    maxSuspiciousPrice?: number;
  };

  rulesVersion: string;
}
```

---

# 45. Versionamento

Toda validação deverá registrar:

```text
rulesVersion
```

Exemplo:

```text
validation-v1
```

Quando as regras forem alteradas:

```text
validation-v2
```

Isso permitirá reprocessar produtos posteriormente.

---

# 46. Persistência

A validação deverá ser salva no Convex.

Adicionar:

```text
productValidations
```

Estrutura:

```ts
{
  productId,
  status,
  score,
  issues,
  rulesVersion,
  validatedAt
}
```

---

# 47. Histórico de validação

Não sobrescrever obrigatoriamente o histórico anterior.

Estrutura recomendada:

```text
product
   │
   ├── validation-v1
   ├── validation-v2
   └── validation-v3
```

A validação mais recente será a ativa.

---

# 48. Validação durante o scrape

O ideal é executar:

```text
Scraper
   ↓
Normalizer
   ↓
Validator
   ↓
Convex
```

Assim o produto já entra no banco com seu status.

Não depender do dashboard para executar a primeira validação.

---

# 49. Revalidação

Criar CLI:

```bash
npm run validate
```

Validar todos:

```bash
npm run validate -- --all
```

Validar pendentes:

```bash
npm run validate -- --status=pending
```

Validar um supermercado:

```bash
npm run validate -- --supermarket=sao-luiz
```

---

# 50. Revalidação por versão

Permitir:

```bash
npm run validate -- --rules-version=validation-v2
```

Isso deverá permitir reprocessar produtos quando as regras mudarem.

---

# 51. Dashboard

O dashboard da SPEC 005 deverá consumir os resultados desta camada.

Na página:

```text
/admin/validation
```

mostrar:

```text
Validated
Suspicious
Invalid
Pending
```

Exemplo:

```text
Validated       8.423
Suspicious        318
Invalid            42
Pending             0
```

---

# 52. Filtro por regra

Permitir filtrar:

```text
Missing price
Missing image
Invalid discount
Suspicious price
Possible duplicate
Missing brand
Invalid quantity
```

---

# 53. Detalhes

Ao abrir um produto:

```text
Validation

Status:
Suspicious

Score:
72

Issues:

⚠ Suspicious price
⚠ Missing image

Rules version:
validation-v1
```

---

# 54. Ação manual

O humano ainda poderá sobrescrever a decisão automática.

Exemplo:

```text
Automated:
Suspicious

Human:
Validated
```

Nesse caso armazenar:

```text
validationSource:
"human"
```

---

# 55. Source

Adicionar:

```ts
validationSource:
  | "rules"
  | "human"
  | "ai";
```

Nesta SPEC somente:

```text
rules
human
```

serão utilizados.

`ai` ficará reservado para SPEC futura.

---

# 56. Não apagar decisão automática

Se o humano alterar:

```text
rules:
suspicious

human:
validated
```

manter ambas as informações.

Exemplo:

```ts
{
  automatedStatus: "suspicious",

  automatedScore: 72,

  automatedIssues: [...],

  humanStatus: "validated",

  humanNotes: "Preço confirmado no site",

  humanValidatedAt: 123456789
}
```

---

# 57. Objetivo para a futura IA

A arquitetura deverá permitir futuramente:

```text
Rules
   ↓
AI
   ↓
Human
```

A IA poderá receber:

```text
produto
+
issues
+
score
```

e tentar resolver apenas os casos necessários.

---

# 58. Performance

A validação deverá ser barata.

Não realizar:

* requests HTTP por produto;
* chamadas externas;
* processamento pesado;
* IA;
* downloads de imagens.

As regras devem trabalhar apenas com os dados já coletados.

---

# 59. Testes

Criar:

```text
tests/validation/
```

Testar cada regra individualmente.

Exemplo:

```text
required-fields.rule.test.ts
price.rule.test.ts
discount.rule.test.ts
quantity.rule.test.ts
unit.rule.test.ts
duplicate.rule.test.ts
```

---

# 60. Testes obrigatórios

### Price

```text
10 → valid
0 → invalid
-1 → invalid
NaN → invalid
```

### Discount

```text
20 → valid
0 → invalid
100 → invalid
150 → invalid
```

### Quantity

```text
1 → valid
5 → valid
0 → invalid
-1 → invalid
```

### Name

```text
"Arroz" → valid
"" → invalid
"X" → suspicious
```

### Promotion

```text
price=8
originalPrice=10
discount=20
→ valid
```

---

# 61. Integração

O pipeline final deverá ser:

```text
                 SUPERMARKET
                      │
                      ▼
                   SCRAPER
                      │
                      ▼
                 RawProduct
                      │
                      ▼
                  NORMALIZER
                      │
                      ▼
               CanonicalProduct
                      │
                      ▼
              VALIDATION ENGINE
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      validated   suspicious   invalid
          │           │           │
          └───────────┼───────────┘
                      ▼
                    Convex
                      │
                      ▼
                  Dashboard
```

---

# 62. Definition of Done

### Engine

* [ ] ValidationEngine implementado.
* [ ] ValidationRule implementado.
* [ ] ValidationIssue implementado.
* [ ] ValidationResult implementado.
* [ ] ValidationContext implementado.

### Rules

* [ ] Required fields.
* [ ] Name.
* [ ] Price.
* [ ] Suspicious price.
* [ ] Discount.
* [ ] Promotion.
* [ ] Quantity.
* [ ] Unit.
* [ ] Image.
* [ ] URL.
* [ ] External ID.
* [ ] Duplicate.
* [ ] Suspicious name.

### Convex

* [ ] `productValidations`.
* [ ] Automated status.
* [ ] Score.
* [ ] Issues.
* [ ] Rules version.
* [ ] Validation source.
* [ ] Human override.

### Pipeline

* [ ] Validator integrado ao scraper.
* [ ] Produto validado antes de persistir.
* [ ] Status persistido.
* [ ] Score persistido.
* [ ] Issues persistidas.

### CLI

* [ ] `npm run validate`.
* [ ] Validar todos.
* [ ] Validar pendentes.
* [ ] Validar supermercado.
* [ ] Revalidar por rules version.

### Dashboard

* [ ] Filtro por status.
* [ ] Filtro por regra.
* [ ] Score exibido.
* [ ] Issues exibidas.
* [ ] Human override.
* [ ] Histórico de validação.

### Testes

* [ ] Unit tests das regras.
* [ ] Integration test do engine.
* [ ] Teste do pipeline scraper → validator → Convex.

---

# 63. Resultado esperado

Depois desta SPEC, um produto não deverá mais entrar no banco simplesmente como:

```text
pending
```

sem explicação.

Ele deverá entrar com algo como:

```text
Arroz Camil Tipo 1 5kg

Status:
validated

Score:
100

Rules:
validation-v1

Issues:
none
```

ou:

```text
Arroz Camil 5kg

Status:
suspicious

Score:
75

Issues:
⚠ Missing image
⚠ Suspicious price
```

ou:

```text
Produto sem nome

Status:
invalid

Score:
40

Issues:
✗ Missing product name
```

A partir daí teremos uma base muito mais sólida para a próxima etapa:

```text
SPEC 007 — AI Product Normalization
```

onde a IA poderá trabalhar **somente nos casos em que regras determinísticas não são suficientes**.
