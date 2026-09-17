# SPEC 019 — Local Qwen2.5-VL via LM Studio

**Projeto:** Cestou  
**Módulo:** Encartes / Extração de Ofertas com Visão (local)  
**Versão:** 0.1.1  
**Status:** Implementation Ready (experimento)  
**Prioridade:** Alta (branch de teste)  
**Backend (obrigatório):** PostgreSQL + Prisma via **Docker Compose**. Volume nomeado `storage-data` → `/data/storage` (**sem pasta no repo**). **Convex não existe mais.**  
**Dependências:** pipeline flyer-first; SPEC 012; Postgres Docker; storage volume  
**Branch:** `experiment/local-qwen25-vl-lm-studio`  
**Provedor alvo:** Qwen2.5-VL-7B-Instruct-8bit (MLX) no **LM Studio no Mac**  
**Worker → modelo:** `MIMO_DOCKER_BASE_URL=http://host.docker.internal:1234/v1` (compose)

> Smoke padrão: `npm run flyers:test-extraction:docker` (Node no container, arquivos no volume, LM Studio no host).

---

# 1. Objetivo

Rodar visão de encartes **local** (Qwen no LM Studio) contra o backend **já em Postgres Docker**.

O sistema deverá:

* apontar `mimoChat` para LM Studio;
* ler páginas de `flyerPages` / `STORAGE_ROOT` (mesmo path do worker Docker);
* gravar offers no **Postgres**;
* reutilizar guards + job `flyer-extraction`;
* (fase 2) locate / section-locate no teach;
* **não** depender de MiMo cloud no caminho local.

---

# 2. Motivação

* Custo zero por página após download do modelo.
* Privacidade: imagens de encarte não saem da máquina.
* Mesmo contrato OpenAI-compatible já usado pelo MiMo → integração mínima.
* Qwen2.5-VL 7B Instruct é multimodal com OCR + structured output adequado a encartes densos.

---

# 3. Escopo

### Incluído

* Config `.env` + `MIMO_DOCKER_BASE_URL` para worker.
* Smoke: `npm run flyers:test-extraction:docker` (volume nomeado, sem `back/storage/`).
* Extração via job no worker + LM Studio host.
* Docs + critérios de aceite.

### Excluído (nesta SPEC / v0.1)

* Treinar / fine-tune do Qwen.
* Remover código MiMo do repositório.
* Deploy em servidor Linux com GPU (só Mac local + LM Studio).
* Troca de nome `mimo/` → `openai-compat/` (fase cosmética posterior).
* Guaranteed JSON schema via guided decoding (avaliar se LM Studio rejeitar `response_format`).

---

# 4. Arquitetura

```text
Flyer Pages (Postgres + STORAGE_ROOT)
        ↓
sharp resize (edge ≤ FLYER_AI_MAX_IMAGE_EDGE_PX)
        ↓
data:image/...;base64  (ou HTTPS público)
        ↓
LM Studio  :1234/v1/chat/completions
  model = Qwen2.5-VL-7B-Instruct-8bit (id local)
        ↓
JSON bruto
        ↓
parseMimoOffers + offer-guards
        ↓
Offers (Prisma) + audit
```

Código reutilizado (sem fork obrigatório na fase 0–1):

```text
back/scraper/src/flyers/extraction/mimo/
├── client.ts       # já aponta para MIMO_BASE_URL
├── extractor.ts
├── prompts.ts      # flyer-offers-v4 (ajustar só se Qwen divergir)
├── schemas.ts
├── locate.ts
├── section-locate.ts
└── ...
back/scraper/src/flyers/core/flyer-config.ts
back/scraper/src/flyers/extraction/offer-extractor.ts
back/scraper/src/flyers/jobs/flyer-extraction.ts
back/scraper/src/flyers/jobs/mimo-test.ts
```

```text
front-admin / scraper
        │  fetch Bearer + OpenAI body
        ▼
LM Studio (local) ── Qwen2.5-VL-7B-Instruct-8bit (MLX 8bit)
```

---

# 5. Modelo e runtime

| Item | Valor |
|------|--------|
| Modelo | `Qwen2.5-VL-7B-Instruct-8bit` (`mlx-community`) |
| Runtime | LM Studio (MLX no Apple Silicon) |
| API | OpenAI-compatible `http://127.0.0.1:1234/v1` |
| Auth | `Authorization: Bearer lm-studio` (qualquer string; LM Studio local) |
| Concurrency | **1** (obrigatório no Mac local) |
| Alternativa mais leve | `…-7B-Instruct-4bit` se 8bit ficar lento / OOM |

> **Nota:** o id exato em `MIMO_MODEL` deve ser o que o LM Studio expõe em `/v1/models` após carregar o modelo — não hardcodar no código.

---

# 6. Configuração (`.env`)

## 6.1 Modo local (experimento)

```env
FLYER_AI_ENABLED=true
FLYER_AI_PROVIDER=mimo

MIMO_BASE_URL=http://127.0.0.1:1234/v1
MIMO_API_KEY=lm-studio
MIMO_MODEL=qwen2.5-vl-7b-instruct          # substituir pelo id real do LM Studio
MIMO_MAX_COMPLETION_TOKENS=8192
MIMO_TIMEOUT=600000
MIMO_MAX_RETRIES=2
MIMO_CONCURRENCY=1

FLYER_AI_PROMPT_VERSION=flyer-offers-v4
FLYER_AI_MAX_IMAGE_EDGE_PX=2048
```

## 6.2 Rollback para MiMo cloud

```env
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_API_KEY=sk-…
MIMO_MODEL=mimo-v2.5
MIMO_CONCURRENCY=2
MIMO_TIMEOUT=300000
```

Documentar ambos em `.env.example` com comentário `# Local LM Studio (SPEC 019)` vs `# MiMo cloud (SPEC 012)`.

---

# 7. Fases de implementação

## Fase 0 — Smoke (volume Docker + LM Studio no Mac)

Pré-requisito: `docker compose up` + flyer baixado no volume `storage-data`.

1. LM Studio no Mac: modelo 7B 8bit → Server `:1234`.
2. `.env`: `MIMO_MODEL` = id do LM Studio; `MIMO_DOCKER_BASE_URL=http://host.docker.internal:1234/v1`.
3. Smoke:

```bash
cd back
npm run flyers:test-extraction:docker -- --page=1
```

**Aceite Fase 0**

* Worker lê arquivo em `/data/storage` (volume).
* HTTP 200 LM Studio via `host.docker.internal`.
* JSON ofertas ok (≥1 com `name` + `price`).
* Sem pasta `back/storage/` no repo.

**Se falhar**

| Sintoma | Ação |
|---------|------|
| Connection refused | LM Studio server off / porta errada |
| Model not found | Copiar id exato de `/v1/models` |
| `response_format` rejeitado | Tornar `json_object` opcional via env (`MIMO_RESPONSE_FORMAT=json_object\|none`) |
| JSON com markdown | Prompt: reforçar “minified JSON only”; strip no parser (já existe path) |
| Timeout | Subir `MIMO_TIMEOUT`; reduzir edge px; ou trocar para 4bit |

## Fase 1 — Extração real

1. LM Studio up no Mac.
2. Job persiste no Postgres via worker:

```bash
cd back
# 1 flyer / 1 página (concurrency=1 no compose/script)
npm run flyers:reextract:docker -- --flyer=<uuid> --page=1
```

3. Comparar vs MiMo no mesmo flyer (`FlyerExtraction.model` + offers).
4. Ajustar prompt **só se** campos sistematicamente errados.

**Aceite Fase 1**

* Job completa sem hung.
* Ofertas persistem no Postgres (`Offer`, status via auto-normalização).
* `FlyerExtraction` com `model=qwen2.5-vl-7b-instruct` + `rawResponse`.
* Guards: raw→válidas razoável (ex.: 4/4 ou 4/8 no smoke).

**Rodado (2026-09-17):** flyer `Ativa Guará` (`f4c60ac0-…`) page 1 → 4 offers salvas; audit Qwen ok. Fix: `--force --page=N` agora faz replace da página (antes duplicava).

## Fase 2 — Teach / locate (front-admin)

Locate usa o **mesmo** `mimoChat` + `MIMO_BASE_URL` do host (session-worker no Mac → `127.0.0.1:1234`). Não passa pelo container Docker.

### Checklist admin

1. LM Studio no Mac com Qwen 7B Instruct 8bit → Server ON.
2. `.env`: `MIMO_BASE_URL=http://127.0.0.1:1234/v1`, `MIMO_MODEL=<id>`, `MIMO_API_KEY=lm-studio`.
3. Session worker (host):

```bash
cd back
npm run flows:session-worker
```

4. `front-admin` → `/admin/scraper` → flow → teach / setup.
5. Abrir Chromium na sessão → navegar até página de encartes.
6. Clicar **Detectar de novo** (UI: “IA …s”; badge mostra `MIMO_MODEL`).
7. Conferir highlight / candidatos → **Aprovar**.
8. Se `need_click`: clicar um card no preview → Detectar de novo (pass 2 / section-locate).

### Aceite Fase 2

* Detectar retorna `ready` ou `need_click` (não `not_found` em site conhecido).
* Selectors copiados do dump (não inventados).
* Aprovar grava steps no flow (Postgres).
* Log session-worker mostra modelo Qwen / HTTP 200 LM Studio.

### Se falhar

| Sintoma | Ação |
|---------|------|
| Connection refused | LM Studio off; reiniciar `flows:session-worker` após mudar `.env` |
| Timeout longo | Normal no 7B; subir `MIMO_TIMEOUT` |
| Selectors ruins | Prompt locate/section-locate; ou Selecionar área manual |
| UI ainda “MiMo” em outras telas | Cosmético; caminho HTTP já é Qwen |

## Fase 3 — Higiene (opcional, pós-validação)

* Introduzir `FLYER_AI_PROVIDER=openai-compat` (alias de mimo).
* Renomear pasta `extraction/mimo` → `extraction/openai-compat` **somente** se o experimento for adotado.
* Log `provider=qwen2.5-vl` + `runtime=lm-studio` nos metadados.
* Atualizar `back/docs/mimo-v25-flyer-extraction.md` com nota “cloud vs local”.

---

# 8. Mudanças de código previstas

### Obrigatórias só se smoke falhar

| Arquivo | Mudança |
|---------|---------|
| `mimo/client.ts` | `response_format` condicional; log de `baseUrl` (sem key) |
| `flyer-config.ts` | `mimoResponseFormat`, defaults de timeout/concurrency documentados |
| `.env.example` | Bloco SPEC 019 |
| `offer-extractor.ts` | (opcional) label `provider` quando BASE_URL for localhost |

### Preferencialmente **não** mudar na Fase 0

* `prompts.ts` / `schemas.ts` / `offer-guards.ts`
* Schema Prisma
* Front-admin (exceto se UI mostrar model string)

---

# 9. Contrato da API (inalterado)

Request (resumo):

```http
POST {MIMO_BASE_URL}/chat/completions
Authorization: Bearer {MIMO_API_KEY}
Content-Type: application/json
```

```json
{
  "model": "<id LM Studio>",
  "temperature": 0.1,
  "max_completion_tokens": 8192,
  "response_format": { "type": "json_object" },
  "messages": [
    { "role": "system", "content": "<SYSTEM_PROMPT>" },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "<userPrompt(page)>" },
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
      ]
    }
  ]
}
```

Imagem: preferir buffer local → resize `sharp` → data URI (já implementado; localhost URL pública do CDN não é necessária).

---

# 10. Operação diária (checklist)

1. Abrir LM Studio → carregar Qwen 7B Instruct 8bit.
2. Server ON (`1234`).
3. Confirmar `.env` aponta para `127.0.0.1:1234/v1`.
4. Rodar extract / `mimo:test`.
5. Se Mac dorme / LM Studio fecha → extract falha com connection error (esperado).

---

# 11. Critérios de sucesso do experimento

O experimento **passa** se:

1. Extração local funciona sem MiMo cloud.
2. Em ≥3 páginas de fixture/reais, qualidade ≥ “usável” (preços corretos na maioria dos produtos legíveis).
3. Tempo por página aceitável no hardware do time (documentar mediana; alvo soft < 120s/página no 8bit).
4. Teach locate não quebra (ou tem workaround documentado).

O experimento **falha / pivot** se:

* 8bit OOM constante → tentar 4bit.
* OCR de encarte denso sistematicamente pior que MiMo → manter MiMo cloud ou hybrid (local só smoke).
* LM Studio não aceita vision no path OpenAI → avaliar Ollama/`llama.cpp` com mesmo contrato.

---

# 12. Riscos

| Risco | Mitigação |
|-------|-----------|
| Máquina única = SPOF | Documentar; não usar local em worker remoto ainda |
| Concurrency > 1 trava Mac | Forçar default 1 no `.env` local |
| Schema JSON instável | Manter guards; retry; temp 0.1 |
| Id de modelo muda entre builds LM Studio | Sempre ler `/v1/models` |
| Confundir 4bit/8bit/bf16 | Spec fixa 8bit; 4bit só fallback |

---

# 13. Plano de teste

| # | Teste | Como |
|---|--------|------|
| T1 | Models list | `curl http://127.0.0.1:1234/v1/models` |
| T2 | Smoke Docker | `npm run flyers:test-extraction:docker -- --page=1` |
| T3 | Página densa | Encarte real no volume Docker |
| T4 | Job real | `flyers:extract` / 1 flyerId no Postgres |
| T5 | Rollback | `.env` MiMo cloud de novo |
| T6 | Locate admin | LM Studio + `flows:session-worker` + Detectar em `/admin/scraper` |

---

# 14. Decisão de adoção

Após Fase 1–2, registrar no PR / issue:

* [ ] Adotar local como default em dev
* [ ] Manter MiMo cloud como default; local só opt-in
* [ ] Hybrid: extract local, locate cloud (ou inverso)
* [ ] Abortar experimento

---

# 15. Referências

* SPEC 012 — `back/docs/mimo-v25-flyer-extraction.md`
* SPEC 011 — DeepSeek (histórico; rejeitado)
* Client: `back/scraper/src/flyers/extraction/mimo/client.ts`
* Config: `back/scraper/src/flyers/core/flyer-config.ts`
* LM Studio OpenAI-compatible local server
* Modelo: `mlx-community/Qwen2.5-VL-7B-Instruct-8bit`
