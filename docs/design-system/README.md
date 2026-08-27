# Design system — Cestou Ops

Fonte: Paper **Cestou Ops — Foundations**, página Design System.  
Light = canônico. Dark = clone da mesma estrutura com hex locais (não altera tokens globais no Paper).

App alvo: `front-admin`. Arquivos CSS em `front-admin/src/styles/design-system/` — **ainda não importados**. UI atual (zinc / Geist) continua.

| Doc | Conteúdo |
|-----|----------|
| [tokens.md](./tokens.md) | Cor, espaço, raio, breakpoint |
| [typography.md](./typography.md) | Outfit + Geist Mono, escala |
| [components.md](./components.md) | Botão, input, pill, card, modal, toast, nav |
| [layout.md](./layout.md) | Sidebar, tabela, KPI, telas |
| [themes.md](./themes.md) | Light / dark |

## Mood

**Maritime** — neblina do cais × água de porto. Uma cor de marca (Harbor `#2F5F7A`). Resto é clima. Sem neon, sem sombra ornamental, sem card sobre card.

Dois registros no repo:

| Superfície | Status |
|------------|--------|
| **Ops Foundations (este DS)** | Canônico para admin |
| `docs/brand-guidelines.md` (night moss / LED âmbar) | Histórico — não usar no front-admin |

## Ativar no código (depois)

1. Outfit (UI) + Geist Mono (números) no `layout.tsx`.
2. `import "@/styles/design-system/index.css"` em `globals.css`.
3. `data-theme="light"` (default) ou `data-theme="dark"` no `<html>`.

Classes: prefixo `.ds-*`. Tokens: `--ds-*` (não colidem com `--background` atual).
