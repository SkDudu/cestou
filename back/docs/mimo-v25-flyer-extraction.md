# SPEC 012 — MiMo-V2.5 Flyer Extraction

**Projeto:** Cestou  
**Módulo:** Encartes / Extração de Ofertas com Visão  
**Versão:** 1.1.0  
**Status:** Implemented (runtime sync)  
**Prioridade:** Alta  
**Dependências:** SPEC 010 (Flyer-First Offers Pipeline); storage via Postgres/Prisma + `STORAGE_ROOT` (Convex removido)  
**Provedor:** Xiaomi MiMo-V2.5 Pay-as-you-go (`https://api.xiaomimimo.com/v1`, OpenAI-compatible)  
**Nota de numeração:** Rascunho original usava SPEC 010; no repositório SPEC 010 já é Flyer-First e SPEC 011 é DeepSeek Vision. Esta SPEC é **012**.  
**Relação com SPEC 011:** DeepSeek (`image_url` no `chat/completions`) foi rejeitado pela API oficial (`unknown variant image_url, expected text`). MiMo-V2.5 passa a ser o **provedor primário de visão**.  
**Changelog 1.1.0 (2026-09):** Sync com runtime (`client` via `fetch`, prompt `flyer-offers-v4`, tokens 8192, storage local/Postgres) e docs oficiais Xiaomi (First API Call, Rate Limit, Pay-as-you-go). Resize cross-platform via `sharp`.

---

# 1. Objetivo

Usar o **MiMo-V2.5** (Xiaomi) no pipeline de encartes do Cestou para extração visual de produtos e ofertas diretamente das páginas dos encartes.

O MiMo interpreta as imagens e devolve dados estruturados.

O sistema deverá:

* enviar páginas do encarte para o MiMo;
* identificar produtos, preços, marcas, quantidades, unidades, preços anteriores, descontos, parcelamento, elegibilidade e condições;
* retornar JSON estruturado;
* validar a resposta (schema + regras determinísticas);
* detectar duplicações;
* salvar os dados no **Postgres (Prisma)**;
* manter a imagem original em disco sob `STORAGE_ROOT` como evidência.

---

# 2. Arquitetura

```text
Flyer
   ↓
Flyer Pages (Postgres flyerPages.filePath)
   ↓
Imagem local (STORAGE_ROOT) → data URI / base64
   ↓
MiMo-V2.5 (POST /chat/completions)
   ↓
JSON
   ↓
Schema Validation + offer-guards
   ↓
Deterministic Validation
   ↓
Offers (Prisma)
   ↓
Dashboard (front-admin)
```

Código isolado:

```text
back/scraper/src/flyers/extraction/mimo/
├── client.ts      # fetch raw → /chat/completions
├── extractor.ts   # resize (sharp, all platforms), retries, imageUrlForApi
├── prompts.ts     # flyer-offers-v4
├── schemas.ts     # parse + guardOffers
├── types.ts
├── errors.ts
├── locate.ts / section-locate.ts
└── index.ts
```

Config central: `back/scraper/src/flyers/core/flyer-config.ts`.  
Orquestração: `offer-extractor.ts` → job `flyer-extraction.ts`.

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

# 4. API (Xiaomi oficial)

Fontes oficiais:

* [First API Call](https://mimo.mi.com/docs/en-US/quick-start/summary/first-api-call)
* [Rate Limit](https://mimo.mi.com/docs/en-US/api/guidance/rate-limit)
* [Pay-as-you-go pricing](https://mimo.mi.com/docs/en-US/price/pay-as-you-go)

## 4.1 Modos de acesso

| Modo | API Key | BASE_URL (OpenAI-compatible) | Uso no Cestou |
|------|---------|------------------------------|---------------|
| **Pay-as-you-go** (default) | `sk-…` | `https://api.xiaomimimo.com/v1` | **Atual** |
| Token Plan (alternativa) | `tp-…` | `https://token-plan-cn.xiaomimimo.com/v1` | Não é o default do projeto |

Há também endpoints Anthropic-compatible; o scraper usa **somente** o path OpenAI `chat/completions`.

## 4.2 Auth (path OpenAI-compatible)

O projeto envia:

```http
Authorization: Bearer ${MIMO_API_KEY}
Content-Type: application/json
```

> **Nota:** alguns exemplos curl oficiais usam o header `api-key`. Para o cliente OpenAI-compatible / `fetch` deste repo, usar **`Authorization: Bearer`**.

## 4.3 Modelos

| Model ID | Papel |
|----------|--------|
| `mimo-v2.5` | **Default** do projeto (`MIMO_MODEL`) |
| `mimo-v2.5-pro` | Exemplo frequente na docs Xiaomi; mais caro |

## 4.4 Rate limits (text generation)

Por conta, por modelo ([Rate Limit](https://mimo.mi.com/docs/en-US/api/guidance/rate-limit)):

| Model | RPM | TPM |
|-------|-----|-----|
| `mimo-v2.5` | 100 | 10M |
| `mimo-v2.5-pro` | 100 | 10M |

Em carga alta a API pode responder `429`; o cliente trata 429/5xx como retryable.

## 4.5 Pricing (alto nível)

Billing pay-as-you-go por tokens (CN ¥ / M tokens; overseas $ / M tokens), com cache hit/miss. Valores mudam — consultar sempre a [página oficial](https://mimo.mi.com/docs/en-US/price/pay-as-you-go).

Resumo relativo (não inventar além da tabela oficial):

* `mimo-v2.5` ≪ `mimo-v2.5-pro` em custo de input/output.
* Cache hit é bem mais barato que cache miss.

## 4.6 Request shape (runtime)

`POST ${MIMO_BASE_URL}/chat/completions` com body:

| Campo | Valor no Cestou |
|-------|-----------------|
| `model` | `flyerConfig.mimoModel` (default `mimo-v2.5`) |
| `temperature` | `0.1` |
| `max_completion_tokens` | `MIMO_MAX_COMPLETION_TOKENS` (default **8192**) |
| `response_format` | `{ type: "json_object" }` |
| `messages` | system + user multimodal |

User content (array):

```json
[
  { "type": "text", "text": "<userPrompt(pageNumber)>" },
  { "type": "image_url", "image_url": { "url": "<https público ou data:…;base64,…>" } }
]
```

---

# 5. Configuração

```env
# MiMo — Pay-as-you-go (sk-… + api.xiaomimimo.com). Token Plan: tp-… + token-plan-cn…
MIMO_API_KEY=
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_MODEL=mimo-v2.5

MIMO_MAX_COMPLETION_TOKENS=8192
MIMO_TIMEOUT=120000
MIMO_MAX_RETRIES=3
MIMO_CONCURRENCY=1

FLYER_AI_ENABLED=true
FLYER_AI_PROVIDER=mimo
FLYER_AI_PROMPT_VERSION=flyer-offers-v4
FLYER_AI_MAX_IMAGE_EDGE_PX=2048

STORAGE_ROOT=/data/storage
```

Defaults espelhados em `flyer-config.ts` e `back/.env.example`. Modelo, timeouts e tokens **não** ficam hardcoded fora dessa config.

---

# 6. Cliente MiMo

Cliente isolado sob o scraper. O restante do projeto **não** chama SDKs de LLM diretamente.

Implementação atual: **`fetch` raw** em `client.ts` (não `new OpenAI({…})`).

```ts
await fetch(`${flyerConfig.mimoBaseUrl}/chat/completions`, {
  method: "POST",
  signal,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${flyerConfig.mimoApiKey}`,
  },
  body: JSON.stringify({
    model: flyerConfig.mimoModel,
    temperature: 0.1,
    max_completion_tokens: flyerConfig.mimoMaxCompletionTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: [/* text + image_url */] },
    ],
  }),
});
```

---

# 7. Input / imagem

O MiMo recebe:

* imagem da página;
* instrução de extração (`SYSTEM_PROMPT` + `userPrompt(pageNumber)`).

### Preferência de imagem (runtime)

1. Se `page.imageUrl` for **HTTPS público** (não localhost) → envia essa URL.
2. Caso contrário (caso típico pós-download): lê o buffer local de `flyerPages.filePath` sob `STORAGE_ROOT` e envia como **data URI base64** via `imageUrlForApi`.

As páginas **não** são URLs públicas HTTPS após o download — daí o caminho data URI ser o default operacional.

### Resize

`maybeResize` em `extractor.ts` usa **`sharp`** (todas as plataformas, incl. Docker Linux) e limita a aresta a `FLYER_AI_MAX_IMAGE_EDGE_PX` (default **2048**). Se já cabe no edge e for JPEG/PNG, reenvia o buffer; senão reencode JPEG qualidade 85. Falha no resize → envia original.

---

# 8. Prompt

Arquivo: `prompts.ts`.

* `promptVersion` / constante: **`flyer-offers-v4`**
* Env: `FLYER_AI_PROMPT_VERSION=flyer-offers-v4` (alinhar com a constante ao reprocessar)

Solicitar: todos os produtos; nome; marca; quantidade; unidade; preço; preço à vista / parcelado; elegibilidade; condições; evidência; validade do encarte.

Resposta: **JSON exclusivamente** (também forçado via `response_format: json_object`).

---

# 9. Prompt base (v4 — resumo)

System (conceitos-chave):

* Extrair **toda** oferta distinta visível.
* Preço condicionado (clube, cartão loja, CPF, app, cupom, pagamento, quantidade) **não** é preço universal.
* Parcelamento ≠ elegibilidade.
* Não inventar condições; citar `evidence.text` quando elegibilidade ≠ `ALL_CUSTOMERS`.
* JSON minificado, sem markdown.

User fields por oferta:

* `name`, `brand`, `quantity`, `unit`
* `price` (à vista quando ambos existem; nunca só a parcela)
* `originalPrice`, `cashPrice`
* `installmentCount`, `installmentAmount`, `installmentInterestFree`
* `discount`, `pageNumber`
* `eligibility`, `conditions[]`, `evidence`, `confidence` (por oferta)
* Página: `validFrom`, `validUntil` (validade do encarte se impressa)

Versionar: `PROMPT_VERSION = "flyer-offers-v4"`.

---

# 10. Response (exemplo v4)

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
      "cashPrice": 27.99,
      "installmentCount": null,
      "installmentAmount": null,
      "installmentInterestFree": null,
      "discount": 19.8,
      "pageNumber": 3,
      "eligibility": "ALL_CUSTOMERS",
      "conditions": [],
      "evidence": null,
      "confidence": 0.9
    }
  ],
  "validFrom": "13/08/2026",
  "validUntil": "20/08/2026",
  "confidence": 0.94
}
```

Exemplo com condição + parcelamento:

```json
{
  "name": "TV 55\"",
  "price": 2999.0,
  "cashPrice": 2799.0,
  "installmentCount": 10,
  "installmentAmount": 299.9,
  "installmentInterestFree": true,
  "eligibility": "STORE_CARD",
  "conditions": [
    { "type": "STORE_CARD", "name": "Cartão da loja", "description": null }
  ],
  "evidence": { "text": "preço exclusivo cartão loja", "page": 3 },
  "confidence": 0.85
}
```

---

# 11. JSON Schema (contrato do modelo)

```text
offers[]
 ├── name                    (string, required)
 ├── brand                   (string|null)
 ├── quantity                (string|null)
 ├── unit                    (string|null)
 ├── price                   (number, required)
 ├── originalPrice           (number|null)
 ├── cashPrice               (number|null)
 ├── installmentCount        (number|null)
 ├── installmentAmount       (number|null)
 ├── installmentInterestFree (boolean|null)
 ├── discount                (number|null)
 ├── pageNumber              (number)
 ├── eligibility             (enum string)
 ├── conditions[]            ({ type, name, description })
 ├── evidence                ({ text, page }|null)
 └── confidence              (number 0–1)
validFrom                   (string|null)
validUntil                  (string|null)
confidence                  (number, page-level)
```

`eligibility` esperado:

`ALL_CUSTOMERS` | `LOYALTY_PROGRAM` | `STORE_CARD` | `CPF_REQUIRED` | `APP_ONLY` | `COUPON_REQUIRED` | `PAYMENT_METHOD` | `QUANTITY_REQUIRED` | `UNKNOWN`

Parser: `parseMimoOffers` → `guardOffers` / `resolveEligibility` (backend pode normalizar e recalcular).

---

# 12. Campos obrigatórios

**Obrigatórios (persistência):** `name`, `price`

**Opcionais:** `brand`, `quantity`, `unit`, `originalPrice`, `cashPrice`, campos de installment, `discount`, `pageNumber`, `eligibility`, `conditions`, `evidence`, `confidence`, `validFrom`/`validUntil` (página)

Campo não identificado → `null`

Nunca: `"unknown"`, `"não identificado"`, `"N/A"` (exceto enum `eligibility=UNKNOWN` quando o selo existe mas o tipo é incerto)

---

# 13. Validação da resposta

Antes de usar:

* JSON válido;
* `offers` é array;
* `name` não vazio;
* `price` é número e `price > 0`;
* `originalPrice`, quando presente, é número e `originalPrice >= price` (regras em guards);
* `discount` ∈ `[0, 100]` quando presente (modelo; backend recalcula %);
* `pageNumber` válido (inteiro ≥ 1, alinhado à página enviada);
* elegibilidade / evidence coerentes quando ≠ `ALL_CUSTOMERS`.

---

# 14. Sanitização

**Nome:** remover espaços duplicados, quebras de linha, caracteres estranhos.

**Marca:** `CAMIL` / `camil` / `Camil` → `Camil` (title case simples).

**Unidade:** `KG` / `Kg` / `kg` → `kg`.

---

# 15. Preços e parcelamento

Esperado:

```json
{ "price": 27.99 }
```

Nunca `"R$ 27,99"` como valor final. Se o modelo devolver string, o parser tenta normalizar (BR `1.234,56` / `27,99`).

Regras de prompt (resumo):

* `"R$ X à vista ou Nx de R$ Y"` → `cashPrice=X`, `price=X`, `installmentCount=N`, `installmentAmount=Y` (uma oferta).
* Só `"Nx de R$ Y"` → `cashPrice=null`, `price=N*Y` (total para comparar), não colocar `Y` em `price`.

---

# 16. Desconto

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

# 17. Cálculo determinístico

O backend é a autoridade do desconto:

```ts
discountPercentage = round(((originalPrice - price) / originalPrice) * 100, 2)
```

Mapear para `offers.discountPercentage` (SPEC 010 / Prisma `Offer`).

---

# 18. Não confiar cegamente no modelo

MiMo extrai; não garante integridade.

Exemplo: `price = 2.799` (possível OCR/decimal errado). O backend deve flagar inconsistência (limites razoáveis, p.ex. `0 < price < 10000`) e marcar `suspicious` ou descartar.

---

# 19. Confidence

A resposta pode incluir:

* `confidence` no nível da página → `extractionConfidence` / `pageConfidence`;
* `confidence` por oferta (especialmente elegibilidade) → `eligibilityConfidence` / `extractionConfidence` na offer.

**Separar** de `validationStatus`. Confidence **não** valida comercialmente.

---

# 20. Status

Continua SPEC 010 / Prisma:

`pending` | `validated` | `suspicious` | `rejected` (`OfferValidationStatus`)

Oferta recém-extraída = **`pending`**, mesmo com confidence alta.

---

# 21. Validação determinística

```text
MiMo → JSON → Schema → Rules (offer-guards)
```

**Nome:** obrigatório; mínimo de caracteres (≥ 3); não só dígitos.

**Preço:** obrigatório; `> 0`; limites razoáveis.

**Quantidade:** se presente, valor + unidade válida (`kg`, `g`, `l`, `ml`, `un`, …).

---

# 22. Detecção de duplicidade

Na **mesma página**, não gerar duas ofertas para o mesmo produto:

```text
Arroz Camil 5kg
Arroz Camil 5 KG
```

---

# 23. Deduplicação

Chave determinística:

```text
normalizedName + brand + quantity + unit + price
```

Matching semântico fica fora desta SPEC.

---

# 24. Evidência

Toda oferta liga a:

* `flyerId`
* `pageNumber` (e `flyerPages` / `pageId`)
* imagem original em `STORAGE_ROOT` (`flyerPages.filePath`)

O dashboard abre a página do encarte a partir do path/storage local (API serve o arquivo).

---

# 25. Raw Response

Salvar a resposta original do MiMo para auditoria (`rawResponse` em `FlyerExtraction`).

Permite debug, evolução de prompt, reprocessar.

---

# 26. Prompt Version

Cada processamento registra:

* `model` (ex. `mimo-v2.5`)
* `promptVersion` (ex. `flyer-offers-v4`)
* `processedAt` / timestamps Prisma

Mudança de prompt → nova `promptVersion` → reprocessamento permitido.

---

# 27. Entidade FlyerExtraction

Tabela Prisma: `FlyerExtraction` (por página).

```ts
{
  id: string; // uuid
  flyerId: string;
  pageId: string;
  pageNumber: number;
  provider: string;          // ex. mimo-v2.5
  model: string;
  promptVersion: string;
  status: ExtractionStatus;  // pending | processing | completed | failed
  rawResponse?: string;
  offerCount?: number;
  extractionConfidence?: number;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

Índice de idempotência: `(pageId, model, promptVersion)`.

> Convex / `Id<"flyers">` **não** se aplica mais. Persistência via `flyer-storage.ts` + Prisma.

---

# 28. Idempotência

Página já processada com sucesso **não** reenvia automaticamente.

Chave:

```text
flyerPageId + model + promptVersion
```

Novo prompt (`v5`, etc.) permite reprocessar.

---

# 29. Reprocessamento

Dashboard / CLI:

* cria **nova** extraction (histórico anterior permanece);
* envia de novo ao MiMo;
* atualiza ofertas conforme `replace` da página/flyer.

---

# 30. Retry

Falha de API: até `MIMO_MAX_RETRIES` (default 3), backoff `500 * 2^(i-1)` ms.  
Retryable: HTTP `429` e `>= 500` (`MimoError.retryable`). Sem retry infinito.

Timeout por tentativa: `AbortController` + `MIMO_TIMEOUT` (default **120000** ms).

---

# 31. Rate limit e concorrência

* Limite oficial: **100 RPM / 10M TPM** para `mimo-v2.5` e `mimo-v2.5-pro`.
* Runtime: `MIMO_CONCURRENCY=1` por default — conservador; o rate limit permite mais; **subir com cuidado** (custo, latência, estabilidade, payload base64).

---

# 32. Falha de página / política do flyer

**Runtime atual (job `flyer-extraction.ts`):** se **qualquer** página falhar na análise (`failedCount > 0`), o job chama `discardFailedFlyer(flyerId)` e **remove/descarta o encarte** (não marca apenas `partially_processed` nesse caminho).

`partially_processed` ainda existe para o caso de páginas **skipped** (já extraídas / filtro), não para falha dura de AI.

Catch de erro no nível do flyer também chama `discardFailedFlyer`.

> Isso diverge do rascunho 1.0.0 (“falha de uma página não aborta o flyer”). Documentar o comportamento real; mudar a política exige mudança de código (fora do escopo desta revisão de SPEC).

---

# 33. Status do Flyer

| Status | Significado |
|--------|-------------|
| `processing` | extração em andamento |
| `partially_processed` | páginas skipped / processamento parcial sem falha dura |
| `processed` | fluxo ok (sem falhas de página no batch atual) |

Falha dura de página → descarte (ver §32), não status intermediário de “falhou mas ficou”.

---

# 34. Batch

Uma requisição **por página**. Não enviar as N páginas juntas.

```text
Página 1 → MiMo
Página 2 → MiMo
…
```

Facilita retry, auditoria, custo, paralelismo futuro (`MIMO_CONCURRENCY`).

---

# 35. Métricas

Registrar / expor:

* páginas processadas;
* ofertas extraídas / pendentes / rejeitadas;
* duplicatas removidas;
* tempo de processamento (`durationMs` / `latencyMs`);
* erros de API;
* tokens (`inputTokens` / `outputTokens` / `totalTokens`).

**Caveat de latência:** em `offer-extractor.ts`, o caminho de falha (catch / MiMo unavailable) devolve `latencyMs: 0` — não usar esse valor para métricas de tempo em falhas.

---

# 36. Custo

Persistir tokens quando a API devolver `usage`.

`MIMO_MAX_COMPLETION_TOKENS=8192` (vs 4096 antigo) aumenta teto de saída → potencial **maior latência/custo** em páginas densas; manter alinhado ao prompt v4 (JSON mais rico).

Resize via `sharp` limita aresta a `FLYER_AI_MAX_IMAGE_EDGE_PX` — ver §7.

---

# 37. Logs

Por página: `flyerId`, `pageId`/`pageNumber`, `model`, `status`, `duration`, `offerCount`, `error`.

**Não** logar API key, secrets, credenciais, nem data URIs completos.

---

# 38. Integração com storage / Postgres

```text
MiMo → Extraction (FlyerExtraction) → Validation → Offer (Prisma)
```

Imagem permanece em disco (`STORAGE_ROOT` + `flyerPages.filePath`).

---

# 39. Separação de responsabilidades

| Peça | Papel |
|------|--------|
| MiMo | interpreta imagem |
| Parser / schemas | JSON → estrutura |
| offer-guards | consistência / eligibility |
| Prisma / flyer-storage | persiste |
| Dashboard | revisão humana |

---

# 40. Fora do escopo

Não implementar nesta SPEC:

* matching entre supermercados;
* normalização avançada / produto canônico (SPEC 014+);
* recomendação, lista de compras, previsão de preço;
* categorização inteligente;
* comparação semântica.

MiMo = extração visual do encarte.

---

# 41. Script de teste

Stack atual: **Postgres + Prisma + `STORAGE_ROOT`** (Docker Compose). Sem Convex.

```bash
cd back
# cwd efetivo do script = scraper/
npm run mimo:test -- --image=fixtures/flyers/sao-luiz/page-01.jpeg
```

Deve:

* ler `MIMO_API_KEY` / `MIMO_BASE_URL` (cloud ou LM Studio);
* carregar uma imagem de teste;
* enviar ao modelo configurado;
* imprimir JSON;
* validar schema;
* informar quantidade de ofertas.

---

# 42. Teste com encarte real

Página já baixada: path relativo em `flyerPages.filePath` sob `STORAGE_ROOT` (`/data/storage` no Compose).

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

# 43. Fixture de qualidade

```text
back/scraper/fixtures/flyers/sao-luiz/
├── page-01.jpeg   # opcional, não versionado
├── page-02.jpeg
└── expected.json
```

Comparar saída do modelo com o esperado (quando fixtures existirem). Preferir `flyers:test-extraction` com encartes do volume Docker.

---

# 44. Critérios de qualidade

| Métrica | Pergunta |
|---------|----------|
| Recall | Quantos produtos reais foram encontrados? |
| Precision | Quantos extraídos realmente existem? |
| Duplicate rate | Quantos duplicados? |
| Invalid rate | Quantos rejeitados/suspeitos? |
| Eligibility accuracy | Condições/clubes corretos vs inventados? |

Objetivo inicial: **reduzir trabalho manual**, não 100% de automação.

---

# 45. Fluxo final

```text
SUPERMERCADO
     ↓
ENCARTE
     ↓
DOWNLOAD → STORAGE_ROOT / flyerPages.filePath
     ↓
PÁGINA DO FLYER (buffer → data URI)
     ↓
MiMo-V2.5
     ↓
JSON (flyer-offers-v4)
     ↓
SCHEMA + GUARDS
     ↓
  VÁLIDO / SUSPEITO  (sempre pending até humano)
     ↓
OFFER (Postgres) + DASHBOARD
     ↓
HISTÓRICO CESTOU
```

---

# 46. Performance / caveats operacionais

1. **Resize:** `sharp` em todas as plataformas até `FLYER_AI_MAX_IMAGE_EDGE_PX` (default 2048). Rebuild do worker Docker necessário após adicionar `sharp`.
2. **`MIMO_CONCURRENCY=1`:** rate limit permite mais (100 RPM); aumentar gradualmente.
3. **`max_completion_tokens=8192`:** mais headroom para v4, mais latência/custo vs 4096.
4. **Timeout:** `MIMO_TIMEOUT=120000`; em falha, `offer-extractor` zera `latencyMs`.
5. **Política discard:** qualquer página failed pode `discardFailedFlyer` — ver §32.

---

# 47. Definition of Done

### MiMo

- [x] Cliente isolado em `extraction/mimo/` (`fetch`, Bearer)
- [x] `MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_MODEL`
- [x] Timeout, retry, concorrência
- [x] Resize cross-platform via `sharp`

### Extração

- [x] Enviar imagem (HTTPS público **ou** data URI a partir de `filePath`)
- [x] Prompt versionado `flyer-offers-v4`
- [x] JSON estruturado + schema/guards (eligibility, installments, validFrom/Until)
- [x] Raw response + confidence
- [x] Página associada

### Validação

- [x] Nome e preço obrigatórios / numéricos
- [x] Desconto calculado no backend
- [x] Quantidade/unidade normalizadas
- [x] Duplicação / guards na página
- [x] Eligibility + evidence

### Persistência

- [x] `FlyerExtraction` (Prisma)
- [x] `Offer` pending + evidência `flyerPages.filePath`
- [x] Idempotência `pageId + model + promptVersion`
- [ ] Política “falha parcial sem discard” (opcional; hoje discard) — **aberto se desejado**

### Pipeline

- [x] Página a página; retry individual
- [x] Logs / métricas / tokens
- [ ] Fallback Tesseract se MiMo indisponível (alinhar SPEC 011; hoje falha se MiMo off)

### Testes

- [x] `mimo:test`
- [x] `flyers:test-extraction`
- [ ] Selfcheck contínuo: JSON inválido, preço string, duplicata `5kg`/`5 KG`

---

# 48. Resultado esperado

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
Cada oferta mantém a página original (filePath) como evidência
```

---

# 49. Relação com o roadmap

```text
SPEC 010  Flyer Pipeline
       ↓
SPEC 011  DeepSeek Vision (bloqueado na API oficial — text-only)
       ↓
SPEC 012  MiMo-V2.5 Flyer Extraction   ← este documento (v1.1.0)
       ↓
SPEC 013  São Luiz Store & Flyer Discovery  → back/docs/sao-luiz-store-flyer-discovery.md
       ↓
SPEC 014  Product Normalization
       ↓
…
```

---

# 50. Referências Xiaomi

* First API Call: https://mimo.mi.com/docs/en-US/quick-start/summary/first-api-call  
* Rate Limit: https://mimo.mi.com/docs/en-US/api/guidance/rate-limit  
* Pay-as-you-go: https://mimo.mi.com/docs/en-US/price/pay-as-you-go  

---

# 51. Gaps conhecidos (código vs desejado)

| Gap | Estado |
|-----|--------|
| Resize cross-platform (`sharp`) | **Feito** |
| `latencyMs = 0` em falhas no `offer-extractor` | Documentado; corrigir se métricas precisarem |
| Página failed → `discardFailedFlyer` | Política atual; SPEC 1.0.0 previa keep + reprocess |
| Fallback OCR offline | Não é o path default quando MiMo está configurado |

Nenhuma outra mudança de runtime nesta revisão além do resize `sharp` (pós-1.1.0 doc sync).
