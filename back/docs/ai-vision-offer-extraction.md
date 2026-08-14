# SPEC 011 — AI Vision Offer Extraction (DeepSeek)

**Projeto:** Cestou  
**Módulo:** Encartes / Extração de Ofertas / IA  
**Versão:** 1.0.0  
**Status:** Implementation Ready  
**Prioridade:** Alta  
**Dependências:** SPEC 010 (Flyer-First Offers Pipeline), SPEC 008 (Convex Storage)  
**Substitui parcialmente:** extração Tesseract+regex da SPEC 010 como *caminho primário*  
**Provedor:** DeepSeek (`api.deepseek.com`, OpenAI-compatible)

---

# 1. Objetivo

Melhorar a acurácia da extração de ofertas a partir de páginas de encarte, usando **visão multimodal** (imagem da página → JSON estruturado de ofertas).

O sistema deverá:

* enviar cada `flyerPage` (imagem) ao modelo DeepSeek com vision;
* receber um JSON tipado de ofertas;
* persistir as ofertas no Convex com `validationStatus = pending`;
* guardar a **resposta bruta do modelo** e metadados de auditoria;
* manter **Tesseract + parser de regras** como **fallback offline**;
* **não** remover a fila de validação humana do admin.

A prioridade é **qualidade e rastreabilidade** das ofertas extraídas, não volume bruto.

---

# 2. Motivação

A SPEC 010 extrai ofertas com:

```text
Página → Tesseract OCR → texto → regex/regras → offers
```

Limitações observadas em produção (encartes Mercadapp / São Luiz):

* layout denso em colunas;
* tipografia decorativa e preços pequenos;
* páginas inteiras com OCR fraco → 0 ofertas;
* parser DE/POR + preço standalone captura só parte do encarte.

Visão por página reduz desalinhamento nome↔preço típico de OCR+regex.

---

# 3. Estratégia

### Primário (online)

```text
flyerPage (Convex Storage URL ou bytes)
        ↓
DeepSeek Vision (chat.completions + image_url)
        ↓
JSON de ofertas
        ↓
normalize + validate schema
        ↓
offers (pending) + audit trail
        ↓
Admin validation queue
```

### Fallback (offline / falha)

```text
flyerPage
   ↓
Tesseract OCR (já existente)
   ↓
offer-parser (regras)
   ↓
offers (pending) + extractionSource = "tesseract"
```

Fallback dispara quando:

* `FLYER_AI_ENABLED=false`;
* `DEEPSEEK_API_KEY` ausente;
* erro HTTP / timeout / rate limit esgotado;
* JSON inválido após N retries de reparo;
* modelo retorna lista vazia **e** política `FLYER_AI_FALLBACK_ON_EMPTY=true`.

---

# 4. Fora do escopo

Não implementar nesta SPEC:

* matching / produto canônico (SPEC 011 antiga no roadmap 010 → renumerar);
* comparação entre supermercados;
* lista de compras;
* fine-tuning próprio;
* substituição da validação humana;
* descoberta/download de encartes (permanece SPEC 010).

---

# 5. Provedor: DeepSeek

### Endpoint

| Param | Valor |
|-------|--------|
| `base_url` | `https://api.deepseek.com` |
| Auth | `Authorization: Bearer ${DEEPSEEK_API_KEY}` |
| API | OpenAI-compatible `POST /chat/completions` |

### Modelo padrão

| Uso | Model id | Nota |
|-----|----------|------|
| Default vision | `deepseek-v4-pro` | Multimodal (imagem + texto) |
| Opcional mais barato | `deepseek-v4-flash` | Só se vision estiver confirmada no ambiente; senão manter Pro |

> **Nota de implementação:** preferir `deepseek-v4-pro` para encartes. Documentação/terceiros divergem sobre vision em Flash — validar com smoke test antes de promover Flash a default.

### Entrada de imagem

Ordem de preferência:

1. **URL assinada/pública** do Convex Storage da página (`flyerPages.storageId` → `getUrl`), se DeepSeek conseguir fetch HTTPS;
2. **Data URI** `data:image/jpeg;base64,...` se URL falhar ou for inacessível (localhost).

Formatos: JPEG, PNG, WebP.

### Exemplo de request

```json
{
  "model": "deepseek-v4-pro",
  "messages": [
    {
      "role": "system",
      "content": "You extract supermarket flyer offers as strict JSON only."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "<PROMPT — ver §9>"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://...convex.cloud/.../page.jpg"
          }
        }
      ]
    }
  ],
  "temperature": 0.1,
  "response_format": { "type": "json_object" }
}
```

Se `response_format` não for honrado pelo provedor, exigir JSON no prompt e parsear com extração do primeiro bloco `{...}`.

---

# 6. Interface (desacoplamento)

Manter OCR Tesseract; adicionar extrator de ofertas por visão:

```ts
interface FlyerOfferExtractor {
  readonly name: "deepseek-vision" | "tesseract-rules";

  extractOffers(page: {
    flyerId: string;
    pageNumber: number;
    imageUrl?: string;
    imageBuffer?: Buffer;
    contentType?: string;
  }): Promise<FlyerOfferExtractionResult>;
}
```

```ts
type FlyerOfferExtractionResult = {
  offers: ParsedOffer[];
  /** Resposta textual bruta do modelo ou texto OCR */
  rawResponse: string;
  provider: "deepseek-vision" | "tesseract-rules";
  model?: string;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};
```

O job de extração escolhe o provider conforme config + health check, sem acoplar Convex ao SDK DeepSeek.

---

# 7. Schema de oferta (saída do modelo)

O modelo **deve** devolver:

```json
{
  "pageNumber": 3,
  "offers": [
    {
      "name": "Arroz Camil Tipo 1",
      "brand": "Camil",
      "quantity": "5kg",
      "unit": "kg",
      "price": 27.99,
      "originalPrice": 34.9,
      "confidence": 0.92
    }
  ]
}
```

Regras:

* `price` e `originalPrice` como **número** (nunca `"R$ 27,99"`);
* omitir oferta se preço ilegível;
* `confidence` ∈ `[0, 1]` (confiança do modelo naquele item);
* não inventar produto que não apareça na página;
* idioma dos nomes: português do Brasil, como no encarte.

Mapeamento para tabela `offers` (SPEC 010):

| Campo modelo | Campo Convex |
|--------------|--------------|
| `name` | `name` |
| `brand` | `brand` |
| `quantity` | `quantity` |
| `unit` | `unit` |
| `price` | `price` |
| `originalPrice` | `originalPrice` (+ `discountPercentage` calculado) |
| `confidence` | `extractionConfidence` |
| — | `pageNumber` (da página processada) |
| — | `sourceType = "flyer"` |
| — | `validationStatus = "pending"` |
| `rawResponse` (página) | ver auditoria §10 |

---

# 8. Validação pós-modelo (determinística)

Antes de persistir, aplicar guards locais (sem IA):

* `name` length ≥ 3;
* `0 < price < 10000`;
* se `originalPrice` presente: `originalPrice > price`;
* dedupe por `(normalizedName, price, pageNumber)` dentro da página;
* descartar itens com `confidence < FLYER_AI_MIN_CONFIDENCE` (default `0.35`) **ou** marcá-los `suspicious` automaticamente — **preferência:** manter `pending` e só filtrar `< 0.2` (lixo óbvio).

Ofertas que passam vão para a **mesma fila de validação humana** do admin.

---

# 9. Prompt (contrato)

System (resumo):

```text
Você extrai ofertas de encartes de supermercado brasileiro.
Responda APENAS com JSON válido no schema combinado.
Não invente produtos. Preços em número decimal com ponto.
```

User text (resumo):

```text
Analise a imagem desta página de encarte.
Extraia todas as ofertas visíveis com nome, preço promocional,
preço original (se houver DE/POR), quantidade/unidade e confidence.
pageNumber = {N}.
Schema: { "pageNumber": number, "offers": [ ... ] }
```

Versionar o prompt em código: `FLYER_AI_PROMPT_VERSION=1`.

---

# 10. Auditoria

Nunca perder rastreio da origem.

### Por página processada

Criar (ou estender) registro de extração — opções:

**A (preferida — tabela nova):** `flyerExtractionsPages`

```ts
{
  flyerId: Id<"flyers">;
  pageNumber: number;
  provider: "deepseek-vision" | "tesseract-rules";
  model?: string;
  promptVersion: string;
  rawResponse: string;      // resposta completa do modelo OU texto OCR
  latencyMs: number;
  offerCount: number;
  status: "ok" | "fallback" | "failed";
  error?: string;
  createdAt: number;
}
```

**B (mínima):** gravar `rawText` em cada `offer` (já existe) **e** um blob/campo agregado no flyer — insuficiente para falhas sem oferta.

Esta SPEC exige **opção A**.

### Por oferta

Continua obrigatório:

* `flyerId`, `pageNumber`, `rawText` (trecho ou serialização curta do item);
* link “Ver encarte” no admin (imagem da página).

### Admin

Na tela de validação / detalhe da oferta:

* provider + model;
* link para raw response da página (collapsible);
* evidência visual da página (já SPEC 010).

---

# 11. Fluxo do job `flyers:extract`

```text
para cada flyer (downloaded | --force processed):
  status = processing
  para cada flyerPage:
    try:
      result = DeepSeekVision.extractOffers(page)
    catch / empty+fallback:
      result = TesseractRules.extractOffers(page)
    persist flyerExtractionsPages
    accumulate offers
  insertBatch(offers, replace=force)
  status = processed
```

Idempotência:

* `--force` / `replace=true` apaga offers do flyer e regrava (já em SPEC 010 reextract);
* re-run sem force em flyer já `processed` → skip (comportamento atual).

CLI:

```bash
npm run flyers:extract
npm run flyers:reextract          # force
npm run flyers:extract -- --provider=tesseract
npm run flyers:extract -- --provider=deepseek
```

---

# 12. Configuração

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro

FLYER_AI_ENABLED=true
FLYER_AI_PROVIDER=deepseek
FLYER_AI_TIMEOUT_MS=90000
FLYER_AI_RETRIES=2
FLYER_AI_MIN_CONFIDENCE=0.2
FLYER_AI_FALLBACK_ON_EMPTY=true
FLYER_AI_PROMPT_VERSION=1
FLYER_AI_MAX_IMAGE_EDGE_PX=2048

# Fallback SPEC 010
FLYER_OCR_ENABLED=true
```

Redimensionar imagem localmente antes do upload/base64 se edge > `FLYER_AI_MAX_IMAGE_EDGE_PX` (custo/latência).

---

# 13. Estrutura de diretórios

Sob `back/scraper/src/flyers/`:

```text
extraction/
  ocr.ts                 # Tesseract (existente)
  offer-parser.ts        # regras (existente)
  deepseek-vision.ts     # NOVO — cliente + prompt + parse JSON
  offer-extractor.ts     # NOVO — orquestra deepseek → fallback tesseract
  text-normalizer.ts
```

SDK: cliente HTTP OpenAI-compatible (`openai` package apontando `baseURL` DeepSeek) **ou** `fetch` fino — preferir pouca dependência.

---

# 14. Custos e limites

* 1 request por página (encarte São Luiz ~15 páginas);
* preferir URL Convex quando possível (evita base64 +33%);
* `temperature` baixa (0–0.2);
* logar `usage.totalTokens` em `flyerExtractedPages`;
* rate limit: backoff exponencial; não marcar flyer `failed` se fallback Tesseract salvou ofertas.

---

# 15. Segurança

* `DEEPSEEK_API_KEY` só em `.env` / secrets — nunca no front;
* não logar API key;
* truncar `rawResponse` em logs de console (persistir completo no Convex);
* SSRF: só enviar URLs de storage Convex allowlisted ou base64 gerado localmente;
* não enviar dados de usuário final (só imagens de encarte público).

---

# 16. Validação humana (inalterada)

Dashboard continua com fila **Ofertas Pendentes**:

* Validar / Suspeito / Rejeitar;
* ordenação por menor `extractionConfidence`;
* evidência da página.

IA **não** auto-valida. `validationStatus` inicial sempre `pending` (exceto lixo filtrado antes do insert).

Opcional futuro (fora desta SPEC): sugerir `suspicious` se `confidence < 0.5`.

---

# 17. Observabilidade

Logs por etapa:

* `AI_VISION` — request model, page, latency, offerCount;
* `AI_FALLBACK` — motivo;
* `OCR` / `PARSER` — caminho Tesseract.

Métricas dashboard (estender SPEC 010 §61):

* Offers via DeepSeek;
* Offers via Tesseract fallback;
* AI failures;
* Avg latency / page.

---

# 18. Testes

* Unit: parse JSON do modelo (válido, markdown fence, trailing comma);
* Unit: guards de preço/nome;
* Selfcheck: fixture de JSON DeepSeek → N offers;
* Smoke (manual): 1 página real São Luiz com `DEEPSEEK_API_KEY` → offers > caminho Tesseract na mesma página;
* Offline: sem key → só Tesseract, flyer ainda `processed` se houver ofertas.

---

# 19. Definition of Done

### Integração DeepSeek

- [ ] Cliente OpenAI-compatible (`DEEPSEEK_*`)
- [ ] Vision por `flyerPage` (URL ou base64)
- [ ] Modelo default `deepseek-v4-pro`
- [ ] Prompt versionado
- [ ] Parse JSON + retries de reparo

### Fallback

- [ ] Tesseract+rules quando AI off / erro / empty+flag
- [ ] `extraction` registra provider usado

### Persistência

- [ ] Tabela `flyerExtractedPages` com `rawResponse`
- [ ] Offers com `extractionConfidence` e `pending`
- [ ] `replace` / reextract compatível

### Admin

- [ ] Fila de validação intacta
- [ ] Evidência de página intacta
- [ ] Exibir provider + raw response (página)

### Ops

- [ ] Env documentado
- [ ] CLI `--provider`
- [ ] Logs `AI_VISION` / `AI_FALLBACK`
- [ ] Selfcheck + smoke checklist

---

# 20. Relação com roadmap SPEC 010

No roadmap da SPEC 010, “SPEC 016 AI” torna-se esta entrega antecipada:

```text
SPEC 010  Flyer Pipeline (download + storage + admin)
       ↓
SPEC 011  AI Vision Offer Extraction (DeepSeek)   ← este documento
       ↓
SPEC 012  MiMo-V2.5 Flyer Extraction  → back/docs/mimo-v25-flyer-extraction.md
       ↓
SPEC 013  São Luiz Store & Flyer Discovery  → back/docs/sao-luiz-store-flyer-discovery.md
       ↓
SPEC 014  Product Normalization
       ↓
…
```

A numeração “Product Normalization” anterior (011) desloca-se para **014+**. MiMo-V2.5 é **SPEC 012**. Discovery de lojas São Luiz é **SPEC 013**.

---

# 21. Resultado esperado

```text
flyers:reextract --provider=deepseek
        ↓
15 páginas do Encarte São Luiz
        ↓
DeepSeek Vision por página
        ↓
dezenas de ofertas JSON (nome + preço corretos)
        ↓
fallback Tesseract só onde AI falhar
        ↓
offers pending no Convex
        ↓
humano valida / rejeita no admin
        ↓
auditoria: rawResponse por página
```
