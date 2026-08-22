# SPEC 015 — Cestou Scraper Flow Builder

**Projeto:** Cestou  
**Módulo:** Configuração e Gravação de Fluxos de Scraping  
**Versão:** 1.0.0  
**Status:** Implementation Ready  
**Prioridade:** Alta  
**Dependências:** SPEC 010 (Flyer-First), SPEC 013 (Store Discovery), SPEC 014 (Browser Flyer Discovery)  
**Nota de numeração:** Rascunho original usava SPEC 013; no repositório SPEC 013 já é São Luiz Store Discovery e SPEC 014 é Browser Flyer Discovery. Esta SPEC é **015**.  
**Relação:** unifica discovery por supermercado via **workflows graváveis**, em vez de scrapers hard-coded (`if sao-luiz` / `if atacadao`). São Luiz e Atacadão viram **flows** sobre o mesmo Browser + Flow Engine.

---

# 1. Objetivo

Criar no dashboard do Cestou uma interface que permita cadastrar um supermercado e ensinar manualmente ao sistema como navegar pelo site para encontrar lojas e encartes.

O usuário deverá informar uma URL, abrir o site em um navegador controlado pelo Playwright e executar o fluxo manualmente.

O sistema deverá registrar as ações relevantes e transformá-las em um workflow reproduzível.

Posteriormente, o backend poderá executar esse workflow automaticamente.

---

# 2. Problema

Cada supermercado possui uma estrutura diferente.

Exemplos:

| Rede | Fluxo típico |
|------|----------------|
| Atacadão | UF → Cidade → Loja → Encartes |
| São Luiz | Loja → Encartes |
| Outro | CEP → Loja → Ofertas |

**Não** devemos criar um scraper completamente diferente para cada supermercado.

O Cestou deverá possuir um **motor de workflows**, onde cada supermercado possui sua própria configuração.

---

# 3. Conceito

Três componentes principais:

```text
Dashboard
    │
    ▼
Flow Builder
    │
    ▼
Flow Definition
    │
    ▼
Scraper Worker
    │
    ▼
Playwright
```

* **Dashboard** → ensinar  
* **Worker** → repetir  

---

# 4. Fluxo geral

```text
Cadastrar supermercado
        ↓
Informar URL
        ↓
Abrir navegador
        ↓
Iniciar gravação
        ↓
Usuário navega pelo site
        ↓
Sistema registra ações
        ↓
Usuário identifica etapa de Flyers
        ↓
Salvar fluxo
        ↓
Validar fluxo
        ↓
Ativar
        ↓
Scheduler executa posteriormente
```

---

# 5. Stack

* Next.js  
* React  
* TypeScript  
* Convex  
* Node.js  
* Playwright  
* Docker  

O Playwright roda no **backend/worker**.

O frontend **não** executa Chromium diretamente.

---

# 6. Arquitetura

```text
┌─────────────────────┐
│      Dashboard      │
│                     │
│  Flow Builder       │
└──────────┬──────────┘
           │
           │ WebSocket / API
           ▼
┌─────────────────────┐
│  Browser Controller │
│                     │
│     Playwright      │
└──────────┬──────────┘
           │
           ▼
       Website
           │
           ▼
     Recorded Actions
           │
           ▼
        Convex
```

---

# 7. Estrutura de pastas

Alvo no monorepo Cestou:

```text
back/scraper/src/flyers/
├── browser/                 # reuso / extensão SPEC 014
│   ├── browser-manager.ts
│   ├── browser-session.ts
│   └── network-monitor.ts
│
├── recorder/
│   ├── action-recorder.ts
│   ├── action-normalizer.ts
│   └── semantic-detector.ts
│
├── runner/
│   ├── flow-runner.ts
│   ├── step-runner.ts
│   └── retry-manager.ts
│
└── types/
    ├── actions.ts
    └── flows.ts

back/convex/
├── supermarkets.ts          # já existe — estender se necessário
├── scraperFlows.ts
├── scraperSteps.ts
└── scraperRuns.ts

front-admin/src/app/admin/
└── scraper/
    ├── page.tsx
    ├── new/
    └── [id]/
```

> Nota: rascunho usava `src/scraper` + `app/dashboard/scraper`. No Cestou: scraper em `back/scraper`, UI em `front-admin/src/app/admin/scraper`.

---

# 8. Supermercados

Entidade: `supermarkets` (já existe no schema atual).

Campos alvo desta SPEC (alinhar / estender):

| Campo | Tipo |
|-------|------|
| name | string |
| slug | string |
| baseUrl / websiteUrl | string |
| status / active | draft \| active \| inactive (ou boolean + draft flag) |
| createdAt | number |
| updatedAt | number |

Exemplo:

```json
{
  "name": "Atacadão",
  "slug": "atacadao",
  "baseUrl": "https://www.atacadao.com.br",
  "status": "active"
}
```

> Compatibilidade: schema atual usa `active: boolean` e `websiteUrl`. Preferir **estender** sem quebrar o admin existente (ex.: `status` opcional ou mapear `active` ↔ `draft/active/inactive`).

---

# 9. Flow

Tabela: `scraperFlows`

| Campo | Tipo |
|-------|------|
| supermarketId | Id\<supermarkets\> |
| name | string |
| startUrl | string |
| status | draft \| testing \| active \| disabled \| error |
| version | number |
| schedule | opcional (ver §46) |
| nextRunAt | opcional number |
| config | opcional string/JSON |
| createdAt | number |
| updatedAt | number |

---

# 10. Steps

Tabela: `scraperSteps`

| Campo | Tipo |
|-------|------|
| flowId | Id\<scraperFlows\> |
| order | number |
| type | ver §11 |
| config | string (JSON) |
| createdAt | number |
| updatedAt | number |

---

# 11. Tipos de Steps

Primeira versão:

* `navigate`
* `click`
* `select`
* `input`
* `wait`
* `scroll`
* `discover-store`
* `discover-flyer`
* `capture-network`

---

# 12. Navigate

```json
{
  "type": "navigate",
  "config": {
    "url": "https://www.atacadao.com.br/institucional/nossas-lojas"
  }
}
```

---

# 13. Click

```json
{
  "type": "click",
  "config": {
    "selector": "...",
    "selectors": ["[data-testid='x']", "#x"],
    "description": "Abrir encartes"
  }
}
```

Armazenar **múltiplas** estratégias de localização quando possível.

---

# 14. Select

```json
{
  "type": "select",
  "config": {
    "selector": "...",
    "value": "{{uf}}",
    "description": "Selecionar estado"
  }
}
```

---

# 15. Input

```json
{
  "type": "input",
  "config": {
    "selector": "...",
    "value": "{{city}}",
    "description": "Informar cidade"
  }
}
```

---

# 16. Wait

Estratégias:

* `waitForSelector`
* `waitForTimeout`
* `waitForNetworkIdle`

```json
{
  "type": "wait",
  "config": {
    "strategy": "selector",
    "selector": ".stores"
  }
}
```

Evitar depender **somente** de timeout.

---

# 17. Scroll

```json
{
  "type": "scroll",
  "config": {
    "direction": "down",
    "amount": 800
  }
}
```

---

# 18. Discover Store

Step semântico:

```json
{
  "type": "discover-store",
  "config": {
    "scope": "page"
  }
}
```

Informa ao runner: *neste ponto, procure lojas*.

---

# 19. Discover Flyer

Step principal:

```json
{
  "type": "discover-flyer",
  "config": {
    "scope": "page"
  }
}
```

Procurar: flyer, encarte, catalog, catalogo, oferta, promocao, flipbook, PDF, imagens + Network (reuso heurísticas SPEC 014).

---

# 20. Capture Network

```json
{
  "type": "capture-network",
  "config": {
    "duration": 5000
  }
}
```

Durante a etapa: XHR, Fetch, JSON, Images, PDF.

---

# 21. Recorder

`ActionRecorder` observa interação do usuário.

Eventos relevantes:

* click  
* input  
* change  
* select  
* navigation  
* scroll  

---

# 22. Não registrar tudo

**Não** gravar:

* mousemove / mouseover / mouseout  
* scroll contínuo semântico-vazio  

Somente ações relevantes.

---

# 23. Normalização

`ActionNormalizer`:

| Evento | Step |
|--------|------|
| click | CLICK |
| change | SELECT |
| input | INPUT |
| navigation | NAVIGATE |

---

# 24. Seletores

Preferência:

```text
data-testid
  ↓
id
  ↓
name
  ↓
aria-label
  ↓
role
  ↓
CSS
```

Evitar seletores extremamente frágeis. XPath só como fallback.

---

# 25. Seletores múltiplos

```json
{
  "selectors": [
    "[data-testid='city']",
    "#city",
    "select[name='city']"
  ]
}
```

Runner tenta na ordem.

---

# 26. Ações semânticas

Transformar ações técnicas quando possível:

| Técnico | Semântico |
|---------|-----------|
| click(select UF) | SELECT_STATE |
| click(loja) | OPEN_STORE |
| click("Encartes") | OPEN_FLYERS |

---

# 27. UI do Flow Builder

Rota:

```text
/admin/scraper
```

Lista de supermercados / fluxos.

---

# 28. Cadastro

Tela **Novo supermercado / fluxo**:

* Nome — ex. Atacadão  
* URL — ex. `https://www.atacadao.com.br/institucional/nossas-lojas`  
* Botão **Abrir navegador**  

---

# 29. Browser Session

Ao clicar **Abrir navegador**:

1. Backend cria sessão Playwright  
2. Dashboard mostra:

```text
● Navegador conectado
URL atual: https://www.atacadao.com.br/...
[ Iniciar gravação ]
```

---

# 30. Browser Preview

Usuário visualiza a página via:

* **screenshot streaming** periódico (v1 OK), ou  
* sessão acessível pelo dashboard  

Streaming de vídeo **não** obrigatório na v1.

---

# 31. Painel lateral (gravação)

```text
┌───────────────────────────────────────┐
│ GRAVANDO                              │
├───────────────────────────────────────┤
│ 1. Navegar                            │
│ 2. Selecionar estado: CE              │
│ 3. Selecionar cidade: Fortaleza       │
│ 4. Abrir loja                         │
│ 5. Abrir encartes                     │
│                                       │
│ [+ Adicionar etapa]                   │
│ [ Parar gravação ]                    │
└───────────────────────────────────────┘
```

---

# 32. Edição

Após gravar:

```text
Fluxo Atacadão Fortaleza

1. Navigate
2. Select CE
3. Select Fortaleza
4. Discover Store
5. Open Store
6. Discover Flyer
```

Cada etapa editável (selector, value, ordem, remover).

---

# 33. Variáveis

Não salvar valores fixos quando configuráveis.

Ruim: `"Fortaleza"`  
Bom: `"{{city}}"`

```json
{
  "type": "select",
  "config": {
    "value": "{{uf}}"
  }
}
```

---

# 34. Contexto do fluxo

Na execução:

```json
{
  "uf": "CE",
  "city": "Fortaleza"
}
```

Substituição: `{{uf}}` → `CE`, `{{city}}` → `Fortaleza`.

---

# 35. Flow Template

Exemplo: **Atacadão — Location → Store → Flyer**

Reutilizável:

* CE + Fortaleza  
* CE + Caucaia  
* PE + Recife  

---

# 36. Descoberta de lojas

```text
discover-store
    ↓
Página → DOM → Network
    ↓
Store candidates
    ↓
Convex (storeCandidates / equivalente)
```

---

# 37. Descoberta de Flyers

```text
discover-flyer
    ↓
DOM → Network → JSON → Images → PDF
    ↓
Flyer candidates
```

---

# 38. Resultado do Discovery

Reusar / alinhar `flyerDiscoveries` (SPEC 013/014):

* supermarketId (quando aplicável)  
* storeId  
* externalId  
* sourceUrl  
* type  
* discoverySource  
* metadata  
* status  
* discoveredAt  
* lastSeenAt  

---

# 39. Runs

Tabela: `scraperRuns`

| Campo | Tipo |
|-------|------|
| flowId | Id\<scraperFlows\> |
| status | running \| success \| partial \| failed |
| startedAt | number |
| finishedAt | opcional |
| error | opcional string |
| stepsExecuted | number |
| flyersFound | number |
| storesFound | number |

---

# 40. Test Run

Botão **Testar fluxo** → runner executa workflow completo.

```text
✓ Navigate
✓ Select state
✓ Select city
✓ Discover stores
✓ Open store
✓ Discover flyers

Stores found: 8
Flyers found: 2
```

---

# 41. Falha no Test Run

```text
✓ Navigate
✓ Select state
✕ Select city
Selector not found
```

UI:

* Etapa N falhou  
* Motivo  
* **Editar etapa** / **Tentar novamente**  

---

# 42. Retry

```env
SCRAPER_MAX_RETRIES=3
```

Nunca loop infinito.

---

# 43. Versionamento

Todo fluxo possui `version`.

Ao salvar alteração material: `v1` → `v2` (incremento; opcional snapshot imutável de steps da versão anterior).

---

# 44. Ativação

Só `status = active` entra no scheduler.

`draft` / `testing` **não** executam automaticamente.

---

# 45. Histórico

Dashboard — últimas execuções:

```text
✓ 13/08 10:00 — 8 lojas — 3 flyers
✓ 12/08 10:00 — 8 lojas — 2 flyers
✕ 11/08 10:00 — erro na etapa 4
```

---

# 46. Scheduler

Preparar suporte (execução diária completa **não** obrigatória nesta SPEC se cron ainda não existir).

No flow:

```json
{
  "schedule": {
    "type": "daily",
    "hour": 6
  }
}
```

Campos: `schedule`, `nextRunAt`.

---

# 47. Idempotência

Reexecutar o mesmo fluxo **não** duplica:

| Entidade | Chave |
|----------|--------|
| Lojas | supermarket + externalId (ou source+storeId) |
| Flyers | supermarket + store + externalId; senão sourceUrl |

---

# 48. Segurança / lifecycle

Isolamento por sessão.

Ao finalizar:

```ts
await context.close();
await browser.close();
```

Não manter sessões abertas indefinidamente (TTL + cleanup).

---

# 49. Timeout

```env
BROWSER_TIMEOUT=30000
BROWSER_NAVIGATION_TIMEOUT=30000
SCRAPER_MAX_RETRIES=3
```

Cada step com timeout próprio (default herdado).

---

# 50. Docker

Worker:

```text
Docker
 ├── Node
 ├── TypeScript
 ├── Playwright
 └── Chromium
```

Dashboard **sem** Chromium.

---

# 51. Fluxo Atacadão — primeiro teste

```text
START
 ↓
https://www.atacadao.com.br/institucional/nossas-lojas
 ↓
Selecionar UF → CE
 ↓
Selecionar cidade → Fortaleza
 ↓
Discover Stores
 ↓
Selecionar/Acessar loja
 ↓
Discover Flyers
 ↓
Salvar candidatos
```

**Não** extrair produtos nesta SPEC.

---

# 52. Fluxo São Luiz — primeiro adapter (via flow)

```text
START
 ↓
https://mercadinhossaoluiz.com.br/loja/{{storeId}}/encartes
 ↓
Renderizar
 ↓
capture-network / discover-flyer
 ↓
Flyer Discovery
```

Migrar lógica hard-coded SPEC 013/014 para steps de flow quando estável.

---

# 53. Regras por supermercado

`config` no flow ou no supermarket:

```json
{
  "discovery": {
    "stores": true,
    "flyers": true
  },
  "requiresLocation": true,
  "requiresStoreSelection": true
}
```

---

# 54. Não criar lógica global específica

**Evitar:**

```ts
if (supermarket === "atacadao") { ... }
if (supermarket === "sao-luiz") { ... }
```

Lógica específica → workflow / config.

---

# 55. Extensibilidade

Futuro:

```text
Supermarket Adapter
        │
        ├── Atacadão
        ├── São Luiz
        ├── Pão de Açúcar
        ├── Carrefour
        └── Assaí
```

Todos usam:

* Browser Engine  
* Flow Engine  
* Discovery Engine  

---

# 56. Definition of Done

### Dashboard

- [ ] Cadastro de supermercado / URL  
- [ ] Criar fluxo  
- [ ] Iniciar sessão / abrir navegador  
- [ ] Iniciar gravação  
- [ ] Visualizar / editar / remover ações  
- [ ] Salvar fluxo  

### Browser

- [ ] Playwright + Chromium  
- [ ] Browser Manager / Session  
- [ ] Network Monitor  
- [ ] Screenshot / debug preview  

### Recorder

- [ ] Click, Input, Select, Navigation, Scroll, Wait  
- [ ] Normalização  
- [ ] Seletores múltiplos  

### Flow Engine

- [ ] navigate, click, select, input, wait, scroll  
- [ ] discover-store, discover-flyer, capture-network  

### Convex

- [ ] scraperFlows, scraperSteps, scraperRuns  
- [ ] flyerDiscoveries (reuso)  
- [ ] Idempotência + versionamento  

### Teste

- [ ] Fluxo Atacadão CE → Fortaleza  
- [ ] Encontrar lojas + flyers  
- [ ] Salvar + reexecutar sem duplicar  

---

# 57. Resultado esperado

```text
1. Cadastrar supermercado
          ↓
2. Colocar URL
          ↓
3. Abrir navegador
          ↓
4. Navegar manualmente
          ↓
5. Cestou grava o fluxo
          ↓
6. Salvar
          ↓
7. Testar
          ↓
8. Ativar
          ↓
9. Backend repete automaticamente
          ↓
10. Descobre lojas/encartes
          ↓
11. Salva no Convex
```

---

# 58. Fora de escopo

* Extração de produtos / MiMo / OCR  
* Download completo de páginas de flyer (pipeline 010)  
* Streaming de vídeo do browser  
* Scheduler diário completo (só preparar campos)  
* Adapters hard-coded por rede (§54)  
