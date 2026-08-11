# SPEC 001 — MVP do Comparador Inteligente de Supermercados

**Status:** Draft
**Versão:** 0.1.0
**Tipo:** Product / Architecture Specification

---

## 1. Visão do Produto

Criar um aplicativo mobile capaz de pesquisar produtos de supermercados, comparar preços e ajudar o usuário a montar uma lista de compras mais econômica.

O produto combina:

* Busca de produtos
* Comparação de preços
* Listas de compras
* Localização de supermercados
* Coleta automatizada de preços
* Histórico de preços
* Detecção de promoções
* IA para interpretação e organização dos produtos

O objetivo do MVP não é criar um marketplace.

O aplicativo será um **comparador inteligente de preços para compras de supermercado**.

---

# 2. Problema

Atualmente, para descobrir onde uma compra está mais barata, o usuário precisa:

1. Abrir diferentes aplicativos/sites.
2. Pesquisar os mesmos produtos várias vezes.
3. Comparar preços manualmente.
4. Descobrir se uma promoção realmente é boa.
5. Calcular qual supermercado oferece o menor valor para sua lista.
6. Repetir esse processo sempre que precisar fazer compras.

Isso gera fricção e dificulta encontrar a melhor combinação de preços.

---

# 3. Proposta

O usuário informa o que precisa comprar.

O sistema:

1. Identifica os produtos.
2. Busca os preços disponíveis.
3. Normaliza produtos equivalentes.
4. Compara os supermercados.
5. Calcula os melhores preços.
6. Mostra a economia potencial.

Exemplo:

```text
Minha lista

Arroz 5kg
Feijão 1kg
Café 500g
Leite 1L
Açúcar 1kg
```

Resultado:

```text
Melhor supermercado único

Mercado A
R$ 82,40

---

Melhor combinação

Mercado A
R$ 46,20

Mercado B
R$ 29,10

Total
R$ 75,30

Economia
R$ 7,10
```

---

# 4. Objetivo do MVP

Validar três hipóteses:

### Hipótese 1

Usuários querem comparar preços de supermercados em um único lugar.

### Hipótese 2

Usuários valorizam criar uma lista de compras e descobrir automaticamente onde ela fica mais barata.

### Hipótese 3

Dados coletados automaticamente podem gerar uma experiência útil mesmo antes de termos integração direta com todos os supermercados.

---

# 5. Escopo do MVP

## 5.1 Autenticação

O MVP deverá permitir:

* Criar conta
* Login
* Logout
* Recuperação de acesso

O usuário poderá utilizar:

* E-mail
* Senha

Autenticação social fica fora do MVP inicial.

---

# 6. Localização

O aplicativo deverá solicitar localização do usuário.

Objetivos:

* Encontrar supermercados próximos.
* Filtrar preços por região.
* Identificar mercados disponíveis para compra.

O usuário também poderá definir manualmente sua localização.

Exemplo:

```text
📍 Fortaleza, CE

Supermercados encontrados:

Mercado A
2,1 km

Mercado B
3,4 km

Mercado C
5,2 km
```

---

# 7. Produtos

Cada produto deverá possuir uma estrutura normalizada.

```ts
Product {
  id
  name
  brand
  category
  subcategory
  quantity
  unit
  barcode
  imageUrl
}
```

Exemplo:

```json
{
  "name": "Arroz Branco Tipo 1",
  "brand": "Tio João",
  "category": "Alimentos",
  "subcategory": "Arroz",
  "quantity": 5,
  "unit": "kg"
}
```

---

# 8. Produtos equivalentes

O sistema deverá conseguir identificar produtos semelhantes.

Exemplo:

```text
"Arroz Tio João Branco 5kg"

"Arroz Branco Tio João 5 KG"

"Tio João Arroz Tipo 1 Branco Pacote 5kg"
```

Devem ser associados ao mesmo produto normalizado quando houver confiança suficiente.

No MVP, essa normalização poderá inicialmente utilizar:

* regras
* limpeza de strings
* marca
* quantidade
* unidade
* similaridade textual

A utilização de LLM poderá ser adicionada posteriormente para casos ambíguos.

---

# 9. Preços

Cada preço deverá possuir:

```ts
ProductPrice {
  id
  productId
  supermarketId
  price
  originalPrice
  discount
  url
  collectedAt
  source
}
```

Exemplo:

```json
{
  "productId": "product_123",
  "supermarketId": "market_001",
  "price": 19.90,
  "originalPrice": 24.90,
  "discount": 20,
  "source": "scraper",
  "collectedAt": "2026-08-11T10:00:00"
}
```

---

# 10. Coleta de preços

O MVP deverá possuir uma camada independente de coleta.

Arquitetura:

```text
Scraper
   ↓
Raw Product Data
   ↓
Parser
   ↓
Normalizer
   ↓
Product Matching
   ↓
Database
```

Cada supermercado deverá possuir seu próprio adapter.

Exemplo:

```ts
interface SupermarketScraper {
  searchProducts(query: string): Promise<RawProduct[]>
}
```

Isso permitirá adicionar novos supermercados sem alterar o restante da aplicação.

---

# 11. Dados brutos

O sistema deverá preservar os dados coletados antes da normalização.

Exemplo:

```ts
RawProduct {
  id
  supermarketId
  externalId
  name
  price
  originalPrice
  url
  imageUrl
  rawData
  collectedAt
}
```

Isso permitirá:

* Reprocessar produtos.
* Melhorar algoritmos de matching.
* Auditar erros.
* Alterar o parser sem perder dados antigos.

---

# 12. Busca

O usuário deverá conseguir pesquisar:

```text
arroz
```

```text
café 500g
```

```text
leite integral
```

```text
coca cola 2l
```

A busca deverá retornar produtos relevantes.

Cada resultado deverá mostrar:

```text
Arroz Tio João 5kg

R$ 19,90
Mercado A

R$ 21,90
Mercado B

R$ 23,90
Mercado C
```

---

# 13. Comparação de preços

Ao abrir um produto, o usuário poderá visualizar:

```text
Arroz Tio João 5kg

Mercado A
R$ 19,90

Mercado B
R$ 21,90

Mercado C
R$ 23,90
```

O menor preço deverá ser destacado.

---

# 14. Lista de compras

O usuário poderá criar listas.

Exemplo:

```text
Minha compra

☐ Arroz 5kg
☐ Feijão 1kg
☐ Café 500g
☐ Leite 1L
```

Cada item deverá possuir:

```ts
ShoppingListItem {
  id
  listId
  productId
  quantity
  checked
}
```

---

# 15. Adicionar produtos à lista

O usuário poderá adicionar um produto:

### Pela busca

```text
Pesquisar → Arroz → Adicionar
```

### Pela página do produto

```text
Arroz Tio João 5kg

[Adicionar à lista]
```

---

# 16. Comparação da lista

O sistema deverá calcular:

### Mercado mais barato

```text
Mercado A

8 produtos
Total: R$ 97,80
```

### Outros mercados

```text
Mercado B
R$ 104,20

Mercado C
R$ 109,80
```

---

# 17. Otimização entre supermercados

O sistema também deverá calcular uma segunda estratégia:

> Comprar produtos diferentes em supermercados diferentes.

Exemplo:

```text
Arroz → Mercado A
Feijão → Mercado B
Café → Mercado A
Leite → Mercado C
```

Resultado:

```text
Total: R$ 91,20

Mercado único mais barato:
R$ 98,50

Economia:
R$ 7,30
```

O MVP deverá permitir configurar um limite:

```text
Máximo de supermercados: 1
Máximo de supermercados: 2
Máximo de supermercados: 3
```

---

# 18. Custo de deslocamento

O cálculo de múltiplos supermercados deverá inicialmente ignorar custo de combustível.

Porém, a arquitetura deverá permitir adicionar posteriormente:

```text
Preço dos produtos
+
Custo estimado de deslocamento
=
Custo real da compra
```

Isso evita que o sistema recomende visitar três supermercados diferentes para economizar R$ 2.

---

# 19. Histórico de preços

Cada coleta deverá gerar histórico.

Exemplo:

```text
Arroz Tio João 5kg

Hoje
R$ 19,90

7 dias atrás
R$ 21,90

30 dias atrás
R$ 24,90
```

O sistema deverá permitir posteriormente construir gráficos.

---

# 20. Detecção de promoções

Uma promoção não deverá ser definida somente porque o supermercado marcou um produto como "oferta".

O sistema deverá comparar:

* preço atual
* preço anterior
* preço médio
* menor preço histórico
* desconto informado pelo supermercado

Exemplo:

```text
Preço atual: R$ 9,99
Preço médio: R$ 14,50

🟢 Excelente oferta

31% abaixo do preço médio.
```

---

# 21. IA — MVP

A IA deverá ser utilizada de maneira controlada.

Não utilizar LLM para todas as operações.

A IA poderá atuar inicialmente em:

### Normalização

Interpretar nomes de produtos.

### Lista inteligente

Transformar linguagem natural em itens.

Exemplo:

```text
"preciso comprar coisas para fazer lasanha"
```

Resultado:

```text
☐ Massa para lasanha
☐ Molho de tomate
☐ Carne moída
☐ Queijo mussarela
☐ Presunto
☐ Creme de leite
```

A geração deverá solicitar confirmação antes de adicionar itens automaticamente.

---

# 22. Busca por linguagem natural

O usuário poderá escrever:

```text
"quero arroz barato"
```

```text
"onde encontro café 500g mais barato?"
```

```text
"quero fazer churrasco para 10 pessoas"
```

A IA deverá transformar a solicitação em filtros e produtos estruturados.

---

# 23. IA — Fora do MVP

As seguintes funcionalidades deverão ser preparadas para futuras versões:

* Recomendações personalizadas
* Previsão de preços
* Substituição inteligente de produtos
* Análise nutricional
* Lista automática baseada em histórico
* Detecção avançada de promoções
* Planejamento mensal
* Otimização considerando distância
* Recomendações baseadas no comportamento do usuário

---

# 24. Arquitetura

Stack inicial recomendada:

## Mobile

```text
React Native
Expo
TypeScript
Expo Router
```

## Backend

```text
Node.js
TypeScript
Fastify
```

## Database

```text
PostgreSQL
Prisma
```

## Cache

```text
Redis
```

## Scraping

Serviço separado:

```text
Node.js
Playwright
```

O scraper não deverá rodar dentro do processo principal da API.

---

# 25. Arquitetura de serviços

```text
                 ┌──────────────┐
                 │ React Native │
                 └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐
                 │   API        │
                 │ Fastify      │
                 └──────┬───────┘
                        │
             ┌──────────┼───────────┐
             ▼          ▼           ▼
        PostgreSQL     Redis       Search
             │
             │
             ▼
       ┌─────────────┐
       │ Scraper     │
       │ Workers     │
       └──────┬──────┘
              │
       ┌──────┼──────┐
       ▼      ▼      ▼
    Market A Market B Market C
```

---

# 26. Backend Modules

O backend deverá ser dividido em módulos:

```text
auth
users
products
categories
supermarkets
prices
price-history
shopping-lists
search
scrapers
promotions
recommendations
ai
```

---

# 27. API inicial

### Auth

```http
POST /auth/register
POST /auth/login
```

### Products

```http
GET /products
GET /products/:id
GET /products/search
```

### Prices

```http
GET /products/:id/prices
```

### Supermarkets

```http
GET /supermarkets
GET /supermarkets/:id
```

### Shopping Lists

```http
GET /shopping-lists
POST /shopping-lists
GET /shopping-lists/:id
POST /shopping-lists/:id/items
DELETE /shopping-lists/:id/items/:itemId
```

### Comparison

```http
GET /shopping-lists/:id/compare
```

---

# 28. App — Telas do MVP

## Home

```text
Bom dia 👋

📍 Fortaleza

🔎 O que você está procurando?

[ arroz 5kg                 ]

🔥 Ofertas perto de você

Arroz
R$ 19,90

Café
R$ 9,99

Leite
R$ 4,99

[Minha lista]
```

---

## Busca

```text
Pesquisar

[ arroz 5kg ]

Resultados

Arroz Tio João 5kg
A partir de R$ 19,90

Arroz Camil 5kg
A partir de R$ 21,90
```

---

## Produto

```text
Arroz Tio João
5kg

R$ 19,90

🟢 Melhor preço

Mercados

Mercado A      R$ 19,90
Mercado B      R$ 21,90
Mercado C      R$ 23,90

[Adicionar à lista]
```

---

## Lista

```text
Minha compra

☐ Arroz 5kg
☐ Feijão 1kg
☐ Café 500g
☐ Leite 1L

[Comparar preços]
```

---

## Comparação

```text
Melhor compra

🏆 Mercado A

R$ 97,80

Economia de R$ 12,40

[Ver detalhes]

---

Melhor combinação

Mercado A + Mercado B

R$ 91,20

Economia de R$ 19,00
```

---

# 29. Banco de dados — entidades principais

```text
User
  │
  └── ShoppingList
          │
          └── ShoppingListItem
                    │
                    ▼
                  Product
                    │
             ┌──────┴──────┐
             ▼             ▼
         ProductPrice   Category
             │
             ▼
       Supermarket
```

Entidades adicionais:

```text
RawProduct
PriceHistory
Promotion
ScrapingJob
ProductAlias
```

---

# 30. Segurança

O backend deverá:

* Validar todas as entradas.
* Utilizar autenticação baseada em tokens.
* Aplicar rate limiting.
* Sanitizar dados provenientes dos scrapers.
* Nunca confiar nos preços enviados pelo cliente.
* Registrar origem dos preços.
* Registrar timestamps de coleta.

---

# 31. Scraping — regras

Cada scraper deverá:

* Ser isolado.
* Possuir testes.
* Possuir tratamento de erros.
* Registrar última coleta.
* Registrar falhas.
* Não bloquear a API.
* Permitir execução manual.
* Permitir execução agendada.

Exemplo:

```text
Scraping Job

Supermercado A
Status: success
Produtos: 8.421
Tempo: 02:14
```

---

# 32. Frequência de atualização

No MVP:

```text
Coleta automática:
1x por dia
```

Supermercados prioritários poderão posteriormente receber:

```text
A cada 6 horas
A cada 3 horas
Em tempo real
```

A frequência dependerá da disponibilidade e das regras de cada fonte.

---

# 33. Métricas do MVP

Devemos acompanhar:

### Aquisição

* Usuários cadastrados
* Usuários ativos

### Busca

* Pesquisas realizadas
* Produtos visualizados

### Lista

* Listas criadas
* Produtos adicionados
* Listas comparadas

### Valor

* Economia calculada
* Produtos encontrados
* Comparações realizadas

### Dados

* Produtos coletados
* Preços coletados
* Produtos normalizados
* Falhas de scraping

---

# 34. Critérios de sucesso

O MVP será considerado funcional quando:

* Usuário conseguir criar uma conta.
* Usuário conseguir pesquisar produtos.
* Sistema conseguir retornar preços.
* Produtos equivalentes forem agrupados.
* Usuário conseguir criar uma lista.
* Sistema conseguir comparar a lista.
* Sistema conseguir identificar o supermercado mais barato.
* Sistema conseguir calcular a melhor combinação entre supermercados.
* Histórico básico de preços estiver disponível.
* Pelo menos uma fonte real de preços estiver integrada.

---

# 35. Fora do MVP

Não implementar inicialmente:

* Pagamento dentro do app.
* Marketplace.
* Delivery.
* Checkout.
* Programa de fidelidade.
* Cupons próprios.
* Integração com cartões.
* Sistema social.
* Chat entre usuários.
* Gamificação avançada.
* Previsão complexa de preços.
* IA autônoma tomando decisões de compra.

---

# 36. Roadmap pós-MVP

## V2 — IA

```text
Lista por linguagem natural
Sugestão de produtos
Substituição de produtos
Detecção inteligente de promoções
```

## V3 — Personalização

```text
Histórico do usuário
Produtos recorrentes
Lista automática
Alertas personalizados
```

## V4 — Visão computacional

```text
Foto de encarte
Foto de etiqueta
Foto de lista escrita
OCR
Reconhecimento de produtos
```

## V5 — Otimização

```text
Distância
Combustível
Tempo
Quantidade de supermercados
Preferência por marcas
Preferência por supermercados
```

---

# 37. Princípio principal do produto

O aplicativo não deve simplesmente responder:

> "Onde está mais barato?"

Ele deverá responder:

> **"Qual é a forma mais inteligente de fazer essa compra gastando menos?"**

Essa será a principal diferenciação do produto.

---

# 38. Definição final do MVP

O MVP será composto por quatro pilares:

```text
              ┌─────────────────┐
              │   COMPARAÇÃO    │
              └────────┬────────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
    PRODUTOS        LISTAS           PREÇOS
       │               │                │
       └───────────────┼────────────────┘
                       ▼
                 OTIMIZAÇÃO
                       │
                       ▼
                  ECONOMIA 💰
```

**Core Loop:**

```text
Pesquisar
    ↓
Adicionar à lista
    ↓
Comparar
    ↓
Encontrar melhor preço
    ↓
Economizar
    ↓
Voltar para próxima compra
```

O produto deverá ser construído inicialmente em torno desse loop.
