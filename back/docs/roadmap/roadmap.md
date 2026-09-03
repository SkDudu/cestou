# Roadmap — Cestou

**Status:** MVP técnico em andamento  
**Última atualização:** 2026-09-03

---

## Contexto

A parte mais difícil do MVP técnico já está funcionando:

```text
discovery → captura do encarte → download → worker → extração estruturada
```

O próximo passo é transformar isso em produto confiável: cadastro das fontes, ciclo automático de encartes, dados normalizados, e só então o cliente com listas, proximidade e alertas.

**Princípio:** a IA não é o centro do sistema agora. O ativo do Cestou é a base:

```text
              CESTOU
                 │
        ┌────────┴────────┐
        ↓                 ↓
   SUPERMERCADOS       USUÁRIOS
        │                 │
        ↓                 ↓
    ENCARTE           LISTA
        ↓                 ↓
     OFERTAS          HISTÓRICO
        │                 │
        └────────┬────────┘
                 ↓
          PRODUTO CANÔNICO
                 ↓
          PREÇO + LOCAL
                 ↓
        ┌────────┴────────┐
        ↓                 ↓
  COMPARAÇÃO         RECOMENDAÇÃO
        │                 │
        └────────┬────────┘
                 ↓
          💰 ECONOMIA
```

Produtos + preços + supermercados + localização + comportamento = coração do Cestou.  
A IA entra depois para consultar e enriquecer essa base — não para construí-la sozinha.

---



## Visão das 6 frentes (ordem)



### 1. Cadastro e gestão dos supermercados

O admin controla as fontes de ofertas.

**Supermercado (rede)**


| Campo     | Notas                                   |
| --------- | --------------------------------------- |
| Nome      |                                         |
| Logo      | ✅ upload via storage                    |
| Site      |                                         |
| Cidade/UF | na rede; filiais herdam / CEP           |
| Status    | ativo / inativo                         |
| Tipo      | ✅ supermarket / wholesale / distributor |


**Lojas / filiais**

```text
Atacadão
 ├── Vila Peri
 ├── Messejana
 ├── Parangaba
 └── ...
```

Cada filial: endereço, bairro, cidade, lat/lng, URL, identificador externo, status.

Fundamental para ofertas por proximidade no cliente.

**Estado atual:** CRUD de rede + filiais + fontes (`scope` rede/filial) + worker com disponibilidade geral/filial + logo + tipo de rede — entregue. Polish de ops ainda aberto.

### 2. Gestão automática de encartes

Com o worker extraindo, falta o ciclo automático.

```text
Supermercado
      ↓
Worker verifica fonte
      ↓
Existe encarte novo?
      ↓
    NÃO → encerra
      ↓ SIM
Baixa encarte
      ↓
Calcula hash
      ↓
Já existe?
   ↓       ↓
  SIM      NÃO
  ↓         ↓
ignora    salva
            ↓
       envia para extração
            ↓
       produtos / ofertas
```

**Flyer — campos**


| Campo                      |     |
| -------------------------- | --- |
| supermercado / loja        |     |
| título                     |     |
| URL original               |     |
| arquivo (storage)          |     |
| hash                       |     |
| validFrom / validUntil     |     |
| status                     |     |
| páginas                    |     |
| discoveredAt / processedAt |     |


**Status:** `DISCOVERED` → `DOWNLOADING` → `DOWNLOADED` → `PROCESSING` → `PROCESSED` / `FAILED` / `EXPIRED` (+ `DUPLICATE` já no schema).

**Retenção de arquivos:** o flyer é evidência operacional temporária, não histórico permanente. A rotina automática remove flyers expirados há mais de **1 mês**, incluindo arquivo original no storage, páginas, extrações e erros técnicos. As **ofertas extraídas** permanecem para análises futuras de preço e catálogo, preservando mercado, vigência, preço, texto extraído e metadados mínimos da origem. A limpeza nunca pode remover um flyer vigente, futuro, sem `validUntil` ou ainda em processamento.

**Falha operacional:** se download pelo worker ou análise falhar, o flyer é descartado integralmente — arquivo, páginas, extrações, erros e ofertas parciais. Retenção de ofertas aplica-se exclusivamente a flyers expirados com extração concluída.

**Estado atual:** listagem, detalhe, reanálise, correção de validade, novo download, filtros, erros no detalhe, expiração manual, descarte integral, limpeza de evidências após 30 dias, limpeza de duplicatas e painel de automação estão entregues. O cron também agenda discovery na expiração e na janela de 24h. Flyers sem `validUntil` ficam em revisão manual e não são expirados/removidos automaticamente. Ainda faltam testes de integração.

### 3. Normalização dos produtos

Próxima feature crítica de dados.

Extração A: `Arroz Camil Tipo 1 5kg` · Camil · 5kg · R$ 24,99  
Extração B: `ARROZ TIPO 1 CAMIL 5KG` · CAMIL · 5 KG · 24,99  

→ produto canônico comum, com preço por supermercado.

Pipeline (sem IA no caminho feliz):

1. regras
2. dicionário
3. heurística
4. matching
5. IA só nos casos difíceis



### 4. Programa de desconto / cartão

Antes do lançamento ao cliente.

Oferta pode ser:

- R$ 29,99 Clube X  
- R$ 34,99 preço normal

Guardar explicitamente:


| Campo                 |     |
| --------------------- | --- |
| price                 |     |
| originalPrice         |     |
| discountPrice         |     |
| discountType          |     |
| requiresMembership    |     |
| membershipName        |     |
| membershipDescription |     |


No app: mostrar preço do clube **e** preço sem clube. Nunca só o preço “bom” sem contexto.

### 5. Aplicativo do cliente

Quando a base estiver confiável:

- Lista de compras  
- Meus supermercados (manual → depois proximidade)  
- Localização / Casa / Trabalho / outro  
- Busca, comparação, ofertas próximas, favoritos



### 6. Perfil de compra + alertas

Sinais comportamentais (sem IA no início):

`produto_adicionado_lista` · `oferta_visualizada` · `oferta_clicada` · `produto_favoritado` · `supermercado_favoritado` · `lista_finalizada` · …

→ perfil (marcas, produtos, mercados, região) → score de relevância → **alertas personalizados** (“o patinho que você costuma comprar entrou em promoção no Atacadão Vila Peri”) em vez de “437 novas ofertas”.

---



## Checklist por fase



### Fase 1 — Backend confiável

→ Detalhes: [`roadmap/fase-1-backend.md`](./fase-1-backend.md)

- [x] Discovery  
- [x] Download  
- [x] Worker / Flow Builder  
- [x] Extração (MiMo + fallback)  
- [x] Cadastro de supermercados  
- [x] Cadastro de lojas / filiais  
- [x] Fontes de ofertas (escopo rede / filial)  
- [x] Logo / tipo da rede  
- [x] Gestão de flyers (ops completa)  
- [x] Ciclo automático de flyers (cron estável)  
- [x] Expiração automática  
- [x] Retenção mensal: remover flyers expirados e arquivos; preservar ofertas extraídas
- [x] Deduplicação robusta  



### Fase 2 — Dados

→ Detalhes: [`roadmap/fase-2-dados.md`](./fase-2-dados.md)

- [ ] Normalização de produtos  
- [ ] Marcas  
- [ ] Produtos canônicos  
- [ ] Matching entre supermercados  
- [ ] Preços  
- [ ] Histórico de preços  
- [ ] Programa de fidelidade / cartão  
- [ ] Validação (ops + regras de qualidade)  



### Fase 3 — Cliente

- [ ] Cadastro  
- [ ] Localização / endereço  
- [ ] Meus supermercados  
- [ ] Lista de compras  
- [ ] Busca de produtos  
- [ ] Comparação de preços  
- [ ] Ofertas próximas  
- [ ] Favoritos  



### Fase 4 — Inteligência

- [ ] Perfil de compra  
- [ ] Score de relevância  
- [ ] Recomendação  
- [ ] “Onde vale mais a pena comprar?”  
- [ ] Sugestão de supermercado  
- [ ] Alertas personalizados  
- [ ] IA para montar listas  



### Fase 5 — Monetização

- [ ] Campanhas dos lojistas  
- [ ] Ofertas patrocinadas  
- [ ] Dashboard do lojista  
- [ ] Métricas de campanha  
- [ ] Segmentação  
- [ ] Notificações patrocinadas  

---



## Próximo foco sugerido

1. ~~Fechar gestão e ciclo automático de flyers~~ — ver [`fase-1-backend.md`](./fase-1-backend.md).
2. Começar **Fase 2 — Dados**: normalização + marcas → produto canônico — ver [`fase-2-dados.md`](./fase-2-dados.md).
3. Completar **membership / clube** na oferta antes de empurrar o cliente.
4. Só então aprofundar o app cliente (listas + proximidade).

Documentação por fase: [`roadmap/README.md`](./README.md).

