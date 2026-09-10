# Fastify, Prisma e PostgreSQL — Design de Migração

## Objetivo

Substituir integralmente Convex por um backend TypeScript local baseado em Fastify, Prisma e PostgreSQL. O sistema usará pg-boss para jobs e agendamentos, SSE para atualizações ao vivo e um volume Docker local para arquivos. O primeiro marco migra scraper e admin; o app cliente migra para a mesma API antes do corte final que remove Convex do repositório.

## Escopo

Incluído:

- API Fastify, Prisma, PostgreSQL e pg-boss em Docker Compose para desenvolvimento local.
- Storage local compartilhado entre API e worker.
- Autenticação de administrador master local, sessão em cookie e autorização por papel.
- Migração do scraper e do admin de Convex para REST/SSE.
- Migração posterior do app cliente e de sua autenticação para permitir remoção completa do Convex.
- Schema relacional, migrations, seed, importação/reconciliação de dados e documentação operacional.

Excluído do primeiro marco:

- Hospedagem/produção, storage em cloud e distribuição de arquivos por CDN.
- Registro público de administradores ou múltiplos papéis administrativos.
- WebSocket; SSE cobre o requisito de atualização ao vivo.

## Princípios

1. PostgreSQL é a fonte única de verdade para domínio, jobs e eventos.
2. O admin não executa trabalho longo: ele cria comandos e acompanha execução por SSE.
3. Escritas do scraper são idempotentes e transacionais.
4. Arquivos são armazenados fora do banco, em caminho relativo dentro de volume Docker.
5. Senhas e URLs com segredo não são versionadas, registradas nem incluídas em respostas.
6. Convex só é removido quando todos os seus consumidores estiverem usando o novo backend.

## Topologia local

```text
front-admin (Next.js :3000) ── REST/SSE ──┐
front-client (Next.js :3001) ─ REST ──────┼── api (Fastify :4000)
scraper / worker ─────────────────────────┘          │
                                                       │ Prisma
                                                postgres (:5432)
                                                       │
                                                 pg-boss schema

api + worker ───────────── volume `storage-data` ──── arquivos locais
```

Docker Compose executa `postgres`, `api` e `worker`. O admin e o app cliente podem começar fora do Compose, usando desenvolvimento do Next.js, e passam a ser conteinerizados em etapa posterior se desejado. API e worker compartilham a mesma imagem de backend com comandos distintos e o volume `storage-data`.

## Estrutura de backend

```text
back/
  api/
    src/
      app.ts
      server.ts
      plugins/{prisma,auth,sse}.ts
      modules/{auth,admin,scraper,catalog,storage,client}/
      lib/{errors,ids,pagination}.ts
    test/
  worker/
    src/{worker,jobs,schedules}.ts
  prisma/
    schema.prisma
    migrations/
    seed.ts
  storage/
  Dockerfile
  docker-compose.yml
```

Cada módulo Fastify contém schemas de entrada/saída, rotas, serviço de domínio e repositório Prisma. O código de parsing, OCR, IA e normalização que não depende de Convex é preservado e chamado pelo worker.

## Modelo de dados

Prisma gera UUIDs como IDs primários. Relações usam chaves estrangeiras, `onDelete` explícito e índices compostos para as consultas operacionais.

### Identidade

- `User`: `id`, `email` único, `passwordHash`, `role`, timestamps.
- `Session`: `id`, `userId`, `tokenHash`, expiração, timestamps.
- Papéis iniciais: `ADMIN_MASTER` e `CLIENT`.

### Operação de encartes e scraper

- `Supermarket`, `Store`, `FlyerSource`, `FlyerSourceStore`.
- `Flyer`: status, datas de validade, URL externa, hash, identificador externo, caminho de arquivo e metadados de conteúdo.
- `FlyerPage`: caminho local e metadados por página; unicidade `flyerId + pageNumber`.
- `FlyerExtraction`, `FlyerError` e `OfferEligibilityHistory` preservam auditoria e falhas.
- `ScraperFlow`, `ScraperStep`, `ScraperRun`, `ScraperRunEvent` e `ScraperSetupEvent` preservam configuração, passos, execução e telemetria. `ScraperRunEvent` contém `runId`, sequência, tipo, payload JSON e data de criação; sua sequência é única por execução.

### Catálogo e cliente

- `Brand`, `CanonicalProduct`, `Offer` e `PriceHistory` mantêm normalização e comparação de preços.
- `Location`, `FavoriteStore`, `FavoriteProduct`, `ShoppingList` e `ShoppingListItem` migram quando o app cliente trocar de API.

### Índices obrigatórios

- slugs únicos de rede, loja e marca quando aplicável;
- `Store(supermarketId, slug)` e `Store(supermarketId, externalId)`;
- `Flyer(supermarketId, fileHash)`, `Flyer(supermarketId, sourceId, validFrom, validUntil)` e `Flyer(supermarketId, externalId)`;
- `FlyerPage(flyerId, pageNumber)`;
- `Offer(validationStatus)`, `Offer(supermarketId, validationStatus)`, `Offer(canonicalProductId)`, `Offer(brandId)` e filtros por validade;
- `PriceHistory(canonicalProductId, supermarketId, createdAt)`;
- `ScraperRun(flowId, startedAt)` e `ScraperStep(flowId, order)`.

Consultas de dashboard, catálogo, série histórica e comparativo devem usar agregações SQL/Prisma e paginação. É proibido carregar tabelas inteiras para filtrar em memória em caminhos de requisição.

## API e fluxos

### Convenções HTTP

- API prefixada por `/api/v1`.
- Respostas de lista usam `items`, `nextCursor` e `hasMore`.
- Erros usam `{ code, message, details? }` e status HTTP semântico.
- Inputs são validados com schemas TypeBox ou Zod antes de chamar serviços.
- Mutação bem-sucedida retorna o recurso alterado ou `204` quando não há corpo necessário.

### Admin e catálogo

- `/auth/login`, `/auth/logout`, `/auth/me` para sessão administrativa.
- `/admin/supermarkets`, `/admin/stores`, `/admin/flyer-sources` para CRUD operacional.
- `/admin/flyers`, `/admin/flyers/:id`, `/admin/flyers/:id/pages` e endpoints de status/validade/retenção.
- `/admin/offers`, `/admin/offers/:id`, `/admin/catalog/*`, `/admin/brands/*`, `/admin/dashboard/*` para revisão e análises.
- `/admin/scraper-flows`, `/admin/scraper-flows/:id/steps`, `/admin/scraper-runs` para configuração e execução.

O `front-admin` troca hooks Convex por um cliente HTTP tipado, com cache e invalidação por chave de consulta. A paginação da lista de ofertas é feita no servidor; não há equivalente a `collect()` no cliente.

### Execução de scraper

1. `POST /api/v1/admin/scraper-flows/:id/runs` valida acesso, cria `ScraperRun` com estado `running` e cria o job `scraper.run` na mesma transação lógica.
2. O worker pg-boss busca o job, processa descoberta, download, arquivo local, páginas, extração, ofertas, normalização e validação.
3. Em cada fronteira, o worker atualiza `ScraperRun`, persiste um `ScraperRunEvent` e publica notificação de SSE.
4. Reexecuções usam chaves de idempotência e regras de hash/identidade de encarte para não duplicar dados.
5. Falhas usam tentativas com backoff; esgotadas as tentativas, o job vai para dead letter e o run é marcado `failed`.
6. Cancelamento atualiza o run para `cancelled`; o worker consulta o estado entre passos e encerra com segurança.

### SSE

- `GET /api/v1/admin/scraper-runs/:id/events` exige sessão administrativa.
- Eventos: `run.updated`, `step.started`, `step.completed`, `progress`, `run.completed`, `run.failed` e `run.cancelled`.
- O servidor envia `id` monotônico baseado na sequência de `ScraperRunEvent`; `Last-Event-ID` permite recuperar eventos após reconexão.
- O frontend consulta o run ao abrir/reconectar e atualiza apenas o estado relacionado à execução.
- SSE não é usado como comando; iniciar, cancelar e editar usam REST.

## Jobs e agendamento

pg-boss é conectado ao mesmo PostgreSQL, em schema dedicado. Filas iniciais:

- `scraper.run`
- `flyer.download`
- `flyer.extract`
- `offer.normalize`
- `offer.validate`
- `flyer.lifecycle`
- `storage.cleanup`

Schedules substituem crons Convex para ciclo de fontes, expiração/retenção e reprocessamento. Jobs devem conter somente IDs e parâmetros pequenos; arquivos e payloads grandes permanecem no volume/banco. Cada handler registra início, sucesso e falha em registros de domínio.

## Arquivos locais

- `STORAGE_ROOT=/data/storage` aponta para volume Docker compartilhado.
- Arquivos são gravados em diretórios determinísticos por UUID de encarte/página e extensão validada.
- O banco armazena caminho relativo, SHA-256, tamanho e MIME type; nunca caminho absoluto do host.
- Uploads verificam tipo, tamanho e hash antes de confirmar a associação no banco.
- Download ocorre por rota Fastify autenticada, com autorização de admin para operações internas.
- Retenção apaga o arquivo e limpa o caminho apenas quando a regra de domínio de expiração permitir; metadados e snapshot de oferta são preservados.

## Autenticação e autorização

- O seed lê `ADMIN_MASTER_EMAIL` e `ADMIN_SEED_PASSWORD` do ambiente local e cria/atualiza idempotentemente a conta master.
- Senhas usam Argon2id; o banco guarda apenas `passwordHash`.
- Login emite cookie de sessão `HttpOnly`, `SameSite=Lax`; `Secure` é habilitado fora de HTTP local.
- Sessões armazenam apenas token com hash, expiração e referência de usuário. Logout invalida a sessão.
- Plugin Fastify protege rotas `/admin`, SSE e rotas de storage privadas. Somente `ADMIN_MASTER` tem autorização nesta primeira fase.
- Worker usa URL interna de banco e não recebe cookie ou token de usuário.
- O app cliente recebe módulo de auth separado quando for migrado; não reutiliza privilégios administrativos.

## Docker e configuração local

`docker-compose.yml` define:

- `postgres`: PostgreSQL com healthcheck, volume `postgres-data` e porta publicada somente para desenvolvimento local.
- `api`: depende do healthcheck, executa migrations antes de iniciar e expõe a porta da API.
- `worker`: depende do healthcheck, executa o consumidor pg-boss e monta `storage-data`.

Variáveis mínimas:

- `DATABASE_URL`
- `API_PORT`
- `CORS_ORIGIN`
- `STORAGE_ROOT`
- `ADMIN_MASTER_EMAIL`
- `ADMIN_SEED_PASSWORD`
- credenciais/limites já necessários ao scraper e ao provedor de IA.

`.env` é ignorado pelo Git. `.env.example` contém valores locais inofensivos e não contém senha real.

## Migração e corte

1. Introduzir infraestrutura e schema Prisma sem remover Convex.
2. Migrar dados atuais para Postgres com importador idempotente e relatório de contagem.
3. Converter scraper e worker, validando um encarte de ponta a ponta.
4. Converter admin para REST/SSE e validar todos os fluxos administrativos.
5. Converter app cliente e suas contas/sessões para a nova API.
6. Executar reconciliação final, testes end-to-end e backup/export dos dados Convex necessários.
7. Apagar `back/convex/`, `convex.json`, SDKs, providers, scripts, variáveis e documentação Convex, conforme o inventário em `docs/convex-removal-inventory.md`.

## Testes e critérios de aceite

- Unitários: serviços, autorização, normalização, deduplicação, paths de storage e jobs.
- Integração: Prisma/Postgres, rotas Fastify, sessão, pg-boss e SSE com banco Docker local.
- E2E: login de admin, configuração de fluxo, início de run, recebimento SSE, cancelamento, extração, revisão e upload/download de arquivo.
- Carga: dashboard, lista de ofertas paginada, comparativo, série histórica e inserção em lote, reportando p50/p95 e volume de linhas transferidas.
- Corte: builds e typechecks passam sem pacotes/importações/variáveis Convex, e `rg -i convex` só encontra inventário histórico e documentos de migração deliberadamente preservados.
