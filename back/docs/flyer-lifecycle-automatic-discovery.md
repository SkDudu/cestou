# SPEC 018 — Flyer Lifecycle & Automatic Discovery

**Projeto:** Cestou  
**Módulo:** Ciclo de vida do encarte / discovery agendado  
**Versão:** 1.0.0  
**Status:** Implementation Ready  
**Prioridade:** Alta  
**Dependências:** SPEC 010 (Flyer-First), SPEC 015 (Flow Builder), SPEC 016 (Browser Session), SPEC 017 (Visual Scope)  
**Relação:** a 010 pediu expire + buscar próximo encarte. O cron só marca `expired`. Todo `discover-flyer` ainda puxa download + MiMo. Esta SPEC fecha o gap: o banco vira o estado; o scraper só corre quando há motivo.

---

# 1. Objetivo

O Cestou não deve baixar nem analisar encartes o tempo todo.

Enquanto um flyer estiver vigente, o sistema **espera**. Quando a validade se aproxima ou acaba, **aí** consulta o supermercado. Só flyer **novo** entra no pipeline de download e extração.

O sistema deverá:

* controlar validade dos flyers (instante, não só data);
* marcar expirados;
* iniciar discovery quando o encarte atual está perto do fim ou já expirou;
* comparar metadados com o banco **antes** de baixar;
* baixar somente flyers novos;
* analisar somente depois do download (e só ofertas vigentes / janela 24h);
* cadastrar produtos/ofertas encontrados;
* manter histórico (nunca apagar flyer antigo);
* registrar execuções e falhas sem loop infinito.

---

# 2. Princípio

Não analisar o site constantemente.

```text
Flyer: 13/08 → 20/08 23:59 America/Fortaleza
Hoje:  17/08
STATUS efetivo = vigente (processed + now ∈ [validFrom, validUntil])

Não procurar outro flyer.
```

No fim da validade:

```text
processed → expired
flow.nextRunAt = now
worker roda discovery-only
```

---

# 3. Fluxo

```text
Flyer cadastrado
      │
      ▼
aguarda validade
      │
      ├── ainda vigente → não faz nada
      │
      └── perto do fim (24h) ou terminou
            │
            ▼
      marca expired se validUntil < now
            │
            ▼
      agenda discovery (nextRunAt)
            │
            ▼
      worker: Playwright discovery-only
            │
            ├── nenhum flyer novo → backoff, espera
            │
            └── flyer novo
                    │
                    ▼
              status = discovered
                    │
                    ▼
              baixa documento
                    │
                    ▼
              Convex Storage
                    │
                    ▼
              analisa páginas (MiMo) se vigente ou na janela
                    │
                    ▼
              extrai ofertas
                    │
                    ▼
              status = processed
```

---

# 4. O que já existe (não reinventar)

| Peça | Onde |
|------|------|
| Status do flyer | `discovered`, `downloading`, `downloaded`, `processing`, `partially_processed`, `processed`, `expired`, `failed` |
| Cron 1h | `back/convex/crons.ts` → `flyersInternal.markExpiredInternal` |
| Janela 24h | `FLYER_DISCOVERY_BEFORE_EXPIRATION_HOURS` + `flyers.listNearExpiration` |
| Dedupe URL | `flyers.createDiscovered` por `supermarketId` + `originalUrl` |
| Dedupe arquivo | `fileHash` + `flyers.attachFile` |
| Storage | Convex `_storage` (`storageId`, `fileType`, `fileSize`, `fileHash`) |
| Discovery | step `discover-flyer` (`flow-pipeline.ts`) |
| Download / extract | `listPendingDownload` / `listPendingExtract` + jobs Node |
| Job log | `scraperRuns` |
| Erros | `flyerErrors` (stage `DISCOVERY` já existe) |
| TZ do browser | `timezoneId: "America/Fortaleza"` |
| Schedule morto | `scraperFlows.schedule` / `nextRunAt` — campos existem, ninguém dispara |

### Gap real

1. Rede já traz `validity.initial` / `final`. `persistDiscovered` **não grava**. Sem `validUntil`, expire é no-op.
2. `execute-flow.ts` (e o session-manager) **anexam** `download-flyers` + `extract-offers` em todo flow com `discover-flyer`. Rodar discovery = MiMo de novo.
3. Nenhum worker consulta `nextRunAt`. Discovery é manual (`flows:run` / dashboard).

---

# 5. Status do flyer — não renomear

Manter os literais atuais (lowercase). Não criar `ACTIVE` / `ANALYZING` / `ANALYZED` / `CURRENT` / `UPCOMING`.

| Status persistido | Significado |
|-------------------|-------------|
| `discovered` | Encontrado no site, ainda sem arquivo |
| `downloading` | Download em andamento |
| `downloaded` | Arquivo no Convex Storage |
| `processing` | Extração em andamento |
| `partially_processed` | Parte das páginas extraída |
| `processed` | Ofertas extraídas |
| `expired` | `validUntil < now` |
| `failed` | Erro ou duplicata de hash |

### Status efetivo (derivado, não gravar)

```text
vigente   = processed (ou downloaded em análise) AND now ∈ [validFrom, validUntil]
upcoming  = validFrom > now
expirado  = status === "expired" OR validUntil < now
```

Dashboard e queries usam o derivado. Não nova coluna.

Fluxo normal:

```text
discovered → downloading → downloaded → processing → processed → expired
```

---

# 6. Status do supermercado / flow — não duplicar

Não criar `MONITORING` / `PAUSED` em `supermarkets`.

| Já existe | Uso |
|-----------|-----|
| `supermarkets.active` | mercado ligado/desligado |
| `scraperFlows.status` | `draft` / `testing` / `active` / `disabled` / `error` |

Só `scraperFlows.status === "active"` entra no scheduler automático. `draft` / `testing` continuam manuais (dashboard).

`error` = discovery falhou de forma terminal (ex.: `SCOPE_NOT_FOUND` após retries). Operador reconfigura o flow.

---

# 7. Arquitetura: Convex orquestra, worker executa

Playwright **não** roda em Convex Action. Convex cloud não alcança `127.0.0.1:8791`.

```text
Convex cron 1h                    Node worker (session-worker ou poller)
     │                                         │
     ▼                                         ▼
expire flyers                          poll: flows com nextRunAt <= now?
set nextRunAt                          │
     │                                 ├── discovery-only (Playwright, sem MiMo)
     │                                 ├── downloadPending (só discovered novo)
     │                                 └── extractPending (só downloaded vigente/janela)
     └──────── estado no Convex ───────┘
```

Cron = mutação barata. Worker = trabalho pesado.

Produção: processo Node longo fazendo poll no Convex. HTTP webhook só se o worker tiver URL pública.

Run **manual** no dashboard (“Rodar fluxo” / Testar) **pode** continuar o pipeline completo (discover → download → extract). Scheduler automático = discovery-only.

---

# 8. Schema — delta mínimo

Não criar tabelas `flyerJobs` nem pastas `convex/flyers/`. Arquivos planos atuais.

### `supermarkets`

```ts
timezone: v.optional(v.string()), // default "America/Fortaleza"
```

Só para **parse** de string de validade → epoch. Comparação de expire usa epoch vs `Date.now()`.

### `flyers`

```ts
externalId: v.optional(v.string()),
```

Id do site quando existir (`?id=ABC123`, `data-flyer-id`). Unique key continua:

1. `supermarketId` + `originalUrl` (já implementado)
2. fallback `fileHash` (já implementado)

**Nome:** `sourceId` no schema atual é `Id<"flyerSources">` (tipo da fonte). Não reusar esse campo para id externo. Campo novo = `externalId`.

Índice opcional: `by_supermarket_externalId` `["supermarketId", "externalId"]`.

### `scraperFlows`

Já tem `schedule`, `nextRunAt`. Acrescentar:

```ts
lastRunAt: v.optional(v.number()),
discoveryAttempts: v.optional(v.number()),
```

Não criar `needsDiscovery`. `nextRunAt <= now` basta.

Não criar tabela `flyerJobs`. `scraperRuns` é o log (`flyersFound`, `startedAt`, `finishedAt`, `status`, `log`).

---

# 9. Validade e timezone

Trabalhar com instante, não “só a data”.

Campos: `validFrom`, `validUntil` (epoch ms), `supermarkets.timezone`.

Foco inicial: Fortaleza → default `America/Fortaleza`.

Parse no worker, na persistência do discovery:

```text
validity.final "20/08/2026 23:59" + timezone mercado
  → epoch
  → flyers.validUntil
```

Expire:

```text
validUntil < Date.now()  →  expired
```

Não converter timezone na query do cron. Instante já está certo se o parse foi certo.

Flyer sem `validUntil`: **não** expirar automaticamente. Logar em `flyerErrors` se o discovery repetir o mesmo URL sem datas — operador/parser.

---

# 10. Rotina de expiração

Estender `markExpiredInternal`. Não cron separado.

Consulta efetiva:

```text
flyers
WHERE validUntil < now
AND status NOT IN (expired, failed)
```

Para cada um: `status = expired`.

Se o supermercado tem flow `active` e **não** há flyer upcoming (`validFrom > now`) daquele mercado: `flow.nextRunAt = min(nextRunAt ?? now, now)`.

Usar índice `by_validUntil` quando `.collect()` doer. Volume atual aguenta scan.

---

# 11. Pre-discovery (24h antes)

Não esperar o encarte morrer.

```env
FLYER_DISCOVERY_BEFORE_EXPIRATION_HOURS=24
```

Já existe no `flyerConfig`. `listNearExpiration` já recorta.

Exemplo:

```text
validUntil = 20/08 23:59 America/Fortaleza
nextRunAt  = 19/08 23:59   (validUntil − 24h)
```

Cron, para cada flyer vigente com `validUntil` na janela: se o flow `active` daquele mercado ainda não rodou discovery recente, `nextRunAt = min(nextRunAt, validUntil − 24h)`.

Pode achar o próximo flyer **antes** do atual acabar. Cadastra como `discovered`. Não analisa com MiMo até vigente ou dentro da janela (ver §15).

---

# 12. Discovery não baixa tudo

Worker, quando `nextRunAt <= now`:

```text
abrir site (flow gravado)
  → executar steps até discover-flyer
  → scope
  → links / metadados
  → comparar com banco
  → insert só o que é novo
PARAR. Sem download-flyers. Sem extract-offers.
```

MiMo **não** participa do discovery.

```text
Discovery:  DOM / rede  →  URL do flyer
MiMo:       arquivo     →  ofertas
```

### Identificação de flyer novo

Preferência:

1. `supermarketId` + `originalUrl`
2. `supermarketId` + `externalId` se ambos preenchidos
3. depois do download: `fileHash`

`flyerKey()` em `flow-pipeline.ts` já extrai `id` da query. Gravar em `externalId`.

Discovery encontra A, B, C. Banco tem A, B. Só C vira `discovered`.

Registro novo:

```json
{
  "supermarketId": "...",
  "sourceId": "<Id flyerSources>",
  "externalId": "ABC123",
  "title": "Super Ofertas",
  "originalUrl": "https://apigw.../Flyer/?id=ABC123",
  "pageUrls": ["..."],
  "validFrom": 1775952000000,
  "validUntil": 1776556799000,
  "status": "discovered"
}
```

`persistDiscovered` **deve** passar `validFrom` / `validUntil` / `externalId`. Hoje descarta. Bug a corrigir na fase 1.

---

# 13. Evitar loop

Nunca:

```text
expirou → discovery → nada novo → discovery imediato → discovery imediato
```

Guardar no flow: `lastRunAt`, `discoveryAttempts`, `nextRunAt`.

Falha ou zero flyers novos:

```text
1ª → +1h
2ª → +2h
3ª → +4h
4ª → +8h (teto)
```

```ts
nextRunAt = now + min(8h, 1h << attempts)
discoveryAttempts += 1
lastRunAt = now
```

Sucesso com flyer novo: `discoveryAttempts = 0`. Próximo `nextRunAt` = `validUntil` do flyer vigente − 24h (ou do upcoming, o que for mais cedo).

`SCOPE_NOT_FOUND` / seletor sumiu: retry com backoff. Após teto de tentativas (`SCRAPER_MAX_RETRIES` / attempts ≥ 4): `scraperFlows.status = "error"`, `flyerErrors` stage `DISCOVERY`. Dashboard mostra falha. Não tentar indefinidamente. Operador reconfigura o flow.

---

# 14. Download

Depois do cadastro `discovered`, o worker (ou o mesmo ciclo após discovery) chama `downloadPending` — já existe.

Só flyers `status === "discovered"` sem `storageId`.

Antes de baixar: `originalUrl` já no banco com arquivo? Skip.

Depois: `fileHash` bate outro flyer? Não baixar de novo; marcar este `failed` (comportamento atual de `attachFile`).

Arquivo: PDF, imagem, flipbook, documento remoto. Storage = Convex File Storage. Guardar `storageId`, `originalUrl`, `fileHash`, `fileType`, `fileSize`.

---

# 15. Análise

Somente depois de download sucesso (`downloaded`).

`analyzeFlyer` = job `extractPending` existente. MiMo (fallback Tesseract). Não reimplementar.

```text
arquivo → páginas → MiMo/parser → ofertas → processed
```

### Upcoming vs vigente

Flyer B com `validFrom` no futuro:

* **cadastra** e **pode baixar** (barato, evita sumiço do CDN);
* **não** roda MiMo até `validFrom <= now` **ou** estiver dentro de `FLYER_DISCOVERY_BEFORE_EXPIRATION_HOURS` do `validFrom`.

Custo some na visão, não no Playwright.

---

# 16. Pipeline completo

```text
                  ┌─────────────────┐
                  │ Convex Cron 1h  │
                  └────────┬────────┘
                           │
                           ▼
                 Expire + nextRunAt
                           │
                           ▼
                 Flyer vigente?
                    /          \
                  SIM           NÃO / janela 24h
                  │              │
                  │              ▼
                  │         nextRunAt due?
                  │              │
                  └──────┐       │
                         │       ▼
                         │   Worker discovery-only
                         │       │
                         │       ▼
                         │   Novo flyer?
                         │    /      \
                         │  NÃO       SIM
                         │  │          │
                         │  backoff    discovered
                         │             │
                         │             ▼
                         │          download
                         │             │
                         │             ▼
                         │          analyze se vigente/janela
                         │             │
                         │             ▼
                         │          processed
                         │
                         └─────────────┘
```

---

# 17. Frequência

| Rotina | Quando |
|--------|--------|
| Expire | cron Convex, 1h (já existe) |
| Discovery | só se `nextRunAt <= now` e flow `active` |
| Download / extract | após discovery, só filas pendentes |

Proteção: `lastRunAt` + backoff. Não “a cada 1h para todo mercado”.

---

# 18. Cron Convex

Manter o interval atual. Handler vira orquestração de estado, não scrape.

Nome interno: `checkFlyerLifecycle` (pode permanecer o cron `"mark expired flyers"` ou renomear). Responsabilidades:

1. Encontrar flyers com `validUntil < now` → `expired`
2. Encontrar vigentes na janela 24h
3. Atualizar `scraperFlows.nextRunAt`
4. **Não** executar Playwright, download ou MiMo

Queries novas (planas, em `flyers.ts` / `scraperFlows.ts`):

* `listDueFlows` — `status=active` AND `nextRunAt <= now`
* reusar `listPendingDownload` / `listPendingExtract` / `listNearExpiration`

---

# 19. Worker Node

Piggyback no processo que já sobe Playwright (`flows:session-worker`) **ou** script `flows:scheduler` que faz poll. Um poller. Não dois schedulers.

Ciclo (ex.: 1 min):

1. `listDueFlows`
2. Para cada flow: `executeFlowById(flowId, ctx, { pipeline: "discovery" })`
3. Atualizar `lastRunAt` / `discoveryAttempts` / `nextRunAt` / `status`
4. `downloadPending` (filas `discovered`)
5. `extractPending` filtrando vigente/janela

Flag nova no runner:

```ts
executeFlowById(id, ctx, { pipeline: "discovery" | "full" })
```

* `discovery` — **não** anexar `download-flyers` / `extract-offers`
* `full` — comportamento atual (dashboard / CLI de teste)

Default do scheduler = `discovery`. Default do botão Testar = `full`.

---

# 20. Idempotência

Reexecução do mesmo job não cria 2 flyers / 2 downloads / 2 conjuntos de ofertas.

Chaves (já na maior parte):

| Entidade | Chave |
|----------|--------|
| Flyer | `supermarketId` + `originalUrl` |
| Flyer (pós-download) | `fileHash` |
| Página | `flyerId` + `pageNumber` |
| Ofertas | `insertBatch` com `replace` / `replacePageNumbers` |
| Run | um `scraperRuns` por execução; não usar run como identidade do flyer |

---

# 21. Logs

Não criar `flyerJobs`. Cada discovery automático = uma linha `scraperRuns`:

```text
flowId, status, startedAt, finishedAt, flyersFound, log
```

`log` já guarda resumo por step. Suffice. Download/extract falhos = `flyerErrors` (já).

Dashboard lê `scraperRuns` recentes por flow.

---

# 22. Dashboard (fase última)

Não tela nova na fase 1. Overview já conta ativos / expirados / erros.

Fase 6 — seção **Automação** (overview ou `/admin/scraper`):

```text
Flows active: 8
Flyers vigentes: 34
Flyers expirados: 12
Aguardando download: 2
Aguardando análise: 1

Próximos discoveries
São Luiz       19/08 23:00
Atacadão       20/08 00:00
```

Por supermercado / flow:

```text
São Luiz
🟢 flow active
Último run: 17/08 08:00
Próximo:    19/08 23:00
Flyer vigente: Super Ofertas  13/08 → 20/08
```

Erro:

```text
🔴 flow error
Motivo: SCOPE_NOT_FOUND — área de flyers não encontrada
Última execução: 17/08 08:00
[ Reconfigurar workflow ]  →  /admin/scraper
```

Query: agregar `scraperFlows` + último `scraperRuns` + flyer vigente. Sem tabela nova.

---

# 23. Convex functions

Continuar arquivos planos:

```text
convex/
├── schema.ts              # timezone, externalId, lastRunAt, discoveryAttempts
├── crons.ts               # 1h → checkFlyerLifecycle
├── flyers.ts              # queries/mutations atuais + listDue se couber
├── flyersInternal.ts      # expire + nextRunAt
├── scraperFlows.ts        # listDueFlows, claim/backoff
├── scraperRuns.ts         # inalterado
└── dashboard.ts           # métricas de automação na fase 6
```

Não criar `convex/automation/` nem `convex/flyerJobs/`.

---

# 24. Ordem de implementação

Código de download / hash / MiMo **já é** as fases 4–5 da ideia original. Não reescrever.

### Fase 1 — validade no banco

* `persistDiscovered` grava `validFrom` / `validUntil` / `externalId`
* parse com timezone do mercado (default Fortaleza)
* `supermarkets.timezone` opcional
* sem isso, expire continua cego

### Fase 2 — split do pipeline

* `pipeline: "discovery" | "full"` em `executeFlowById`
* scheduler / poller usa `discovery`
* dashboard Testar continua `full`
* `downloadPending` / `extractPending` só filas

### Fase 3 — scheduler

* `markExpiredInternal` também seta `nextRunAt` (expire + janela 24h)
* `listDueFlows`
* worker poll + backoff + `status=error` no teto
* `lastRunAt` / `discoveryAttempts`

### Fase 4 — dashboard

* seção Automação
* próximo discovery, último run, erro com link de reconfigurar

Cada fase deixa o sistema usável. Não precisa 4 pra 1 funcionar.

---

# 25. Fora de escopo (de propósito)

* Renomear status para UPPERCASE / `ACTIVE`
* Estados persistidos `CURRENT` / `UPCOMING`
* `supermarkets` com `MONITORING` / `PAUSED`
* Flag `needsDiscovery` além de `nextRunAt`
* Tabela `flyerJobs`
* Playwright / download / MiMo dentro de Convex Action
* Reorganizar `convex/` em subpastas
* App consumidor, matching de produto, histórico de preço

Add when: worker remoto com URL pública (webhook); volume que obrigue paginar expire pelo índice `by_validUntil`.

---

# 26. Resultado

```text
SUPERMERCADO
      │
      ▼
Flyer vigente
      │
┌─────┴──────┐
│            │
aguarda    perto do fim / expirou
             │
             ▼
        discovery-only
             │
        flyer novo?
          /     \
        não      sim
        │         │
     backoff      discovered
                  │
                  ▼
               baixa
                  │
                  ▼
               analisa (se vigente/janela)
                  │
                  ▼
               ofertas no Convex
```

Scraper deixa de ser tarefa manual contínua. Banco = estado. Playwright só quando `nextRunAt` manda.

---

# 27. Checklist

- [ ] `persistDiscovered` grava validade + `externalId`
- [ ] `supermarkets.timezone` default Fortaleza
- [ ] Expire usa epoch; flyer sem `validUntil` não some sozinho
- [ ] `executeFlowById` aceita `pipeline: "discovery" | "full"`
- [ ] Scheduler não anexa download/extract
- [ ] Cron seta `nextRunAt` no expire e na janela 24h
- [ ] `listDueFlows` + poller
- [ ] Backoff + teto → `flow.status = error`
- [ ] Download só `discovered`; extract só `downloaded` vigente/janela
- [ ] Dedupe URL + hash inalterados
- [ ] Dashboard Automação (fase 4)
- [ ] Self-check: mesmo `originalUrl` duas vezes → 1 flyer; flow due com flyer vigente → 0 Playwright
