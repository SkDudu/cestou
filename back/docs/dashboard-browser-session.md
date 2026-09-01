# SPEC 016 — Dashboard Browser Session (Remote Recorder)

**Projeto:** Cestou  
**Módulo:** Flow Builder — Sessão de Browser no Dashboard  
**Versão:** 1.0.0  
**Status:** Implementation Ready  
**Prioridade:** Alta  
**Dependências:** SPEC 015 (Scraper Flow Builder), SPEC 014 (Browser Engine)  
**Relação com SPEC 015:** a 015 entrega CRUD de fluxos + `flows:record` / `flows:run` via CLI. Esta SPEC fecha o gap: o usuário **grava e visualiza o navegador só pelo dashboard**, sem precisar digitar comandos no terminal.

---

# 1. Objetivo

Permitir que, na tela `/admin/scraper/[id]`, o usuário clique em **Abrir navegador** e:

1. um **worker local** suba Playwright (Chromium);
2. o dashboard receba **screenshots periódicos** (preview);
3. cliques / inputs / selects feitos **no site** (via proxy de interação no preview **ou** no Chromium headed + espelho) sejam **gravados** como steps do fluxo;
4. o usuário pare a gravação e **salve** os steps no Convex.

O frontend Next.js **não** executa Chromium. Quem executa é o worker.

---

# 2. Problema atual

Hoje o admin só mostra instruções:

```bash
npm run flows:record -- --flow=<id>
```

Isso força o operador a:

* sair do dashboard;
* abrir terminal;
* lembrar IDs;
* alternar janelas.

Para ensinar scrapers (Atacadão, São Luiz, etc.), o fluxo precisa ser **visual e no dashboard**.

---

# 3. Princípio

```text
Dashboard (Next.js)
        │
        │ HTTP / WebSocket
        ▼
Browser Session Worker (Node + Playwright)
        │
        ▼
Chromium
        │
        ├── screenshot stream → Dashboard preview
        ├── action events    → Dashboard step list
        └── save             → Convex scraperSteps
```

* **Dashboard** = UI + controle  
* **Worker** = Playwright  
* **Convex** = persistência do flow  

---

# 4. Escopo desta SPEC

Inclui:

* worker local de sessão;
* API de sessão (start / stop / click / type / screenshot);
* UI no Flow Builder: Abrir / Gravar / Parar / Salvar;
* preview por screenshots;
* gravação de ações → steps;
* TTL e cleanup de sessão;
* um modo de interação no preview (cliques no screenshot mapeados para coordenadas Playwright).

Não inclui (ainda):

* streaming de vídeo contínuo (WebRTC);
* worker remoto em cloud / multi-tenant SaaS;
* execução headless agendada (já coberto por `flows:run` / scheduler futuro);
* download / MiMo / ofertas.

---

# 5. Stack

| Camada | Tech |
|--------|------|
| Dashboard | Next.js + React |
| Sessão | Node.js + Playwright |
| Tempo real | WebSocket (preferido) ou HTTP long-poll + SSE |
| Persistência | Convex (`scraperFlows`, `scraperSteps`) |

Playwright **só** no worker.

---

# 6. Arquitetura detalhada

```text
┌─────────────────────────────────────────────┐
│  /admin/scraper/[flowId]                    │
│                                             │
│  [ Abrir navegador ]  [ ● Gravando ]        │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │ Preview         │  │ Steps ao vivo    │  │
│  │ (screenshot)    │  │ 1. navigate      │  │
│  │ click → coords  │  │ 2. click         │  │
│  └─────────────────┘  │ 3. select …      │  │
│                       └──────────────────┘  │
└──────────────────┬──────────────────────────┘
                   │ WS: start|stop|input|frame
                   ▼
┌─────────────────────────────────────────────┐
│  browser-session-worker (:8791)             │
│  ├── BrowserManager                         │
│  ├── SessionStore (Map sessionId → Page)    │
│  ├── ScreenshotTicker (2–5 fps)             │
│  └── ActionBridge (DOM inject + click map)  │
└──────────────────┬──────────────────────────┘
                   │ ConvexHttpClient
                   ▼
                Convex
```

---

# 7. Por que worker local (v1)

v1 assume o operador roda worker na **mesma máquina** (ou rede local) que usa o dashboard:

```bash
cd back
npm run flows:session-worker
```

Motivos:

* Chromium headed/debug fácil;
* sem auth multi-tenant;
* baixo custo;
* alinhado ao “ensinar scraper” em desenvolvimento.

v2 (fora desta SPEC) pode mover o worker para Docker/cloud com auth.

Config dashboard:

```env
NEXT_PUBLIC_BROWSER_SESSION_URL=http://127.0.0.1:8791
```

Se o worker estiver offline, o botão **Abrir navegador** mostra erro claro:

> Worker offline. Rode `npm run flows:session-worker` no back.

---

# 8. Estrutura de pastas

```text
back/scraper/src/flyers/
├── session/
│   ├── session-server.ts      # HTTP + WS entry
│   ├── session-manager.ts     # create/destroy sessions
│   ├── screenshot-loop.ts
│   ├── action-bridge.ts       # inject recorder + click-at
│   └── types.ts
│
└── jobs/
    └── flow-session-worker.ts

front-admin/src/
├── lib/browser-session.ts     # client WS/HTTP
└── app/admin/scraper/[id]/
    ├── page.tsx               # integrar painel
    └── BrowserSessionPanel.tsx
```

Reusar `BrowserManager` (SPEC 014/015) e `action-normalizer` (SPEC 015).

---

# 9. Modelo de Sessão

```ts
type BrowserSession = {
  sessionId: string;
  flowId: string;
  startUrl: string;
  status: "starting" | "ready" | "recording" | "stopping" | "closed" | "error";
  createdAt: number;
  lastActivityAt: number;
  viewport: { width: number; height: number };
  currentUrl: string;
  recording: boolean;
  actions: RecordedAction[];
  error?: string;
};
```

TTL padrão:

```env
BROWSER_SESSION_TTL_MS=600000   # 10 min idle
BROWSER_SESSION_MAX_MS=1800000  # 30 min hard cap
```

Ao expirar: `browser.close()` + notificar dashboard.

---

# 10. API do Worker

Base: `http://127.0.0.1:8791`

### HTTP

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/health` | `{ ok: true }` |
| POST | `/sessions` | cria sessão |
| GET | `/sessions/:id` | estado |
| POST | `/sessions/:id/stop` | encerra |
| POST | `/sessions/:id/record/start` | liga gravação |
| POST | `/sessions/:id/record/stop` | desliga (mantém browser) |
| POST | `/sessions/:id/actions` | click/type/scroll/navigate |
| POST | `/sessions/:id/save` | persiste steps no Convex |
| GET | `/sessions/:id/screenshot` | último JPEG (fallback) |

### WebSocket

`ws://127.0.0.1:8791/sessions/:id/ws`

Mensagens worker → dashboard:

```json
{ "type": "frame", "ts": 0, "width": 1280, "height": 720, "jpegBase64": "..." }
{ "type": "url", "url": "https://..." }
{ "type": "action", "action": { "kind": "click", "selectors": ["#x"], "description": "..." } }
{ "type": "status", "status": "recording" }
{ "type": "error", "message": "..." }
```

Mensagens dashboard → worker:

```json
{ "type": "click", "x": 120, "y": 340 }
{ "type": "type", "text": "Fortaleza" }
{ "type": "press", "key": "Enter" }
{ "type": "scroll", "dy": 400 }
{ "type": "navigate", "url": "https://..." }
{ "type": "record_start" }
{ "type": "record_stop" }
{ "type": "add_semantic", "step": "discover-flyer" }
{ "type": "save" }
{ "type": "ping" }
```

---

# 11. Criar sessão

`POST /sessions`

```json
{
  "flowId": "kd7...",
  "startUrl": "https://www.atacadao.com.br/institucional/nossas-lojas",
  "headless": false,
  "viewport": { "width": 1280, "height": 720 }
}
```

Resposta:

```json
{
  "sessionId": "sess_…",
  "wsUrl": "ws://127.0.0.1:8791/sessions/sess_…/ws",
  "status": "ready",
  "currentUrl": "https://..."
}
```

Fluxo interno:

```text
launch Chromium
  → newContext + page
  → goto(startUrl)
  → inject action-bridge
  → start screenshot loop
  → return sessionId
```

`headless: false` é o default (modals/selects pintam no preview).  
`BROWSER_SESSION_HEADLESS=true` se quiser só JPEG na UI, sem janela OS.

---

# 12. Preview por screenshots

v1: **JPEG periódico**, não vídeo.

```env
BROWSER_SESSION_FPS=2
BROWSER_SESSION_JPEG_QUALITY=60
BROWSER_SESSION_MAX_WIDTH=1280
```

Loop:

```text
every 1/FPS:
  page.screenshot({ type: "jpeg", quality })
  → WS frame
```

Dashboard renderiza `<img src="data:image/jpeg;base64,…" />` (ou `blob:`).

Se FPS cair, priorizar latência de ação sobre qualidade.

---

# 13. Interação no preview (click map)

Usuário clica no preview:

1. dashboard calcula `x,y` relativos ao viewport da imagem;
2. escala para coordenadas da página Playwright (`viewport`);
3. envia `{ type: "click", x, y }`;
4. worker: `page.mouse.click(x, y)`;
5. action-bridge captura o elemento sob o ponto (ou o click real) e emite `action`.

Para input:

* clique no campo;
* dashboard mostra prompt / campo de texto;
* envia `{ type: "type", text }` → `keyboard.type` / `locator.fill`.

Select:

* click abre native select **ou** worker detecta `<select>` e aplica `selectOption` via UI auxiliar no painel (“valor / {{city}}”).

---

# 14. Gravação de ações

Reusar normalizer SPEC 015:

* click → `click`
* change select → `select`
* input → `input`
* navigation → `navigate`

Regras:

* **não** gravar mousemove;
* dedupe cliques idênticos em &lt; 300ms;
* preferir `selectors[]` múltiplos (`data-testid`, `id`, `name`, …);
* tentar `semantic` (`SELECT_STATE`, `OPEN_FLYERS`, …).

Modo gravação:

* OFF: navega sem acumular steps (ainda envia frames);
* ON: cada ação relevante entra na lista ao vivo.

Botão **+ Discover Flyer** / **+ Discover Store** adiciona step semântico sem DOM.

---

# 15. Salvar no Convex

`POST /sessions/:id/save` ou WS `{ type: "save" }`:

1. normaliza `actions[]` → steps;
2. chama `scraperSteps.replaceAll` (já existe);
3. bump `version` do flow;
4. opcional: set `status: testing`;
5. responde `{ saved: true, steps: N }`.

Dashboard atualiza a lista de steps (Convex query reativa).

---

# 16. UI — BrowserSessionPanel

Em `/admin/scraper/[id]`, substituir o bloco “rode no terminal” por:

```text
┌──────────────────────────────────────────────────────────┐
│ Sessão                                                   │
│ ● Worker online          URL: https://…                  │
│                                                          │
│ [ Abrir navegador ] [ Iniciar gravação ] [ Parar ]       │
│ [ Salvar steps ] [ Fechar sessão ]                       │
│                                                          │
│ ┌──────── Preview ────────┐  ┌──── Steps ao vivo ────┐   │
│ │                         │  │ 1. navigate           │   │
│ │     (screenshot)        │  │ 2. click Encartes     │   │
│ │                         │  │ 3. discover-flyer     │   │
│ └─────────────────────────┘  └───────────────────────┘   │
│                                                          │
│ Variáveis: uf=[CE] city=[Fortaleza] storeId=[355]        │
└──────────────────────────────────────────────────────────┘
```

Estados do botão Abrir:

| Estado | UI |
|--------|-----|
| worker offline | disabled + mensagem |
| starting | spinner |
| ready | preview ativo |
| recording | badge vermelho “GRAVANDO” |
| error | toast + log |

---

# 17. Segurança (v1 local)

v1 **só** escuta `127.0.0.1` (não `0.0.0.0`).

```env
BROWSER_SESSION_HOST=127.0.0.1
BROWSER_SESSION_PORT=8791
BROWSER_SESSION_TOKEN=           # opcional; se set, exige header
```

Se `BROWSER_SESSION_TOKEN` definido:

```http
Authorization: Bearer <token>
```

Dashboard: `NEXT_PUBLIC_BROWSER_SESSION_TOKEN` **não** é ideal (expõe). Preferir:

* proxy Next.js Route Handler `/api/browser-session/*` que injeta o token server-side; **ou**
* token só em dev local sem commit.

Isolamento:

* 1 sessão por flowId (nova start fecha a anterior);
* max 2 sessões simultâneas no worker;
* sempre `close()` no stop/TTL.

**Não** burlar CAPTCHA / auth de terceiros.

---

# 18. CORS

Worker deve aceitar origem do Next (`http://localhost:3000`).

```env
BROWSER_SESSION_CORS_ORIGIN=http://localhost:3000
```

---

# 19. Scripts npm

```bash
# back/package.json
npm run flows:session-worker
```

Equivalente:

```bash
tsc && node --env-file=../.env dist/flyers/jobs/flow-session-worker.js
```

Manter CLI legado:

```bash
npm run flows:record -- --flow=<id>
```

como fallback offline (documentar “modo terminal”).

---

# 20. Configuração

```env
# Worker
BROWSER_SESSION_HOST=127.0.0.1
BROWSER_SESSION_PORT=8791
BROWSER_SESSION_FPS=2
BROWSER_SESSION_JPEG_QUALITY=60
BROWSER_SESSION_TTL_MS=600000
BROWSER_SESSION_MAX_MS=1800000
BROWSER_SESSION_CORS_ORIGIN=http://localhost:3000
BROWSER_SESSION_TOKEN=
BROWSER_HEADLESS=false

# Front
NEXT_PUBLIC_BROWSER_SESSION_URL=http://127.0.0.1:8791
```

---

# 21. Fluxo do usuário (Definition of Happy Path)

```text
1. npm run convex:dev
2. npm run flows:session-worker   # terminal A
3. npm run dev (front)            # terminal B
4. Abrir /admin/scraper/[id]
5. Clicar Abrir navegador
6. Ver preview + (opcional) janela Chromium
7. Iniciar gravação
8. Clicar/navegar no preview (ou no Chromium se headed+bridge)
9. Steps aparecem ao vivo
10. Salvar steps
11. Fechar sessão
12. flows:run / Testar (CLI ou botão futuro)
```

---

# 22. Gravação headed vs preview-only

### Modo A — Headed + bridge (recomendado v1)

* Chromium visível;
* usuário clica **na janela real**;
* inject DOM captura ações;
* dashboard só espelha screenshot + lista.

Mais confiável para selects nativos / hover complexos.

### Modo B — Preview click-map

* headless OK;
* todos os cliques no `<img>`;
* pior para menus hover / iframes.

v1 deve implementar **A + preview**.  
B como enhancement se headed indisponível (CI/Docker).

---

# 23. Iframes

Se o site usar iframe:

* v1: documentar limitação;
* tentar `frame.locator` no click-at se o ponto cair no iframe;
* não bloquear o resto do DoD.

---

# 24. Test Run pelo dashboard (opcional nesta SPEC)

Botão **Testar fluxo** pode:

* chamar worker `POST /runs` com `flowId` + `ctx`; **ou**
* apenas linkar ao comando CLI.

**Mínimo desta SPEC:** gravação via dashboard.  
Test run remoto = nice-to-have (marcar como extensão se tempo curto).

---

# 25. Observabilidade

Logs worker:

```text
[SESSION] created sess_… flow=…
[SESSION] frame fps=2
[SESSION] action click #encartes
[SESSION] saved 6 steps
[SESSION] closed idle TTL
```

Dashboard: status + último erro.

---

# 26. Idempotência / concorrência

* `start` com mesmo `flowId` → encerra sessão anterior;
* `save` substitui steps (`replaceAll`), não duplica;
* `stop` idempotente.

---

# 27. Definition of Done

### Worker

- [ ] `flows:session-worker` sobe em `127.0.0.1:8791`
- [ ] `/health`
- [ ] criar / stop sessão Playwright
- [ ] screenshot loop via WS
- [ ] record start/stop
- [ ] capturar click/input/select/navigation
- [ ] save → Convex `scraperSteps.replaceAll`
- [ ] TTL + hard cap + cleanup

### Dashboard

- [ ] painel Abrir / Gravar / Parar / Salvar / Fechar
- [ ] preview de screenshots
- [ ] lista de steps ao vivo
- [ ] mensagem clara se worker offline
- [ ] remover dependência exclusiva de “rode no terminal” (CLI fica como fallback)

### Integração

- [ ] gravar fluxo São Luiz `/loja/355/encartes` pelo dashboard
- [ ] gravar (ou tentar) Atacadão start URL pelo dashboard
- [ ] steps salvos editáveis na UI existente
- [ ] `flows:run` reproduz steps gravados

### Segurança

- [ ] bind localhost
- [ ] CORS restrito
- [ ] close browser sempre

---

# 28. Resultado esperado

```text
Dashboard
   │ Abrir navegador
   ▼
Worker local (Playwright)
   │ screenshots + ações
   ▼
Preview + Steps ao vivo
   │ Salvar
   ▼
Convex scraperSteps
   │
   ▼
flows:run (automático / futuro scheduler)
```

Operador **não precisa** mais do terminal para ensinar o scraper — só para subir o worker uma vez.

---

# 29. Fora de escopo

* WebRTC / vídeo 30fps
* Worker cloud multi-usuário
* Proxy Next obrigatório (pode ser follow-up de segurança)
* Pipeline download + MiMo
* Scheduler diário
* Bypass CAPTCHA

---

# 30. Ordem de implementação sugerida

1. Worker HTTP `/health` + `/sessions` + screenshot HTTP  
2. WS frames  
3. Record inject (headed)  
4. Save Convex  
5. BrowserSessionPanel no admin  
6. Click-map no preview (modo B)  
7. TTL / token / polish  

---

# 31. Critério de aceite (demo)

1. Worker rodando.  
2. Em `/admin/scraper/[id]`, Abrir navegador → preview atualiza.  
3. Iniciar gravação → clicar “Encartes” (ou navegar São Luiz) → step aparece.  
4. Salvar → refresh da página → steps persistidos.  
5. `npm run flows:run -- --flow=<id> --ctx.storeId=355` executa sem erro de selector óbvio no navigate inicial.
