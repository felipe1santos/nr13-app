# Padrões de cor e de tag — definidos pelo dono em 22/11/2026

Quando o dono pedir **"vermelho padrão"**, **"verde padrão"** ou **"espaçamento de tag"**,
é exatamente isto. Não inventar variação: usar os tokens e a classe abaixo.

## Vermelho padrão

A tag do **tipo de ocorrência selecionado** no modal "Novo registro" (Registros de Segurança).

| Propriedade | Valor |
|---|---|
| Fundo | `#DC2626` → token `--vermelho-padrao` |
| Texto | `#FFFFFF`, peso 600 (contraste 4,8:1) |
| Hover / item sob o mouse (lista) | fundo `#FEE2E2`, texto `#B42318` → `--vermelho-padrao-claro` / `--vermelho-padrao-texto` |

Uso reservado: erro, vencido, item escolhido nesse seletor, ação destrutiva.
Vermelho **nunca** colore uma família/tipo de dado (ver "Prazos por tipo" no Dashboard).

## Verde padrão

O verde da aba **"Prévia"** ativa no mesmo modal — o mesmo verde de seleção do sistema.

| Propriedade | Valor |
|---|---|
| Fundo | `#0F766E` → token `--verde-padrao` (= `--sel`) |
| Texto | `#FFFFFF` (contraste 5,5:1) |
| Hover | `#0B5E58` → `--sel-hover` |

Uso: selecionado, ativo, hover de ação "editar/confirmar", botões de barra acesos.

## Espaçamento de tag

O da tag vermelha padrão — vale para **toda** tag/etiqueta de texto curto.

| Propriedade | Valor |
|---|---|
| Padding | `3px 9px` → token `--tag-pad` |
| Raio | `4px` → token `--tag-raio` |
| Fonte | 600, 13px, line-height 1.35 |

## Como aplicar

```html
<span class="tag-padrao vermelho">Vencido</span>
<span class="tag-padrao verde">Em dia</span>
```

Tokens em `src/styles/tokens.css`; a classe `.tag-padrao` em `src/styles/barra-lista.css`.
