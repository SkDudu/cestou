# Tokens

Medida igual em light e dark. Só cor muda.

## Primitivos (cena)

| Nome | Hex | Papel |
|------|-----|--------|
| Harbor | `#2F5F7A` | Marca, CTA primário |
| Ink | `#1A2B3C` | Texto light |
| Fog | `#F3F5F7` | Fundo de seção, agrupamento |
| Mist | `#D5DCE3` | Borda 1px |
| Buoy | `#B8952C` | Promoção, revisão, alerta |
| Sea glass | `#3D6B5A` | Sucesso, worker ativo |
| Rust | `#A14A3C` | Falha, destrutivo |
| Paper | `#FFFFFF` | Canvas / card light |
| Haze | `#E8EEF2` | Secondary, chip inativo |

Aliases Paper: `--color-primary` = Harbor, `--color-accent` = Buoy, `--color-success` / `--color-danger`.

## Semânticos light (globais)

| Token | Valor |
|-------|--------|
| background / card | Paper |
| foreground | Ink |
| muted | Fog |
| muted-foreground | `#4A5C6B` |
| border | Mist |
| primary-foreground | `#FFFFFF` |
| disabled | `#8A9AAB` |
| scrim | Ink 40% |

## Semânticos dark (hex locais)

| Papel | Hex |
|-------|-----|
| Canvas | `#15232E` |
| Card / sidebar | `#1C2F3D` |
| Muted | `#243848` |
| Borda | `#334D5E` |
| Texto | `#E8EEF2` |
| Mute / hint | `#8FA3B3` |
| Harbor claro (foco) | `#7BA8C4` |
| Primary fill | `#2F5F7A` (igual light) |
| Scrim | `#0F1A22` 60% |

## Espaço (4px)

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64` (64 = seção).

## Raio

| px | Uso |
|----|-----|
| 6 | Input, chip, menu item |
| 10 | Botão, nav item (chrome) |
| 14 | Painel, KPI, toast |
| 20 | Módulo, modal |
| 999 | Pill status |

## Bordas

- Padrão: **1px Mist** (dark: `#334D5E`). Painel, tabela, form. Sem drop shadow.
- Agrupar: fundo **Fog** (dark: muted). Área já branca — não empilhar card.
- Acento: **Harbor 2px** só módulo ativo, foco, linha selecionada. Dark usa Harbor claro.

## Breakpoints / container

`sm 640 · md 768 · lg 1024 · xl 1280`. Container max ops: **1400**.
