/**
 * Fase 9 · 9D — o que o boot precisa ANTES de qualquer tela.
 *
 * Até aqui o boot esperava a organização inteira (`lerTudo`), e essa espera é
 * o defeito da Fase 8: ~4 min e 1,63 GB para abrir `/equipamentos` com 51.000
 * equipamentos. Esta tabela é o oposto — a lista EXPLÍCITA e curta do que
 * precisa estar no `Map` para a primeira tela existir.
 *
 * REGRA QUE DÁ SENTIDO À LISTA: **nada aqui pode crescer com o número de
 * equipamentos.** Um teto só é teto se for independente do tamanho da conta.
 * `hidratacaoEssencial.test.ts` trava isso comparando com `POR_TAG`.
 *
 * O resto continua chegando, só que quando for preciso:
 *   · as chaves de um equipamento → `carregarEquipamento(tag)` (desenho §4);
 *   · a lista de equipamentos     → a projeção de busca (`buscaIndex`).
 */

/**
 * Chaves inteiras, por nome. Comparação EXATA — a mesma disciplina do
 * `GLOBAIS` de `familiasChave.ts`.
 *
 * Cada uma está aqui por uma tela que abre logo no começo:
 *   · `nr13_minha_empresa`  — logo e cabeçalho, presentes em toda folha;
 *   · `nr13_lista_phs`      — assinantes; sem ela o relatório sai sem rubrica;
 *   · `nr13_clientes`       — lista de clientes (cresce com clientes, não com
 *                             equipamentos);
 *   · `nr13_permissoes_`    — (prefixo, abaixo) módulos do sub-login: o MENU
 *                             depende dela, e um menu que nasce errado manda o
 *                             usuário para uma rota que ele não pode ver;
 *   · `nr13_termos_aceite`  — o modal de termos é decidido no boot;
 *   · `nr13_demo_seed`      — marcador do seed do trial, conferido na entrada;
 *   · `nr13_uso_contadores` — contador de uso; minúsculo, e some se não vier;
 *   · `nr13_agenda_notas`   — as notas do calendário do Dashboard.
 *
 * FICAM DE FORA, de propósito:
 *   · `nr13_historico_relatorios` — LEGADO que cresce sem teto (§7-sexies);
 *   · `nr13_relatorio_meta_atual`, `nr13_inspecao_atual`, `nr13_injecao_atual`,
 *     `nr13_prontuario_atual` — documento em montagem, e as duas do meio
 *     carregam as fotos de campo (640 KB cada). São ESCRITAS na geração do
 *     documento; nenhuma tela precisa delas para abrir;
 *   · `nr13_rastreabilidade` — chave legada, sem leitor vivo.
 */
export const CHAVES_ESSENCIAIS: string[] = [
  'nr13_minha_empresa',
  'nr13_lista_phs',
  'nr13_clientes',
  'nr13_termos_aceite',
  'nr13_demo_seed',
  'nr13_uso_contadores',
  'nr13_agenda_notas',
];

/**
 * Famílias por PREFIXO cujo tamanho depende da organização, não do parque.
 *
 * `nr13_rastreab_` é o certificado do instrumento PADRÃO: **um por tipo de
 * instrumento** entre os ativos (§2 do CLAUDE.md) — uma lista de unidades, não
 * de milhares. Entra porque a injeção no relatório a lê do `Map`, de forma
 * síncrona. Ela é a família mais PESADA daqui (o PDF vive no registro do
 * servidor), e é por isso que `hidratarEssencial` mede por família: o teto
 * real desta lista se decide com número, não com estimativa.
 *
 * `nr13_permissoes_` é uma linha por sub-login da organização.
 */
export const PREFIXOS_ESSENCIAIS: string[] = ['nr13_rastreab_', 'nr13_permissoes_'];

/** O que uma hidratação essencial trouxe — o instrumento de medida da 9D.1. */
export interface MedidaEssencial {
  chaves: number;
  bytes: number;
  /** Bytes por família (chave exata ou prefixo), para decidir com número. */
  porFamilia: Record<string, number>;
}

/**
 * A família de uma chave, do ponto de vista desta lista. Serve à medida — e é
 * separada da `familiasChave.ts` porque aqui o rótulo é o PREFIXO declarado,
 * não o escopo ('tag'/'global'/'id').
 */
export function familiaEssencial(chave: string): string {
  const prefixo = PREFIXOS_ESSENCIAIS.find((p) => chave.startsWith(p));
  return prefixo ?? chave;
}
