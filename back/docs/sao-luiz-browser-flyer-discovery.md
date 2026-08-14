# SPEC 014 — São Luiz Browser Flyer Discovery

**Projeto:** Cestou  
**Módulo:** Discovery de Encartes via Browser  
**Versão:** 1.0.0  
**Status:** Implementation Ready  
**Prioridade:** Alta  
**Dependências:** SPEC 010 (Flyer-First), SPEC 013 (Store & Flyer Discovery)  
**Nota de numeração:** Rascunho original usava SPEC 012; no repositório SPEC 012 já é MiMo-V2.5 e SPEC 013 é Store Discovery. Esta SPEC é **014**.  
**Relação com SPEC 013:** a 013 varre lojas (Fortaleza) e grava `storeCandidates` / refs mínimas. Esta SPEC aprofunda o **browser discovery** em `/loja/{storeId}/encartes` — Playwright, network monitor, DOM, heurísticas — **sem** download, MiMo ou produtos.

---

# 1. Objetivo

Implementar Browser Discovery com Playwright para acessar páginas de encartes do São Luiz via navegador real.

A primeira versão deverá acessar:

```text
https://mercadinhossaoluiz.com.br/loja/{storeId}/encartes
```

e descobrir como os encartes são carregados pela aplicação.

Objetivo principal:

* renderizar o site;
* aguardar o JavaScript;
* identificar os encartes disponíveis;
* monitorar requisições de rede;
* identificar possíveis endpoints;
* identificar URLs de imagens/páginas;
* salvar as descobertas no Convex.

**Não** haverá extração de produtos nesta SPEC.

---

# 2. Problema

A rota `/loja/355/encartes` é uma SPA JavaScript.

HTTP GET tradicional pode retornar só o shell, sem dados dos encartes:

```text
HTTP GET
   ↓
HTML
   ↓
sem dados suficientes
```

Precisamos:

```text
Chromium
   ↓
JavaScript
   ↓
Aplicação renderizada
   ↓
Network
   ↓
Dados dos encartes
```

---

# 3. Stack

Stack atual:

* Node.js
* TypeScript
* Docker
* Convex

Adicionar / usar:

* Playwright
* Chromium

**Não** utilizar Selenium.

---

# 4. Arquitetura

```text
                   Cestou
                     │
                     ▼
             Store Discovery (SPEC 013)
                     │
                     ▼
              storeId = 355 (ou active)
                     │
                     ▼
       /loja/355/encartes
                     │
                     ▼
                Playwright
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
         DOM       Network    Console
          │          │          │
          └──────────┼──────────┘
                     ▼
             Flyer Discovery
                     │
                     ▼
                  Convex
```

---

# 5. URL

Construir dinamicamente:

```ts
const url = `${SAO_LUIZ_BASE_URL}/loja/${storeId}/encartes`;
```

Exemplo:

```text
https://mercadinhossaoluiz.com.br/loja/355/encartes
```

---

# 6. Configuração

Adicionar ao `.env`:

```env
SAO_LUIZ_BASE_URL=https://mercadinhossaoluiz.com.br

BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000
BROWSER_NAVIGATION_TIMEOUT=30000
BROWSER_WAIT_AFTER_LOAD=5000
BROWSER_MAX_PAGES=100
BROWSER_SCREENSHOTS=false
BROWSER_SAVE_HTML=false
BROWSER_CONCURRENCY=1
```

Durante desenvolvimento:

```env
BROWSER_HEADLESS=false
```

pode ser usado para visualizar o navegador.

---

# 7. Dependência

```bash
npm install playwright
npx playwright install chromium
```

Container Docker deverá incluir dependências necessárias para Chromium.

---

# 8. Estrutura de pastas

Alvo no scraper atual (`back/scraper/src/flyers/sources/sao-luiz/`):

```text
sao-luiz/
├── discovery/          # SPEC 013 (lojas)
│   ├── store-discovery.ts
│   └── flyer-discovery.ts
│
├── browser/            # SPEC 014
│   ├── browser.ts
│   ├── context.ts
│   ├── navigation.ts
│   └── network-monitor.ts
│
├── parser/
│   ├── flyer-parser.ts
│   └── url-parser.ts
│
├── types/
│   └── discovery.types.ts
│
├── scraper.ts          # pipeline download (já existe)
└── index.ts
```

> Nota: rascunho usava `src/scrapers/sao-luiz/`. No repo Cestou o path canônico é `scraper/src/flyers/sources/sao-luiz/`.

---

# 9. Browser Manager

`BrowserManager` responsável por:

* iniciar Chromium;
* criar context;
* configurar timeout;
* fechar browser;
* controlar lifecycle.

```text
BrowserManager
    │
    ├── launch()
    ├── createContext()
    ├── createPage()
    └── close()
```

O restante do scraper **não** deverá instanciar Chromium diretamente.

---

# 10. Browser Context

Configurar:

* viewport
* userAgent
* locale
* timezone
* timeouts

Comportamento compatível com navegação normal.

**Não** implementar técnicas para burlar anti-bot.

---

# 11. Navegação

Para cada loja:

```text
createPage()
    ↓
goto(url)
    ↓
waitForLoadState()
    ↓
aguardar aplicação
    ↓
analisar DOM
    ↓
analisar Network
```

Usar `waitUntil: "domcontentloaded"` e depois aguardar a aplicação carregar (`BROWSER_WAIT_AFTER_LOAD`).

---

# 12. JavaScript

Playwright deverá executar o JavaScript da página normalmente.

**Não** usar:

```ts
page.setJavaScriptEnabled(false)
```

---

# 13. Network Monitor

Criar `network-monitor.ts` para capturar:

* request
* response

durante a navegação.

---

# 14. Dados capturados

Para cada request relevante:

```json
{
  "url": "https://example.com/api/flyers",
  "method": "GET",
  "resourceType": "xhr",
  "status": 200,
  "contentType": "application/json"
}
```

---

# 15. Recursos de interesse

Prioridade:

* xhr
* fetch
* image
* document
* script

Principalmente:

* `application/json`
* `image/*`

---

# 16. Não salvar tudo no Convex

O monitor pode capturar muitas requisições.

**Não** enviar todas ao banco.

```text
request
   ↓
relevant?
 /      \
NO       YES
 │        │
ignore   save
```

---

# 17. Heurística de Flyer

Identificar URLs com termos como:

* flyer, encarte, flipbook
* catalog, catalogo
* promotion, promocao
* offer, oferta

Também analisar:

* JSON responses;
* arrays de imagens;
* IDs;
* estruturas relacionadas a encartes.

Heurística **configurável** (lista de keywords em config/env).

---

# 18. JSON Discovery

Quando `Content-Type: application/json`, tentar identificar estruturas de flyers.

Exemplo:

```json
{
  "id": 70382,
  "pages": []
}
```

Registrar como possível descoberta.

---

# 19. Não assumir estrutura

O parser **não** assume exatamente `{ id, pages }`.

O site pode usar: `data`, `results`, `items`, `content`, `flyers`, `catalogs`, `pages`, `flipbooks`, `images_urls`.

Parser tolerante / recursivo em chaves conhecidas.

---

# 20. DOM Discovery

Além da Network, analisar o DOM renderizado.

Procurar: `a`, `img`, `iframe`, `button`

Atributos: `href`, `src`, `data-src`, `data-url`, `data-id`

---

# 21. Links relevantes

Exemplos a identificar:

* `<a href="/encarte/70382">`
* `<img src="...flyer...jpeg">`
* `<div data-flyer-id="70382">`

---

# 22. Screenshot opcional

Quando `BROWSER_SCREENSHOTS=true`, salvar em:

```text
debug/screenshots/store-{id}-encartes.png
```

Só para debugging. **Não** persistir no Convex.

---

# 23. HTML opcional

Quando `BROWSER_SAVE_HTML=true`, salvar em:

```text
debug/html/store-{id}-encartes.html
```

**Não** salvar HTML permanentemente no Convex.

---

# 24. Console Monitor

Capturar:

* `console.log`
* `console.warn`
* `console.error`

Priorizar erros de API, network e JavaScript.

---

# 25. Falha de JavaScript

Erro JS **não** deve necessariamente abortar o scraper.

Registrar `consoleError` e continuar tentando descobrir flyers.

---

# 26. Flyer Candidate

Estrutura interna:

```ts
type FlyerCandidate = {
  externalId?: string;
  url?: string;
  type?: string;
  source: "network" | "dom";
  discoveredAt: string;
};
```

---

# 27. Deduplicação

Duas descobertas iguais → um único candidate.

Prioridade:

1. `externalId`
2. `url`
3. hash

---

# 28. Convex

Salvar resultados em:

```text
storeCandidates
        │
        ▼
flyerDiscoveries
```

Reusar tabelas da SPEC 013 quando possível; estender campos se necessário (`discoverySource`).

---

# 29. Schema — storeCandidates

Campos mínimos (alinhados à 013):

* `storeId`
* `source`
* `url`
* `status`
* `httpStatus`
* `city` / `state` (filtro Fortaleza — SPEC 013)
* `discoveredAt`
* `lastCheckedAt`

Exemplo:

```json
{
  "storeId": "355",
  "source": "sao-luiz",
  "url": "https://mercadinhossaoluiz.com.br/loja/355/encartes",
  "status": "discovered"
}
```

---

# 30. Schema — flyerDiscoveries

Campos:

* `storeCandidateId`
* `storeId`
* `externalId`
* `sourceUrl`
* `type`
* `discoverySource` — `network` | `dom` | `both`
* `status`
* `metadata`
* `discoveredAt`
* `lastSeenAt`

> Hoje a tabela 013 ainda não tem `discoverySource`. Esta SPEC adiciona o campo (opcional no schema).

---

# 31. Status

Flyer discovery:

* `discovered`
* `active`
* `inactive`

Inicialmente: `discovered`.

---

# 32. Não baixar o Flyer

Se encontrar `page-001.jpeg` … salvar **só referência**.

Download = SPEC posterior.

---

# 33. Não usar MiMo

Não executar pipeline imagem → MiMo nesta etapa.

Objetivo: descobrir **onde** estão os encartes.

---

# 34. Não extrair produtos

Não identificar arroz, feijão, preços, marcas.

---

# 35. Interação com visualizador

Se o flyer exigir click para abrir:

```text
lista de encartes
       ↓
click
       ↓
viewer
       ↓
network monitor
       ↓
capturar novas requests
```

---

# 36. Navegação do visualizador

Controles possíveis: Próxima, Next, `>`, `→`.

Prioridade: descobrir recursos carregados, **não** extrair conteúdo.

---

# 37. Limite de páginas

```env
BROWSER_MAX_PAGES=100
```

Evitar loops infinitos no visualizador.

---

# 38. Detecção de página

Se o visualizador mostrar `1 / 15` ou `Página 1 de 15`, registrar em metadata:

```json
{ "pageCount": 15 }
```

---

# 39. Network após interação

Monitor permanece ativo durante toda a interação:

```text
page opened
   ↓
network monitor ON
   ↓
click flyer
   ↓
requests
   ↓
click next
   ↓
requests
```

---

# 40. Identificação de imagens

`image/*` → candidato:

```json
{
  "url": "https://cdn.example.com/flyer/page-01.jpeg",
  "resourceType": "image"
}
```

---

# 41. Identificação de PDFs

`application/pdf` → `type: pdf` (sem baixar).

---

# 42. Identificação de Flipbook

Referência a `flipbook` → `type: flipbook`.

---

# 43. Metadata

Exemplo:

```json
{
  "pageCount": 15,
  "contentType": "application/json",
  "source": "network"
}
```

**Não** armazenar payloads enormes (cortar / resumir).

---

# 44. Logs

```bash
npm run discovery:sao-luiz:browser
```

Exemplo:

```text
[DISCOVERY] Store 355
[DISCOVERY] Opening /loja/355/encartes

[BROWSER] Page loaded

[NETWORK] GET /api/...
[NETWORK] GET /api/flyers
[NETWORK] GET /images/...

[FLYER] Candidate found
[FLYER] externalId: 70382

[RESULT]
Store: 355
Flyers: 1
Images: 15
Requests: 84
```

> Script novo (`discovery:sao-luiz:browser`) para não conflitar com o discovery de lojas da SPEC 013 (`discovery:sao-luiz`).

---

# 45. Modo Debug

```bash
npm run discovery:sao-luiz:browser:debug
```

Força:

```env
BROWSER_HEADLESS=false
BROWSER_SCREENSHOTS=true
BROWSER_SAVE_HTML=true
```

---

# 46. Modo Headless

Produção: `BROWSER_HEADLESS=true` — sem janela gráfica.

---

# 47. Teste inicial

Primeiro testar **somente** `storeId = 355`.

```bash
npm run discovery:sao-luiz:browser -- --store=355
```

Não executar milhares de IDs nesta fase.

---

# 48. Resultado esperado

Para `/loja/355/encartes`:

```text
Store 355
   │
   └── Flyer 70382
        │
        ├── page 1
        ├── page 2
        ├── …
        └── page 15
```

Mesmo que inicialmente só: Flyer ID + URL + endpoint → sucesso.

---

# 49. Estratégia de fallback

Ordem:

```text
1. Network
       ↓
2. JSON responses
       ↓
3. DOM
       ↓
4. Links
       ↓
5. Imagens
       ↓
6. Interação com visualizador
```

**Não** começar clicando cegamente.

---

# 50. Princípio importante

Browser = ferramenta de **descoberta**, não necessariamente scraper definitivo.

```text
Playwright
    ↓
descobrir endpoint
    ↓
identificar estrutura
    ↓
HTTP scraper (quando possível)
```

Depois de entender a API, preferir HTTP ao Chromium em cada execução.

---

# 51. Respeito ao site

* concorrência baixa (`BROWSER_CONCURRENCY=1`);
* respeitar timeouts;
* evitar requests desnecessários;
* **não** burlar CAPTCHA;
* **não** contornar autenticação;
* **não** quebrar mecanismos de segurança;
* armazenar só o necessário para o Cestou.

---

# 52. Definition of Done

### Browser

- [ ] Playwright instalado
- [ ] Chromium funcionando (local + Docker)
- [ ] BrowserManager
- [ ] ContextManager
- [ ] Headless / debug mode

### São Luiz

- [ ] `/loja/{id}/encartes`
- [ ] Store 355 funcionando
- [ ] JavaScript carregando
- [ ] Network monitor
- [ ] DOM parser
- [ ] Console monitor

### Discovery

- [ ] Detectar requests relevantes
- [ ] Detectar JSON
- [ ] Detectar imagens
- [ ] Detectar PDFs
- [ ] Detectar possíveis flyers / IDs
- [ ] Deduplicar candidates

### Convex

- [ ] `storeCandidates` (reuso 013)
- [ ] `flyerDiscoveries` (+ `discoverySource`)
- [ ] Persistência + idempotência + `lastSeenAt`

### Debug

- [ ] Screenshot / HTML opcional
- [ ] Logs + estatísticas

---

# 53. Resultado final desta SPEC

```text
São Luiz
    │
    ▼
/loja/355/encartes
    │
    ▼
Playwright
    │
    ├── DOM
    ├── Network
    ├── JSON
    └── Images
    │
    ▼
Flyer Discovery
    │
    ▼
Convex
```

Somente depois:

```text
Flyer Discovery
      ↓
Download das páginas
      ↓
Convex Storage
      ↓
MiMo-V2.5
      ↓
Extração dos produtos
      ↓
Validação
      ↓
Dashboard
```

---

# 54. Fora de escopo

* Download de imagens/PDF
* MiMo / Tesseract / OCR
* Extração de ofertas
* Validação de preços
* Cadastro completo de produtos
* Bypass de CAPTCHA / anti-bot
* Brute-force de milhares de store IDs (usar SPEC 013 + candidatos `active`)
