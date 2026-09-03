# SPEC — App Cliente Cestou (MVP)

**Status:** Fase 3  
**Versão:** 0.3.0  
**Tipo:** Product / Frontend Client  
**Relacionados:** `docs/mvp.md`, `front-admin/docs/dashboard-mvp.md`, `back/convex/schema.ts`

---

## 1. Posicionamento

Dois produtos, mesmo banco de ofertas:

| Produto | Pasta / UI | Função |
|---------|------------|--------|
| Admin | `front-admin/` → `/admin` | Monitora scrapers, valida ofertas |
| Cliente | `front-client/` | Ajuda pessoa comprar melhor |

Cliente **não** é dashboard. Consome dados que o pipeline flyer-first já gera.

North star:

> Qual a forma mais inteligente de fazer essa compra gastando menos?

**Otimizar custo da lista inteira** — não só menor preço por produto.

Preço unitário aparece na busca. Na lista, herói = melhor mercado único (+ split 2 mercados no P1).

---

## 2. Realidade do back (Fase 3)

Schema: redes, **filiais** (`stores` com lat/lng), flyers, ofertas validadas, **canônicos**, `priceHistory`, users (Convex Auth).

| Tem | Ainda não (Fase 4+) |
|-----|---------------------|
| Cadastro e-mail/senha | Alertas, perfil de compra |
| Location + GPS opcional | Mapa, custo de deslocamento |
| Favorito de **filial** | Verificação de e-mail |
| Lista + compare (canônico) | IA assistente |
| Preço público vs clube | |

**Implicação de produto:** compara o que está **em oferta válida na região**, não catálogo completo de prateleira. UI deve ser transparente sobre isso. Preço é da **rede**; a filial diz onde ir.

---

## 3. Pilares do MVP

```text
                 CESTOU CLIENTE
                       │
       ┌───────────────┼────────────────┐
       │               │                │
    🛒 COMPRAR      🔥 OFERTAS       🏪 MERCADOS
       │               │                │
    Lista           Busca            Região
    Comparar        Encartes         Favoritos
       │               │                │
       └───────────────┼────────────────┘
                       │
                 💰 ECONOMIZAR
                       │
              Melhor mercado único
              Split 2 mercados (P1)
```

**Fora do MVP:** IA assistente, alertas push, histórico fino “bom momento”, custo de deslocamento (km × combustível), multi-endereço avançado, gamificação de economia acumulada.

Esses entram depois dos pilares firmes.

---

## 4. Modelo de dados (cliente)

Não vincular User direto a Supermarket como fonte da verdade.

```text
User
 ├── Locations          ← fase 1: uma localização basta
 │     └── (Casa)
 └── FavoriteStores     ← overlay sobre mercados próximos

Supermarket             ← já existe (bandeira / cidade)
   ↑
Nearby (filtro por região)
   ↓
Offers / Flyers         ← já existem
   ↓
ShoppingList → ListItem → Compare
```

### Tabelas novas (Convex)

```ts
users {
  // auth Convex / identity
  createdAt, updatedAt
}

locations {
  userId
  label          // "Casa" | futuro: "Trabalho"
  // Fase 1 — texto / região
  city: string
  state: string
  neighborhood?: string
  addressText?: string
  // Fase 2 — GPS
  lat?: number
  lng?: number
  isDefault: boolean
  createdAt, updatedAt
}

favoriteStores {
  userId
  storeId          // filial
  createdAt
}

shoppingLists {
  userId
  name
  locationId?    // região usada na comparação
  createdAt, updatedAt
}

shoppingListItems {
  listId
  queryText
  offerId?
  canonicalProductId?
  quantity: number
  notes?: string
  createdAt, updatedAt
}
```

### Consumo do schema existente

- `supermarkets` — listar / filtrar por `city` + `state` (+ `active`)
- `flyers` — encartes vigentes (`validUntil`, status `processed`)
- `offers` — **somente** `validationStatus === "validated"` e dentro da validade do flyer/oferta

### Evolução (não neste SPEC)

- Custo km × combustível
- Alertas de preço (Fase 4)

---

## 5. Localização — fluxos

### Fase 1 (MVP)

Onboarding:

```text
👋 Bem-vindo ao Cestou

Para achar ofertas perto de você,
precisamos saber onde você compra.

[ Digitar cidade / bairro ]
[ Usar minha localização ]  ← opcional; pode mapear só city/state no início
```

Depois:

```text
📍 Fortaleza, CE — Aldeota

N supermercados encontrados

⭐ Meus mercados
  Atacadão
  São Luiz

Outros próximos
  Pão de Açúcar
  …
```

Usuário marca **⭐ Meus mercados**. Comparação da lista usa favoritos; se nenhum favorito, usa todos da região.

### Fase 2 (depois)

- GPS fino + distância em km
- Múltiplas locations (Casa / Trabalho)
- “Vale a pena?” com deslocamento

Modelo User → Location → Nearby → Favorites **não muda**.

---

## 6. Fluxos principais

### Core loop

```text
Definir região
    ↓
Buscar / ver ofertas
    ↓
Montar lista
    ↓
Comparar
    ↓
Escolher 1 mercado (ou split)
    ↓
Economizar → voltar
```

### Match de item (MVP honesto)

1. Usuário digita item (“arroz”, “café 500g”).
2. Sistema busca ofertas validadas (texto + marca + qtd quando houver).
3. Usuário confirma qual oferta / variante entra na lista **ou** sistema pega melhor match com confiança alta.
4. Sem produto canônico no dia 1 — escolha humana cobre ambiguidade.

### Comparação

Entrada: itens da lista + conjunto de supermercados (favoritos ∩ região, ou região).

Saída P0:

```text
🏆 Melhor opção (1 mercado)
Atacadão — R$ 169,80
Economia vs mais caro da região: R$ 17,60
```

Saída P1:

```text
💰 Melhor combinação (até 2 mercados)
Atacadão — 8 itens — R$ 112,40
São Luiz — 4 itens — R$ 48,20
Total R$ 160,60 | Economia R$ 26,80
```

Itens sem oferta em um mercado: marcar “indisponível no encarte” — não inventar preço.

---

## 7. Telas do MVP

### Onboarding localização

Cidade/bairro (obrigatório). GPS opcional.

### Home

```text
📍 Fortaleza, CE          [Alterar]

🔎 O que você procura?

🔥 Ofertas para você      ← ofertas validadas nos meus mercados / região
📰 Encartes perto de você
🛒 Minha lista
```

### Busca

```text
escova de dente

Escova Oral-B 3un
  Atacadão      R$ 14,90
  São Luiz      R$ 16,90
🏆 Mais barato: Atacadão

[ Adicionar à lista ]
```

### Encartes

```text
São Luiz     13→20 AGO    N ofertas
Atacadão     14→21 AGO    N ofertas

→ abrir lista pesquisável de ofertas do flyer (não só página a página)
```

### Lista

```text
Compras da semana
☐ Arroz …
☐ Feijão …
☐ Leite …

[ Comparar preços ]
```

### Resultado da comparação

Melhor mercado único (P0). Split 2 (P1). Sempre citar base: “com base em ofertas de encarte vigentes”.

### Meus mercados

Lista próximos + toggle favorito. Sem cadastro manual de mercado do zero.

---

## 8. Contratos Convex (cliente)

Separar do admin. Queries read-only para dados públicos de oferta; mutations só no domínio do user.

### Queries (propostas)

| Query | Função |
|-------|--------|
| `getMyDefaultLocation` | Location ativa do user |
| `listSupermarketsByRegion` | `city` + `state` (+ active) |
| `listMyFavoriteStores` | Favoritos |
| `listNearbyFlyers` | Encartes vigentes na região / favoritos |
| `searchOffers` | Texto + filtros (região, supermarketIds, só validated) |
| `getOffer` | Detalhe + supermarket + flyer |
| `listMyShoppingLists` / `getShoppingList` | Listas + items |
| `compareShoppingList` | Totais por mercado + (P1) split |

### Mutations (propostas)

| Mutation | Função |
|----------|--------|
| `upsertLocation` | Criar/atualizar região |
| `toggleFavoriteStore` | ⭐ |
| `createShoppingList` / `rename` / `delete` | Listas |
| `addListItem` / `removeListItem` / `updateListItem` | Itens |
| `attachOfferToItem` | Bind oferta escolhida |

Admin mutations (`validateOffer`, scraper, etc.) **nunca** expostas ao cliente.

### Regras de leitura

1. Só `offers.validationStatus === "validated"`.
2. Respeitar `validFrom` / `validUntil` (offer e/ou flyer).
3. Comparação limitada a supermercados da região do user (e favoritos quando existirem).
4. Não vazar `flyerErrors`, runs, flows, extractions cruas na UI cliente.

---

## 9. Priorização

| Pri | Entrega | Por quê |
|-----|---------|---------|
| P0 | Auth + Location (cidade/bairro) | Sem região, app inútil |
| P0 | Busca de ofertas validadas | Consome back atual |
| P0 | Encartes da região | Diferencial da infra flyer |
| P0 | Lista + comparar 1 mercado | Hipótese central |
| P1 | Meus mercados (favoritos) | Reduz ruído |
| P1 | Split até 2 mercados | Diferencial vs comparador |
| P2 | Favoritos de produto + alertas | Retenção |
| P2 | Histórico / “bom momento” | Exige normalização |
| P3 | Distância km + “vale a pena?” | Precisa lat/lng real |
| Depois | IA assistente de compra | Camada de interação, não fundação |

---

## 10. Critérios de pronto (MVP)

- [ ] User define região (cidade/estado no mínimo).
- [ ] Vê supermercados da região e pode favoritar.
- [ ] Busca oferta e vê preços por mercado.
- [ ] Vê encartes vigentes com ofertas pesquisáveis.
- [ ] Cria lista, adiciona itens, roda comparação.
- [ ] Resultado mostra **melhor mercado único** + total + economia relativa.
- [ ] Copy deixa claro: dados = encartes validados, não prateleira completa.
- [ ] Zero vazamento de telas/APIs de admin no fluxo cliente.

---

## 11. Fora do escopo deste SPEC

- Implementação do scraper / Flow Builder
- Dashboard admin (`front-admin/docs/dashboard-mvp.md`)
- Taxonomia completa de produtos canônicos
- Push notifications
- Mapa interativo
- Cálculo de custo de combustível / deslocamento
- Chat / LLM montando lista

---

## 12. Princípio de arquitetura

```text
User → Location → Nearby Stores → Favorite Stores → Prices/Offers → Shopping List → Optimize
```

Quando GPS, mapa ou multi-endereço chegarem, **não refazer** o produto — só enriquecer `locations` e o cálculo de Nearby.

---

## 13. Implementação

App: pasta `front-client/` (Next.js, porta **3001**).  
API: `back/convex/client*.ts` + Convex Auth (`auth.ts`, `http.ts`).  
Detalhe da fase: `back/docs/roadmap/fase-3-cliente.md`.  
Ver `front-client/README.md`.
)