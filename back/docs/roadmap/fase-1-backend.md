# Fase 1 — Backend confiável

**Projeto:** Cestou  
**Frente:** Pipeline de encartes e operações  
**Status:** Concluída  
**Última atualização:** 2026-09-03  

Documento de referência da Fase 1. Checklist resumido: [`roadmap.md`](./roadmap.md#fase-1--backend-confiável).

---

## Objetivo

Pipeline confiável do encarte até ofertas estruturadas, com cadastro de redes/filiais, ciclo automático, retenção e gestão operacional no admin.

```text
discovery → download → worker → extração → ofertas → validação ops
```

---

## Checklist

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

---

## Entregas principais

### Pipeline técnico

- Flow Builder + worker Playwright (`flows:session-worker`, scheduler).
- Discovery, download, extração MiMo, filas `discovered` / `downloaded`.
- Dedupe por URL, `externalId` e `fileHash`.

### Gestão de flyers (ops)

- Listagem com filtros (rede, fonte, status, período, duplicados, sem validade).
- Detalhe: vigência editável, reanálise, novo download, erros, expiração, descarte.
- Retenção 30 dias: remove evidências; **preserva ofertas** com snapshot de origem.
- Falha de download/análise: descarte integral (inclui ofertas parciais).
- Automação no dashboard: próximo discovery, última execução, erros.

### Políticas

- Flyer sem `validUntil`: revisão manual; não expira nem entra em retenção automática.
- Duplicatas removidas pelo ciclo de lifecycle.
- Site do supermercado opcional no cadastro (obrigatório só no flow de scrape).

---

## Referências técnicas

- [`../flyer-first-offers-pipeline.md`](../flyer-first-offers-pipeline.md)  
- [`../flyer-lifecycle-automatic-discovery.md`](../flyer-lifecycle-automatic-discovery.md)  
- [`../comands/npm.md`](../comands/npm.md)  

---

## Próxima fase

→ [`fase-2-dados.md`](./fase-2-dados.md)
