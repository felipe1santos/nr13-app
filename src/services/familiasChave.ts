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
const POR_TAG = [
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
  'nr13_lotes_cal_',
  'nr13_med_esp_',
  'nr13_med_grid_',
  'nr13_modelo3d_',
  'nr13_pref_unidade_',
  'nr13_pront_fab_',
  'nr13_prontuario_meta_',
  'nr13_termo_livro_',
  'nr13_vaso_',
  'nr13_vaso_ac_corpo_',
  'nr13_vaso_cald_',
  'nr13_vaso_gv_',
  'nr13_vida_',
];

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

export function escopoDaChave(chave: string): Escopo {
  if (GLOBAIS.has(chave)) return 'global';
  if (prefixoMaisLongo(chave, POR_ID)) return 'id';
  if (prefixoMaisLongo(chave, POR_TAG)) return 'tag';
  return 'global'; // desconhecida: nunca inventar TAG
}

export function tagDaChave(chave: string): string | null {
  if (GLOBAIS.has(chave)) return null;
  if (prefixoMaisLongo(chave, POR_ID)) return null;
  const p = prefixoMaisLongo(chave, POR_TAG);
  return p ? chave.slice(p.length) : null;
}
