# Inventário de remoção do Convex

> Estado: mapeamento concluído; nenhuma remoção foi executada neste documento.
>
> Destino aprovado: Fastify + Prisma + PostgreSQL + pg-boss + SSE, com arquivos em volume local e serviços em Docker Compose. A migração abrange todo o projeto, inclusive o app cliente e a autenticação atualmente provida pelo Convex.

## Objetivo e regra de corte

O Convex não deve ser apagado até que cada capacidade abaixo tenha uma substituição funcional, testada e em uso. A exclusão final inclui código, SDKs, tipos gerados, configuração, variáveis de ambiente, documentação e dependências de lockfile.

O primeiro marco de entrega prioriza **scraper e admin**. O app cliente entra no inventário porque a solicitação é remover o Convex por completo, mas sua migração deve acontecer depois de o novo backend estar estável.

## Superfícies atuais do Convex

| Capacidade | Implementação atual | Substituição alvo |
| --- | --- | --- |
| Banco e modelo de dados | `back/convex/schema.ts` | `back/prisma/schema.prisma` + migrations PostgreSQL |
| API de leitura e escrita | módulos em `back/convex/*.ts` | rotas Fastify, serviços e repositórios Prisma |
| Cliente reativo | `convex/react` no admin e app cliente | cliente HTTP tipado; SSE para eventos de execução e invalidação/polling para listas |
| Cliente do scraper | `ConvexHttpClient` em `back/scraper/src/flyers/core/flyer-storage.ts` | cliente HTTP interno do Fastify ou pacote compartilhado de serviços |
| Jobs e cron | `back/convex/crons.ts` e mutações internas | workers pg-boss, schedules e filas nomeadas |
| Arquivos | Convex Storage, `generateUploadUrl()` e `getUrl()` | volume Docker `storage-data` e rota Fastify autenticada de download/upload |
| Auth de clientes | `@convex-dev/auth`, tabelas `authTables` e `getAuthUserId` | autenticação própria no Fastify; admin master local no primeiro marco e auth de cliente na migração do app |
| IDs e relações | `Id<T>` / `_id` do Convex | UUIDs PostgreSQL e chaves estrangeiras Prisma |

## Dados a migrar

O schema atual define 22 tabelas de domínio, além das tabelas internas de autenticação injetadas por `authTables`.

### Operação de redes, encartes e extração

| Tabela Convex | Entidade Prisma | Relações e índices que precisam ser preservados |
| --- | --- | --- |
| `supermarkets` | `Supermarket` | `slug` único; rede possui lojas, fontes e encartes |
| `stores` | `Store` | FK para rede; unicidade composta rede + `slug` e rede + `externalId` |
| `flyerSources` | `FlyerSource` | FK para rede e fluxo; fontes ativas por rede |
| `flyerSourceStores` | `FlyerSourceStore` | tabela de junção fonte–loja; unicidade fonte + loja |
| `flyers` | `Flyer` | FK para rede/fonte; índices por status, validade, hash, identidade e ID externo |
| `flyerPages` | `FlyerPage` | FK para encarte; unicidade encarte + número de página; caminho local substitui `storageId` |
| `offers` | `Offer` | FK para encarte/rede/marca/produto canônico; filtros por validação, elegibilidade e produto |
| `offerEligibilityHistory` | `OfferEligibilityHistory` | histórico imutável por oferta |
| `flyerExtractions` | `FlyerExtraction` | FK para encarte/página; índice página + modelo + versão de prompt |
| `flyerErrors` | `FlyerError` | FK opcional para encarte e obrigatória para rede; filtros por estágio/status/data |
| `scraperFlows` | `ScraperFlow` | FK para rede/loja; estado, agenda e próxima execução |
| `scraperSteps` | `ScraperStep` | FK para fluxo; unicidade fluxo + ordem |
| `scraperRuns` | `ScraperRun` | FK para fluxo; índices por fluxo e início; eventos SSE associados |
| `scraperSetupEvents` | `ScraperSetupEvent` | FK para fluxo; ordem cronológica |

### Catálogo e histórico de preço

| Tabela Convex | Entidade Prisma | Relações e índices que precisam ser preservados |
| --- | --- | --- |
| `brands` | `Brand` | `slug` e nome pesquisáveis; aliases |
| `canonicalProducts` | `CanonicalProduct` | FK opcional para marca; `slug`, `matchKey` e marca |
| `priceHistory` | `PriceHistory` | FK para produto canônico, rede e oferta; índice produto + rede |

### App cliente e conta

| Tabela Convex | Entidade Prisma | Observação |
| --- | --- | --- |
| `locations` | `Location` | depende da futura tabela `User` |
| `favoriteStores` | `FavoriteStore` | junção usuário–loja; unicidade usuário + loja |
| `favoriteProducts` | `FavoriteProduct` | junção usuário–produto; unicidade usuário + produto |
| `shoppingLists` | `ShoppingList` | FK de usuário e local opcional |
| `shoppingListItems` | `ShoppingListItem` | FK da lista; oferta/produto canônico opcionais |
| `users` e tabelas de `authTables` | `User`, `Account`, `Session`, `VerificationToken` ou modelo de auth equivalente | será escolhido no marco de migração do app cliente |

## Módulos de função e destino

| Módulo atual | Responsabilidade | Destino |
| --- | --- | --- |
| `auth.ts`, `auth.config.ts`, `clientAuth.ts` | login e usuário autenticado | módulo de auth Fastify; admin master primeiro, usuários de cliente depois |
| `supermarkets.ts`, `stores.ts`, `flyerSources.ts` | CRUD de redes, lojas e fontes | rotas `/admin/supermarkets`, `/stores`, `/flyer-sources` + serviços Prisma |
| `flyers.ts`, `flyerPages.ts`, `flyerExtractions.ts`, `flyerErrors.ts` | ciclo de encarte, páginas, extração, erros e retenção | rotas de encartes + serviços de storage + worker pg-boss |
| `scraperFlows.ts`, `scraperSteps.ts`, `scraperRuns.ts`, `scraperSetupEvents.ts` | configuração, execução e acompanhamento do scraper | API de fluxos/runs; worker e SSE em `/scraper-runs/:id/events` |
| `normalization.ts`, `autoValidation.ts`, `offerEligibility.ts` | normalização e validação de ofertas | serviços transacionais e jobs de normalização/validação |
| `offers.ts`, `brands.ts`, `catalog.ts`, `dashboard.ts` | catálogo, busca, séries, comparativos e dashboards | queries Prisma/SQL com paginação, agregações e índices no banco |
| `clientLocation.ts`, `clientFavorites.ts`, `clientLists.ts`, `clientOffers.ts`, `clientStores.ts`, `clientLib.ts` | funções do app cliente | API pública autenticada, migrada após admin/scraper |
| `crons.ts`, `flyersInternal.ts` | ciclo automático/expiração de encartes | schedules e workers pg-boss |
| `http.ts` | router HTTP Convex | rotas Fastify correspondentes |
| `clearData.ts` | limpeza operacional | comando administrativo protegido, exclusivo de ambiente local |
| `flyerEdition.ts` | comparação de edição de encarte | utilitário TypeScript compartilhado; não depende de Convex |

## Consumidores que precisam ser convertidos

### Scraper

- `back/scraper/src/flyers/core/flyer-storage.ts` concentra 35 chamadas de query/mutation e upload de arquivo. Deve ser substituído por um `ApiClient` HTTP ou por serviços compartilhados, sem importações `convex/browser` e `convex/server`.
- `back/scraper/src/flyers/core/flyer-config.ts` troca `CONVEX_URL` por `API_URL`.
- Jobs de download, extração, reextração e scheduler deixam de chamar o Convex e passam a enfileirar/consumir jobs pg-boss.

### Admin Next.js

- `front-admin/src/components/ConvexClientProvider.tsx` deve ser removido e sua inclusão em layout substituída por um provider HTTP/SSE quando necessário.
- 28 arquivos usam `useQuery`, `useMutation` ou `usePaginatedQuery` de `convex/react`; todos devem passar a usar um cliente REST tipado e cache de consulta compatível com React.
- As áreas atingidas são dashboard, redes/lojas, encartes, extração, ofertas, catálogo, marcas, preços, validação e fluxo de scraper.
- A listagem paginada de ofertas deve preservar cursor/paginação na API, sem carregar coleção inteira no navegador.
- Atualizações de um `ScraperRun` usarão SSE; demais listas serão revalidadas após mutações e/ou por polling de baixa frequência.

### App cliente Next.js

- `front-client/src/components/ConvexClientProvider.tsx`, `AuthGate.tsx`, `AuthForm.tsx` e `AppShell.tsx` dependem de Convex/Auth.
- As páginas `busca`, `encartes`, `favoritos`, `lista`, `mercados`, `onboarding` e inicial usam queries/mutações Convex.
- A migração exigirá nova autenticação de cliente, sessão HTTP e API pública para favoritos, localização, listas, busca e encartes. Ela deve ocorrer depois do corte de scraper/admin, mas antes de apagar o pacote Convex definitivamente.

## Arquivos, configuração e dependências a remover no corte final

### Código e configuração

- Diretório inteiro `back/convex/`, incluindo `_generated/`, `schema.ts`, `convex/tsconfig.json`, auth, crons e funções.
- `back/convex.json`.
- `ConvexClientProvider.tsx` em `front-admin` e `front-client`.
- Variáveis `CONVEX_URL`, `CONVEX_DEPLOYMENT`, `CONVEX_SITE_URL`, `NEXT_PUBLIC_CONVEX_URL`, `JWT_PRIVATE_KEY` e `JWKS` quando não forem reutilizadas por uma implementação de auth deliberadamente escolhida.
- Referências de setup e operação presentes em `back/README.md`, `front-admin/README.md`, `front-client/README.md`, `back/docs/` e documentos raiz em `docs/`.

### Pacotes

- `convex` em `back/package.json`, `back/scraper/package.json`, `front-admin/package.json` e `front-client/package.json`.
- `@convex-dev/auth` em `back/package.json` e `front-client/package.json`.
- Scripts `convex:dev` e `convex:deploy`.
- Entradas correspondentes nos quatro lockfiles, atualizadas com o gerenciador npm após a remoção dos pacotes.

## Comportamentos que não podem ser perdidos

1. Deduplicação de encartes por hash, identidade e ID externo.
2. Retenção/expiração de evidência de encarte e preservação do snapshot da oferta.
3. Extração idempotente de páginas e ofertas, com reprocessamento por página.
4. Normalização, associação a marca/produto canônico e histórico de preços.
5. Fluxos configuráveis do scraper, passos ordenados, execução, cancelamento, logs e recuperação de jobs parados.
6. Filtros, revisão e trilha de auditoria de validação/eligibilidade de ofertas.
7. Busca, comparação de mercados, séries históricas e painéis sem varreduras integrais no caminho crítico.
8. Upload e leitura de logos, PDFs e imagens de páginas em volume local.
9. Admin autenticado: criar o usuário master local a partir de segredo de ambiente, sem versionar senha.
10. Autorização e contas do app cliente quando seu marco de migração começar.

## Sequência segura de remoção

1. Criar Docker Compose, Postgres, Prisma e migrations sem desligar Convex.
2. Construir Fastify, autenticação de admin, storage local e pg-boss.
3. Migrar o scraper e seus jobs para a nova API/worker; validar importação e processamento de encartes.
4. Converter o admin para REST + SSE e validar todos os fluxos operacionais.
5. Migrar app cliente e a autenticação de usuários para o novo backend.
6. Executar carga de dados, reconciliação de contagens e testes de ponta a ponta.
7. Remover somente então código/configuração/pacotes Convex listados acima e atualizar a documentação.

## Critérios de conclusão da remoção

- `rg -i convex` não encontra importações, scripts, variáveis ou instruções operacionais fora deste inventário histórico.
- Admin e app cliente iniciam sem `NEXT_PUBLIC_CONVEX_URL`.
- Scraper processa um encarte completo usando Fastify, Postgres, pg-boss e o volume local.
- Admin recebe eventos SSE de uma execução e permite cancelar/revisar o resultado.
- Testes, typechecks e build dos serviços Docker passam sem dependências do Convex.
