# Fase 2 — Dados

**Projeto:** Cestou  
**Frente:** Normalização, catálogo e preços comparáveis  
**Status:** Planejamento  
**Última atualização:** 2026-09-03  
**Dependências:** Fase 1 concluída (pipeline flyer → ofertas no Convex)

Documento detalhado da Fase 2. Checklist resumido: [`roadmap.md`](./roadmap.md#fase-2--dados).

---

## Objetivo

Transformar **ofertas brutas de encarte** em **dados comparáveis entre supermercados**:

```text
Offer (São Luiz)          Offer (Assaí)
      │                         │
      └───────────┬─────────────┘
                  ↓
        Normalização + marca
                  ↓
          Produto canônico
                  ↓
       Preço por supermercado
                  ↓
         Histórico de preço
```

Exemplo alvo:

- Extração A: `Arroz Camil Tipo 1 5kg` · Camil · 5kg · R$ 24,99  
- Extração B: `ARROZ TIPO 1 CAMIL 5KG` · CAMIL · 5 KG · 24,99  

→ **um** produto canônico, **dois** preços por rede.

**Princípio:** pipeline determinístico (regras → dicionário → heurística → matching). IA só nos casos difíceis, depois.

---

## Estado atual (baseline)

| Peça | Status | Onde |
|------|--------|------|
| Ofertas extraídas | ✅ | `offers` — nome, marca, qtd, unidade, preço, elegibilidade |
| Normalização na extração | ⚠️ parcial | `back/scraper/src/flyers/extraction/text-normalizer.ts`, `offer-guards.ts` |
| Condição de preço (clube, cartão…) | ⚠️ parcial | `eligibility` + revisão humana no admin |
| Comparação no cliente | ⚠️ provisório | `clientOffers.searchOffers` — agrupa por string normalizada |
| Marcas / produto canônico / histórico | ❌ | Sem tabelas dedicadas no schema |
| SPECs legadas (adaptar) | 📄 | `back/docs/enriquecimento-brand.md`, `back/docs/determinisc-data-validation.md` |

O app cliente já “compara”, mas por **texto normalizado**, não por produto canônico. Serve para demo; não escala.

---

## Checklist da fase

- [ ] Normalização de produtos  
- [ ] Marcas  
- [ ] Produtos canônicos  
- [ ] Matching entre supermercados  
- [ ] Preços  
- [ ] Histórico de preços  
- [ ] Programa de fidelidade / cartão  
- [ ] Validação (ops + regras de qualidade)  

---

## Etapas de implementação

### Etapa 1 — Normalização de produtos

**Por quê:** base de tudo; cada mercado grava texto diferente.

**Entregas:**

- Reutilizar `text-normalizer.ts` como módulo compartilhado (scraper + Convex).
- Campos normalizados por oferta (denormalizados em `offers` ou tabela auxiliar):
  - `normalizedName`
  - `normalizedBrand`
  - `quantityValue` (numérico quando possível)
  - `unitNormalized` (`kg`, `g`, `l`, `ml`, `un`, …)
- Job pós-extração ou pós-validação para ofertas `pending`.
- Admin: exibir “antes / depois” na revisão de ofertas.

**Critério de pronto:** ofertas com campos limpos e consistentes, sem produto canônico ainda.

---

### Etapa 2 — Marcas

**Por quê:** matching sem marca é frágil.

**Entregas:**

- Schema: `brands`, `brandAliases` (adaptar SPEC 007 — `enriquecimento-brand.md`).
- Pipeline de enriquecimento:
  1. Usar `brand` do MiMo quando existir  
  2. Extrair do nome via dicionário  
  3. Heurísticas + fila de revisão  
- Seed inicial: ~50–100 marcas frequentes em Fortaleza.
- Admin: CRUD de marcas, merge de aliases.

**Critério de pronto:** taxa alta de ofertas com marca; base estável para matching.

---

### Etapa 3 — Produto canônico + matching

**Por quê:** unir variações de texto da mesma oferta real.

**Entregas:**

- Schema: `canonicalProducts` (`canonicalName`, `brandId`, `quantity`, `unit`, `category?`).
- Campo `offers.canonicalProductId` (opcional até match).
- Matching determinístico:
  ```text
  normalizedName + brandId + quantity + unit → score → match ou criar novo
  ```
- Admin: fila “sem match” / “match suspeito”.

**Critério de pronto:** mesma oferta lógica agrupada entre mercados.

---

### Etapa 4 — Preços agregados

**Por quê:** comparação real no app.

**Entregas:**

- Query por `canonicalProductId`: preço vigente por `supermarketId`.
- Substituir agrupamento por string em `clientOffers`.
- Respeitar elegibilidade: preço “todos” vs “clube” separados na comparação.

**Critério de pronto:** ex. “Arroz Camil 5kg — São Luiz R$ 24,99 · Assaí R$ 26,90”.

---

### Etapa 5 — Histórico de preços

**Por quê:** tendência, alertas e análise futura (ofertas preservadas após purge de flyer).

**Entregas:**

- Schema: `priceHistory` (append-only):
  - `canonicalProductId`, `supermarketId`, `price`, `validFrom`, `validUntil`, `offerId`
- Snapshot ao validar oferta (ou ao expirar encarte).
- Nunca sobrescrever — cada ciclo = nova linha.

**Critério de pronto:** série temporal consultável por produto/mercado.

---

### Etapa 6 — Programa de fidelidade / cartão

**Por quê:** roadmap exige preço clube **e** preço normal, nunca só o “bom”.

**Estado hoje:** `eligibility` + `conditions` detectam clube/cartão, mas não separam preços explicitamente.

**Entregas:**

- Campos explícitos (schema ou derivados):
  - `publicPrice`, `memberPrice`, `membershipName`, `requiresMembership`
- Melhorar extração MiMo/regras para “DE/POR” + “preço clube”.
- UI cliente: sempre mostrar contexto (“R$ 29,99 no clube · R$ 34,99 normal”).

**Referência roadmap:** seção “Programa de desconto / cartão” em [`roadmap.md`](./roadmap.md).

---

### Etapa 7 — Validação automática (ops)

**Por quê:** escala; hoje a maior parte fica `pending` até revisão humana.

**Entregas:**

- Motor de regras (adaptar SPEC 006 — `determinisc-data-validation.md` para flyer/ofertas):
  - preço > 0, nome não vazio, unidade válida, desconto coerente, etc.
- Resultados: `validated` / `suspicious` / `rejected` automático.
- Admin: fila focada em `suspicious` + amostragem QA.

**Critério de pronto:** maioria das ofertas óbvias validadas sem humano.

---

## Ordem recomendada

| # | Item | Depende de | Impacto |
|---|------|------------|---------|
| 1 | Normalização | — | Alto |
| 2 | Marcas + dicionário | Normalização | Alto |
| 3 | Produto canônico | Marcas | Crítico |
| 4 | Matching cross-mercado | Canônico | Crítico |
| 5 | Preços agregados | Matching | Cliente |
| 6 | Histórico | Preços validados | Alertas / analytics |
| 7 | Clube/cartão explícito | Elegibilidade atual | Confiança |
| 8 | Validação automática | Normalização | Ops |

**Próximo passo sugerido:** Etapas 1 + 2 juntas (normalização + marcas).

---

## Fora de escopo (Fase 2)

- Taxonomia de queries / scraper de catálogo completo (`taxonomia-queries.md`) — estratégia **flyer-first**.
- Matching semântico com IA em massa.
- Categorias profundas de produto (nice-to-have; marca + qtd + unidade bastam no MVP).
- App cliente completo — Fase 3.

---

## Arquivos e módulos prováveis

```text
back/convex/schema.ts              # brands, brandAliases, canonicalProducts, priceHistory
back/convex/offers.ts              # campos normalizados, link canônico
back/convex/catalog/               # ou arquivos planos: brands.ts, canonicalProducts.ts
back/scraper/src/flyers/extraction/text-normalizer.ts  # compartilhar lógica
front-admin/                       # filas marca, canônico, validação automática
front-client/convex/clientOffers.ts  # comparar por canonicalProductId
```

---

## Referências

- [`roadmap.md`](./roadmap.md) — visão geral e checklist  
- [`../enriquecimento-brand.md`](../enriquecimento-brand.md) — SPEC 007 marcas  
- [`../determinisc-data-validation.md`](../determinisc-data-validation.md) — SPEC 006 validação  
- [`../flyer-first-offers-pipeline.md`](../flyer-first-offers-pipeline.md) — pipeline de ofertas  
