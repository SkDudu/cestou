# Fase 3 — App cliente

**Projeto:** Cestou  
**Frente:** Conta, proximidade por filial e comparação canônica no `front-client`  
**Status:** Entregue  
**Última atualização:** 2026-09-03  
**Dependências:** Fase 2 (canônicos / clube) e Fase 2.1 (admin). Filiais com `lat`/`lng` (Fase 1).

Documento detalhado da Fase 3. Checklist resumido: [`roadmap.md`](./roadmap.md#fase-3--cliente).  
Spec de produto: [`docs/cliente-mvp.md`](../../../docs/cliente-mvp.md).

---

## Objetivo

O esqueleto do cliente (lista, busca textual, favorito de **rede**, sessão anônima) já existia. Esta fase fecha o produto consumidor:

1. Conta com e-mail e senha (identity no Convex, sem `userId` no cliente).
2. Região + GPS opcional; **filiais** próximas ordenadas por distância.
3. Busca e comparação da cesta pelo **produto canônico**, com preço público e clube.

```text
Cadastro
   ↓
Localização (+ GPS)
   ↓
Filiais próximas → favoritos
   ↓
Busca canônica → lista → comparar
   ↓
Encartes vigentes da região
```

---

## Checklist da fase

- [x] Cadastro (e-mail / senha)
- [x] Localização / endereço
- [x] Meus supermercados (filiais)
- [x] Lista de compras
- [x] Busca de produtos (canônico)
- [x] Comparação de preços
- [x] Ofertas / encartes próximos
- [x] Favoritos (filial + produto)

---

## Estado de partida

| Peça | Antes da 3 |
|------|------------|
| Auth | `sessionToken` no `localStorage`; `userId` enviado em toda query |
| Nearby | `supermarkets.city` / `state` |
| Favoritos | `favoriteStores.supermarketId` (rede) |
| Busca / compare | `tokensMatch` em nome bruto |
| Encartes | `listNearbyFlyers` no back, sem UI |

---

## Telas

| Rota | Papel |
|------|--------|
| `/entrar` `/cadastro` | Password (Convex Auth) |
| `/onboarding` | Cidade/UF + GPS opcional |
| `/` | Ofertas + encartes da região |
| `/busca` | Grupos canônicos, público vs clube |
| `/lista` `/lista/comparar` | Cesta e melhor mercado / split |
| `/mercados` | Filiais + distância + favorito |
| `/encartes` `/encartes/[id]` | Encartes vigentes |
| `/favoritos` | Produtos canônicos favoritos |

---

## Regras

- Só ofertas `validated` e vigentes.
- Comparação nos mercados das filiais favoritas; senão, todas as próximas.
- Preço por **rede**. Filial escolhe o destino. Flyer com `storeIds` restringe filiais.
- Mostrar preço público **e** clube. Ranking da cesta usa preço público.
- Sem Maps SDK, sem reverse-geocode, sem verificação de e-mail.

---

## Ordem

| # | Item |
|---|------|
| 1 | Convex Auth + identity nas `client*` |
| 2 | Nearby por filial + GPS + favoritar filial |
| 3 | Search / lista / compare canônico |
| 4 | Encartes na UI + favorito de produto |

---

## Fora de escopo

- Alertas, perfil de compra, IA (Fase 4)
- Clerk, mapa, custo de deslocamento, verificação de e-mail
- Dashboard lojista (Fase 5)

---

## Arquivos

```text
back/convex/auth.ts
back/convex/http.ts
back/convex/auth.config.ts
back/convex/client*.ts
front-client/src/app/entrar/
front-client/src/app/cadastro/
front-client/src/app/encartes/
front-client/src/app/favoritos/
```

---

## Referências

- [`roadmap.md`](./roadmap.md)
- [`fase-2-dados.md`](./fase-2-dados.md)
- [`../../../docs/cliente-mvp.md`](../../../docs/cliente-mvp.md)
