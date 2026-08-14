# SPEC 017 — Visual Scope Selector & Context-Aware Discovery

**Projeto:** Cestou  
**Módulo:** Scraper Flow Builder — seleção visual de área + discovery restrito  
**Versão:** 1.0.0  
**Status:** Implementation Ready  
**Prioridade:** Alta  
**Dependências:** SPEC 015 (Flow Builder), SPEC 016 (Dashboard Browser Session), SPEC 010 (Flyer-First)  
**Nota de numeração:** Rascunho original usava SPEC 014; no repositório SPEC 014 já é São Luiz Browser Flyer Discovery. Esta SPEC é **017**.  
**Relação:** a 015/016 gravam cliques e rodam `discover-flyer` na **página inteira**. Esta SPEC adiciona **Discovery Scope**: o operador marca uma região no preview; o runner analisa **somente o DOM (e APIs de flyer) dessa região**.

---

# 1. Objetivo

Permitir que o usuário selecione visualmente uma área do site e associe essa área a uma ação de discovery (`Discover Flyers`).

O usuário deverá:

1. Abrir o site do supermercado (sessão Playwright no dashboard).
2. Navegar normalmente (UF, cidade, loja…).
3. Ativar o modo **Selecionar Área**.
4. Passar o mouse sobre uma seção (highlight).
5. Clicar para selecionar; opcionalmente **↑ container**.
6. Escolher a finalidade (**Discover Flyers** nesta entrega).
7. O Cestou **testa imediatamente** o discovery nessa área.
8. Confirmar e **salvar** no workflow.

Eliminar dependência de textos específicos:

* "Folhetos de ofertas"
* "Encartes"
* "Ofertas da semana"
* "Catálogo"

Cada rede usa nomes e HTML diferentes. O identificador é **seletor estável**, não o título.

---

# 2. Problema atual

`discover-flyer` analisa a página inteira (`document` + network harvest de qualquer JPEG ≥ 20 KB).

```text
Página
├── Produtos (GraphQL ProductsQuery)
├── Banners
├── Categorias
├── Imagens de SKU
├── Promoções
├── Thumbnails
└── Flyers   ← o que queremos
```

O discovery trata fotos de produto como encarte. No Atacadão (`/loja/fortaleza-vila-peri`) isso manda SKUs para MiMo.

Comportamento novo:

```text
Página
   │
   ▼
Área selecionada pelo usuário
   │
   ▼
Discover Flyers
   │
   ▼
Somente DOM dessa área (+ APIs de flyer)
```

Código hoje (a alterar):

| Peça | Arquivo | Comportamento atual |
|------|---------|---------------------|
| Scan DOM | `scraper/src/flyers/runner/flow-pipeline.ts` `scanDomFlyerCandidates` | `document.querySelectorAll("a, img")` + JPEG genérico |
| Network | `attachNetworkHarvester` | qualquer `image/*` ≥ 20 KB + JSON com chaves `images` |
| Persist | `persistDiscovered` | salva qualquer `pageUrls` |
| UI | `BrowserSessionPanel` | `+ Discover Flyer` sem região |
| Step type | Convex `scraperSteps.type` | sem `select-scope` |

---

# 3. Conceito — Discovery Scope

Um **scope** é a parte da página a analisar.

| Tipo | Uso |
|------|-----|
| `page` | legado — página inteira (default se não houver `select-scope`) |
| `element` | **desta SPEC** — um nó DOM resolvido por seletores |
| `section` | alias de `element` quando a tag é `section` / landmark |

Nesta entrega o principal é **`element`**.

---

# 4. Fluxo

```text
Dashboard
   │
   ▼
Abrir navegador
   │
   ▼
Navegar pelo site
   │
   ▼
Selecionar Área
   │
   ▼
Usuário seleciona seção
   │
   ▼
Cestou identifica elemento (+ âncora de container)
   │
   ▼
Usuário escolhe: Discover Flyers
   │
   ▼
Executar discovery (teste imediato)
   │
   ▼
Mostrar resultado
   │
   ▼
Confirmar
   │
   ▼
Salvar workflow
```

---

# 5. UI — Browser Builder

Em `/admin/scraper/[id]`, junto aos botões da sessão:

```text
[ Selecionar Área ]
```

Quando ativo:

```text
🔵 Modo de seleção ativo
Passe o mouse sobre uma área. Clique para selecionar.
```

Cliques no preview **não** gravam `click` de navegação nesse modo — só atualizam o candidato de scope.

Sair: **Cancelar seleção** ou confirmar.

---

# 6. Highlight

Hover no elemento sob o cursor (coordenadas do screenshot → `elementFromPoint`, depois **promote** — §7).

Overlay no Chromium **e** no preview (retângulo em coords da viewport, desenhado no JPEG ou um canvas por cima).

Opcional no overlay:

```text
SECTION
3 links · 6 images
```

---

# 7. Evitar elementos pequenos

Não deixar o primeiro clique cair em `img` / `span` / `svg` / `path` / `button` / `icon` se existir um container maior (`article`, `section`, `main`, `ul`, `[role=list]`, `div` com ≥ 2 links de flyer).

Clique numa imagem dentro de:

```html
<section>
  <article>
    <img>
  </article>
</section>
```

UI:

```text
Elemento selecionado: IMG

[ Usar este elemento ]
[ ↑ Selecionar container ]
```

Default sugerido: o **menor ancestral** que contém ≥ 2 candidatos a flyer **ou** um `section`/`article` wrapping a galeria.

---

# 8. Subir na árvore

```text
[ ↑ Selecionar container ]
```

Cadeia:

```text
IMG → ARTICLE → DIV → SECTION → MAIN
```

A cada nível, atualizar overlay + contagens (links, imagens, textos).

---

# 9. Informações da área

Após seleção:

```text
Área selecionada
Tag:      SECTION
Classes:  … (estáveis)
Links:    9
Imagens:  9
Textos:   12
```

`label` (texto visível truncado) só para o dashboard — **não** é o seletor.

---

# 10. Ações disponíveis

```text
O que deseja fazer?

[ Discover Flyers ]     ← implementar
[ Discover Stores ]     ← UI disabled / purpose reservado
[ Discover Products ]   ← reservado
[ Discover Offers ]     ← reservado
```

Nesta SPEC só **Discover Flyers**. As outras gravam `purpose` futuro sem runner.

---

# 11. Step `select-scope`

Novo `StepType`:

```ts
| "select-scope"
```

```json
{
  "type": "select-scope",
  "config": {
    "purpose": "flyer-discovery",
    "selectors": [
      "[data-section='flyers']",
      "section.offers-section",
      "main > section:nth-of-type(2)"
    ],
    "label": "Folhetos de ofertas",
    "metadata": {
      "tagName": "SECTION",
      "id": "",
      "className": "…",
      "textPreview": "Folhetos de ofertas Super Ofertas…",
      "childCount": 14,
      "linkCount": 9,
      "imageCount": 9
    }
  }
}
```

**Não** usar `value: "Folhetos de ofertas"` como identificador.

---

# 12. Seletores — prioridade

Gerar lista ordenada (dedupe, descartar classes utilitárias tipo Tailwind `w-full`, `mb-4`, `text-xl`):

1. `data-testid`
2. `data-*` específico (`data-section`, `data-flyer`, `data-component`)
3. `id` estável (não hash/css-module)
4. `name`
5. `aria-label` / `role`+nome
6. classes **estáveis** (não `css-xyz`, não utilities)
7. CSS path curto (`main > section:nth-of-type(n)`)
8. DOM path (`nth-child`) — último recurso

```json
{
  "selectors": [
    "[data-section='flyers']",
    "section.flyers-section",
    "main > section:nth-of-type(5)"
  ]
}
```

---

# 13. Texto é metadado

Proibido como chave de replay:

```json
{ "value": "Folhetos de ofertas" }
```

Permitido:

```json
{
  "label": "Folhetos de ofertas",
  "selectors": ["…"]
}
```

---

# 14. Snapshot (debug)

Guardar no `config.metadata` (não HTML completo):

```json
{
  "tagName": "section",
  "id": "",
  "className": "…",
  "textPreview": "…",
  "childCount": 14,
  "linkCount": 9,
  "imageCount": 9
}
```

HTML completo só se `BROWSER_SCOPE_SAVE_HTML=true` (debug, fora do default).

---

# 15. Discover Flyer context-aware

Antes:

```text
discover-flyer → document → varrer página
```

Novo:

```text
discover-flyer
    ↓
scopeStep (select-scope anterior com purpose flyer-discovery)
    ↓
resolver elemento (fallback de selectors)
    ↓
element.querySelectorAll(...)
    ↓
analisar somente esse nó
```

Ligação:

```json
{
  "type": "discover-flyer",
  "config": {
    "scope": "element"
  }
}
```

O runner usa o **último** `select-scope` com `purpose: "flyer-discovery"` **antes** deste step no mesmo flow. `scopeStepId` opcional se no futuro steps forem referenciáveis por id; nesta entrega a ordem no array basta (`order`).

Se não houver `select-scope` anterior: **não** voltar ao harvest JPEG da página. Falhar com `SCOPE_REQUIRED` **ou** modo `scope: "page"` explícito só para fluxos legados São Luiz (flag `config.scope: "page"`). Default novo: exigir scope.

Compatibilidade: fluxos já gravados sem `select-scope` → `scope: "page"` implícito **somente** se o step já existir; **novos** discovers gravados pelo builder sempre vêm depois de `select-scope`.

---

# 16. Relação dos steps

```text
Navigate
↓
Select UF / Cidade
↓
Open Store
↓
select-scope   (purpose: flyer-discovery)
↓
discover-flyer
↓
download-flyers
↓
extract-offers
```

---

# 17. Regras do Discover Flyer (dentro do scope)

Priorizar href/src:

* `/Flyer/?id=`
* `/flyer/`
* `/flip` `/flipbook`
* `.pdf`
* host `api-middleware-flyer-services`

Analisar só **dentro do elemento**:

* `a[href]`
* `img[src]` (candidato **só** se o ancestral `<a>` for flyer — §18)
* `iframe[src]`
* `object` / `embed`

---

# 18. Proibição de JPEG genérico

**Não** tratar automaticamente `.jpg` `.jpeg` `.png` `.webp` como flyer.

Imagem só entra se **todas**:

1. está **dentro** do scope;
2. **e** (está dentro de `<a href>` de flyer **ou** o `src` é thumbnail de API de flyer `/Flyer/thumbnail` **ou** o JSON do mesmo card tem `urlFinalDocument`).

---

# 19. Network Discovery

Network **não** vira lista de imagens da página.

Ignorar:

* `ProductGalleryQuery` / `ProductsQuery`
* CDN de SKU (`vtexassets` produto, `_next/image` de card de produto fora do scope)
* analytics

Priorizar:

* `api-middleware-flyer-services` (`/Store/{slug}`, `/Flyer/?id=`)
* flipbook / Mercadapp `/flipbooks`
* `application/pdf`

Se a API misturar produtos e flyers, filtrar por URL/payload (`flyers[]`, `urlFinalDocument`, `idThumbnail`).

O scope DOM **valida** candidatos de network: um PDF/API flyer pode ser aceito mesmo se o `<a>` do DOM for o mesmo `id`. Imagens de SKU da network **nunca** entram.

---

# 20. Teste imediato

Após **Discover Flyers** no modo seleção:

```text
Analisando área...
✓ Área encontrada
✓ DOM analisado
✓ Network (flyer APIs) analisada

Flyers encontrados: 9
```

Endpoint no worker: `POST /sessions/:id/probe-scope` (não persiste Convex até confirmar).

---

# 21. Resultado (cards)

```text
┌─────────────────────────────┐
│ Super Ofertas               │
│ 13/08 → 20/08               │
│ PDF / Flyer API             │
└─────────────────────────────┘
```

Campos: `title`, `validFrom`/`validUntil` se no DOM ou JSON, `kind` (`pdf` | `api` | `flipbook` | `image`).

---

# 22. Zero resultados

```text
Nenhum flyer encontrado.

• A área selecionada não contém flyers
• Conteúdo lazy / precisa scroll
• Flyer só na API — tente ↑ container
• Selecione outro container

[ Selecionar outra área ]
[ Reanalisar ]
```

---

# 23. Confirmar área

**[ Confirmar área ]** grava no flow (Convex `replace` dos steps de scope+discover, ou append se ainda não existirem).

Não disparar download/MiMo no teste imediato.

---

# 24. Editar Scope

Na lista de steps:

```text
5. Select Scope
   └── Flyer Discovery Area  (label)
   [ Editar ] [ Testar ] [ Remover ]
```

Editar: reabre sessão (ou usa a atual) → modo seleção → testar → salvar seletores novos.

---

# 25. Persistência Convex

Estender union `scraperSteps.type` e o `stepType` em `convex/scraperSteps.ts`:

```ts
v.literal("select-scope")
```

`config` continua `v.string()` (JSON). Sem tabela nova.

---

# 26. Fallback de seletores (runner)

```text
Selector 1 → hit?
  SIM → usar
  NÃO → Selector 2 → … → SCOPE_NOT_FOUND
```

Timeout: `BROWSER_TIMEOUT` existente.

---

# 27. Scope inválido

```json
{
  "ok": false,
  "error": "SCOPE_NOT_FOUND: não foi possível localizar a área configurada"
}
```

Dashboard: step `select-scope` em vermelho + mensagem. Não seguir para `discover-flyer`.

---

# 28. Validação antes do discovery

```text
Resolver scope
  → elemento visível?
  → bounding box área > mínimo (ex. 80×80 CSS px)
  → links+imagens+texto > 0
  → senão alerta (permitir forçar no teste; no run: warning no log, ainda tenta)
```

---

# 29. Restrição de escopo (hard)

**Proibido:**

```js
document.querySelectorAll("a[href], img")
```

**Obrigatório:**

```js
scopeEl.querySelectorAll("a[href], img, iframe, object, embed")
```

---

# 30. Network vs DOM

Network usa o scope só como **contexto** (ids/hrefs já vistos no DOM, ou endpoints de flyer). Não “todas as imagens da aba”.

---

# 31. Exemplo Atacadão

```text
nossas-lojas → CE → Fortaleza → loja
→ /loja/fortaleza-vila-peri
→ usuário marca o bloco da galeria de folhetos
→ Discover Flyers
```

HTML real (referência, **não** hard-code de texto):

```html
<h1>Folhetos de ofertas</h1>
<article>
  <a href="https://apigw.cloud.carrefour.com.br/api-middleware-flyer-services/api/v2/Flyer/?id=…"
     title="Super Ofertas">
    <img src="…/Flyer/thumbnail/?id=…" />
  </a>
</article>
```

API complementar (network allowlist):

`GET https://apigw.cloud.carrefour.com.br/api-middleware-flyer-services/api/v2/Store/{slug}`

```json
"flyers": [{
  "name": "Super Ofertas",
  "urlFinalDocument": "https://…/Flyer/?id=…",
  "urlFinalDocumentThumbnail": "https://…/Flyer/thumbnail/?id=…",
  "validity": { "initial": "…", "final": "…" }
}]
```

`urlFinalDocument` = arquivo do folheto (não thumbnail, não SKU).

O workflow **não** depende da string "Folhetos de ofertas".

---

# 32. Outro supermercado

Bloco “Ofertas da Semana” — o operador marca o container. Mesmos steps: `select-scope` → `discover-flyer`. Sem if por rede.

---

# 33. Sem título

Só `[flyer][flyer][flyer]` — o usuário seleciona o `ul`/`div` pai. Continua válido.

---

# 34. Compatibilidade Flow Builder (SPEC 015 / 016)

Tipos suportados:

```text
navigate, select, click, input, wait, scroll,
select-scope,
discover-store, discover-flyer, capture-network,
download-flyers, extract-offers
```

`+ Discover Flyer` no painel: se o modo seleção não estiver ativo, **entrar** em seleção primeiro (não gravar discover sem scope).

---

# 35. Logs

```text
[FLOW] Step 5: select-scope
[SCOPE] Resolving element
[SCOPE] Selector 1 matched
[SCOPE] Tag: SECTION
[SCOPE] Links: 9 Images: 9

[FLOW] Step 6: discover-flyer
[FLYER] Searching scoped DOM
[FLYER] Candidates: 9
[FLYER] Valid flyers: 9
```

Encaminhar para SSE `onLog` do run (não só stdout).

---

# 36. Métricas (no `scraperRuns.log` / step result)

* `scopeResolved` (bool)
* `scopeSelectorUsed` (índice ou string)
* `scopeElementsFound` (1)
* `flyerCandidates`
* `flyersAccepted`
* `flyersRejected`

Sem tabela nova.

---

# 37. Worker / preview — hover

Modo seleção: o dashboard envia `POST /sessions/:id/hover` `{ x, y }` (throttle ~100 ms). Worker devolve:

```json
{
  "tagName": "SECTION",
  "selectors": ["…"],
  "box": { "x": 0, "y": 0, "width": 800, "height": 400 },
  "linkCount": 9,
  "imageCount": 9,
  "ancestors": [{ "tagName": "MAIN", "…" }]
}
```

Click: `POST /sessions/:id/pick-scope` `{ x, y }` ou `{ ancestorIndex }`.

Probe: `POST /sessions/:id/probe-scope` `{ selectors, purpose }`.

Overlay: Playwright `page.evaluate` injeta um `div` fixo; screenshot já captura o highlight.

---

# 38. Arquivos a tocar (implementação)

| Área | Path |
|------|------|
| Tipos | `scraper/src/flyers/types/flows.ts` |
| Scan scoped | `scraper/src/flyers/runner/flow-pipeline.ts` |
| Steps | `scraper/src/flyers/runner/step-runner.ts` |
| Runner logs | `scraper/src/flyers/runner/flow-runner.ts` |
| Sessão | `scraper/src/flyers/session/session-manager.ts`, `session-server.ts` |
| Convex | `convex/schema.ts`, `convex/scraperSteps.ts` |
| UI | `front/src/components/admin/BrowserSessionPanel.tsx` |
| Client | `front/src/lib/browser-session.ts` |
| Allowlist hosts | `flyer-config` + `apigw.cloud.carrefour.com.br` |

---

# 39. Fora de escopo

* Discover Stores / Products / Offers (só `purpose` reservado)
* WebRTC / highlight pixel-perfect vs JPEG delay (aceitável o overlay no Chromium)
* Salvar innerHTML completo
* Adapter hard-coded `if atacadao`
* Download/MiMo no teste imediato

---

# 40. Definition of Done

**Seleção**

- [ ] Ativar modo de seleção
- [ ] Highlight no hover
- [ ] Selecionar elemento
- [ ] Subir para container pai
- [ ] Mostrar tag / counts
- [ ] Gerar múltiplos seletores (sem texto como chave)
- [ ] Salvar `select-scope` no Convex

**Discovery**

- [ ] `discover-flyer` resolve scope anterior
- [ ] Só `element.querySelectorAll`
- [ ] Sem JPEG genérico da página
- [ ] Detecta `/Flyer/?id=`, PDF, flipbook
- [ ] Network: Flyer API / PDF; ignora ProductsQuery

**UX**

- [ ] Teste imediato + cards
- [ ] Zero resultados com re-seleção
- [ ] Editar / testar / remover scope
- [ ] Erro `SCOPE_NOT_FOUND`

**Runner**

- [ ] Fallback de selectors
- [ ] Timeout
- [ ] Logs no console do run
- [ ] Fluxos novos exigem scope; legado `scope: "page"` só se já gravado assim

---

# 41. Resultado esperado

Operador:

```text
ABRIR SITE → NAVEGAR → SELECIONAR ÁREA
→ DISCOVER FLYERS → TESTAR → CONFIRMAR → SALVAR
```

Worker depois:

```text
Executar workflow
  → encontrar área
  → restringir DOM
  → discover flyers
  → validar candidatos
  → Convex (download + extract nos steps seguintes)
```
