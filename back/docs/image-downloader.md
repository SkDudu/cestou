# SPEC 008 — Product Image Downloader & Convex Storage

**Projeto:** Cestou
**Módulo:** Image Storage / Asset Pipeline
**Versão:** 1.1.0
**Status:** Implementation Ready

---

# 1. Objetivo

Criar um sistema responsável por baixar, validar, deduplicar e armazenar as imagens dos produtos coletados pelos scrapers no **Convex File Storage**.

O Cestou deverá possuir suas próprias cópias das imagens.

A imagem original fornecida pelo supermercado será utilizada apenas como **fonte inicial**.

Depois que uma imagem válida for armazenada, ela **não deverá ser substituída automaticamente**.

---

# 2. Princípios fundamentais

O sistema deverá seguir quatro regras principais:

### Regra 1 — O scraper não baixa imagens

O scraper apenas coleta:

```text
imageUrl
```

O download acontece posteriormente em um job independente.

---

### Regra 2 — Imagem já armazenada não é substituída

Se o produto já possui:

```text
imageStorageId
```

e a imagem é válida:

```text
NÃO baixar novamente
NÃO substituir
NÃO atualizar
```

Mesmo que a URL original tenha mudado.

---

### Regra 3 — Imagens idênticas devem ser reutilizadas

Se uma imagem já existe no Storage e possui o mesmo hash:

```text
NÃO criar outro arquivo
```

O produto deverá reutilizar o mesmo:

```text
imageStorageId
```

---

### Regra 4 — O mesmo produto/embalagem deverá compartilhar imagem

Quando produtos de diferentes supermercados forem identificados futuramente como o mesmo produto canônico:

```text
São Luiz
Arroz Camil 5kg
       │
       ├─────────────┐
       ▼             ▼
Pão de Açúcar    Outro mercado
       │             │
       └──────┬──────┘
              ▼
      Produto Canônico
              │
              ▼
        Mesma imagem
```

A implementação inicial deverá preparar a estrutura para isso.

---

# 3. Problema atual

Atualmente os produtos podem possuir:

```json
{
  "name": "Arroz Camil Tipo 1 5kg",
  "imageUrl": "https://cdn.supermercado.com/image.jpg"
}
```

Essa imagem pertence ao supermercado.

Isso cria dependência externa.

Problemas:

* URL pode expirar;
* imagem pode ser removida;
* CDN pode bloquear acesso;
* URL pode mudar;
* supermercado pode trocar a imagem;
* frontend depende de serviço externo;
* não existe controle sobre os assets.

---

# 4. Resultado esperado

Produto coletado:

```json
{
  "name": "Arroz Camil Tipo 1 5kg",
  "imageUrl": "https://cdn.supermercado.com/arroz.jpg"
}
```

Depois do processamento:

```json
{
  "name": "Arroz Camil Tipo 1 5kg",
  "imageUrl": "https://cdn.supermercado.com/arroz.jpg",
  "imageStorageId": "kg123abc",
  "imageStatus": "stored"
}
```

O frontend deverá utilizar prioritariamente:

```text
imageStorageId
```

---

# 5. Arquitetura

```text
                    SUPERMERCADO
                         │
                         ▼
                      SCRAPER
                         │
                         ▼
                     Convex DB
                         │
                         │ imageUrl
                         ▼
                  IMAGE SYNC JOB
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           Validate     Hash     Existing?
              │          │          │
              └──────────┼──────────┘
                         ▼
                    Deduplication
                         │
                         ▼
                  Convex Storage
                         │
                         ▼
                  imageStorageId
                         │
                         ▼
                      CESTOU
```

---

# 6. Fluxo principal

```text
Product
   │
   ▼
Possui imageStorageId?
   │
   ├── SIM
   │    │
   │    └── Não fazer download
   │
   └── NÃO
        │
        ▼
     imageUrl existe?
        │
        ├── NÃO → pending/invalid
        │
        └── SIM
             │
             ▼
          Download
             │
             ▼
          Validate
             │
             ▼
            Hash
             │
             ▼
       Hash já existe?
          │       │
         SIM     NÃO
          │       │
          ▼       ▼
      Reutilizar Upload
      Storage ID    │
                    ▼
               Storage ID
```

---

# 7. Estrutura de diretórios

```text
src/
│
├── images/
│   ├── image-downloader.ts
│   ├── image-validator.ts
│   ├── image-hasher.ts
│   ├── image-storage.ts
│   ├── image-deduplicator.ts
│   ├── image-sync.ts
│   ├── image-types.ts
│   └── index.ts
│
├── jobs/
│   └── sync-product-images.ts
│
└── tests/
    └── images/
        ├── image-downloader.test.ts
        ├── image-validator.test.ts
        ├── image-hasher.test.ts
        ├── image-deduplicator.test.ts
        └── image-sync.test.ts
```

---

# 8. Convex Storage

Utilizar o File Storage nativo do Convex.

O documento do produto armazenará somente:

```ts
imageStorageId?: Id<"_storage">;
```

O arquivo binário não será armazenado dentro do documento do produto.

---

# 9. Schema do produto

Adicionar:

```ts
imageUrl?: string;

imageStorageId?: Id<"_storage">;

imageStatus?:
  | "pending"
  | "downloading"
  | "stored"
  | "failed"
  | "invalid";
```

Informações adicionais:

```ts
imageDownloadedAt?: number;

imageContentType?: string;

imageSize?: number;

imageHash?: string;

imageError?: string;

imageSourceUrl?: string;
```

---

# 10. Status

## pending

Produto possui imagem remota, mas ainda não foi processado.

## downloading

Download em andamento.

## stored

Imagem armazenada com sucesso.

## failed

Download ou upload falhou.

## invalid

A URL ou o arquivo não representa uma imagem válida.

---

# 11. Image Source

Preservar a origem:

```ts
imageSourceUrl?: string;
```

Exemplo:

```json
{
  "imageSourceUrl": "https://cdn.supermercado.com/image.jpg",
  "imageStorageId": "kg123",
  "imageStatus": "stored"
}
```

A URL original nunca deverá ser perdida.

---

# 12. Regra de prioridade da imagem

A prioridade será:

```text
1. imageStorageId
2. imageUrl
3. placeholder
```

Ou seja:

```text
imagem própria do Cestou
        ↓
imagem original do supermercado
        ↓
placeholder
```

---

# 13. Regra de não substituição

Esta é uma regra obrigatória.

Se:

```ts
product.imageStorageId != null
```

e:

```text
imageStatus = stored
```

o sistema deverá encerrar o processamento desse produto.

Não deverá:

* baixar a nova imagem;
* comparar URLs;
* substituir o arquivo;
* alterar `imageStorageId`;
* atualizar a imagem automaticamente.

---

# 14. Exemplo de não substituição

Primeira coleta:

```text
São Luiz
Arroz Camil 5kg
imageUrl = image-a.jpg
```

Resultado:

```text
imageStorageId = storage-001
```

No dia seguinte:

```text
São Luiz
Arroz Camil 5kg
imageUrl = image-b.jpg
```

Mesmo que:

```text
image-a.jpg
```

e:

```text
image-b.jpg
```

sejam diferentes:

```text
storage-001
```

continua sendo utilizado.

---

# 15. Exceção — Force

A substituição automática não será permitida.

Uma operação administrativa explícita poderá futuramente permitir:

```bash
npm run sync:images -- --force
```

Mesmo assim, essa funcionalidade deverá ser tratada como operação de manutenção e não como comportamento normal do pipeline.

---

# 16. Downloader

Criar:

```text
src/images/image-downloader.ts
```

Responsabilidades:

1. receber URL;
2. realizar HTTP GET;
3. validar resposta;
4. obter bytes;
5. validar Content-Type;
6. validar tamanho;
7. retornar arquivo;
8. nunca armazenar diretamente no banco.

---

# 17. Timeout

```env
IMAGE_DOWNLOAD_TIMEOUT=15000
```

15 segundos.

---

# 18. Retry

```env
IMAGE_DOWNLOAD_RETRIES=3
```

Máximo de três tentativas.

---

# 19. Backoff

Utilizar exponential backoff:

```text
500ms
1000ms
2000ms
```

---

# 20. Content-Type

Aceitar:

```text
image/jpeg
image/png
image/webp
image/gif
image/avif
```

SVG somente se necessário.

---

# 21. Magic Bytes

Não confiar somente no Content-Type.

Validar:

```text
JPEG → FF D8 FF
PNG  → 89 50 4E 47
GIF  → 47 49 46
WEBP → RIFF....WEBP
```

---

# 22. Tamanho máximo

```env
IMAGE_MAX_SIZE_MB=5
```

Imagens maiores deverão ser rejeitadas.

---

# 23. Hash

Criar:

```text
src/images/image-hasher.ts
```

Utilizar SHA-256.

Exemplo:

```text
imageHash =
a7c4f9...
```

---

# 24. Deduplicação

Criar:

```text
src/images/image-deduplicator.ts
```

Antes de fazer upload:

```text
download
   ↓
hash
   ↓
buscar hash no banco
```

Se encontrar:

```text
hash existente
      ↓
reutilizar imageStorageId
```

Não realizar novo upload.

---

# 25. Exemplo de deduplicação

São Luiz:

```text
Arroz Camil 5kg
imageHash = abc123
imageStorageId = storage-001
```

Pão de Açúcar:

```text
Arroz Camil 5kg
imageHash = abc123
```

Resultado:

```text
Pão de Açúcar
imageStorageId = storage-001
```

Não criar:

```text
storage-002
```

---

# 26. Product Images

Criar collection:

```text
productImages
```

Estrutura:

```ts
{
  storageId: Id<"_storage">;

  hash: string;

  contentType: string;

  size: number;

  originalUrl?: string;

  createdAt: number;
}
```

Criar índice:

```text
by_hash
```

para consulta rápida.

---

# 27. Relação

```text
products
   │
   └── imageStorageId
            │
            ▼
     productImages
            │
            ▼
     Convex Storage
```

---

# 28. Reutilização de Storage ID

Quando o hash já existir:

```text
productImages
      │
      ├── hash = abc123
      └── storageId = storage-001
```

novo produto:

```text
products.imageStorageId
=
storage-001
```

---

# 29. Um Storage ID pode ter vários produtos

Isso é permitido e esperado.

Exemplo:

```text
storage-001
     │
     ├── São Luiz / produto-123
     ├── Pão de Açúcar / produto-982
     └── outro mercado / produto-431
```

Quando representam a mesma imagem, não duplicar o arquivo.

---

# 30. Produto canônico

A arquitetura deverá permitir futuramente:

```text
Product A
   │
   ├── supermarket A
   ├── supermarket B
   └── supermarket C
           │
           ▼
    Canonical Product
           │
           ▼
      imageStorageId
```

Essa consolidação será responsabilidade da futura SPEC de Product Canonicalization.

---

# 31. Não inferir produto canônico nesta SPEC

Esta SPEC não deverá tentar descobrir semanticamente que:

```text
Arroz Camil Tipo 1 5kg
```

e:

```text
Arroz Camil Tipo 1 - 5 Kg
```

são o mesmo produto.

Isso será tratado posteriormente.

Nesta SPEC:

```text
hash igual → mesma imagem
```

---

# 32. Futuro matching

Posteriormente:

```text
São Luiz
"Arroz Camil Tipo 1 5kg"

Pão de Açúcar
"Arroz Camil Tipo 1 5 KG"
```

poderão ser identificados como:

```text
canonicalProductId = X
```

e compartilhar:

```text
imageStorageId = Y
```

mesmo que as imagens originais sejam diferentes.

---

# 33. Raw Data

Nunca alterar:

```text
rawProducts
```

O scraper original deverá continuar disponível para auditoria.

---

# 34. Product Data

O produto enriquecido poderá conter:

```ts
{
  imageUrl,
  imageStorageId,
  imageStatus,
  imageHash,
  imageContentType,
  imageSize,
  imageDownloadedAt
}
```

---

# 35. Image Sync

Criar:

```text
src/images/image-sync.ts
```

Buscar somente:

```text
imageUrl != null
AND
imageStorageId == null
```

Isso garante que imagens já armazenadas não sejam processadas novamente.

---

# 36. Query de pendentes

Conceitualmente:

```text
products
WHERE
imageUrl exists
AND
imageStorageId does not exist
```

---

# 37. CLI

Adicionar:

```bash
npm run sync:images
```

---

# 38. Por supermercado

```bash
npm run sync:images -- --supermarket=sao-luiz
```

```bash
npm run sync:images -- --supermarket=pao-de-acucar
```

---

# 39. Somente pendentes

```bash
npm run sync:images -- --missing
```

---

# 40. Somente falhas

```bash
npm run sync:images -- --failed
```

---

# 41. Force

```bash
npm run sync:images -- --force
```

O `--force` deverá ser explicitamente identificado nos logs como operação administrativa.

Por padrão:

```text
force = false
```

---

# 42. Batch

```env
IMAGE_SYNC_BATCH_SIZE=50
```

Processar no máximo 50 produtos por lote.

---

# 43. Concorrência

```env
IMAGE_SYNC_CONCURRENCY=5
```

No máximo cinco downloads simultâneos.

---

# 44. Delay

```env
IMAGE_SYNC_DELAY_MS=200
```

Aplicar delay quando necessário para evitar comportamento agressivo contra uma mesma origem.

---

# 45. User-Agent

Utilizar um User-Agent identificável:

```text
CestouImageSync/1.0
```

Não tentar mascarar o processo para contornar bloqueios.

---

# 46. Bloqueios

Para:

```text
403
429
```

o sistema deverá:

1. registrar erro;
2. aplicar backoff;
3. limitar retries;
4. continuar outros produtos;
5. não entrar em loop infinito.

---

# 47. Domínios permitidos

Criar configuração por supermercado:

```ts
{
  id: "sao-luiz",

  allowedImageDomains: [
    "mercadinhossaoluiz.com.br"
  ]
}
```

Exemplo:

```ts
{
  id: "pao-de-acucar",

  allowedImageDomains: [
    "paodeacucar.com"
  ]
}
```

CDNs oficiais deverão ser cadastrados explicitamente quando necessário.

---

# 48. SSRF Protection

Bloquear acesso a:

```text
localhost
127.0.0.1
0.0.0.0
::1
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.0.0/16
```

e demais endpoints internos.

---

# 49. URL inválida

Se:

```text
imageUrl = invalid
```

resultado:

```text
imageStatus = invalid
```

sem retries desnecessários.

---

# 50. HTTP

Preferir HTTPS.

Não realizar downgrade automático de:

```text
https://
```

para:

```text
http://
```

---

# 51. Frontend

Criar:

```ts
getProductImageUrl(product)
```

Prioridade:

```text
1. imageStorageId
2. imageUrl
3. placeholder
```

---

# 52. Dashboard

Adicionar coluna:

```text
Image
```

Estados:

```text
✓ Stored
⏳ Pending
↻ Downloading
⚠ Failed
✕ Invalid
```

---

# 53. Informações do asset

Exibir:

```text
Image

Status:
Stored

Storage:
Convex

Size:
182 KB

Type:
image/webp

Hash:
abc123

Downloaded:
11/08/2026
```

---

# 54. Métricas

Dashboard:

```text
Total Products
Images Stored
Images Pending
Images Failed
Images Invalid
Unique Images
Duplicated References
```

Exemplo:

```text
Products:           12,483
Images Stored:      11,921
Unique Images:       9,804
Reused Images:       2,117
Pending:               421
Failed:                 98
Invalid:                43
```

---

# 55. Métrica importante

Adicionar:

```text
Storage Deduplication Rate
```

Exemplo:

```text
Total image references: 12,000
Unique image files:      9,500

Deduplication:
20.8%
```

Isso permite acompanhar quanto espaço está sendo economizado.

---

# 56. Retry manual

Produtos:

```text
imageStatus = failed
```

deverão possuir:

```text
Retry
```

no dashboard.

---

# 57. Não baixar novamente

Se:

```text
imageStorageId != null
```

o job deverá ignorar o produto.

Exemplo:

```text
12.000 produtos
10.000 já possuem imagem

Resultado:
2.000 candidatos ao download
```

---

# 58. Idempotência

Executar:

```bash
npm run sync:images
```

repetidamente deverá ser seguro.

Primeira execução:

```text
500 pendentes
→ 500 processados
```

Segunda execução:

```text
0 downloads
```

se todos foram armazenados.

---

# 59. Deduplicação por hash

Mesmo com URLs diferentes:

```text
market-a/image123.jpg
market-b/image999.webp
```

se:

```text
SHA-256 = abc123
```

então:

```text
storageId = mesmo arquivo
```

---

# 60. Não considerar URL como identidade

Não utilizar:

```text
imageUrl
```

para determinar se duas imagens são iguais.

URLs diferentes podem apontar para a mesma imagem.

A identidade do arquivo será baseada em:

```text
SHA-256
```

---

# 61. Não considerar nome como identidade de imagem

Não assumir:

```text
Arroz Camil 5kg
```

como identificador da imagem.

O nome do produto pode mudar.

---

# 62. Não substituir por imagem "melhor"

O sistema não deverá decidir automaticamente:

> "Essa imagem nova parece melhor."

Se já existe:

```text
imageStorageId
```

ela permanece.

A troca deverá ser uma ação explícita de manutenção.

---

# 63. Imagem canônica futura

Quando o sistema de produtos canônicos existir:

```text
Canonical Product
       │
       ▼
Canonical Image
       │
       ▼
imageStorageId
```

Isso será implementado posteriormente.

---

# 64. Orphan Cleanup

Criar futuramente:

```bash
npm run images:cleanup
```

Identificar arquivos no Storage sem referência.

Nesta versão:

```text
somente relatório
```

Não deletar automaticamente.

---

# 65. Logs

Exemplo de sucesso:

```text
[IMAGE] Product: 123
[IMAGE] URL: https://...
[IMAGE] Downloading...
[IMAGE] Size: 182KB
[IMAGE] Type: image/webp
[IMAGE] Hash: abc123
[IMAGE] Searching existing asset...
[IMAGE] Existing asset found
[IMAGE] Reusing storageId: xyz789
[IMAGE] SUCCESS
```

---

# 66. Novo upload

Quando não existir hash:

```text
[IMAGE] Product: 123
[IMAGE] Downloading...
[IMAGE] Valid image
[IMAGE] Hash: abc123
[IMAGE] No existing asset
[IMAGE] Uploading...
[IMAGE] Storage ID: xyz789
[IMAGE] SUCCESS
```

---

# 67. Imagem já armazenada

Log:

```text
[IMAGE] Product: 123
[IMAGE] Existing imageStorageId found
[IMAGE] Skipping download
[IMAGE] SKIPPED
```

---

# 68. Relatório final

Exemplo:

```text
Image Sync Complete

Processed:              500
New uploads:            381
Reused existing:         91
Already stored:          17
Failed:                   8
Invalid:                  3

Unique new images:       381
Reused images:            91

Success rate:          98.2%
```

---

# 69. Testes

Implementar testes para:

### Downloader

* URL válida;
* URL inválida;
* timeout;
* retry;
* HTTP 403;
* HTTP 429.

### Validator

* JPEG;
* PNG;
* WEBP;
* GIF;
* arquivo inválido;
* arquivo vazio;
* arquivo acima do limite.

### Hash

* mesmo arquivo → mesmo hash;
* arquivos diferentes → hashes diferentes.

### Deduplicator

* hash existente → reutilizar;
* hash inexistente → novo upload.

### Sync

* produto sem imagem;
* produto com imagem;
* produto já armazenado;
* produto failed;
* produto invalid.

---

# 70. Teste crítico — não substituição

Estado inicial:

```json
{
  "imageStorageId": "storage-001",
  "imageUrl": "https://market.com/image-a.jpg",
  "imageStatus": "stored"
}
```

Nova coleta:

```json
{
  "imageUrl": "https://market.com/image-b.jpg"
}
```

Resultado esperado:

```json
{
  "imageStorageId": "storage-001"
}
```

Não baixar `image-b.jpg`.

---

# 71. Teste crítico — mesma imagem

Produto A:

```text
hash = abc123
storageId = storage-001
```

Produto B:

```text
hash = abc123
```

Resultado:

```text
Produto B
storageId = storage-001
```

Nenhum novo arquivo deverá ser criado.

---

# 72. Teste crítico — URLs diferentes

```text
URL A:
https://market-a.com/a.jpg

URL B:
https://market-b.com/b.webp
```

Mesmo conteúdo:

```text
hash = abc123
```

Resultado:

```text
storageId = storage-001
```

---

# 73. Teste crítico — imagem diferente

```text
hash A = abc123
hash B = xyz789
```

Resultado:

```text
storage-A
storage-B
```

Dois arquivos são permitidos porque os conteúdos são diferentes.

---

# 74. Teste crítico — produto já armazenado

Produto:

```text
imageStorageId = storage-001
```

Executar:

```bash
npm run sync:images
```

Resultado:

```text
download = 0
upload = 0
```

---

# 75. Teste de fallback

Sem Storage:

```text
imageStorageId = null
imageUrl = valid
```

Frontend:

```text
→ imageUrl
```

Sem Storage e sem URL:

```text
→ placeholder
```

---

# 76. Teste de idempotência

Executar:

```text
sync
sync
sync
```

Resultado:

```text
uploads = 1
```

e não:

```text
uploads = 3
```

---

# 77. Definition of Done

## Downloader

* [ ] Downloader implementado.
* [ ] Timeout implementado.
* [ ] Retry implementado.
* [ ] Backoff implementado.
* [ ] Content-Type validado.
* [ ] Magic bytes validados.
* [ ] Limite de tamanho implementado.

## Storage

* [ ] Convex Storage configurado.
* [ ] Upload implementado.
* [ ] `imageStorageId` salvo.
* [ ] `productImages` criado.
* [ ] SHA-256 implementado.
* [ ] Deduplicação implementada.

## Não substituição

* [ ] Produto com imagem armazenada é ignorado.
* [ ] Nova URL não substitui imagem existente.
* [ ] Novo download não ocorre sem `--force`.
* [ ] `--force` é explicitamente administrativo.

## Deduplicação

* [ ] Hash duplicado reutiliza Storage ID.
* [ ] URLs diferentes podem compartilhar imagem.
* [ ] Um Storage ID pode ser utilizado por múltiplos produtos.
* [ ] Não criar arquivos duplicados.

## Pipeline

* [ ] `sync:images`.
* [ ] Batch processing.
* [ ] Concurrency control.
* [ ] Idempotência.
* [ ] Retry.
* [ ] Logs.
* [ ] Relatório.

## Segurança

* [ ] SSRF protection.
* [ ] Allowed domains.
* [ ] HTTP validation.
* [ ] Content validation.
* [ ] File size limit.

## Dashboard

* [ ] Status da imagem.
* [ ] Métricas.
* [ ] Unique images.
* [ ] Reused images.
* [ ] Retry manual.
* [ ] Informações do asset.

## Testes

* [ ] Download.
* [ ] Validation.
* [ ] Hash.
* [ ] Deduplication.
* [ ] No replacement.
* [ ] Idempotency.
* [ ] SSRF.
* [ ] Fallback.

---

# 78. Resultado final

O comportamento esperado do Cestou será:

```text
                 SCRAPER
                    │
                    ▼
             imageUrl coletada
                    │
                    ▼
              Convex Product
                    │
                    ▼
             Image Sync Job
                    │
          ┌─────────┴─────────┐
          │                   │
    Já possui imagem?       Não possui
          │                   │
         SIM                  ▼
          │                Download
          │                   │
          │                   ▼
          │                Validate
          │                   │
          │                   ▼
          │                 SHA-256
          │                   │
          │             ┌─────┴─────┐
          │             │           │
          │          Existe?      Nova?
          │             │           │
          │             ▼           ▼
          │          Reutiliza    Upload
          │             │           │
          └─────────────┴─────┬─────┘
                               ▼
                        imageStorageId
                               │
                               ▼
                             CESTOU
```

### Regra definitiva

> **Uma vez que o Cestou tenha uma imagem válida armazenada, ela permanece como a imagem do produto. O sistema nunca deverá substituí-la automaticamente.**

E:

> **Se uma nova imagem possuir o mesmo conteúdo de uma imagem já armazenada, o Cestou reutilizará o mesmo arquivo em vez de criar uma cópia.**

A identificação de que **duas imagens diferentes representam a mesma embalagem** ficará para a futura camada de **Product Canonicalization**, não para o downloader.
