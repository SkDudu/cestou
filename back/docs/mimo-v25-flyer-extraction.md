# SPEC 012 — MiMo-V2.5 Flyer Extraction

**Projeto:** Cestou  
**Módulo:** Encartes / Extração de Ofertas com Visão  
**Versão:** 1.0.0  
**Status:** Implementation Ready  
**Prioridade:** Alta  
**Dependências:** SPEC 010 (Flyer-First Offers Pipeline), SPEC 008 (Convex Storage)  
**Provedor:** Xiaomi MiMo-V2.5 (`https://api.xiaomimimo.com/v1`, OpenAI-compatible)  
**Nota de numeração:** Rascunho original usava SPEC 010; no repositório SPEC 010 já é Flyer-First e SPEC 011 é DeepSeek Vision. Esta SPEC é **012**.  
**Relação com SPEC 011:** DeepSeek (`image_url` no `chat/completions`) foi rejeitado pela API oficial (`unknown variant image_url, expected text`). MiMo-V2.5 passa a ser o **provedor primário de visão**. Tesseract+regras permanece fallback offline.

---

# 1. Objetivo

Adicionar o **MiMo-V2.5** (Xiaomi) ao pipeline de encartes do Cestou para extração visual de produtos e ofertas diretamente das páginas dos encartes.

O MiMo interpreta as imagens e devolve dados estruturados.

O sistema deverá:

* enviar páginas do encarte para o MiMo;
* identificar produtos, preços, marcas, quantidades, unidades, preços anteriores e descontos;
* retornar JSON estruturado;
* validar a resposta (schema + regras determinísticas);
* detectar duplicações;
* salvar os dados no Convex;
* manter a imagem original como evidência.

---

# 2. Arquitetura

```text
Flyer
   ↓
Flyer Pages
   ↓
Imagem (Convex Storage)
   ↓
MiMo-V2.5
   ↓
JSON
   ↓
Schema Validation
   ↓
Deterministic Validation
   ↓
Offers
   ↓
Convex
   ↓
Dashboard
```

---

# 3. Papel do MiMo

Usar o MiMo **somente** como modelo de visão para o encarte.

Pergunta:

> Quais produtos e ofertas estão presentes nesta página?

**Não** é responsabilidade do modelo:

* decidir se uma oferta é comercialmente válida;
* decidir se o supermercado pertence a Fortaleza;
* substituir validações do backend;
* criar produtos que não aparecem na imagem;
* corrigir silenciosamente informações ausentes.

---

# 4. API

API compatível com OpenAI:

| Param | Valor |
|-------|--------|
| `base_url` | `https://api.xiaomimimo.com/v1` |
| Modelo | `mimo-v2.5` |
| Auth | `Authorization: Bearer ${MIMO_API_KEY}` |

---

# 5. Configuração

```env
MIMO_API_KEY=
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_MODEL=mimo-v2.5

MIMO_MAX_COMPLETION_TOKENS=4096
MIMO_TIMEOUT=120000
MIMO_MAX_RETRIES=3
MIMO_CONCURRENCY=1
```

Modelo e timeouts **não** ficam hardcoded no código.

---

# 6. Cliente MiMo

Cliente isolado sob o scraper atual:

```text
back/scraper/src/flyers/extraction/mimo/
├── client.ts
├── extractor.ts
├── prompts.ts
├── schemas.ts
├── types.ts
├── errors.ts
└── index.ts
```

O restante do projeto **não** chama o SDK OpenAI diretamente.

---

# 7. Client

```ts
new OpenAI({
  apiKey: MIMO_API_KEY,
  baseURL: MIMO_BASE_URL, // https://api.xiaomimimo.com/v1
})
```

O `model` vem de `MIMO_MODEL`.

---

# 8. Input

O MiMo recebe:

* imagem da página;
* instrução de extração.

Conceito: `image_url` + prompt.

A imagem poderá ser:

* URL temporária (Convex Storage `getUrl`);
* URL pública;
* bytes da imagem armazenada / processada localmente (data URI se a URL for localhost).

---

# 9. Preferência de imagem

A imagem original permanece no **Convex File Storage** (`flyerPages.storageId`).

O pipeline analisa a cópia armazenada — **não** depender da URL permanente do supermercado.

---

# 10. Prompt

Arquivo separado: `prompts.ts`.

Solicitar: todos os produtos; nome; marca; quantidade; unidade; preço; preço anterior; desconto; página.

Resposta: **JSON exclusivamente**.

---

# 11. Prompt base

```text
Analyze this supermarket flyer page.

Extract EVERY distinct product offer visible in the image.

For each offer identify:

- name
- brand
- quantity
- unit
- price
- originalPrice
- discount
- pageNumber

Rules:
1. Do not invent information.
2. If a field cannot be identified, return null.
3. Keep the product name as close as possible to the flyer.
4. Separate different products even when they appear in the same promotional block.
5. Do not count decorative elements as products.
6. Do not count the same product twice on the same page.
7. Prices must be numeric using decimal notation.
8. Return valid JSON only.
```

Versionar: `promptVersion = flyer-offers-v1`.

---

# 12. Response

```json
{
  "offers": [
    {
      "name": "Arroz Camil Tipo 1",
      "brand": "Camil",
      "quantity": "5",
      "unit": "kg",
      "price": 27.99,
      "originalPrice": 34.9,
      "discount": 19.8,
      "pageNumber": 3
    }
  ],
  "confidence": 0.94
}
```

---

# 13. JSON Schema

Validar **antes** de persistir.

```text
offers
 └── offer
      ├── name
      ├── brand
      ├── quantity
      ├── unit
      ├── price
      ├── originalPrice
      ├── discount
      └── pageNumber
```

---

# 14. Campos obrigatórios

**Obrigatórios:** `name`, `price`

**Opcionais:** `brand`, `quantity`, `unit`, `originalPrice`, `discount`, `pageNumber`

Campo não identificado → `null`

Nunca: `"unknown"`, `"não identificado"`, `"N/A"`

---

# 15. Validação da resposta

Antes de usar:

* JSON válido;
* `offers` é array;
* `name` não vazio;
* `price` é número e `price > 0`;
* `originalPrice`, quando presente, é número e `originalPrice >= price`;
* `discount` ∈ `[0, 100]` quando presente;
* `pageNumber` válido (inteiro ≥ 1, bate com a página enviada).

---

# 16. Sanitização

**Nome:** remover espaços duplicados, quebras de linha, caracteres estranhos.

**Marca:** `CAMIL` / `camil` / `Camil` → `Camil` (title case simples).

**Unidade:** `KG` / `Kg` / `kg` → `kg`.

---

# 17. Preços

Esperado:

```json
{ "price": 27.99 }
```

Nunca `"R$ 27,99"` como valor final. Se o modelo devolver string, o parser tenta normalizar (BR `1.234,56` / `27,99`).

---

# 18. Desconto

Encarte:

```text
De R$ 34,90
Por R$ 27,99
```

Esperado:

```json
{ "price": 27.99, "originalPrice": 34.9 }
```

O `discount` do modelo **pode ser ignorado** se inconsistente. O backend calcula.

---

# 19. Cálculo determinístico

O backend é a autoridade do desconto:

```ts
discountPercentage = round(((originalPrice - price) / originalPrice) * 100, 2)
```

Mapear para `offers.discountPercentage` (SPEC 010).

---

# 20. Não confiar cegamente no modelo

MiMo extrai; não garante integridade.

Exemplo: `price = 2.799` (possível OCR/decimal errado). O backend deve flagar inconsistência (limites razoáveis, p.ex. `0 < price < 10000`) e marcar `suspicious` ou descartar.

---

# 21. Confidence

A resposta pode incluir `confidence` (página).

Criar `extractionConfidence` na offer (do modelo ou derivado).

**Separar** de `validationStatus`. Confidence **não** valida comercialmente.

---

# 22. Status

Continua SPEC 010:

`pending` | `validated` | `suspicious` | `rejected`

Oferta recém-extraída = **`pending`**, mesmo com confidence alta.

---

# 23. Validação determinística

```text
MiMo → JSON → Schema → Rules
```

**Nome:** obrigatório; mínimo de caracteres (≥ 3); não só dígitos.

**Preço:** obrigatório; `> 0`; limites razoáveis.

**Quantidade:** se presente, valor + unidade válida (`kg`, `g`, `l`, `ml`, `un`, …).

---

# 24. Detecção de duplicidade

Na **mesma página**, não gerar duas ofertas para o mesmo produto:

```text
Arroz Camil 5kg
Arroz Camil 5 KG
```

---

# 25. Deduplicação

Chave determinística:

```text
normalizedName + brand + quantity + unit + price
```

Matching semântico fica fora desta SPEC.

---

# 26. Evidência

Toda oferta liga a:

* `flyerId`
* `pageNumber` (e `flyerPages` / `pageId` quando existir)
* imagem original no Storage

O dashboard abre a página do encarte.

---

# 27. Raw Response

Salvar a resposta original do MiMo para auditoria (`rawResponse` na extraction).

Permite debug, evolução de prompt, reprocessar.

---

# 28. Prompt Version

Cada processamento registra:

* `model` (ex. `mimo-v2.5`)
* `promptVersion` (ex. `flyer-offers-v1`)
* `processedAt`

Mudança de prompt → nova `promptVersion` → reprocessamento permitido.

---

# 29. Entidade FlyerExtraction

Tabela Convex: `flyerExtractions` (página).

```ts
{
  flyerId: Id<"flyers">;
  pageId: Id<"flyerPages">;
  model: string;
  promptVersion: string;
  status: "pending" | "processing" | "completed" | "failed";
  rawResponse?: string;
  offerCount?: number;
  extractionConfidence?: number;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  createdAt: number;
  updatedAt: number;
}
```

Índice de idempotência: `(pageId, model, promptVersion)`.

> **Nota:** SPEC 011 criou `flyerExtractionsPages` para DeepSeek. Esta SPEC introduz `flyerExtractions` no contrato MiMo. Na implementação, **unificar** numa tabela de extração por página (migrar/renomear `flyerExtractionsPages` ou reutilizar com `provider = mimo-v2.5`) — não duplicar dois ledgers permanentes.

---

# 30. Idempotência

Página já processada com sucesso **não** reenvia automaticamente.

Chave:

```text
flyerPageId + model + promptVersion
```

Novo prompt (`v2`) permite reprocessar.

---

# 31. Reprocessamento

Dashboard (pode ser nesta SPEC no mínimo via CLI; UI “Reprocessar página” se couber no admin existente):

* cria **nova** extraction (histórico anterior permanece);
* envia de novo ao MiMo;
* atualiza ofertas conforme `replace` da página/flyer.

---

# 32. Retry

Falha de API: até `MIMO_MAX_RETRIES` (default 3), backoff progressivo. Sem retry infinito.

---

# 33. Rate limit

`MIMO_CONCURRENCY=1` inicialmente. Aumentar depois de medir custo, latência, rate limit, estabilidade.

---

# 34. Falha de uma página

Falha **não** aborta o Flyer inteiro.

Exemplo: 15 páginas → 12 ok, 2 ok após retry, 1 failed. A página failed pode ser reprocessada.

---

# 35. Status do Flyer

Estender SPEC 010:

| Status | Significado |
|--------|-------------|
| `processing` | extração em andamento (já existe) |
| `partially_processed` | **novo** — ao menos uma página failed, outras ok |
| `processed` | todas as páginas extraídas com sucesso |

---

# 36. Batch

Uma requisição **por página**. Não enviar as 15 páginas juntas.

```text
Página 1 → MiMo
Página 2 → MiMo
…
Página 15 → MiMo
```

Facilita retry, auditoria, custo, paralelismo futuro.

---

# 37. Métricas

Registrar / expor no dashboard:

* páginas processadas;
* ofertas extraídas / pendentes / rejeitadas;
* duplicatas removidas;
* tempo de processamento;
* erros de API.

Exemplo futuro: 15 páginas → 187 ofertas → 173 válidas → 9 suspeitas → 5 rejeitadas.

---

# 38. Custo

Persistir `inputTokens` / `outputTokens` / `totalTokens` quando a API devolver.

---

# 39. Logs

Por página: `flyerId`, `pageId`, `model`, `status`, `duration`, `offerCount`, `error`.

**Não** logar API key, secrets, credenciais.

---

# 40. Integração com Convex

```text
MiMo → Extraction → Validation → Offer
```

Imagem permanece no Convex Storage.

---

# 41. Separação de responsabilidades

| Peça | Papel |
|------|--------|
| MiMo | interpreta imagem |
| Parser | JSON → estrutura |
| Validator | consistência |
| Convex | persiste |
| Dashboard | revisão humana |

---

# 42. Fora do escopo

Não implementar:

* matching entre supermercados;
* normalização avançada / produto canônico;
* recomendação, lista de compras, previsão de preço;
* categorização inteligente;
* comparação semântica.

MiMo = extração visual do encarte.

---

# 43. Script de teste

```bash
npm run mimo:test
```

Deve:

* ler `MIMO_API_KEY`;
* carregar uma imagem de teste;
* enviar a `mimo-v2.5`;
* imprimir JSON;
* validar schema;
* informar quantidade de ofertas.

---

# 44. Teste com encarte real

```bash
npm run flyers:test-extraction -- --flyer=<id> --page=3
```

Selecionar flyer, página (ou intervalo). Exemplo:

```text
Flyer: São Luiz 70382
Página: 3
Offers detected: 17
Valid: 15
Suspicious: 2
```

---

# 45. Fixture de qualidade

```text
back/scraper/fixtures/flyers/sao-luiz/
├── page-01.jpeg
├── page-02.jpeg
└── expected.json
```

Comparar saída do MiMo com o esperado (quando fixtures existirem).

---

# 46. Critérios de qualidade

| Métrica | Pergunta |
|---------|----------|
| Recall | Quantos produtos reais foram encontrados? |
| Precision | Quantos extraídos realmente existem? |
| Duplicate rate | Quantos duplicados? |
| Invalid rate | Quantos rejeitados/suspeitos? |

Objetivo inicial: **reduzir trabalho manual**, não 100% de automação.

---

# 47. Fluxo final

```text
SUPERMERCADO
     ↓
ENCARTE
     ↓
CONVEX STORAGE
     ↓
PÁGINA DO FLYER
     ↓
MiMo-V2.5
     ↓
JSON
     ↓
SCHEMA VALIDATOR
     ↓
DETERMINISTIC VALIDATOR
     ↓
  VÁLIDO / SUSPEITO  (sempre pending até humano)
     ↓
OFFER + DASHBOARD
     ↓
CONVEX
     ↓
HISTÓRICO CESTOU
```

---

# 48. Definition of Done

### MiMo

- [ ] Cliente isolado em `extraction/mimo/`
- [ ] `MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_MODEL`
- [ ] Timeout, retry, concorrência

### Extração

- [ ] Enviar imagem (URL Convex ou data URI)
- [ ] Prompt versionado `flyer-offers-v1`
- [ ] JSON estruturado + schema
- [ ] Raw response + confidence
- [ ] Página associada

### Validação

- [ ] Nome e preço obrigatórios / numéricos
- [ ] Desconto calculado no backend
- [ ] Quantidade/unidade normalizadas
- [ ] Duplicação na página

### Convex

- [ ] `flyerExtractions` (ou ledger unificado)
- [ ] `offers` pending + evidência `flyerPages`
- [ ] Idempotência `pageId + model + promptVersion`
- [ ] Status `partially_processed` no flyer

### Pipeline

- [ ] Página a página; retry individual; falha parcial
- [ ] Logs / métricas / tokens
- [ ] Fallback Tesseract se MiMo indisponível (alinhar SPEC 011)

### Testes

- [ ] `mimo:test`
- [ ] `flyers:test-extraction`
- [ ] Selfcheck: JSON inválido, preço string, duplicata `5kg`/`5 KG`

---

# 49. Resultado esperado

```text
Encarte São Luiz — 15 páginas
        ↓
MiMo-V2.5 analisa cada página
        ↓
187 produtos encontrados
        ↓
180 passam pelas regras (pending)
        ↓
7 ficam suspicious (ainda pending até humano, ou flag)
        ↓
Dashboard confere
        ↓
Aprovadas entram no histórico
        ↓
Cada oferta mantém a página original como evidência
```

---

# 50. Relação com o roadmap

```text
SPEC 010  Flyer Pipeline
       ↓
SPEC 011  DeepSeek Vision (bloqueado na API oficial — text-only)
       ↓
SPEC 012  MiMo-V2.5 Flyer Extraction   ← este documento
       ↓
SPEC 013  São Luiz Store & Flyer Discovery  → back/docs/sao-luiz-store-flyer-discovery.md
       ↓
SPEC 014  Product Normalization
       ↓
…
```
