# Refino global de UX — o shell, os filtros e a prévia

**07/09/2026.** Só UX/UI, layout e navegação. Nenhuma documentação técnica foi
tocada: PDF, memorial, fórmulas, SHA, `pdfRef`, bytes arquivados, histórico,
Livro e certificados arquivados seguem exatamente como estavam.

---

## 1 · A auditoria, medida

Quatro telas de lista, mesma janela, 1.154px de área disponível:

| tela | largura da página | `<h1>` na página | topo até o conteúdo |
|---|---|---|---|
| `/relatorios` | 1.144 | não | **61px** |
| `/prontuarios` | 1.000 | sim | 157px |
| `/calibracoes` | 1.000 | sim | 174px |
| `/inspecoes` | 1.000 | sim | **208px** |

Duas causas, e as duas no CSS da página:

1. **`max-width: 1000px`** numa área de 1.154 — a lista virava uma caixa
   estreita com 154px de margem morta de cada lado;
2. **`padding: 24px` + `gap: 18px`**, somados a um **`<h1>` que repetia** o
   título que a topbar já mostra.

`/relatorios` não tinha nenhum dos dois — é por isso que ela já estava compacta.
A correção foi alinhar as três ao mesmo shell, não inventar um novo.

### Depois, medido em produção

| tela | largura | topo até o conteúdo | ganho |
|---|---|---|---|
| `/prontuarios` | 1.000 → **1.290** | 157 → **82px** | −75px, +290 de largura |
| `/calibracoes` | 1.000 → **1.290** | 174 → **105px** | −69px |
| `/inspecoes` | 1.000 → **1.290** | 208 → **133px** | −75px |

*(a área disponível na janela da medição final era 1.290px; o `max-width` de
1.400 só limita em telas maiores que isso.)*

## 2 · O filtro de prontuários, reescrito

Ele perguntava **"com prontuário / sem prontuário ainda"** — a pergunta de uma
lista de EQUIPAMENTOS, que era o que a tela mostrava até anteontem. Desde que a
lista passou a ser de DOCUMENTOS, essa pergunta não tem resposta: toda linha é
um documento, então todas "têm prontuário". Saiu.

| seção | o que oferece |
|---|---|
| Período | `De` / `Até` + **Hoje · Últimos 7 dias · Últimos 30 dias** |
| Empresa / cliente | lista com a **logo real** do cadastro |
| Equipamento | busca própria; TAG, nome, tipo e cliente |
| Situação | rascunho · emitido |
| Revisão | as revisões que existem na lista |
| Tipo / categoria | **só aparecem quando há valor** |

Três decisões que valem registro:

- **o período recorta pelo DIA, não pelo instante.** Comparar o ISO inteiro
  deixaria de fora tudo que foi emitido depois das 00:00 do dia final;
- **"Últimos 7 dias" inclui hoje.** São 7 contando o de hoje, que é o que a
  pessoa quer dizer; contar 7 para trás a partir de ontem daria 8;
- **documento sem data não é escondido por um filtro qualquer.** Ele só sai
  quando o recorte pedido é justamente o de data — aí ele não tem como provar
  que está dentro. Sumir em silêncio é o defeito que este sistema persegue.

**A logo é a real** (`logoUrl` do cadastro do cliente). Sem logo, a inicial —
nunca uma imagem inventada, nunca um serviço externo de avatar.

`tipo` e `categoria` entraram nas entradas NOVAS do índice. Os seletores deles só
aparecem quando há valor para oferecer: um seletor que filtra tudo para fora sem
explicação é pior do que nenhum.

## 3 · A prévia do prontuário subiu

`"Documento emitido em … · 3 páginas · código de verificação …"` era um parágrafo
de **largura inteira** entre a barra e a prévia, e empurrava o documento para
baixo em toda abertura. O mesmo texto virou a segunda linha da identificação, na
barra, com o código completo no `title` — ele é longo e serve para conferir.

O **erro de emissão continua onde estava**: ele é excepcional, precisa ser lido,
e não cabe numa linha discreta.

### "Editar" respeita o que está na tela

Com documento emitido, o que está aberto é um ARQUIVO que não se edita. A ação
principal passou a ser **Emitir revisão**, e **"Editar dados (nova revisão)"**
desceu para o menu, com o nome do que faz.

A regra do §22 **não mudou**: editar depois de emitir sempre produziu uma revisão
nova, sem tocar a anterior. O que mudou é a interface parar de sugerir que se
está editando o documento aberto.

## 4 · Avatar do funcionário

Iniciais, com cor derivada do nome — estável, que é o que faz o avatar ajudar a
achar alguém numa lista em vez de ser só um círculo. "João da Silva" vira **JS**,
não JD: as partículas são ignoradas.

**Não criei campo de foto.** O cadastro não tem um, e a `assinatura` é a rubrica
que vai ao documento assinado — usá-la como retrato mostraria um rabisco no lugar
de uma pessoa e exporia num lugar casual algo que só deve aparecer no documento.
Mudar o dado por causa de layout é o que este projeto não faz; há teste que
verifica que o campo `foto` continua não existindo em `Funcionario`.

## 5 · Verificação

### Produção

| item | resultado |
|---|---|
| largura das três telas | 1.000 → **1.290px** |
| topo até o conteúdo | −69 a −75px por tela |
| `<h1>` duplicado | removido nas três |
| painel de filtro exposto em Calibrações | não existe |
| filtro de documentos | 5 seções, 3 atalhos, **2 logos reais** carregando |
| "com/sem prontuário" | **ausente** |
| avatares em Funcionários | 2, cores distintas, 34px, antes do nome |
| transbordo | nenhuma tela |

### Três larguras

1400 / 768 / 386: **sem rolagem horizontal**, botão de ação com 34px no desktop e
44px no celular.

### Suíte

| | |
|---|---|
| gates novos | 31 asserções (filtro, atalhos, avatar, shell, prévia) |
| total | **2.305 testes, 175 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |

## 6 · Pendências declaradas

- **as telas de cadastro não foram alteradas.** A auditoria procurou nelas o
  mesmo defeito (shell estreito, `<h1>` duplicado, painel de filtro fixo) e não
  encontrou: só Prontuários, Inspeções e Calibrações tinham `max-width: 1000px`,
  e só elas repetiam o título. Mexer nelas seria redesenho gratuito, que o
  próprio pedido proíbe;
- **o formulário do prontuário não foi reorganizado de novo** — ele passou por
  isso na rodada anterior (barra única, 31 campos num componente, campo
  automático marcado, −12% de altura). O que mudou aqui foi o shell da página em
  volta dele;
- **o visualizador de PDF (miniaturas, zoom) não foi tocado.** §20 pede
  "miniaturas fechadas por padrão"; elas são do componente de prévia, que é
  parte do caminho do documento — e esta rodada tinha instrução explícita de não
  mexer aí. Fica registrado como próximo passo possível;
- **a medição por iframe aninhado deixou de funcionar** nas rotas que montam
  iframes próprios. As medições acima foram feitas por navegação real, uma tela
  por vez.
