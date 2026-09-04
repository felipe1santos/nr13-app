/**
 * Tabela EXPLÍCITA de famílias de chave, levantada por varredura de `src/` e
 * `public/` em 04/08/2026.
 *
 * POR QUE NÃO É REGEX: a dedução genérica errava em chaves reais do projeto —
 * `nr13_med_esp_ACA 2040` produzia a TAG "esp_ACA 2040", `nr13_livro_config_X`
 * produzia "config_X" e `nr13_minha_empresa` produzia "empresa". Índice de TAG
 * errado significa `excluirVaso` apagando o equipamento errado e o palco
 * montando o documento errado.
 *
 * REGRA AO ACRESCENTAR CHAVE NOVA: registre a família aqui. Chave desconhecida
 * cai em 'global' — nunca vira TAG inventada.
 */
export type Escopo = 'tag' | 'global' | 'id';

/**
 * Prefixos de chaves ligadas a um equipamento (`nr13_<familia>_<TAG>`).
 * A ordem da lista NÃO importa: o casamento é sempre pelo prefixo mais longo,
 * então `nr13_livro_config_` vence `nr13_livro_` sem depender de ordenação.
 */
export const POR_TAG = [
  'nr13_assinantes_pront_',
  'nr13_assinantes_rel_',
  'nr13_autoclave_dados_',
  'nr13_calc_',
  'nr13_calc_gv_',
  'nr13_caldeira_dados_costado_',
  'nr13_caldeira_dados_espelho_',
  'nr13_caldeira_dados_tampo_',
  'nr13_calibracoes_',
  'nr13_cat_',
  'nr13_componentes_cal_',
  'nr13_croqui2d_',
  'nr13_croqui3d_',
  'nr13_docs_',
  'nr13_emp_',
  'nr13_folha_dados_',
  'nr13_fotos_',
  'nr13_info_',
  'nr13_laudo_',
  'nr13_livro_',
  'nr13_livro_config_',
  // 10B.2 · registros do Livro EM RASCUNHO. Chave separada de `nr13_livro_` de
  // propósito: é o que os mantém fora da projeção, do Portal e da folha
  // impressa. O casamento é pelo prefixo MAIS LONGO, então esta vence.
  'nr13_livro_rascunho_',
  'nr13_lotes_cal_',
  'nr13_med_esp_',
  'nr13_med_grid_',
  'nr13_modelo3d_',
  'nr13_pref_unidade_',
  // 12B · a foto REAL da placa de identificação (guarda `RefFoto`, nunca base64).
  'nr13_placa_',
  'nr13_pront_fab_',
  // 12A · emissões arquivadas do prontuário (lista por revisão; nunca sobrescreve).
  'nr13_pront_emitido_',
  // Índice leve do histórico de relatórios do equipamento. Não confundir com
  // `nr13_historico_relatorios` (global, LEGADO — comparação exata em GLOBAIS).
  'nr13_historico_indice_',
  // O registro do prontuário do equipamento. Estava fora desta lista, então caía
  // em 'global' e nunca era indexado por TAG: não ia para o palco (a folha
  // PLACA.html lê `nr13_prontuario_<TAG>` para o código de projeto) e não era
  // apagada junto com o equipamento por `excluirVaso`. O casamento é pelo
  // prefixo mais longo, então `nr13_prontuario_meta_<TAG>` continua sendo meta, e
  // `nr13_prontuario_atual` continua global (comparação exata vem antes).
  'nr13_prontuario_',
  'nr13_prontuario_meta_',
  'nr13_termo_livro_',
  'nr13_vaso_',
  'nr13_vaso_ac_corpo_',
  'nr13_vaso_cald_',
  'nr13_vaso_gv_',
  'nr13_vida_',
];

/**
 * Famílias `nr13_<familia>_<id>_<TAG>`: têm id PRÓPRIO e TAG, nessa ordem.
 *
 * A TAG fica no FIM porque a Edge Function `portal_cliente` seleciona as chaves
 * do cliente por `chave.endsWith('_' + tag)` — pôr o id por último tiraria os
 * relatórios do Portal e exigiria um deploy da Edge só para isso.
 *
 * A TAG é tudo que vem depois do PRIMEIRO `_` do sufixo, e isso só é exato
 * porque `chaveRelatorio()` troca `_` por `-` no id antes de montar a chave (ver
 * `historicoRelatorios.ts`). Sem essa sanitização, um id com `_` moveria a
 * fronteira e o registro seria indexado sob uma TAG inexistente — o mesmo
 * defeito que fez esta tabela deixar de ser regex.
 */
const POR_ID_E_TAG = ['nr13_rel_'];

/** Registros identificados por id próprio, não por TAG de equipamento. */
const POR_ID = ['nr13_rastreab_', 'nr13_calibracao_item_', 'nr13_permissoes_'];

/** Chaves inteiras, sem sufixo — comparação exata, não por prefixo. */
const GLOBAIS = new Set([
  'nr13_minha_empresa',
  'nr13_lista_phs',
  'nr13_clientes',
  'nr13_demo_seed',
  'nr13_historico_relatorios',
  'nr13_uso_contadores',
  'nr13_termos_aceite',
  'nr13_relatorio_meta_atual',
  'nr13_inspecao_atual',
  'nr13_injecao_atual',
  'nr13_prontuario_atual',
  'nr13_rastreabilidade',
  'nr13_agenda_notas',
  // 10B.1 · índice dos relatórios em rascunho. Global de propósito: a tela de
  // relatórios mostra rascunho de qualquer equipamento, e um índice por TAG
  // obrigaria a varrer o parque para montar essa lista.
  'nr13_rascunhos',
  // Ids de relatório FINALIZADO tirados da lista padrão de `/relatorios`.
  // Global porque a tela mostra relatório de todos os equipamentos — e guarda
  // ids, nunca documentos: arquivar não apaga PDF, SHA nem pdfRef.
  'nr13_relatorios_arquivados',
  // Fase 11 · qual motor gera o PDF de uma finalização NOVA. Global porque é
  // decisão da ORGANIZAÇÃO, não do equipamento — e não alcança documento já
  // emitido, que abre sempre pelo seu próprio pdfRef.
  'nr13_motor_pdf',
  'nr13_motor_prontuario',
  // Fase 12B · o MODELO escolhido pela empresa ('classico' | 'novo'). Global
  // pela mesma razão: é decisão da organização. O motor acima continua sendo o
  // termo TÉCNICO, e esta chave a escolha que o usuário faz na tela.
  'nr13_modelo_relatorio',
]);

/**
 * Prefixo mais longo que casa a chave e ainda deixa sufixo. Exigir sufixo
 * não-vazio impede que `nr13_info_` (sem TAG) seja tratada como equipamento.
 */
function prefixoMaisLongo(chave: string, lista: string[]): string | null {
  let achado: string | null = null;
  for (const p of lista) {
    if (chave.startsWith(p) && chave.length > p.length) {
      if (!achado || p.length > achado.length) achado = p;
    }
  }
  return achado;
}

/**
 * TAG de uma chave `nr13_<familia>_<id>_<TAG>`: o sufixo depois do primeiro `_`.
 * `null` quando não há esse `_` (chave malformada) — nunca inventa TAG.
 */
function tagAposId(chave: string, prefixo: string): string | null {
  const resto = chave.slice(prefixo.length);
  const corte = resto.indexOf('_');
  if (corte < 0 || corte === resto.length - 1) return null;
  return resto.slice(corte + 1);
}

/**
 * Cópias de conflito que a versão anterior gravava DENTRO de `dados`, como
 * `nr13_conflito_<chave>__<timestamp>`.
 *
 * Registradas aqui porque a regra deste arquivo é essa — chave nova se declara
 * na tabela, nunca se deduz por regex. O escopo é 'global' e a TAG é `null`
 * DE PROPÓSITO: mesmo enquanto a migração da Fase 3 não rodou num aparelho, uma
 * cópia de conflito não pode ser indexada sob a TAG do equipamento nem ser
 * arrastada para o palco ou para o `excluirVaso` como se fosse dado dele.
 *
 * Nada novo grava com este prefixo desde 16/08/2026: o destino é a store
 * `conflitos`, fora do `Map`.
 */
export const PREFIXO_CONFLITO_LEGADO = 'nr13_conflito_';

export function ehChaveDeConflitoLegado(chave: string): boolean {
  return chave.startsWith(PREFIXO_CONFLITO_LEGADO);
}

export function escopoDaChave(chave: string): Escopo {
  if (ehChaveDeConflitoLegado(chave)) return 'global';
  if (GLOBAIS.has(chave)) return 'global';
  const comId = prefixoMaisLongo(chave, POR_ID_E_TAG);
  if (comId) return tagAposId(chave, comId) ? 'tag' : 'global';
  if (prefixoMaisLongo(chave, POR_ID)) return 'id';
  if (prefixoMaisLongo(chave, POR_TAG)) return 'tag';
  return 'global'; // desconhecida: nunca inventar TAG
}

export function tagDaChave(chave: string): string | null {
  if (ehChaveDeConflitoLegado(chave)) return null;
  if (GLOBAIS.has(chave)) return null;
  const comId = prefixoMaisLongo(chave, POR_ID_E_TAG);
  if (comId) return tagAposId(chave, comId);
  if (prefixoMaisLongo(chave, POR_ID)) return null;
  const p = prefixoMaisLongo(chave, POR_TAG);
  return p ? chave.slice(p.length) : null;
}
