# SPEC 010 — Flyer-First Offers Pipeline

**Projeto:** Cestou  
**Módulo:** Encartes / Ofertas / Coleta Local  
**Versão:** 1.0.0  
**Status:** Implementation Ready  
**Prioridade:** Alta  
**Dependências:** SPEC 005 (Dashboard), SPEC 008 (Convex Storage patterns)  
**Nota de numeração:** Rascunho original usava SPEC 009; no repositório SPEC 009 já é Data Retention & Storage Budget. Esta SPEC é **010**.

---

# 1. Objetivo

Criar uma arquitetura para o Cestou focada inicialmente em encartes e ofertas locais de supermercados de Fortaleza.

O sistema deverá:

* cadastrar supermercados;
* cadastrar fontes de encartes;
* descobrir/downloadar encartes;
* armazenar os arquivos no Convex Storage;
* identificar período de validade;
* extrair ofertas;
* armazenar as ofertas no Convex;
* permitir validação através do dashboard;
* manter histórico;
* detectar encartes próximos do vencimento;
* buscar automaticamente novos encartes;
* permitir adicionar novos supermercados sem alterar a arquitetura principal.

A prioridade será **qualidade e localização** dos preços, e não quantidade de produtos.

---

# 2. Mudança de estratégia

O Cestou não deverá tentar inicialmente obter o catálogo completo dos supermercados.

### Estratégia anterior

```text
Supermercado
      ↓
API / Scraper
      ↓
Milhares de produtos
      ↓
Tentar descobrir localização
      ↓
Validar
```

### Nova estratégia

```text
Supermercado
      ↓
Encarte
      ↓
Ofertas
      ↓
Validação
      ↓
Histórico
```

O encarte será considerado uma **fonte primária** de ofertas promocionais.

---

# 3. Escopo geográfico

A primeira versão será focada exclusivamente em:

* **Cidade:** Fortaleza
* **Estado:** Ceará
* **País:** Brasil

Não assumir que um preço pertence a Fortaleza apenas porque foi encontrado no site do supermercado.

A localização da oferta deverá possuir uma **fonte identificável**.

---

# 4. Princípio de confiança

Toda oferta deverá possuir:

* `source`
* `location`
* `validFrom`
* `validUntil`

Exemplo:

```json
{
  "sourceType": "flyer",
  "city": "Fortaleza",
  "state": "CE",
  "validFrom": 1775952000000,
  "validUntil": 1776211200000
}
```

---

# 5. Fontes de dados

O sistema deverá permitir diferentes tipos de fonte:

* `flyer_pdf`
* `flyer_image`
* `flyer_web`
* `promotion_page`
* `api`
* `scraper`

Nesta SPEC, **somente as fontes de encarte** serão implementadas.

As demais ficarão preparadas para futuras versões.

---

# 6. Conceito de Flyer

Um **Flyer** representa o encarte inteiro.

Exemplo:

* São Luiz
* Ofertas da Semana
* 12/08/2026 → 15/08/2026

O Flyer **não** representa um produto individual.

---

# 7. Conceito de Offer

Uma **Offer** representa uma oferta encontrada dentro de um Flyer.

Exemplo:

* Arroz Camil Tipo 1 5kg
* R$ 27,99

Relação:

```text
Flyer
 │
 ├── Offer
 ├── Offer
 ├── Offer
 ├── Offer
 └── Offer
```

---

# 8. Arquitetura

```text
                         CESTOU
                            │
                            ▼
                    SUPERMARKETS
                            │
                            ▼
                     FLYER SOURCES
                            │
                            ▼
                      FLYER SCRAPER
                            │
                            ▼
                      RAW FLYER
                            │
                            ▼
                     Convex Storage
                            │
                            ▼
                       OCR / Parser
                            │
                            ▼
                         OFFERS
                            │
                            ▼
                    VALIDATION QUEUE
                            │
                     ┌──────┴──────┐
                     ▼             ▼
                 VALIDATED      REJECTED
                     │
                     ▼
                 HISTÓRICO
                     │
                     ▼
                  CESTOU APP
```

---

# 9. Estrutura de diretórios

```text
src/
│
├── flyers/
│   │
│   ├── core/
│   │   ├── flyer-scraper.ts
│   │   ├── flyer-downloader.ts
│   │   ├── flyer-validator.ts
│   │   ├── flyer-parser.ts
│   │   ├── flyer-storage.ts
│   │   └── flyer-types.ts
│   │
│   ├── sources/
│   │   ├── sao-luiz/
│   │   │   └── scraper.ts
│   │   │
│   │   ├── assai/
│   │   │   └── scraper.ts
│   │   │
│   │   ├── pao-de-acucar/
│   │   │   └── scraper.ts
│   │   │
│   │   └── index.ts
│   │
│   ├── extraction/
│   │   ├── ocr.ts
│   │   ├── offer-parser.ts
│   │   └── text-normalizer.ts
│   │
│   └── index.ts
│
├── jobs/
│   ├── flyer-discovery.ts
│   ├── flyer-download.ts
│   ├── flyer-extraction.ts
│   └── flyer-expiration.ts
│
└── tests/
    └── flyers/
```

No repositório atual, o caminho esperado é sob `back/scraper/src/` (mesmo workspace do scraper existente), mantendo a árvore `flyers/` acima.

---

# 10. Interface de scraper

Todos os supermercados deverão seguir a mesma interface.

```ts
interface FlyerScraper {
  findFlyer(): Promise<FlyerSource | null>;

  downloadFlyer(
    source: FlyerSource
  ): Promise<DownloadedFlyer>;

  extractMetadata(
    flyer: DownloadedFlyer
  ): Promise<FlyerMetadata>;
}
```

O scraper específico **não** deverá implementar lógica de negócio do Cestou.

---

# 11. Cadastro de supermercado

Criar entidade: `supermarkets`

Exemplo:

```json
{
  "name": "São Luiz",
  "slug": "sao-luiz",
  "city": "Fortaleza",
  "state": "CE",
  "country": "BR",
  "active": true
}
```

> **Nota de implementação:** a tabela `supermarkets` já existe no Convex (SPEC 002/004). Esta SPEC **estende** o modelo com campos de localização (`city`, `state`, `country`) quando ausentes — não duplicar entidade.

---

# 12. Campos de supermercado

```ts
{
  name: string;
  slug: string;
  city: string;
  state: string;
  country: string;
  active: boolean;
  websiteUrl?: string;
  createdAt: number;
  updatedAt: number;
}
```

---

# 13. Flyer Source

Criar: `flyerSources`

Representa de onde o sistema encontra o encarte.

Exemplo:

```json
{
  "supermarketId": "...",
  "type": "web",
  "url": "https://...",
  "active": true
}
```

---

# 14. Tipos de Flyer Source

* `pdf`
* `image`
* `web`
* `dynamic`

Exemplos:

```text
PDF
↓
download direto

IMAGE
↓
JPG/PNG/WebP

WEB
↓
página contendo encarte

DYNAMIC
↓
site que gera encarte dinamicamente
```

---

# 15. Cadastro manual

Inicialmente deverá ser possível cadastrar manualmente:

* Supermercado
* URL do encarte
* Tipo da fonte
* Cidade
* Estado
* Ativo

Não será necessário criar um sistema automático de descoberta de supermercados na primeira versão.

---

# 16. Exemplo

```text
Supermercado: São Luiz
Cidade:       Fortaleza
Fonte:        https://...
Tipo:         web
Ativo:        true
```

---

# 17. Flyer

Criar: `flyers`

Schema:

```ts
{
  supermarketId: Id<"supermarkets">;
  sourceId: Id<"flyerSources">;
  title?: string;
  originalUrl: string;
  storageId?: Id<"_storage">;
  fileType?: string;
  fileSize?: number;
  fileHash?: string;
  validFrom?: number;
  validUntil?: number;
  status:
    | "discovered"
    | "downloading"
    | "downloaded"
    | "processing"
    | "processed"
    | "expired"
    | "failed";
  createdAt: number;
  updatedAt: number;
}
```

---

# 18. Histórico

**Nunca apagar** Flyers antigos.

Exemplo:

```text
São Luiz

Flyer #1  01/08 → 05/08
Flyer #2  06/08 → 10/08
Flyer #3  11/08 → 15/08
Flyer #4  16/08 → 20/08
```

Todos deverão permanecer disponíveis.

---

# 19. Status do Flyer

| Status | Significado |
|--------|-------------|
| `discovered` | Encarte encontrado |
| `downloading` | Download em andamento |
| `downloaded` | Arquivo armazenado |
| `processing` | Extração em andamento |
| `processed` | Ofertas extraídas |
| `expired` | Período terminou |
| `failed` | Erro no processamento |

---

# 20. Armazenamento

O arquivo original deverá ser armazenado no **Convex File Storage**.

O banco armazenará `storageId` e **não** o arquivo binário.

---

# 21. Não substituir Flyer

Se o mesmo encarte já foi armazenado:

* **NÃO** baixar novamente
* **NÃO** substituir

O sistema deverá identificar o Flyer existente através de:

* `supermarketId`
* `sourceId`
* `originalUrl`
* `validFrom`
* `validUntil`

e futuramente também poderá utilizar hash.

---

# 22. Hash do Flyer

Calcular **SHA-256** após download.

Campo: `fileHash?: string`

Isso permitirá detectar o mesmo arquivo mesmo que a URL tenha mudado.

---

# 23. Download

Configuração:

```env
FLYER_DOWNLOAD_TIMEOUT=30000
FLYER_DOWNLOAD_RETRIES=3
FLYER_MAX_SIZE_MB=50
```

---

# 24. Validação do arquivo

Verificar:

* HTTP status;
* Content-Type;
* tamanho;
* magic bytes;
* arquivo vazio;
* arquivo corrompido.

---

# 25. Página do encarte

Se o Flyer possuir múltiplas páginas: `flyerPages`

Exemplo:

```json
{
  "flyerId": "...",
  "pageNumber": 1,
  "storageId": "...",
  "createdAt": 1770000000000
}
```

---

# 26. Página como evidência

Cada oferta extraída deverá poder apontar para:

* `flyerId`
* `pageNumber`

Exemplo:

```json
{
  "name": "Arroz Camil 5kg",
  "price": 27.99,
  "flyerId": "...",
  "pageNumber": 3
}
```

Isso permitirá ao dashboard mostrar a origem exata.

---

# 27. Extração

A primeira versão deverá separar **download** de **extraction**.

Fluxo:

```text
Flyer
 ↓
Storage
 ↓
OCR
 ↓
Texto
 ↓
Parser
 ↓
Offers
```

---

# 28. OCR

Criar interface:

```ts
interface FlyerOCR {
  extractText(
    page: FlyerPage
  ): Promise<OCRResult>;
}
```

O provedor de OCR deverá ser substituível.

Não acoplar o sistema inteiro a um único fornecedor.

---

# 29. OCR Result

```ts
{
  text: string;
  confidence?: number;
  pageNumber: number;
  boundingBoxes?: OCRBoundingBox[];
}
```

---

# 30. Parser

Criar: `offer-parser.ts`

Responsável por transformar texto OCR em `Offer`.

---

# 31. Exemplo de OCR

Entrada:

```text
ARROZ CAMIL
TIPO 1
5KG

DE 34,90
POR 27,99
```

Saída:

```json
{
  "name": "Arroz Camil Tipo 1",
  "quantity": "5kg",
  "originalPrice": 34.9,
  "price": 27.99
}
```

---

# 32. Não utilizar IA inicialmente

Nesta SPEC:

* OCR
* regras
* regex
* normalização

IA ficará preparada para uma futura SPEC.

---

# 33. Offer

Criar: `offers`

Schema inicial:

```ts
{
  flyerId: Id<"flyers">;
  supermarketId: Id<"supermarkets">;
  name: string;
  brand?: string;
  quantity?: string;
  unit?: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  pageNumber?: number;
  rawText?: string;
  extractionConfidence?: number;
  sourceType: "flyer";
  validationStatus:
    | "pending"
    | "validated"
    | "rejected"
    | "suspicious";
  createdAt: number;
  updatedAt: number;
}
```

Validade herdada do Flyer (ver §37): `validFrom` / `validUntil` podem ser denormalizados na offer ou resolvidos via `flyerId`.

---

# 34. Preço

O preço deverá ser armazenado como número:

```ts
27.99
```

Nunca:

```ts
"R$ 27,99"
```

---

# 35. Preço promocional

Quando houver:

```text
DE 34,90
POR 27,99
```

armazenar:

```json
{
  "originalPrice": 34.9,
  "price": 27.99
}
```

---

# 36. Desconto

Calcular:

```ts
discountPercentage =
  ((originalPrice - price) / originalPrice) * 100
```

Exemplo: 34,90 → 27,99 = **19.8% OFF**

---

# 37. Validade da oferta

A oferta deverá herdar inicialmente:

* `flyer.validFrom`
* `flyer.validUntil`

Podendo futuramente possuir validade própria.

---

# 38. Localização

Toda oferta deverá possuir vínculo: `supermarketId`

O supermercado possuirá:

* `city`
* `state`
* `country`

Na primeira versão:

* `city = Fortaleza`
* `state = CE`

---

# 39. Localidade da loja

O sistema deverá futuramente permitir:

```text
supermarket
    │
    ├── store Fortaleza Centro
    ├── store Fortaleza Aldeota
    └── store Fortaleza Cambeba
```

Nesta SPEC, pode-se manter apenas `supermarket.city`, mas o schema deverá ser criado de forma que a expansão seja possível.

---

# 40. Confiança

A oferta deverá possuir `extractionConfidence` (ex.: `0.98`).

Essa confiança representa **extração**, não validade comercial.

---

# 41. Validação humana

Dashboard deverá permitir:

* Validar
* Suspeito
* Rejeitar

---

# 42. Fila de validação

Criar visão: **Ofertas Pendentes**

Ordenação: menor confidence primeiro.

---

# 43. Evidência

Ao revisar uma oferta:

```text
┌─────────────────────────────┐
│ Arroz Camil Tipo 1 5kg      │
│                             │
│ R$ 27,99                    │
│                             │
│ São Luiz                    │
│ Fortaleza                   │
│                             │
│ Página 3                    │
│                             │
│ [Ver encarte]               │
│                             │
│ [Validar] [Suspeito] [X]    │
└─────────────────────────────┘
```

---

# 44. Scheduler

Criar job: `flyer-expiration.ts`

Responsabilidade:

* verificar Flyers expirando;
* marcar expirados;
* procurar novos Flyers;
* iniciar download;
* iniciar processamento.

---

# 45. Não esperar expirar

O sistema deverá procurar o próximo encarte **antes** do atual terminar.

Configuração:

```env
FLYER_DISCOVERY_BEFORE_EXPIRATION_HOURS=24
```

Exemplo:

```text
Atual: 12/08 → 15/08

14/08
 ↓
buscar próximo
```

---

# 46. Descoberta

Cada supermercado poderá possuir `findFlyer()`.

A implementação poderá:

* acessar URL cadastrada;
* encontrar PDF;
* encontrar imagem;
* encontrar link;
* extrair metadados;
* identificar período.

---

# 47. Não confiar cegamente na URL

Uma URL cadastrada pode continuar apontando para encarte atual **ou** antigo.

O scraper deverá verificar os metadados encontrados.

---

# 48. Detecção de período

Prioridade:

1. Metadata explícita
2. Texto do encarte
3. Nome do arquivo
4. URL
5. Configuração manual

---

# 49. Exemplo

URL: `/ofertas/encarte-12-15-agosto.pdf`

Extrair:

* `validFrom = 12/08`
* `validUntil = 15/08`

Se não for possível: `status = suspicious` e exigir validação.

---

# 50. Jobs

Criar:

```bash
npm run flyers:discover
npm run flyers:download
npm run flyers:extract
npm run flyers:expire
```

---

# 51. Pipeline completo

Também criar:

```bash
npm run flyers:sync
```

Fluxo:

```text
discover
   ↓
download
   ↓
validate
   ↓
store
   ↓
OCR
   ↓
parse
   ↓
offers
```

---

# 52. Idempotência

Executar `npm run flyers:sync` diversas vezes **não** deverá duplicar:

* supermercados;
* fontes;
* Flyers;
* páginas;
* ofertas.

---

# 53. Identificação de Flyer

Prioridade:

```text
supermarketId + sourceId + validFrom + validUntil
```

Hash será utilizado como proteção adicional.

---

# 54. Identificação de Offer

Nesta SPEC **não** tentar identificar perfeitamente o produto.

Duas ofertas:

* `Arroz Camil 5kg`
* `Arroz Camil Tipo 1 5 KG`

podem ser registros separados.

A consolidação ficará para **Product Canonicalization**.

---

# 55. Histórico de preços

**Não** sobrescrever ofertas antigas.

Exemplo:

```text
12/08  Arroz Camil  R$ 27,99
16/08  Arroz Camil  R$ 31,90
20/08  Arroz Camil  R$ 29,90
```

Isso permitirá criar histórico posteriormente.

---

# 56. Fonte da oferta

Toda oferta deverá ter:

```json
{
  "sourceType": "flyer",
  "flyerId": "...",
  "pageNumber": 3
}
```

---

# 57. Dashboard

Criar seção **Encartes** com:

* Supermercados
* Encartes ativos
* Encartes expirados
* Próximos encartes
* Falhas

---

# 58. Lista de supermercados

```text
┌──────────────────────────────────────┐
│ Supermercados                        │
├──────────────────────────────────────┤
│ São Luiz             ✓ Ativo         │
│ Assaí                ✓ Ativo         │
│ Pão de Açúcar        ✓ Ativo         │
│ Atacadão             ✓ Ativo         │
└──────────────────────────────────────┘
```

---

# 59. Flyer Dashboard

```text
São Luiz

Atual
12/08 → 15/08
Status: Processed
Ofertas: 87
[Ver encarte]

Próximo:
16/08 → 19/08
Status: Discovered
```

---

# 60. Offer Dashboard

Filtros:

* Supermercado
* Status
* Data
* Categoria
* Confidence
* Preço

---

# 61. Métricas

Mostrar:

* Supermarkets
* Active Flyers
* Processed Flyers
* Offers Extracted
* Offers Validated
* Offers Pending
* Offers Rejected
* Extraction Errors

---

# 62. Auditoria

Toda oferta deverá permitir descobrir:

```text
Supermercado
↓
Flyer
↓
Página
↓
Texto original
↓
Dados extraídos
```

Essencial para corrigir erros de OCR/parser.

---

# 63. Raw Text

Guardar `rawText` da região utilizada para extrair a oferta.

Isso permitirá reprocessar sem baixar novamente o encarte.

---

# 64. Reprocessamento

Futuramente:

```bash
npm run flyers:reprocess -- --flyer=ID
```

Deverá permitir alterar o parser sem baixar novamente o arquivo.

---

# 65. Erros

Cada etapa deverá possuir logs:

* `DISCOVERY`
* `DOWNLOAD`
* `STORAGE`
* `OCR`
* `PARSER`
* `VALIDATION`

---

# 66. Falha parcial

Se OCR falhar:

* Flyer = `downloaded`
* não deverá ser perdido

Será possível executar novamente OCR.

---

# 67. Falha no parser

Se parser falhar:

* Flyer = `downloaded`
* OCR = complete
* Offers = failed

**Não** baixar novamente.

---

# 68. Docker

O pipeline deverá continuar compatível com Docker.

Exemplo:

```text
docker/
├── scraper
├── worker
└── scheduler
```

Inicialmente pode ser executado localmente.

---

# 69. Configuração

```env
CONVEX_URL=

FLYER_DOWNLOAD_TIMEOUT=30000
FLYER_DOWNLOAD_RETRIES=3
FLYER_MAX_SIZE_MB=50

FLYER_DISCOVERY_BEFORE_EXPIRATION_HOURS=24

FLYER_OCR_ENABLED=true

FLYER_BATCH_SIZE=10
FLYER_CONCURRENCY=2
```

---

# 70. Segurança

Aplicar:

* SSRF protection;
* limite de tamanho;
* timeout;
* retries;
* allowed domains;
* HTTPS quando possível;
* validação de Content-Type;
* magic bytes.

---

# 71. Compliance / origem

Nunca remover:

* `originalUrl`
* `source`
* `supermarket`
* `validFrom`
* `validUntil`

A origem deverá sempre ser rastreável.

---

# 72. Adicionar supermercado

O objetivo principal da arquitetura é permitir:

```text
Novo supermercado
       ↓
Cadastro
       ↓
URL do encarte
       ↓
Scraper
       ↓
Pipeline existente
```

Sem alterar: Offer, Flyer, Storage, Dashboard, Scheduler.

---

# 73. Exemplo de configuração

```ts
const supermarket = {
  name: "São Luiz",
  slug: "sao-luiz",
  city: "Fortaleza",
  state: "CE",
  flyerSources: [
    {
      type: "web",
      url: "https://...",
    },
  ],
};
```

---

# 74. Roadmap de fontes

Primeira implementação: **São Luiz**

Depois:

* Assaí
* Pão de Açúcar
* Atacadão
* Cometa
* Super Lagoa
* Pinheiro
* Center Box
* Frangolândia
* Mix Mateus

A ordem deverá ser determinada pela disponibilidade e estabilidade dos encartes.

> **Nota de descoberta (pré-impl):** São Luiz Mercadapp loja 355 expõe flipbooks via  
> `GET /mapp/v2/markets/355/flipbooks` + imagens em `cdn.mercadapp.services`.  
> Preferir essa fonte sobre o site Wix institucional quando disponível.

---

# 75. Fora do escopo

Não implementar nesta SPEC:

* catálogo completo;
* comparação entre supermercados;
* lista de compras;
* IA;
* recomendação automática;
* matching semântico;
* produto canônico;
* previsão de preços;
* alertas;
* aplicativo mobile.

Esses módulos serão construídos sobre os dados produzidos por esta SPEC.

---

# 76. Próxima camada

Depois desta implementação:

```text
SPEC 010  Flyer Pipeline
       ↓
SPEC 011  AI Vision Offer Extraction (DeepSeek)  → back/docs/ai-vision-offer-extraction.md
       ↓
SPEC 012  Product Normalization
       ↓
SPEC 013  Product Canonicalization
       ↓
SPEC 014  Price History
       ↓
SPEC 015  Shopping List
       ↓
SPEC 016  Price Comparison
```

A numeração pode ser ajustada conforme novas SPECs forem inseridas.

---

# 77. Definition of Done

### Supermercados

- [ ] Schema `supermarkets` (extensão com localização)
- [ ] Cadastro manual
- [ ] Fortaleza como localização inicial
- [ ] Status ativo/inativo

### Fontes

- [ ] Schema `flyerSources`
- [ ] URL cadastrável
- [ ] Tipo configurável
- [ ] Ativação/desativação

### Flyers

- [ ] Schema `flyers`
- [ ] Descoberta
- [ ] Download
- [ ] Validação
- [ ] Hash
- [ ] Convex Storage
- [ ] Período de validade
- [ ] Histórico
- [ ] Status

### Páginas

- [ ] Schema `flyerPages`
- [ ] Página armazenada
- [ ] Número da página
- [ ] Relação com Flyer

### OCR

- [ ] Interface desacoplada
- [ ] Extração de texto
- [ ] Confidence
- [ ] Raw text
- [ ] Reprocessamento

### Offers

- [ ] Schema `offers`
- [ ] Nome / marca / quantidade
- [ ] Preço / preço anterior / desconto
- [ ] Validade
- [ ] Página de origem
- [ ] Confidence
- [ ] Status

### Validação

- [ ] Pending / Validated / Suspicious / Rejected
- [ ] Dashboard
- [ ] Evidência da página

### Scheduler

- [ ] Descoberta automática
- [ ] Verificação de expiração
- [ ] Busca antecipada
- [ ] Processamento automático
- [ ] Retry

### Pipeline

- [ ] `flyers:discover`
- [ ] `flyers:download`
- [ ] `flyers:extract`
- [ ] `flyers:expire`
- [ ] `flyers:sync`

### Qualidade

- [ ] Idempotência
- [ ] Logs
- [ ] Auditoria
- [ ] Falhas recuperáveis
- [ ] Não duplicação
- [ ] Histórico preservado

---

# 78. Resultado esperado

Depois da implementação, o Cestou deverá conseguir fazer:

```text
                 12/08
                   │
                   ▼
          Scheduler executa
                   │
                   ▼
          São Luiz — Fortaleza
                   │
                   ▼
            Encontrar encarte
                   │
                   ▼
              Download
                   │
                   ▼
          Convex File Storage
                   │
                   ▼
                 OCR
                   │
                   ▼
             Parser
                   │
                   ▼
          87 ofertas encontradas
                   │
                   ▼
          Dashboard de validação
                   │
              ┌────┴────┐
              ▼         ▼
          Validar    Rejeitar
              │
              ▼
        Oferta disponível
              │
              ▼
        Histórico Cestou
```
