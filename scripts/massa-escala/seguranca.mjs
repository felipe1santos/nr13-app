/**
 * As travas da Fase 8. É a parte mais importante do gerador.
 *
 * O precedente que justifica cada uma: já houve relatório de teste gerando
 * entrada imutável em livro real. Um gerador apontado para a organização errada
 * não é um bug — é um estrago, e alguns deles não têm desfazer.
 *
 * Tudo aqui é FUNÇÃO PURA, para poder ser testado sem rede e sem banco.
 */

/** Prefixo de toda TAG gerada. Qualquer varredura reconhece. */
export const PREFIXO = 'ZZ-SCALE-F8-';

/**
 * Organizações onde a massa pode nascer. Lista BRANCA, e curta de propósito.
 *
 * Não existe hoje uma marca de "org de teste" em `profiles`, e criar uma seria
 * mudança de banco — fora do escopo desta fase, que não altera produção. A
 * lista explícita cumpre o mesmo papel: uma org só entra aqui por decisão
 * consciente de quem edita o arquivo, e o diff mostra.
 */
export const ORGS_DE_TESTE = [
  '99f642d3-6efd-446d-9e76-d234ad8d211c', // teste@gmail.com
];

/** TAGs que a limpeza NUNCA pode tocar, mesmo se algo der errado no filtro. */
export const TAGS_PROTEGIDAS = [
  'ZZ-FASE3',
  'EQUIPE TESTE',
  'VASO A23',
  'VASO 02',
  'CALD-01',
  'COMPRESSOR V8-15/200L',
  'DASDSA',
  'ZZ-TESTE-P2',
];

/** Chaves globais (sem TAG) — a massa nunca escreve nelas, a limpeza nunca as apaga. */
export const CHAVES_GLOBAIS_PROIBIDAS = [
  'nr13_lista_phs',
  'nr13_minha_empresa',
  'nr13_clientes',
  'nr13_historico_relatorios',
  'nr13_relatorio_meta_atual',
  'nr13_inspecao_atual',
  'nr13_injecao_atual',
  'nr13_uso_contadores',
  'nr13_agenda_notas',
  'nr13_demo_seed',
];

/**
 * Famílias que o gerador tem PROIBIÇÃO ABSOLUTA de escrever.
 *
 * `nr13_livro_` é a razão desta lista existir: o livro tem trava de
 * imutabilidade no banco (`livro_imutavel.sql`, §7-quinquies). Uma entrada
 * sintética em livro real não sai mais — nem por script, nem pela UI.
 */
export const FAMILIAS_PROIBIDAS = ['nr13_livro_', 'nr13_livro_config_', 'nr13_termo_livro_'];

export function tagDaSeed(seed, n) {
  return `${PREFIXO}${seed}-${n}`;
}

/** A TAG pertence a ESTA seed? Usado pela limpeza — precisa ser exato. */
export function ehTagDaSeed(tag, seed) {
  if (typeof tag !== 'string') return false;
  const inicio = `${PREFIXO}${seed}-`;
  if (!tag.startsWith(inicio)) return false;
  // O resto tem de ser só dígitos: `...-12-1` não pode casar com a seed 1.
  return /^\d+$/.test(tag.slice(inicio.length));
}

/** Extrai a TAG de uma chave `nr13_<familia>_<TAG>`, ou null se não houver. */
export function tagDaChave(chave) {
  if (typeof chave !== 'string' || !chave.startsWith('nr13_')) return null;
  const i = chave.indexOf(PREFIXO);
  return i === -1 ? null : chave.slice(i);
}

/**
 * A chave pode ser APAGADA por esta seed?
 *
 * Ordem das recusas importa: primeiro o que é proibido em absoluto, depois o
 * pertencimento. Uma chave global nunca é apagada, nem que por acidente
 * contivesse o prefixo.
 */
export function podeApagar(chave, seed) {
  if (typeof chave !== 'string' || !chave) return false;
  if (CHAVES_GLOBAIS_PROIBIDAS.includes(chave)) return false;
  const tag = tagDaChave(chave);
  if (!tag) return false;
  if (TAGS_PROTEGIDAS.some((p) => tag === p || chave.endsWith(`_${p}`))) return false;
  return ehTagDaSeed(tag, seed);
}

/** A chave pode ser ESCRITA pelo gerador? */
export function podeEscrever(chave, seed) {
  if (typeof chave !== 'string' || !chave) return false;
  if (CHAVES_GLOBAIS_PROIBIDAS.includes(chave)) return false;
  if (FAMILIAS_PROIBIDAS.some((f) => chave.startsWith(f))) return false;
  const tag = tagDaChave(chave);
  return tag !== null && ehTagDaSeed(tag, seed);
}

/**
 * Valida os argumentos antes de qualquer contato com a rede.
 *
 * `producaoPermitida` é a 6ª trava: contra a URL de produção, o gerador só roda
 * com uma variável de ambiente adicional — e, mesmo assim, apenas em org da
 * lista branca.
 */
export function validarAlvo({ org, perfil, url, confirmou, producaoPermitida }) {
  const erros = [];
  if (!org) erros.push('--org é obrigatório (nunca "a org logada")');
  else if (!ORGS_DE_TESTE.includes(org)) erros.push(`org ${org} não está na lista de organizações de teste`);
  if (!perfil) erros.push('--perfil é obrigatório: estrutural | realista');
  else if (!['estrutural', 'realista'].includes(perfil)) erros.push(`perfil inválido: ${perfil}`);
  if (!confirmou) erros.push('--confirmar-org-de-teste é obrigatório');
  const ehProducao = typeof url === 'string' && /\.supabase\.co/.test(url);
  if (ehProducao && !producaoPermitida) {
    erros.push('URL de produção exige NR13_PERMITIR_PRODUCAO=1 (e org na lista branca)');
  }
  return { ok: erros.length === 0, erros, ehProducao };
}
