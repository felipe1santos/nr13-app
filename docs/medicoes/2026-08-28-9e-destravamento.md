# Fase 9 · 9E — o destravamento: três defeitos, um deles silencioso (28/08/2026)

O rollout de 25/08 reprovou no passo 11: **clicar em "Visualizar" não abria nada**.
Ao consertar esse caminho, apareceram mais dois defeitos que estavam escondidos
atrás dele — um deles é o que realmente mantinha a tela sem documento nenhum.

> **Nenhum PDF foi regenerado e nenhum SHA-256 mudou.** As três correções são de
> NAVEGAÇÃO e de PROJEÇÃO. O arquivo arquivado nunca foi tocado — nem em 25/08,
> quando o defeito foi encontrado, nem agora.

---

## Defeito 1 — a rota que a própria flag impedia de existir

`RelatoriosV9` delegava a abertura navegando para `/relatorios?tag=…&rel=…`,
confiando que "a tela legada sabe abrir a partir da TAG". Duas coisas erradas na
mesma linha:

1. com `busca_v9` LIGADA, `/relatorios` **sempre** montava a V9 — o modo vinha da
   flag, uma vez, e nunca da URL;
2. a tela legada **nunca leu `tag`/`rel`**. Mesmo com a flag desligada, aquele
   link não abriria nada: ela é TAG-first e só se chega a um relatório clicando no
   equipamento.

**Correção.** A V9 resolve o documento ela mesma: `pdfRef` → `VisualizadorPdf`, na
própria tela, com barra de volta e o SHA-256 à vista. É o que o §7-quater já
mandava — relatório finalizado é um ARQUIVO, não uma receita —, então não há
palco, não há iframe e não há remontagem.

Peças: `artefatoDoItemBuscado` (`features/relatorios/artefatoRelatorio.ts`)
converte o caminho em texto que a projeção guarda na `RefFoto` que o visualizador
exige.

---

## Defeito 2 — `pdfRef ->> 'caminho'`, e o campo se chama `path`

**Este é o que fazia a tela ficar sem documento.** A projeção
(`projetar_relatorios`, em `busca_manutencao.sql`) lia:

```sql
case when jsonb_typeof(r -> 'pdfRef') = 'object' then (r -> 'pdfRef') ->> 'caminho'
```

`RefFoto` guarda o caminho em **`path`**. O `->>` de uma chave inexistente devolve
`NULL` sem erro nenhum: **todo** relatório finalizado ficava na projeção com
`pdf_ref` nulo. Medido em produção em 25/08: `pdf_ref` nulo nas 15 linhas da
organização de teste, **inclusive nas 4 que têm artefato e `sha256` gravados**.

O mesmo erro estava do lado do cliente, em `relatoriosLocais.ts` (o caminho
offline lia `(pdfRef as {caminho}).caminho`) — ou seja, os dois caminhos que
levam ao documento estavam quebrados pelo mesmo motivo.

**Correção.** `->> 'path'` na projeção, `caminhoDoPdf()` no serviço local, e três
proteções para o erro não voltar em silêncio:

- `busca_relatorios.sql` **recusa ser aplicado** sobre uma projeção velha: uma
  guarda `do $$ … $$` inspeciona o `prosrc` de `projetar_relatorios` e estoura com
  a instrução de reaplicar a manutenção antes;
- `scripts/fase9/testes-9e.sql` ganhou a seção **6-quater**, que projeta um
  registro com `pdfRef` objeto e exige o caminho do outro lado — passando pela
  projeção de verdade, não inserindo na tabela na mão;
- `relatoriosLocaisEscopo.test.ts` cobre a mesma conversão no lado offline.

> **Por que a auditoria não pegou:** `auditar_projecao` compara a projeção com o
> que a função ATUAL produz. Função errada e projeção errada CONVERGEM. É a
> armadilha nº 2 do ponto de retomada, e ela custou este defeito.

---

## Defeito 3 — os 12 relatórios "a mais" (era decisão do dono, virou desenho)

A V9 listava **15** onde a legada mostrava **3**. Não era duplicação: a legada
lista o histórico do equipamento ESCOLHIDO; a V9 lê a projeção da organização
inteira, e enxerga também o relatório cujo equipamento saiu do cadastro.

**Decisão implementada:** nada some e nada aparece sem aviso.

| | comportamento |
|---|---|
| Escopo padrão | `ativos` — o mesmo conjunto que a tela antiga sempre mostrou |
| Quando há histórico fora do recorte | a tela **diz quantos são** e oferece "Ver histórico" |
| Escopos | `ativos` · `historicos` · `todos`, na URL como o resto do estado |
| Na linha | selo **"Equipamento excluído"** — a omissão afirmaria que o equipamento ainda existe |
| Contagem | `contar_relatorios` devolve `total` e `historicos` **na mesma linha**, senão os dois números apareceriam incoerentes entre si |

**A guarda que impede o vazio falso:** "ativo" é decidido por
`equipamentos_index`, que é PROJEÇÃO. Numa organização cujo rebuild ainda não
rodou ela está VAZIA — sem guarda, todo relatório viraria órfão, o escopo padrão
devolveria lista vazia e a tela afirmaria "não há relatórios" para quem tem o
parque inteiro. Sem catálogo projetado a resposta honesta é "não sei": ninguém é
marcado, e o escopo não corta. O mesmo vale offline, onde o aparelho pode ter o
índice de relatórios de uma TAG sem ter baixado a ficha dela.

---

## O relatório LEGADO, que não tem arquivo

Relatório salvo antes do §7-quater (12/08/2026) não tem `pdfRef` — só a tela
antiga sabe remontá-lo a partir da receita. Para ele existe agora uma saída
explícita na URL, `legado=1`, que a rota respeita mesmo com a flag ligada
(`features/relatorios/rotaRelatorios.ts`), e a tela antiga passou a abrir por link
(`?tag=…&rel=…`). Se o relatório não estiver no índice daquela TAG (aparelho novo
sob `boot_v9`, cache frio), a tela para no **histórico da TAG certa** — destino
útil, e não a lista de equipamentos de onde o usuário saiu.

O que não pode voltar a acontecer é o clique não fazer nada.

---

## Verificação local

| | |
|---|---|
| Suíte | **1410/1410** (eram 1320 em 25/08) |
| `tsc -b` | limpo |
| `npm run build` | verde |
| Testes novos | `artefatoDoItemBuscado` (4), `rotaRelatorios` (9), escopo servidor + escopo local |

A tela não tem teste de componente: a suíte roda em `environment: 'node'`, sem
DOM. Por isso as regras que quebraram em produção — qual tela a rota monta, o que
é alvo de um link, e como o caminho do PDF vira referência — foram extraídas para
**funções puras**, que a suíte cobre. O que sobrou dentro do componente é ligação.

---

## O que falta para desbloquear a 9E de verdade

Isto é código verificado localmente. **A 9E continua BLOQUEADA até o rollout
passar em produção**, e ele precisa, NESTA ordem:

1. **Reaplicar `supabase/busca_manutencao.sql`** — é o `->> 'path'`. Sem isso
   nada mais adianta: a projeção continua com `pdf_ref` nulo.
2. **Reprojetar** as organizações envolvidas (`reiniciar_rebuild_busca` +
   `reconstruir_indice_busca`) e conferir `pdf_ref` não nulo nas linhas que têm
   `sha256`.
3. **Reaplicar `supabase/busca_relatorios.sql`** — assinaturas novas
   (`p_escopo`), coluna `equipamento_ativo`, `historicos` na contagem. Ele agora
   RECUSA rodar se o passo 1 não tiver sido feito.
4. Publicar o front e conferir o bundle novo.
5. Repetir o roteiro de 14 passos na organização de TESTE, com atenção ao **passo
   11**: clicar em "Visualizar" num relatório com artefato e confirmar que o PDF
   abre; conferir que a busca continua com **zero** requisição de PDF; e clicar
   num relatório de equipamento excluído para ver o selo e o aviso.

Rollback continua sendo desligar a flag: a projeção é derivada, `app_storage`
segue sendo a verdade e a 9E nunca escreve.
