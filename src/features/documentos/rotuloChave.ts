/**
 * Tradução de chave técnica para nome que o inspetor reconhece.
 *
 * A tela de conflito pede uma decisão sobre DADO, e a pergunta só é
 * respondível se ela disser de que dado se trata. "nr13_med_esp_VP-01" não é
 * uma pergunta; "Medição de espessura · VP-01" é.
 *
 * Cobre as famílias que aparecem em conflito na prática (as que o usuário
 * edita); qualquer outra cai num rótulo honesto — a chave crua — em vez de um
 * nome inventado.
 */
import { tagDaChave } from '../../services/familiasChave';

const NOMES: Array<[string, string]> = [
  ['nr13_info_', 'Ficha do equipamento'],
  ['nr13_calc_', 'Memorial de cálculo'],
  ['nr13_vaso_cald_', 'Memorial da caldeira'],
  ['nr13_vaso_ac_corpo_', 'Memorial — corpo'],
  ['nr13_vaso_', 'Memorial — componentes'],
  ['nr13_cat_', 'Categoria de risco'],
  ['nr13_emp_', 'Cliente do equipamento'],
  ['nr13_fotos_', 'Fotos do equipamento'],
  ['nr13_med_esp_', 'Medição de espessura'],
  ['nr13_med_grid_', 'Grade de espessuras'],
  ['nr13_livro_config_', 'Configuração do livro'],
  ['nr13_livro_', 'Livro de Registro de Segurança'],
  ['nr13_laudo_', 'Laudo da conclusão'],
  ['nr13_vida_', 'Vida remanescente'],
  ['nr13_croqui2d_', 'Croqui 2D'],
  ['nr13_modelo3d_', 'Modelo do croqui'],
  ['nr13_folha_dados_', 'Folha de dados'],
  ['nr13_calibracoes_', 'Calibrações'],
  ['nr13_componentes_cal_', 'Componentes de calibração'],
  ['nr13_lotes_cal_', 'Lotes de calibração'],
  ['nr13_prontuario_meta_', 'Metadados do prontuário'],
  ['nr13_prontuario_', 'Prontuário'],
  ['nr13_historico_indice_', 'Histórico de relatórios'],
  ['nr13_rel_', 'Relatório salvo'],
  ['nr13_rastreab_', 'Certificado do instrumento padrão'],
  ['nr13_minha_empresa', 'Dados da minha empresa'],
  ['nr13_lista_phs', 'Funcionários e assinaturas'],
  ['nr13_clientes', 'Clientes'],
];

/** "Medição de espessura · VP-01", ou a chave crua se a família for desconhecida. */
export function rotuloDaChave(chave: string): string {
  let melhor: [string, string] | null = null;
  for (const par of NOMES) {
    if (!chave.startsWith(par[0])) continue;
    if (!melhor || par[0].length > melhor[0].length) melhor = par;
  }
  if (!melhor) return chave;
  const tag = tagDaChave(chave);
  return tag ? `${melhor[1]} · ${tag}` : melhor[1];
}

/**
 * Resumo de UMA linha do conteúdo, para o usuário ver que os dois lados
 * diferem sem precisar ler JSON.
 *
 * Mostra os primeiros campos de texto/número do objeto. Não tenta ser bonito
 * nem completo: o valor íntegro fica no `<details>` de detalhes técnicos, e é
 * ele que decide qualquer dúvida.
 */
export function resumoDoValor(bruto: string | null | undefined, maxCampos = 4): string {
  if (!bruto) return '(vazio)';
  let dado: unknown;
  try {
    dado = JSON.parse(bruto);
  } catch {
    return bruto.length > 120 ? `${bruto.slice(0, 120)}…` : bruto;
  }
  if (Array.isArray(dado)) return `lista com ${dado.length} item(ns)`;
  if (dado === null || typeof dado !== 'object') return String(dado);

  const partes: string[] = [];
  for (const [k, v] of Object.entries(dado as Record<string, unknown>)) {
    if (partes.length >= maxCampos) break;
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'object') continue; // aninhado não cabe numa linha
    const texto = String(v);
    partes.push(`${k}: ${texto.length > 40 ? `${texto.slice(0, 40)}…` : texto}`);
  }
  return partes.length > 0 ? partes.join(' · ') : '(sem campos simples)';
}
