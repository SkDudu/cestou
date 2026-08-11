# SPEC 005 — Scraper Validation Dashboard

**Projeto:** Smart Grocery Price Comparator
**Módulo:** Internal Dashboard / Data Validation
**Versão:** 1.0.0
**Status:** Implementation Ready

---

# 1. Objetivo

Criar um dashboard web interno para visualizar, validar e monitorar os dados coletados pelos scrapers.

O dashboard será utilizado durante a fase de desenvolvimento para:

* verificar se os produtos foram coletados corretamente;
* verificar preços;
* validar promoções;
* identificar produtos duplicados;
* identificar dados incompletos;
* acompanhar execuções do scraper;
* visualizar erros;
* comparar supermercados;
* validar a qualidade dos dados antes da implementação da IA.

---

# 2. Escopo

Nesta fase o dashboard será exclusivamente de **observabilidade e validação de dados**.

Não implementar:

* IA;
* recomendação automática;
* classificação automática por IA;
* chatbot;
* geração automática de listas;
* previsão de preços.

Esses recursos serão adicionados posteriormente.

---

# 3. Arquitetura

```text
                    SCRAPER
                       │
                       ▼
                    Convex
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
        Web App Público     Admin Dashboard
                              │
                              ├── Products
                              ├── Prices
                              ├── Promotions
                              ├── Scrape Runs
                              ├── Errors
                              └── Validation
```

O dashboard deverá consumir os mesmos dados armazenados no Convex.

---

# 4. Tecnologia

Utilizar:

```text
Next.js
React
TypeScript
Convex
Tailwind CSS
```

O dashboard deverá fazer parte do mesmo projeto web ou de uma área administrativa separada.

Recomendação inicial:

```text
/app
  /(public)
  /admin
```

---

# 5. Estrutura

```text
app/
│
├── (public)/
│
└── admin/
    │
    ├── page.tsx
    │
    ├── products/
    │   ├── page.tsx
    │   └── [id]/
    │       └── page.tsx
    │
    ├── prices/
    │   └── page.tsx
    │
    ├── supermarkets/
    │   ├── page.tsx
    │   └── [id]/
    │       └── page.tsx
    │
    ├── runs/
    │   ├── page.tsx
    │   └── [id]/
    │       └── page.tsx
    │
    ├── validation/
    │   └── page.tsx
    │
    └── errors/
        └── page.tsx
```

---

# 6. Dashboard principal

Rota:

```text
/admin
```

Deverá apresentar um resumo geral.

## Métricas

Cards:

```text
Produtos
12.483

Supermercados
2

Preços coletados
24.931

Promoções
1.284
```

E:

```text
Última execução
Há 8 minutos

Produtos coletados
5.238

Produtos com erro
37
```

---

# 7. Status do sistema

Criar um bloco:

```text
Scraper Status

● São Luiz        Online
● Pão de Açúcar   Online

Última coleta:
11/08/2026 08:32
```

---

# 8. Últimas execuções

Tabela:

```text
Supermercado     Status       Produtos    Erros    Data
---------------------------------------------------------
São Luiz         ✓ Success     4.321        12     08:32
Pão de Açúcar    ✓ Success     5.821        24     08:28
São Luiz         ✗ Failed      0            1      07:50
```

Clicar em uma execução deverá abrir:

```text
/admin/runs/[id]
```

---

# 9. Página de execuções

Rota:

```text
/admin/runs
```

Filtros:

```text
Supermercado
Status
Data
Query
```

Tabela:

```text
ID
Supermercado
Queries
Encontrados
Salvos
Erros
Duração
Status
Data
```

---

# 10. Detalhes da execução

Exemplo:

```text
Pão de Açúcar

Run #82

Status
✓ Completed

Started
08:21:32

Finished
08:26:14

Duration
4m 42s
```

Estatísticas:

```text
Queries                  24
Products found           6.281
Products parsed          6.214
Products saved           6.198
Products failed             16
```

---

# 11. Queries da execução

Mostrar:

```text
Query          Found    Parsed    Saved    Errors
--------------------------------------------------
arroz           142      140       140       0
feijão          121      121       120       1
leite           98        97        97       0
café            164      163       162       1
```

Clicar em uma query deverá permitir visualizar os produtos coletados.

---

# 12. Produtos

Rota:

```text
/admin/products
```

Tabela:

```text
Imagem
Produto
Marca
Supermercado
Preço
Preço anterior
Desconto
Unidade
Status
```

Exemplo:

```text
[img] Arroz Tio João 1kg
      Tio João
      Pão de Açúcar

      R$ 7,99
      R$ 9,99
      -20%
```

---

# 13. Busca de produtos

O dashboard deverá permitir:

```text
Buscar produto...
```

Exemplos:

```text
arroz
leite integral
escova de dente
detergente
```

A busca deverá procurar pelo:

* nome;
* marca;
* externalId;
* supermercado.

---

# 14. Filtros

Filtros:

```text
Supermercado
Marca
Categoria
Preço
Promoção
Disponibilidade
Dados incompletos
```

Exemplo:

```text
Supermercado:
[Todos]

Promoção:
[Somente promocionais]

Dados:
[Incompletos]
```

---

# 15. Página de produto

Rota:

```text
/admin/products/[id]
```

Deverá apresentar:

```text
Produto

Arroz Tio João Tipo 1 1kg

Marca
Tio João

Supermercado
Pão de Açúcar

External ID
1234567

URL
Abrir produto
```

---

# 16. Informações coletadas

Exibir:

```text
Nome
Marca
Quantidade
Unidade
Preço
Preço original
Desconto
Disponibilidade
Imagem
URL
External ID
```

---

# 17. Dados brutos

O dashboard deverá possuir uma seção:

```text
Raw Data
```

Exibir o JSON original coletado.

Exemplo:

```json
{
  "name": "...",
  "price": 7.99,
  "brand": "...",
  "externalId": "..."
}
```

Isso será extremamente importante durante o desenvolvimento do scraper.

---

# 18. Validação manual

Cada produto deverá possuir ações:

```text
✓ Validar
⚠ Marcar como suspeito
✗ Invalidar
```

Estados:

```text
pending
validated
suspicious
invalid
```

---

# 19. Motivo da invalidação

Quando marcar como inválido:

```text
Motivo:

[ ] Preço incorreto
[ ] Produto incorreto
[ ] Produto duplicado
[ ] Imagem incorreta
[ ] Marca incorreta
[ ] Unidade incorreta
[ ] Produto indisponível
[ ] Outro
```

Permitir observação:

```text
Observação:
________________________
```

---

# 20. Status de validação

Cada produto deverá possuir:

```text
validationStatus
```

Valores:

```text
pending
validated
suspicious
invalid
```

---

# 21. Produtos suspeitos

Criar uma página:

```text
/admin/validation
```

Exibir produtos que apresentam possíveis problemas.

Exemplos:

```text
Produto sem preço
Produto sem marca
Produto sem imagem
Preço = R$ 0
Preço extremamente alto
Nome muito curto
Produto duplicado
```

---

# 22. Data Quality Score

Criar uma pontuação simples baseada em regras.

Exemplo:

```text
Produto:

Arroz Tio João 1kg

Data Quality
█████████░ 90%
```

Critérios:

```text
Nome                 +20
Preço                +20
Marca                +15
External ID          +15
Imagem               +10
URL                  +10
Quantidade/Unidade   +10
```

Total:

```text
100%
```

Não utilizar IA.

---

# 23. Produtos incompletos

O dashboard deverá possuir um filtro:

```text
Incomplete Data
```

Exemplo:

```text
Produto                     Problema
------------------------------------------------
Arroz X 1kg                 Sem imagem
Leite Y                     Sem marca
Café Z                      Sem preço
Detergente W                Sem unidade
```

---

# 24. Detecção de duplicidade

Criar uma visão:

```text
/admin/validation?type=duplicates
```

Exemplo:

```text
Possíveis duplicados

Arroz Tio João 1kg
Arroz Tio Joao 1 KG
ARROZ TIO JOÃO PACOTE 1KG
```

O dashboard deverá agrupar produtos potencialmente iguais.

Nesta primeira versão, apenas mostrar.

Não fazer merge automático.

---

# 25. Validação de preços

Criar regras simples.

Exemplo:

```text
price <= 0
```

→ suspeito.

Preço muito acima da média:

```text
Produto: Arroz X

Preço:
R$ 999,99

Média:
R$ 8,49
```

→ suspeito.

---

# 26. Promoções

Página:

```text
/admin/prices
```

Filtros:

```text
Somente promoções
Maior desconto
Menor preço
```

Tabela:

```text
Produto
Supermercado
Atual
Anterior
Desconto
```

---

# 27. Comparação de preços

O dashboard deverá permitir buscar:

```text
Arroz Tio João 1kg
```

e mostrar:

```text
Supermercado       Preço
--------------------------
São Luiz           R$ 7,49
Pão de Açúcar      R$ 7,99
```

Isso será o primeiro teste real da futura funcionalidade principal do produto.

---

# 28. Supermercados

Rota:

```text
/admin/supermarkets
```

Cards:

```text
Mercadinhos São Luiz

Produtos
5.821

Última coleta
08:32

Status
✓
```

```text
Pão de Açúcar

Produtos
6.214

Última coleta
08:28

Status
✓
```

---

# 29. Detalhes do supermercado

Rota:

```text
/admin/supermarkets/[id]
```

Mostrar:

```text
Produtos coletados
Produtos válidos
Produtos inválidos
Promoções
Última execução
Taxa de sucesso
```

---

# 30. Scraper Health

Criar uma métrica:

```text
Scraper Health
```

Exemplo:

```text
São Luiz
██████████ 98%

Pão de Açúcar
█████████░ 94%
```

Baseado em:

```text
queries funcionando
+
produtos coletados
+
erros
+
dados incompletos
```

---

# 31. Erros

Rota:

```text
/admin/errors
```

Tabela:

```text
Data
Supermercado
Query
Tipo
Mensagem
Status
```

Exemplo:

```text
08:31
Pão de Açúcar
arroz
ParserError
Price not found
Open
```

---

# 32. Detalhes do erro

Exibir:

```text
Error

ParserError

Supermarket:
Pão de Açúcar

Query:
arroz

Message:
Price not found

URL:
...

Stack:
...
```

Quando disponível, permitir visualizar:

```text
Screenshot
HTML
Raw Response
```

---

# 33. Atualização

O dashboard deverá utilizar atualizações em tempo real do Convex quando possível.

Exemplo:

```text
Scraper executando...

Products:
1.248
1.249
1.250
...
```

Sem necessidade de refresh manual.

---

# 34. Dashboard durante execução

Quando uma execução estiver acontecendo:

```text
Pão de Açúcar

● Running

Query:
arroz

Progress:
████████░░ 80%

Products:
4.231 / ~5.200
```

---

# 35. Ações do dashboard

Nesta primeira versão:

```text
Visualizar
Validar
Invalidar
Marcar suspeito
Filtrar
Pesquisar
Abrir produto original
Visualizar raw data
```

Evitar ações destrutivas.

---

# 36. Não permitir edição de preço

O dashboard não deverá permitir alterar manualmente:

```text
price
originalPrice
discount
```

Esses dados devem continuar vindo do scraper.

A validação deverá somente indicar se o dado está correto ou não.

---

# 37. Schema Convex

Adicionar:

```text
products
prices
supermarkets
scrapeRuns
scrapeErrors
productValidations
```

---

# 38. Product Validation

Estrutura:

```ts
{
  productId: Id<"products">;

  status:
    | "pending"
    | "validated"
    | "suspicious"
    | "invalid";

  reason?: string;

  notes?: string;

  validatedAt?: number;
}
```

---

# 39. Scrape Errors

Estrutura:

```ts
{
  scrapeRunId: Id<"scrapeRuns">;

  supermarketId: Id<"supermarkets">;

  query?: string;

  type: string;

  message: string;

  stack?: string;

  url?: string;

  createdAt: number;
}
```

---

# 40. Métricas do dashboard

O dashboard deverá calcular:

```text
Total Products
Total Prices
Total Promotions
Total Supermarkets
Total Scrape Runs
Failed Scrape Runs
Invalid Products
Suspicious Products
Incomplete Products
```

---

# 41. Design

O dashboard deverá possuir aparência de ferramenta interna.

Características:

```text
Clean
Dense
Informative
Fast
Desktop-first
```

Priorizar:

* tabelas;
* filtros;
* badges;
* cards;
* gráficos simples;
* estados;
* busca.

Evitar excesso de elementos decorativos.

---

# 42. Navegação

Sidebar:

```text
─────────────────────
SCRAPER DASHBOARD

Overview

DATA
Products
Prices
Validation
Supermarkets

SCRAPER
Runs
Errors

─────────────────────
```

---

# 43. Status badges

Utilizar estados visuais:

```text
✓ Validated
⚠ Suspicious
✗ Invalid
● Pending
```

Para scraper:

```text
✓ Completed
● Running
✗ Failed
```

---

# 44. Gráficos

Nesta primeira versão utilizar somente gráficos que realmente ajudem na validação.

Exemplos:

### Produtos por supermercado

```text
São Luiz        ████████████
Pão de Açúcar   ██████████████
```

### Produtos por status

```text
Validated
Pending
Suspicious
Invalid
```

### Execuções

```text
Success
Failed
```

Não criar dashboards complexos apenas por estética.

---

# 45. Responsividade

O dashboard deverá ser:

```text
Desktop-first
```

mas funcionar em:

```text
Tablet
Mobile
```

As tabelas poderão possuir scroll horizontal em telas pequenas.

---

# 46. Performance

O dashboard não deverá carregar milhares de produtos de uma vez.

Utilizar:

```text
pagination
cursor
filters
search
```

O Convex deverá retornar apenas os dados necessários para cada tela.

---

# 47. Paginação

Produtos:

```text
20 / 50 / 100 por página
```

Execuções:

```text
20 / 50
```

Erros:

```text
20 / 50
```

---

# 48. Ordenação

Produtos:

```text
Nome
Preço
Desconto
Data de coleta
Supermercado
Status
```

Execuções:

```text
Data
Duração
Produtos
Erros
```

---

# 49. IA

A IA **não será implementada nesta SPEC**.

O dashboard deverá apenas preparar dados confiáveis para uma futura camada de IA.

Futuro:

```text
Scraper
   ↓
Raw Data
   ↓
Validation
   ↓
Normalization
   ↓
AI
```

A IA somente deverá receber dados após essa camada de qualidade.

---

# 50. Futuro sistema de IA

Posteriormente poderemos adicionar:

```text
Product Classification
        ↓
Category
        ↓
Subcategory
        ↓
Brand Detection
        ↓
Product Matching
        ↓
Promotion Detection
        ↓
Recommendation
```

Mas nenhuma dessas funcionalidades deverá ser implementada agora.

---

# 51. Definition of Done

### Dashboard

* [ ] Overview criado.
* [ ] Products criado.
* [ ] Product details criado.
* [ ] Prices criado.
* [ ] Validation criado.
* [ ] Supermarkets criado.
* [ ] Runs criado.
* [ ] Run details criado.
* [ ] Errors criado.

### Dados

* [ ] Produtos exibidos.
* [ ] Preços exibidos.
* [ ] Promoções exibidas.
* [ ] Raw data exibido.
* [ ] Histórico de preço exibido.
* [ ] Supermercados exibidos.

### Validação

* [ ] Produto validável.
* [ ] Produto pode ser marcado como suspeito.
* [ ] Produto pode ser invalidado.
* [ ] Motivo armazenado.
* [ ] Observação armazenada.
* [ ] Produtos incompletos detectados.
* [ ] Possíveis duplicados exibidos.
* [ ] Preços suspeitos identificados.

### Scraper

* [ ] Runs exibidos.
* [ ] Queries exibidas.
* [ ] Erros exibidos.
* [ ] Status em tempo real.
* [ ] Métricas exibidas.

### Infraestrutura

* [ ] Convex integrado.
* [ ] Paginação.
* [ ] Filtros.
* [ ] Busca.
* [ ] Ordenação.
* [ ] Responsividade.

---

# 52. Resultado esperado

Ao terminar esta SPEC, você deverá conseguir abrir:

```text
/admin
```

e responder rapidamente:

```text
Quantos produtos temos?

Quais supermercados estão funcionando?

Quando foi a última coleta?

Quantos produtos foram coletados?

Quantos estão com erro?

Quantos possuem promoção?

Quais produtos estão incompletos?

Quais produtos parecem duplicados?

Os preços parecem corretos?

O scraper está funcionando?
```

O dashboard será a **camada de controle de qualidade dos dados** antes da entrada da IA no projeto.
