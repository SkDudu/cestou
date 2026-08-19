# Brand Guidelines — Cestou v1.0

> Last updated: 2026-08-18  
> Status: Canonical (extraído do Paper: Ops Console)  
> Mood: vehicle dashboard — asfalto molhado × LED âmbar

## Quick Reference

| Element | Value |
|---------|-------|
| Primary Color | #E7A93B |
| Secondary Color | #68A87A |
| Accent Color | #D66A5E |
| Primary Font | Geist |
| Data Font | Geist Mono |
| Voice | Preciso, operacional, sem floreio |

---

## Brand Concept

**Cestou** compara encartes e ofertas de supermercado. Nome = cesta + compromisso (“já cestou”).

Identidade visual não é varejo alegre. É **console de operação**: night moss, hairline, raio 0, um único acento LED.

Dois registros, uma marca:

| Superfície | Uso |
|------------|-----|
| **Ops Console** | Admin, scraper, validação — canônico no Paper |
| **Wordmark** | `CESTOU` Geist 700 — mesma em rail, docs, marca |

Explorações botanical / editorial no Paper **não** são marca. Arquivo histórico.

---

## 1. Color Palette

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Âmbar LED | #E7A93B | rgb(231,169,59) | CTA, KPI herói, foco, marca |
| On-accent | #171917 | rgb(23,25,23) | Texto sobre âmbar |

### Secondary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Musgo ok | #68A87A | rgb(104,168,122) | Sucesso, status processado |
| Musgo profundo | #47705A | rgb(71,112,90) | Série secundária (páginas) |

### Accent Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Alerta | #D66A5E | rgb(214,106,94) | Erro, destrutivo, abaixo do limiar |

### Neutral Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Night bg | #151917 | rgb(21,25,23) | Fundo app |
| Rail | #101411 | rgb(16,20,17) | Navegação |
| Panel | #202622 | rgb(32,38,34) | Superfície elevada |
| Panel deep | #191E1B | rgb(25,30,27) | Card, input |
| Hairline | #333B35 | rgb(51,59,53) | Borda |
| Text | #F4F5EF | rgb(244,245,239) | Texto primário |
| Mute | #78817A | rgb(120,129,122) | Secundário |

### Accessibility

- Texto `#F4F5EF` em `#151917`: alto contraste
- Âmbar em fundo night: acento, não corpo de texto longo
- CTA âmbar usa texto `#171917`, nunca branco

---

## 2. Typography

### Font Stack

```css
--font-heading: Geist, system-ui, sans-serif;
--font-body: Geist, system-ui, sans-serif;
--font-mono: "Geist Mono", ui-monospace, monospace;
```

### Type Scale (Ops)

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| Wordmark | 14px+ | 700 | CESTOU |
| H1 | 24px | 600 | Título de página |
| KPI hero | 44px | 600 | Geist Mono |
| Body | 12–13px | 400 | UI |
| Label | 9–10px | 500 | Caps, tracking 0.08–0.1em |

Regra: número de KPI = Geist Mono. Label = caps. Sem Inter/Arial.

---

## 3. Logo Usage

### Variants

| Variant | Spec | Use |
|---------|------|-----|
| Wordmark | `CESTOU` Geist 700, caps | Rail, capa, docs |
| Mark | Bloco 24×24, fundo âmbar, `C` on-accent | Favicon, avatar |

### Correct Usage

- Caps always
- Tracking normal no wordmark (não esmagar)
- Âmbar no mark; wordmark em `--color-text` sobre night
- Clear space ≥ altura do C

### Incorrect Usage

- Não alongar / outline / drop shadow
- Não pintar wordmark de âmbar em fundo night (vira néon barato)
- Não usar Geist Mono no wordmark
- Não arredondar o mark

---

## 4. Voice

### We Are

- **Preciso, não frio:** dado primeiro, adjetivo depois
- **Operacional, não corporativo:** “7 encartes, 251 ofertas” > “insights poderosos”
- **Direto, não brusco:** ação no verbo (processar, validar, excluir)

### Do / Don't

| Do | Don't |
|----|-------|
| Ofertas extraídas · confiança 0.88 | Super app de economia mágica |
| Revisar antes de publicar | Revolucione suas compras |
| Limiar 0.70 | Synergy / AI-powered (vazio) |

### Tone by context

| Context | Tone |
|---------|------|
| Ops UI | Caps label, números mono |
| Erro | Fato + próximo passo |
| Marca / capa | Wordmark + uma linha de produto |
| Legal | Formal padrão |

### AI image / mood

Base: instrument panel, wet asphalt, amber LED, no neon purple, no grocery clipart, no rounded SaaS blobs.

Keywords: nocturnal, moss, hairline, phosphor amber, dense ops.

---

## Source of truth

Paper file `smart-grocery` — páginas Design System + Marca.  
Tokens Paper: `--night-*`, `--font-ui`, `--font-data`.
