/**
 * Fase 11 · slug guardado → texto que vai para o papel.
 *
 * ## Por que existe
 *
 * O sistema guarda valores curtos e estáveis (`vaso`, `nao`, `aprovado`) — e
 * está certo: chave de dado não deve mudar quando o texto da tela muda. O que
 * não pode é esse valor chegar cru a um documento que um engenheiro assina. No
 * piloto saíram `TIPO DE EQUIPAMENTO: vaso` e `RESULTADO: NAO`, e os dois foram
 * anotados como defeito.
 *
 * A tradução mora AQUI, num lugar só. Espalhá-la pelas folhas produziria
 * "Vaso de Pressão" numa e "Vaso" noutra, no mesmo relatório.
 *
 * **Slug desconhecido não vira travessão.** Ele é devolvido como veio, apenas
 * com a primeira letra maiúscula: um valor que o mapa não conhece ainda é um
 * dado real, e apagá-lo seria pior do que imprimi-lo feio.
 */

const TIPO_EQUIPAMENTO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
  tubulacao: 'Tubulação',
  manometro: 'Manômetro',
  valvula: 'Válvula de Segurança',
  psv: 'Válvula de Segurança',
};

const RESPOSTA: Record<string, string> = {
  sim: 'SIM',
  nao: 'NÃO',
  na: 'N/A',
  'n/a': 'N/A',
  nc: 'NC',
  ok: 'OK',
};

const RESULTADO_ENSAIO: Record<string, string> = {
  aprovado: 'APROVADO',
  reprovado: 'REPROVADO',
  aprovado_com_ressalvas: 'APROVADO COM RESSALVAS',
  'aprovado com ressalvas': 'APROVADO COM RESSALVAS',
  na: 'NÃO APLICÁVEL',
};

const CLASSE_FLUIDO: Record<string, string> = {
  a: 'Classe A',
  b: 'Classe B',
  c: 'Classe C',
  d: 'Classe D',
};

function primeiraMaiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function traduzir(mapa: Record<string, string>, valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const bruto = String(valor).trim();
  if (bruto === '') return null;
  return mapa[bruto.toLowerCase()] ?? primeiraMaiuscula(bruto);
}

export function rotuloTipoEquipamento(v: string | null | undefined): string | null {
  return traduzir(TIPO_EQUIPAMENTO, v);
}

export function rotuloResposta(v: string | null | undefined): string | null {
  return traduzir(RESPOSTA, v);
}

export function rotuloResultado(v: string | null | undefined): string | null {
  return traduzir(RESULTADO_ENSAIO, v);
}

export function rotuloClasseFluido(v: string | null | undefined): string | null {
  return traduzir(CLASSE_FLUIDO, v);
}

/** APTO / INAPTO do laudo. `null` = não marcado, e isso NÃO é "inapto". */
export function rotuloLaudo(apto: boolean | null): string | null {
  if (apto === null) return null;
  return apto ? 'APTO' : 'INAPTO';
}

/**
 * O enquadramento na NR-13, a partir do `isEnquadrado` de `nr13_cat_<TAG>`.
 *
 * `null` (nunca categorizado) NÃO é "não enquadrado": é ausência de resposta, e
 * o documento diz isso com travessão. Transformar ausência em negativa faria a
 * folha afirmar que o equipamento está fora da norma sem ninguém ter avaliado.
 */
export function rotuloEnquadramento(v: unknown): string | null {
  if (v === true) return 'Enquadrado na NR-13';
  if (v === false) return 'Não enquadrado';
  return null;
}
