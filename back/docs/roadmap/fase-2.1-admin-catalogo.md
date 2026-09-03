# Fase 2.1 — Admin: catálogo e preços

**Projeto:** Cestou  
**Frente:** UI operacional sobre o catálogo da Fase 2  
**Status:** Entregue  
**Última atualização:** 2026-09-03  
**Dependências:** Fase 2 concluída (`brands`, `canonicalProducts`, `priceHistory`, normalização pós-extração)

Documento detalhado da Fase 2.1. Checklist resumido: [`roadmap.md`](./roadmap.md#fase-21--admin-catálogo-e-preços).  
Backend da Fase 2: [`fase-2-dados.md`](./fase-2-dados.md).

---

## Objetivo

O backend da Fase 2 já grava marcas, produtos canônicos e histórico de preços. O admin ainda só mostra **ofertas brutas**. Esta fase entrega o fluxo de **confiança operacional** no `front-admin`: ver, comparar e corrigir o catálogo sem SQL.

Responder no admin:

1. Quais produtos canônicos existem e com que qualidade de match?
2. Em quais supermercados cada produto aparece e a que preço (público vs clube)?
3. Como o preço evoluiu no tempo por mercado?
4. Onde o matching falhou (sem marca, sem canônico, canônicos duplicados suspeitos)?

```text
Ofertas brutas          Catálogo Fase 2
      │                        │
      └──────────┬─────────────┘
                 ↓
         Admin 2.1 (UI)
                 ↓
    ┌────────────┼────────────┐
    ↓            ↓            ↓
 Marcas     Canônico      Comparador
              hub          + saúde
```

---

## Checklist da fase

- [x] Hub do produto canônico (preço vigente por mercado + histórico)
- [x] Lista de produtos canônicos (busca, marca, cobertura)
- [x] CRUD / merge de marcas
- [x] Comparador de preços entre supermercados
- [x] Saúde do catálogo (KPIs + filas de qualidade)
- [x] Queries Convex de agregação (`catalog.*`)
- [x] Links oferta ↔ canônico no fluxo atual de Ofertas

---

## Navegação (sidebar Catálogo)

| Rota | Papel |
|------|--------|
| `/admin/brands` | CRUD marcas + aliases + merge |
| `/admin/products` | Lista de canônicos (busca, marca, cobertura) |
| `/admin/products/[id]` | **Hub do produto** — coração do fluxo |
| `/admin/prices` | Comparador / ranking “quem está mais barato agora” |
| `/admin/catalog/health` | Saúde do matching (ops) |

Ofertas (`/admin/offers`) continuam como fila de revisão; linkam para o canônico quando existir.

---

## Telas e dados (MVP)

### 1. Hub do produto canônico (`/admin/products/[id]`)

- Identidade: nome canônico, marca, qtd/unidade, `matchKey`, slug  
- **Tabela preço vigente por supermercado** (último `priceHistory` ou oferta ativa): preço, clube, desconto %, validade, link da oferta  
- **Série temporal** (`priceHistory`): linha por mercado ao longo do tempo  
- Ofertas vinculadas (antes/depois da normalização)  
- Ações: merge canônico, trocar marca, desvincular oferta

### 2. Comparador entre supermercados (`/admin/prices`)

- Filtros: mercado A/B/C, marca, só vigentes, só clube  
- Ranking: produto → preço min / max / spread %  
- “Só num mercado” vs “em 2+ mercados” (cobertura de matching)

### 3. Marcas (`/admin/brands`)

- Lista + busca; detalhe com aliases e contagem de ofertas/canônicos  
- Merge (já existe mutation `brands.merge`)  
- Seed / revisão de marcas lixo da extração

### 4. Saúde do catálogo (`/admin/catalog/health`)

| Métrica | Por quê |
|---------|---------|
| % ofertas com `brandId` | qualidade da marca |
| % ofertas com `canonicalProductId` | matching |
| Canônicos com 1 só mercado | match fraco ou produto raro |
| Canônicos com N nomes-fonte muito diferentes | falso positivo |
| Ofertas sem marca / sem qtd / unidade inválida | fila de correção |
| Spread extremo (ex. >40%) no mesmo canônico | possível match errado |

---

## Análises (segunda leva, sem inventar schema)

Derivadas de `priceHistory` + `offers` + `supermarkets`:

- Tendência 7/30/90 dias por produto ou por mercado  
- Basket snapshot: “cesta fixa” (arroz, óleo, leite…) vs preço médio por rede  
- Inflação de encarte: variação mediana de preços renovados  
- Assimetria clube vs público por rede  
- Top marcas por volume de ofertas vigentes  

---

## Queries Convex a expor (ou enriquecer)

Já parcialmente: `brands.*`, `normalization.listCanonical`, `getCanonical`, `getPriceHistory`.

Faltam agregações tipadas, por exemplo:

- `catalog.getProductPriceBoard(canonicalId)` — preço vigente por `supermarketId`  
- `catalog.compareMarkets({ supermarketIds, brandId?, onlyActive? })`  
- `catalog.healthSummary()` — KPIs da tabela acima  
- `catalog.listProducts({ search, brandId, minMarkets? })` — lista com contagens

---

## Ordem recomendada

| # | Item | Impacto |
|---|------|---------|
| 1 | Hub do produto + board de preços + histórico | Crítico |
| 2 | Lista de canônicos + marcas | Alto |
| 3 | Comparador entre mercados | Alto |
| 4 | Saúde / filas de qualidade | Ops |
| 5 | Análises 7/30/90 + cesta | Nice-to-have |

---

## Critério de pronto

- Operador abre um canônico e vê preços lado a lado por supermercado  
- Vê histórico no tempo  
- Consegue corrigir marca / merge  
- Tem fila de “match suspeito” e “sem marca”

---

## Fora de escopo

- Dashboard lojista (Fase 5)  
- Alertas de usuário (Fase 4)  
- Mapa de filiais no preço  
- App cliente completo (Fase 3)  
- Mudanças no pipeline de extração (já coberto na Fase 2)

---

## Arquivos prováveis

```text
front-admin/src/app/admin/brands/
front-admin/src/app/admin/products/
front-admin/src/app/admin/prices/
front-admin/src/app/admin/catalog/health/
front-admin/src/components/admin/AdminSidebar.tsx
back/convex/catalog.ts                 # agregações (ou extensão de normalization/brands)
```

---

## Referências

- [`roadmap.md`](./roadmap.md) — visão geral e checklist  
- [`fase-2-dados.md`](./fase-2-dados.md) — backend da Fase 2  
- [`../enriquecimento-brand.md`](../enriquecimento-brand.md) — SPEC 007 marcas  
