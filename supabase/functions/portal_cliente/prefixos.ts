/**
 * Tabela de prefixos que a Edge `portal_cliente` busca por TAG do cliente.
 *
 * ── POR QUE ISTO EXISTE COMO ARQUIVO SEPARADO ───────────────────────────────
 *
 * A Edge roda em Deno e não importa de `src/`. A tabela verdadeira do projeto é
 * `src/services/familiasChave.ts` (POR_TAG), mantida e coberta por teste. Aqui ela é
 * necessariamente DUPLICADA — e duplicação de tabela é fonte clássica de dessincronização.
 *
 * O modo de falha é o pior possível: alguém acrescenta uma família em `familiasChave.ts`,
 * esquece deste arquivo, e a chave **para de chegar ao Portal**. Nenhum erro aparece; o
 * cliente só vê a folha com "-".
 *
 * Por isso o arquivo é isolado, sem nada de Deno dentro, e importado por
 * `src/features/portal/paridadePrefixos.test.ts`, que **quebra o build** se as duas listas
 * divergirem. É o mesmo remédio de `palco.varreduraTemplates.test.ts` (I-24).
 *
 * ── REGRA AO MEXER ──────────────────────────────────────────────────────────
 *
 * Família nova em `familiasChave.POR_TAG` → ou entra em `PREFIXOS_POR_TAG`, ou entra em
 * `FORA_DO_PORTAL` com o motivo escrito. Nunca deixe implícito.
 */

/**
 * Buscadas por `<prefixo><TAG>`, para cada TAG vinculada ao cliente.
 *
 * A lista é a `POR_TAG` do app menos o que está em `FORA_DO_PORTAL`. Ser generosa aqui é
 * barato (a consulta é por igualdade, servida pelo índice `(org_id, chave)`) e ser avara é
 * caro (folha silenciosamente vazia).
 */
export const PREFIXOS_POR_TAG: string[] = [
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
  'nr13_historico_indice_',
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
 * Chaves GLOBAIS da organização que o cliente pode ver.
 *
 * Cada linha aqui é uma decisão de segurança: o cliente passa a receber um dado que **não é do
 * ativo dele**. As duas atuais são dados da empresa executante — logo, razão social, rubricas
 * dos responsáveis técnicos — que ele legitimamente vê impressos no relatório e no prontuário.
 *
 * Acrescentar item nesta lista exige análise. O teste de paridade cobra igualdade EXATA
 * justamente para que ninguém amplie isto sem perceber.
 */
export const GLOBAIS_LIBERADAS: string[] = ['nr13_minha_empresa', 'nr13_lista_phs'];

/**
 * Famílias de `POR_TAG` que o Portal **deliberadamente não busca**, com o motivo.
 *
 * Existe para que uma exclusão seja explícita e revisável, em vez de virar um prefixo que
 * alguém "esqueceu" de copiar.
 */
export const FORA_DO_PORTAL: string[] = [
  // Fase 10B.2 · registros do Livro de Segurança EM RASCUNHO.
  //
  // O cliente enxerga o Livro do equipamento dele, e o Livro é documento legal: ele só pode
  // ver o que está TRANCADO — registro incorporado à cadeia de integridade, com hash, que o
  // engenheiro decidiu tornar oficial. Um rascunho é trabalho em andamento; entregá-lo ao
  // cliente seria mostrar como documento aquilo que ainda pode mudar.
  //
  // A exclusão aqui é a segunda camada: os rascunhos já vivem em chave separada
  // (`nr13_livro_rascunho_<TAG>`), fora de `nr13_livro_<TAG>`, que é o que o Portal lê.
  'nr13_livro_rascunho_',

  // Fase 12A · emissões arquivadas do PRONTUÁRIO.
  //
  // Não é decisão de segurança: o prontuário emitido é documento do cliente e
  // caberia bem no Portal. Fica de fora porque a tela do Portal ainda não sabe
  // apresentá-lo — não há listagem, nem visualizador, nem lugar para a revisão.
  // Servir a chave sem tela que a use só aumentaria o payload da carga inicial.
  //
  // Quando o Portal ganhar essa tela, mover para PREFIXOS_POR_TAG (ou para as
  // buscadas sob demanda, que é o desenho certo: o registro traz pdfRef e SHA,
  // e o arquivo em si vem pelo portal_arquivo).
  'nr13_pront_emitido_',

  // Fase 12B · a foto REAL da placa de identificação.
  //
  // O cliente já recebe a placa: ela vai DENTRO do PDF do relatório, embutida
  // na folha de identificação. Servir a chave daria ao Portal a referência de
  // um arquivo do bucket que a tela dele não abre — e o Portal não tem sessão
  // para pedir URL assinada de foto avulsa. O documento é o canal.
  'nr13_placa_',
];

/**
 * Famílias servidas **somente sob demanda** — não entram na carga inicial.
 *
 * `nr13_rel_<id>_<TAG>` é o registro COMPLETO de um relatório (~9,3 KB, 30 % do payload
 * medido). A listagem do Portal precisa só do índice; o registro inteiro só é necessário
 * quando o cliente abre um relatório LEGADO, anterior ao PDF arquivado (§7-quater).
 *
 * Ela não está em `PREFIXOS_POR_TAG` de propósito, e é por isso que esta lista existe: sem
 * ela, exigir que toda chave pedida estivesse na lista da carga inicial quebraria a abertura
 * desses relatórios no Portal.
 */
export const PREFIXOS_SOB_DEMANDA: string[] = ['nr13_rel_'];

/**
 * A chave pedida pelo cliente pode ser servida?
 *
 * Três perguntas, **nesta ordem**, e a ordem é a regra:
 *
 *  1. **está negada?** `FORA_DO_PORTAL` vence tudo. Vem primeiro porque as famílias se
 *     encaixam: `nr13_livro_rascunho_<TAG>` começa com `nr13_livro_`, que é permitido, e
 *     termina com `_<TAG>` de um equipamento que é mesmo do cliente. Só a negação explícita,
 *     avaliada ANTES da permissão, o exclui;
 *  2. **é de um equipamento deste cliente?** `tags` vem do banco, nunca do corpo do request —
 *     o pedido diz QUAL chave, jamais A QUEM ela pertence;
 *  3. **é de uma família prevista?** Sem isto, terminar em `_<TAG>` bastava, e qualquer chave
 *     futura passava a ser legível pelo cliente no dia em que fosse criada, sem ninguém
 *     decidir isso.
 *
 * Função PURA, e separada da Edge de propósito: é a regra de autorização, e ela precisa de
 * teste — o runtime da Edge é Deno e não roda na suíte.
 */
export function chaveAutorizadaSobDemanda(chave: string, tags: string[]): boolean {
  if (typeof chave !== 'string' || chave === '') return false;
  if (FORA_DO_PORTAL.some((p) => chave.startsWith(p))) return false;
  if (!tags.some((t) => chave.endsWith(`_${t}`))) return false;
  return [...PREFIXOS_POR_TAG, ...PREFIXOS_SOB_DEMANDA].some((p) => chave.startsWith(p));
}

/**
 * Prefixo de escopo de ID (não de TAG) que o Portal precisa.
 *
 * `nr13_rastreab_` são os certificados dos instrumentos PADRÃO da executante, anexados ao fim
 * dos relatórios. Não terminam em `_<TAG>` — são da empresa, não do ativo — então não podem
 * ser resolvidos pela lista por TAG. Continuam buscados por prefixo, e a lista é curta.
 */
export const PREFIXO_RASTREABILIDADE = 'nr13_rastreab_';

/**
 * Monta o conjunto EXATO de chaves a consultar para um cliente.
 *
 * A lista é construída **a partir das TAGs já autorizadas** — construir a lista É a validação.
 * Não existe caminho em que uma chave fora do conjunto do cliente entre na consulta.
 */
export function chavesDoCliente(tags: string[]): string[] {
  const out: string[] = [...GLOBAIS_LIBERADAS];
  for (const tag of tags) {
    for (const prefixo of PREFIXOS_POR_TAG) out.push(`${prefixo}${tag}`);
  }
  return out;
}
