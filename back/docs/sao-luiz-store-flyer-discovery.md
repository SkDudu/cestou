# SPEC 013 — São Luiz Store & Flyer Discovery

**Projeto:** Cestou  
**Módulo:** Discovery de lojas e encartes  
**Versão:** 1.0.0  
**Status:** Implementation Ready  
**Prioridade:** Alta  
**Dependências:** SPEC 010 (Flyer-First Offers Pipeline)  
**Nota de numeração:** Rascunho original usava SPEC 011; no repositório SPEC 011 já é DeepSeek Vision e SPEC 012 é MiMo. Esta SPEC é **013**.  
**Relação com SPEC 010:** o scraper atual de São Luiz **fixa** `MARKET_ID = 355` e descobre flipbooks só em `/loja/355/encartes`. Esta SPEC amplia o discovery para **varrer IDs de loja**, gravar candidatos e referências de flyers — **sem** download, OCR ou MiMo.  
**Escopo geográfico:** Cestou opera em **Fortaleza (CE)**. Só persistir lojas (e seus flyers) localizadas em Fortaleza.

---

# 1. Objetivo

Criar um processo de discovery para o São Luiz capaz de:

* testar IDs de loja;
* acessar `/loja/{id}`;
* identificar se a página existe;
* **confirmar que a loja é de Fortaleza**;
* localizar possíveis flyers associados à página;
* salvar no Convex **somente** lojas + flyers de Fortaleza;
* evitar duplicações.

**Não** extrair informações dos produtos neste momento.

---

# 2. Escopo

Nesta primeira versão:

```text
ID
 ↓
/loja/{id}
 ↓
Página encontrada?
 ↓
SIM
 ↓
É Fortaleza?
 ↓
SIM                         NÃO
 ↓                           ↓
Encontrar flyers        out_of_scope
 ↓                      (não flyer discovery)
Salvar no Convex
```

Não será realizado:

* parsing de produtos;
* OCR;
* MiMo;
* identificação de preços;
* validação de ofertas;
* cadastro completo da loja (nome, endereço completo, etc.);
* normalização de produtos;
* download de imagens/PDF;
* persistir lojas de outras cidades.

---

# 3. Exemplo

Entrada conhecida:

```text
https://mercadinhossaoluiz.com.br/loja/355
```

O discovery deverá verificar:

```text
/loja/1
/loja/2
/loja/3
…
/loja/355
…
```

Quando encontrar uma página potencialmente válida **e** for Fortaleza, criar um **storeCandidate** com `status = discovered` e seguir para flyer discovery.

Loja válida em outra cidade → `out_of_scope` (sem flyer discovery, sem ofertas futuras).

---

# 4. Não assumir IDs sequenciais contínuos

O sistema **pode** testar intervalos sequenciais, mas **não** deve assumir que todo ID no intervalo é válido **nem** que todo ID válido é Fortaleza.

Exemplo:

```text
350 → inválido (404)
351 → válido, outra cidade → out_of_scope
352 → válido, Fortaleza → discovered + flyers
353 → válido, Fortaleza → discovered + flyers
354 → inválido
355 → válido, Fortaleza → discovered + flyers
```

IDs inválidos / fora do escopo **não** abortam o intervalo. Seguir até `DISCOVERY_END_ID`.

---

# 5. Configuração

```env
SAO_LUIZ_BASE_URL=https://mercadinhossaoluiz.com.br
SAO_LUIZ_STORE_PATH=/loja

DISCOVERY_START_ID=1
DISCOVERY_END_ID=1000

DISCOVERY_CONCURRENCY=5
DISCOVERY_TIMEOUT=15000
DISCOVERY_RETRIES=2
DISCOVERY_DELAY_MS=200

# Filtro geográfico (Cestou = Fortaleza)
DISCOVERY_CITY=Fortaleza
DISCOVERY_STATE=CE
```

Intervalo, concorrência, timeout, delay e cidade **não** ficam hardcoded.

User-Agent identificável, p.ex. `CestouBot/0.1 (+cestou discovery)`.

---

# 6. Estrutura

Adapter São Luiz sob o scraper atual (não um `src/scrapers/` solto):

```text
back/scraper/src/flyers/sources/sao-luiz/discovery/
├── store-discovery.ts
├── flyer-discovery.ts
├── http-client.ts
├── parser.ts
├── types.ts
└── index.ts
```

CLI:

```text
back/scraper/src/flyers/jobs/sao-luiz-discovery.ts
```

O restante do pipeline (download / MiMo) **não** chama este discovery automaticamente nesta SPEC.

> **Nota:** o scraper em `sources/sao-luiz/scraper.ts` (loja 355 + Mercadapp flipbooks) permanece até esta SPEC ser plugada. Não misturar download/OCR neste módulo.

---

# 7. Store Discovery

Responsabilidades:

1. Esse `/loja/{id}` parece ser uma página de loja válida?
2. Essa loja é de **Fortaleza**?

Não interpretar profundamente o restante (nome comercial, endereço completo, etc.).

---

# 8. URL

```text
${SAO_LUIZ_BASE_URL}${SAO_LUIZ_STORE_PATH}/${id}
```

Exemplo:

```text
https://mercadinhossaoluiz.com.br/loja/355
```

Validar que o host pertence à base configurada. Sem open-redirect para domínio externo.

---

# 9. Página válida

Potencialmente válida (estrutura de loja) quando houver **sinais suficientes** — não só HTTP 200.

Sinais (combinar ≥ 2, ou 200 + um sinal forte):

* HTTP 200;
* HTML com estrutura de loja (`/loja/{id}` no canonical, scripts Mercadapp, `markets/{id}`, etc.);
* referências a supermercado / encartes / flipbooks;
* **não** é a home genérica nem uma página de erro.

**Página válida ≠ persistir.** Só Fortaleza segue para `discovered` + flyers (ver §9.1).

---

# 9.1 Filtro Fortaleza (obrigatório)

Após confirmar que `/loja/{id}` é uma loja real, detectar **cidade/UF** com parser mínimo.

Aceitar como Fortaleza quando houver evidência clara, por exemplo:

* texto / JSON com `Fortaleza` + `CE` / `Ceará`;
* campo de cidade da API Mercadapp / market payload;
* slug ou label estável da loja apontando Fortaleza.

Normalizar comparação: case-insensitive, sem acento (`fortaleza`, `Fortaleza`).

| Resultado | Ação |
|-----------|------|
| Fortaleza | `status = discovered` → flyer discovery → Convex |
| Outra cidade (ex. Juazeiro, Sobral) | `status = out_of_scope` → **não** flyer discovery |
| Cidade não determinada | `status = unknown_city` → **não** flyer discovery; logar para revisão |

**Regra de ouro:** em dúvida, **não** salvar flyers. Preferir falso negativo a trazer loja de fora de Fortaleza.

Não depende de lista hardcoded de IDs (355 pode mudar; outras lojas de Fortaleza devem entrar).

---

# 10. Página inválida

`INVALID` quando:

* HTTP 404;
* redirect para home / “loja não encontrada” / URL sem o id;
* página de erro;
* conteúdo claramente genérico (mesmo site, outra rota).

**Não** confundir com `out_of_scope` (loja existe, mas não é Fortaleza).

Pode registrar `storeCandidates.status = invalid` para não rechecar o mesmo 404 a cada run (recomendado: sim, um row `invalid` por `storeId`, atualizar `lastCheckedAt`).

---

# 11. Store Candidates

Tabela Convex: `storeCandidates`

```ts
{
  storeId: string;          // "355"
  source: "sao-luiz";
  url: string;
  status:
    | "discovered"      // loja válida + Fortaleza
    | "invalid"         // 404 / não é loja
    | "out_of_scope"    // loja válida, outra cidade
    | "unknown_city"    // loja válida, cidade não detectada
    | "active"
    | "inactive";
  city?: string;            // só o necessário p/ filtro (ex. "Fortaleza")
  state?: string;           // "CE"
  httpStatus?: number;
  discoveredAt: number;
  lastCheckedAt: number;
}
```

Índice único lógico: `(source, storeId)`.

Nesta etapa, `discovered` significa:

> página de loja válida **e** localizada em Fortaleza.

`active` / `inactive` ficam para SPEC futura (não promover automaticamente).

**Só** `discovered` gera `flyerDiscoveries`.

---

# 12. Dados mínimos da loja

Para o filtro geográfico, **pode** ler e persistir só:

* `city`
* `state`

**Não** persistir nesta SPEC:

* nome;
* endereço completo / rua;
* telefone;
* horário;
* coordenadas;
* bairro;
* CEP.

Mesmo que estejam no HTML. SPEC futura.

---

# 13. Flyer Discovery

Depois de um candidate **`discovered` (Fortaleza)**, executar flyer discovery **nessa página** (e, se o site exigir, em `/loja/{id}/encartes` — ainda só referências, sem download).

**Não** rodar flyer discovery para `invalid`, `out_of_scope` ou `unknown_city`.

---

# 14. O que é um Flyer nesta etapa

Referência, não conteúdo:

* URL de imagem;
* URL de PDF;
* URL de flipbook;
* ID de flipbook (ex. Mercadapp `70382`);
* endpoint (`/mapp/v2/markets/{id}/flipbooks`);
* array de páginas (URLs);
* referência promocional óbvia.

Não é necessário entender o conteúdo das páginas.

---

# 15. Exemplo

Se a página / API expuser:

```text
Flipbook_70382
image-1.jpeg
image-2.jpeg
image-3.jpeg
```

Registrar a referência (`externalId: "70382"`, `type: "flipbook"`, `sourceUrl`, `metadata` com lista de URLs de página **se** já vierem no JSON — strings apenas, sem fetch das imagens).

---

# 16. Entidade Flyer Discovery

Tabela Convex: `flyerDiscoveries`

```ts
{
  storeCandidateId: Id<"storeCandidates">;
  storeId: string;          // denormalizado p/ queries
  externalId?: string;
  sourceUrl: string;
  type: "pdf" | "image" | "flipbook" | "endpoint" | "unknown";
  status: "discovered" | "inactive";
  metadata?: string;        // JSON curto (ids, pageUrls[], title)
  discoveredAt: number;
  lastSeenAt: number;
}
```

`status = inactive` **não** é obrigatório nesta SPEC (futuro). Criar o campo já no schema.

---

# 17. Não baixar imagens

Somente referências: `sourceUrl` e/ou `externalId`.

Download = pipeline SPEC 010 (`flyers:download`), etapa seguinte, fora desta SPEC.

---

# 18. Não processar o Flyer

Não executar:

```text
Flyer → OCR → MiMo
```

Resultado desta SPEC: **Flyer encontrado** (referência no Convex).

---

# 19. Relação no Convex

```text
storeCandidates
       │
       └── flyerDiscoveries
```

Exemplo:

```text
storeCandidate
  storeId: 355
  city: Fortaleza
  state: CE
  status: discovered
        ↓
flyerDiscovery
  externalId: 70382
  type: flipbook
  sourceUrl: …
```

Loja fora de Fortaleza **não** aparece em `flyerDiscoveries`.

Não ligar ainda a `supermarkets` / `flyers` da SPEC 010. Ponte (candidate → supermarket + flyerSources) é SPEC posterior, para não misturar “página potencial” com loja validada.

---

# 20. Deduplicação

O mesmo flyer **não** entra duas vezes **por loja**.

Prioridade de identidade:

1. `source + storeId + externalId` (quando houver);
2. senão `source + storeId + sourceUrl`;
3. senão hash estável da referência.

```text
Flipbook 70382 visto 20 vezes na loja 355 → 1 registro.
```

O **mesmo** `externalId` em lojas diferentes (355 e 353) **pode** gerar dois registros — um por `storeCandidate`. Não colapsar entre lojas nesta SPEC.

---

# 21. lastSeenAt

Reencontrar o mesmo flyer: atualizar `lastSeenAt` (+ `metadata` se a lista de páginas mudou). **Não** criar outro row.

Permite, no futuro, marcar flyers que sumiram da fonte.

---

# 22. Histórico

Não excluir flyers antigos automaticamente.

Sumiu do site → `status = inactive` em etapa futura. Nesta SPEC: manter o registro.

---

# 23. CLI

```bash
npm run discovery:sao-luiz
```

Opcional:

```bash
npm run discovery:sao-luiz -- -- --from=340 --to=360
```

(o `-- --` evita o npm do workspace engolir flags.)

Depois: cron / Docker / worker / VPS — fora desta SPEC.

---

# 24. Pipeline

```text
ID 1  → GET /loja/1  → inválido → próximo
ID 2  → GET /loja/2  → inválido → próximo
…
ID 200 → GET /loja/200 → válido, outra cidade → out_of_scope → próximo
…
ID 355 → GET /loja/355 → válido + Fortaleza
         → Store Candidate (discovered)
         → Flyer Discovery
         → Flyer encontrado
         → Convex
```

---

# 25. Concorrência

`DISCOVERY_CONCURRENCY=5` (pool limitado). Sem unbounded `Promise.all` em 1000 IDs.

---

# 26. Rate limiting

`DISCOVERY_DELAY_MS` entre requisições (por worker ou global). Objetivo: não sobrecarregar o site, evitar bloqueio.

---

# 27. Retry

Retry (até `DISCOVERY_RETRIES`) com backoff curto para:

* timeout;
* 502 / 503 / 504.

**Sem** retry em 404 / 410 / 4xx permanentes.

---

# 28. Logs

```text
[355] checking
[355] page found
[355] city=Fortaleza CE → in scope
[355] flyer found: 70382
[200] page found
[200] city=Juazeiro do Norte CE → out_of_scope
[356] page not found
[357] city unknown → skip flyers
```

Não logar cookies, tokens, HTML completo.

---

# 29. Estatísticas

Ao finalizar:

```text
Discovery completed
IDs checked: 1000
Invalid IDs: 900
Out of scope (other city): 50
Unknown city: 5
Fortaleza stores: 45
Flyers found: 67
New flyers: 14
Existing flyers: 53
Errors: 3
```

---

# 30. Segurança

* timeout;
* limite de redirects (ex. 3);
* validação de URL / host allowlist;
* concorrência limitada;
* User-Agent identificável;
* retry limitado.

**Não** contornar CAPTCHA, bloqueios, autenticação ou anti-bot.

---

# 31. Parser mínimo

Pode olhar:

* HTML / atributos / `<script>`;
* JSON embutido;
* URLs e IDs (`flipbook`, `flipbooks`, `70382`, `cdn.mercadapp`).

**Não** interpretar produtos.

Hoje o site usa Mercadapp (`/mapp/v2/markets/{id}/flipbooks`) — o parser **pode** detectar esse endpoint na página; chamar a API de flipbooks (Playwright/session, como o scraper 010) **é permitido** para listar IDs/URLs, desde que **não** baixe bytes das páginas.

---

# 32. Dados brutos

No Convex: `httpStatus`, `sourceUrl`, `discoveredAt`, `metadata` curto.

**Não** salvar HTML completo no Convex. HTML local só em desenvolvimento, se útil (gitignore).

---

# 33. Idempotência

Rodar `discovery:sao-luiz` duas vezes → mesmo estado lógico.

Não criar:

```text
Store 355 × 3
Flyer 70382 × 3 (mesma loja)
```

---

# 34. Escalabilidade futura

São Luiz só no adapter:

```text
São Luiz Adapter
        ↓
Discovery Core (opcional nesta SPEC: funções no próprio adapter)
        ↓
Convex
```

Não extrair um “core” genérico até o segundo supermercado existir. YAGNI: um adapter + mutations Convex bastam.

---

# 35. Fora do escopo

* extração de nome / endereço completo / telefone / horário;
* produtos, preços, OCR, MiMo;
* download das imagens;
* comparação de preços;
* validação humana;
* classificação de produtos;
* datas de validade do encarte (já existem no pipeline 010 após download);
* persistir flyers de lojas fora de Fortaleza.

---

# 36. Definition of Done

### Discovery

- [ ] Intervalo configurável
- [ ] Teste `/loja/{id}`
- [ ] Página válida / inválida
- [ ] Filtro Fortaleza (`DISCOVERY_CITY` / `DISCOVERY_STATE`)
- [ ] `out_of_scope` / `unknown_city` sem flyer discovery
- [ ] Timeout, retry, concorrência, delay

### Convex

- [ ] `storeCandidates` (incl. city/state + status geográfico)
- [ ] `flyerDiscoveries` **apenas** para Fortaleza (`discovered`)
- [ ] Relação store → flyers
- [ ] Deduplicação + `lastSeenAt`

### Flyer discovery

- [ ] Detectar URL / ID / tipo
- [ ] Salvar referência
- [ ] Não baixar arquivo
- [ ] Não rodar fora de Fortaleza

### CLI

- [ ] `npm run discovery:sao-luiz`
- [ ] Logs + estatísticas (Fortaleza vs out_of_scope)

---

# 37. Resultado esperado

```text
São Luiz Discovery
│
├── /loja/200 → válido, Juazeiro → out_of_scope (sem flyers)
├── /loja/350 → inválido
├── /loja/351 → inválido
├── /loja/352 → Fortaleza
│     ├── Flyer 70380
│     └── Flyer 70381
│
├── /loja/353 → Fortaleza
│     └── Flyer 70382
│
├── /loja/354 → inválido
│
└── /loja/355 → Fortaleza
      ├── Flyer 70382
      └── Flyer 70385
```

Convex:

```text
storeCandidates
────────────────────────────────────
storeId   city        status
200       Juazeiro…   out_of_scope
352       Fortaleza   discovered
353       Fortaleza   discovered
355       Fortaleza   discovered

flyerDiscoveries  (só Fortaleza)
────────────────────────────────
storeId   externalId   type
352       70380        flipbook
352       70381        flipbook
353       70382        flipbook
355       70382        flipbook
355       70385        flipbook
```

---

# 38. Relação com o roadmap

```text
SPEC 010  Flyer Pipeline (hoje: só loja 355)
       ↓
SPEC 011  DeepSeek Vision
       ↓
SPEC 012  MiMo-V2.5 Flyer Extraction
       ↓
SPEC 013  São Luiz Store & Flyer Discovery   ← este documento
       ↓
SPEC 014  Product Normalization
       ↓
…
```

Depois desta SPEC: ligar candidates → `supermarkets` / `flyerSources` / `flyers:download` (ainda sem extrair nome da loja, se a ponte for só por `storeId`).
