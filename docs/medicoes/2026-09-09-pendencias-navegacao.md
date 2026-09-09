# Pendências, navegação, ART e projeção do rascunho — 09/09/2026

Commit `63e7340`. Bundle em produção: `assets/index-C5Hw9dVP.js`,
CSS `assets/index-CAuZTd1i.css`.

---

## 1. A auditoria: por que a barra mostrava pouco

`oQueFalta` era uma **segunda lista, escrita à mão** sobre o modelo — doze
`marcar('Cliente', m.cliente)` em sequência. O documento, em paralelo, pintava
de amarelo TODO campo de valor vazio, decidido por `celulaVazia` dentro do
gerador. Duas fontes, duas respostas: a folha cheia de amarelo, a barra dizendo
"faltam 3".

Não era um esquecimento pontual: a lista à mão **não tem como** acompanhar um
documento de 21 folhas que muda de tamanho conforme a inspeção.

## 2. A correção: a pendência nasce onde nasce o amarelo

Cada campo registrado pelo gerador passa a trazer `pendencia`:

| valor | amarelo na prévia | entra na barra |
|---|---|---|
| `critica` | sim | sim |
| `opcional` | sim | não |
| `nenhuma` | não | não |

Ela é decidida em `Documento.classificar`, ao lado do `celulaVazia` que pinta a
célula — nos sete pontos que desenham campo (tabela, parágrafo, bloco elástico,
pílulas, campo livre, área de imagem, logo do cabeçalho). `oQueFalta` deixou de
olhar o modelo e passou a derivar de `editaveis`.

**Sem varredura de pixel.** O gerador já declara id, rótulo, página, caixa e
valor; procurar amarelo no PDF renderizado seria adivinhar o que está escrito.

## 3. Inventário de cobertura (documento ZZ gerado de verdade)

| | quantidade |
|---|---|
| campos distintos desenhados | **509** |
| preenchidos (sem amarelo) | 405 |
| **amarelos críticos → com alerta** | **40** |
| amarelos opcionais → sem alerta | 64 |
| críticos sem alerta | **0** |
| pendências sem campo | **0** |

Os 40 críticos, por seção: Cabeçalho 1 · Capa 1 · Documentos de referência 2 ·
Escopo 1 · Pressões 4 · Categorização 1 · Dados operacionais 3 · Prontuário 1 ·
Memorial 3 · Exames realizados 2 · Instrumentos 6 · Checklist 2 ·
Recomendações 8 · Parecer 2 · Próximas inspeções 3.

## 4. As exclusões, e uma para o dono decidir

**Allowlist declarada** — observação POR ITEM, nas três tabelas que têm a
resposta marcada numa coluna ao lado:

- `documentacao.<n>.obs` — verificação da documentação;
- `checklist<x>.<n>.obs` — checklists NR-13;
- `<exame>.item-<n>.obs` — exames visuais externo e interno.

A terceira **não estava no pedido**, e está aqui declarada como o item 23 manda:
ela tem exatamente a mesma forma das outras duas (SIM/NÃO/N.A. na coluna
vizinha, comentário livre do inspetor). Se o dono discordar, tirar é remover um
`opcional: true`.

Marcado na CÉLULA, no ponto onde ela nasce — não por `label.includes('observação')`,
que daria falso negativo no dia em que uma observação passasse a ser exigida. E
há observações exigidas neste documento: a conclusão de cada exame, as
observações do prontuário e as da categorização continuam críticas.

**ACHADO PARA DECISÃO (não alterado):** as 4 linhas em branco da tabela de
recomendações geram **8 pendências** (texto + prazo de cada uma). Um relatório
pode legitimamente não ter recomendação nenhuma. Não excluí sozinho — é
exatamente o caso do item 23. Se for para excluir, é um `opcional: true` na
célula da recomendação.

## 5. Navegação até o campo

O clique não abre a página: leva ao campo.

`VisualizadorPdfBytes` ganhou `irParaPonto { pagina, fracaoY, pedido }` —
`fracaoY` porque só o visualizador sabe a escala com que desenhou. O campo fica
a **28% do topo** da área (dentro do campo de visão, não colado na borda), e
`pedido` muda a cada clique para o mesmo campo funcionar duas vezes seguidas.

**Medido**, com um PDF de 6 páginas e campos em alturas diferentes:

| campo | página | página certa | visível | posição |
|---|---|---|---|---|
| `capa.art` | 1 | sim | sim | 22% do topo |
| `escopo.texto` | 2 | sim | sim | 22% |
| `th.duracao` | 4 | sim | sim | 22% |
| `parecer.justificativa` | 6 | sim | sim | 22% |

A conta bate no pixel: `scrollTop` calculado 6795, aplicado 6796. O destaque
acende nos quatro e **some sozinho** — `.previa-alvo.is-destacado` = 0 depois de
1,7 s.

Limitação do ambiente de medição, não do código: `scrollTo({behavior:'smooth'})`
não executa em aba oculta, e a aba de teste fica `hidden` nesta máquina. A
posição foi verificada aplicando a MESMA conta do componente sem a animação.

## 6. Campo em Configurações

Quando o campo não se edita na folha (datas, ART, quem assina), o destino é o
painel — mandar o revisor para a folha ali seria levá-lo a um lugar onde ele não
resolve o que a barra apontou. O modal abre, o input recebe **foco + seleção +
destaque de 1,5 s** (`.rel-modal .campo-destacado`).

O mapa é explícito, por id (`destinoPendencia.ts`), e não por prefixo: a divisão
não é por prefixo — `proximas.interna` vem das Configurações e `proximas.nota` é
texto da folha; `ultrassom.resultado` se digita na folha e as medições vêm da
grade.

## 7. A.R.T.

O documento tinha a linha em dois lugares (`capa.art`, `inspecao.art`) e o
sistema **não tinha o campo**: nascia vazia e se preenchia clicando na folha,
em dois campos independentes que podiam divergir dentro do mesmo relatório.

Agora é `meta.art`, preenchido uma vez nas Configurações, alimentando os dois.
Não é o CREA do engenheiro: o CREA identifica o profissional e é o mesmo em
todos os relatórios dele; a ART identifica o contrato desta inspeção.

## 8. Rascunho na lista × prazo oficial

O índice leve (`nr13_rascunhos`) passou a carregar `validade`, `proximaInterna`,
`proximaExterna` e `emissao` — ~40 bytes por item, campo vazio não vira chave. A
linha do rascunho mostra essas datas em vez de dois travessões fixos.

**Isso não o torna prazo oficial**, e a regra não foi tocada: o vencimento sai de
`nr13_historico_indice_<TAG>`, e o rascunho não entra lá. A razão já estava
escrita no cabeçalho de `rascunhos.ts` desde a 10B.1 — um rascunho com data de
emissão viraria "o último relatório" da TAG e apagaria o prazo real do
equipamento. Há teste travando que `registrarRascunho` não toca o índice do
equipamento e que a linha não abre o registro para desenhar.

## 9. O gate

`emissaoVetorial.test.ts` gera o documento e reprova se houver campo crítico sem
pendência, pendência sem campo, opcional fora da allowlist, ou observação por
item na barra. Prova também o ciclo: campo vazio → pendência; override manual →
some; override `branco` (o vazio deliberado) → volta.

`cadeiaPendencias.test.ts` trava os destinos, o índice leve e a fronteira
rascunho × vencimento.

Suíte 2751/2751.

---

## O que NÃO foi validado nesta rodada

Declarado porque metade de uma prova não é prova:

1. **E2E dentro do app em produção.** A sessão da conta de teste caiu durante a
   investigação anterior e eu não insiro credenciais. Tudo acima foi provado em
   suíte e em render isolado (mesma pilha, mesmo componente), e o deploy foi
   conferido por conteúdo do bundle — mas ninguém clicou nas pendências dentro
   do app logado.
2. **Persistência com F5 / logout** (itens 15 e 26). O caminho é o mesmo do
   resto da meta, que já persiste; não testei o ciclo completo.
3. **Dashboard recebendo o prazo do relatório finalizado** (itens 18 e 27). A
   regra existente não foi alterada e o rascunho continua fora; a passagem do
   finalizado para o agregador não foi reexercida nesta rodada.
4. **Auditoria campo a campo do modal de Configurações** (item 13) — feita em
   parte: as fontes e a persistência foram lidas para acrescentar a ART, mas
   sem a tabela completa que o item pede.
