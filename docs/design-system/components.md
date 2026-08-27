# Componentes

Valores lidos do Paper (computed styles). Harbor só no primário. Outline no filtro. Pills só em estado.

## Botão

Altura **36px**, raio **10**, ícone 14, gap 6, texto 13/500.

| Variante | Fundo | Borda | Texto | Padding-x |
|----------|-------|-------|-------|-----------|
| Primary | Harbor | — | branco | 14 |
| Outline | canvas | 1px Mist | Ink | 12 |
| Ghost | — | — | Harbor | 12 |
| Disabled | Fog | — | `#8A9AAB` | 12 |
| Danger | — | 1px Rust | Rust | 12 |

CTA de fundamentos (40px, 14/600, pad 18): usar `.ds-btn--lg`. Dark: primary fill continua `#2F5F7A`; outline card `#1C2F3D` + borda `#334D5E`; foco/ghost usa Harbor claro.

## Input / select

- Altura **40**, raio **6**, pad 12, borda 1px Mist, fundo card.
- Label **sempre acima** (13/500).
- Foco: filete **2px Harbor** (dark: `#7BA8C4`).
- Erro: borda 1px Rust + hint Rust.
- Ícone busca 14, gap 8.

Dropdown: item 36px, raio 6, ativo = muted.

## Status pill

Altura **22**, pad-x 10, raio full, 12/500.

| Estado | Light bg | Texto |
|--------|----------|-------|
| Rodando | `#E6F0EA` | Sea glass |
| Fila | `#E8EEF2` | Harbor |
| Revisão | `#F4EEDC` | Buoy |
| Falha | `#F4E6E3` | Rust |

Dark bg: `#2A4038` · `#243848` · `#3A3420` · `#3A2A28`. Cor do texto igual light.

## Card / KPI

Painel: raio **14**, pad 18×20, gap 10, borda 1px. Dois KPIs **assimétricos** (um largo, um estreito). Valor mono 28/600. Ícone KPI 32×32, raio 8, fundo muted.

Módulo (gráfico): raio **20**. Sem card empilhado — agrupar no Fog.

## Tabela

Header 32px, caps 11/500 tracking 0.08em. Linha 48px, pad-x 18. Selecionada: Fog + filete esquerdo Harbor 2px. Worker ID em mono.

## Nav

Spec isolado: 36px, raio 8, ativo Fog + filete 2px Harbor.  
Chrome da tela: sidebar **248**, item **40px**, raio **10**, ativo muted, rail 3px. **Chrome ganha** na implementação (`.ds-nav-item`).

## Modal

- Light: largura **480**, pad 24, gap 20, raio 20, borda 1px, scrim Ink **40%**.
- Dark: mesmo raio; spec dark mostra 440 — usar 480.
- Primário à **direita**. Título section; corpo 14/400 muted.

## Toast

- Canto **top-right**, gap 12, máx **3**. Novo empurra antigo.
- Largura **360**, raio 14, pad 14×16, gap 12, sem sombra.
- Sucesso / warning / info: borda 1px Mist. **Falha**: filete esquerdo 2px Rust (ícone carrega o estado).
- Título 13/600 Ink. Corpo 13/400 muted.
- Tempo: sucesso/info **4s**. Falha fica até dismiss. Ação não fecha sozinha.
