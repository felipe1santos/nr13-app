/**
 * OS EXAMES VISUAIS DA CALDEIRA (22/10/2026).
 *
 * Os itens são os do relatório de caldeira de referência: 16 verificações no
 * externo, 11 no interno (com espelhos, feixes tubulares, fornalha, grelha,
 * câmara de reversão, refratários — coisas que vaso não tem).
 *
 * O formulário grava `itens: { "1": "sim" }` — só o NÚMERO. Trocar a lista de
 * um registro já respondido mudaria a PERGUNTA de cada resposta gravada, e um
 * "SIM" dado para "Juntas, conexões e vedações" passaria a ser um "SIM" para
 * "Corpo". Por isso a lista sai do CARIMBO do registro (`catalogo`):
 * - carimbado com o catálogo de caldeira → lista de caldeira;
 * - SEM carimbo e COM respostas → a lista antiga, sempre (registro legado);
 * - SEM carimbo e SEM respostas, numa caldeira → lista de caldeira, e o
 *   formulário carimba ao gravar.
 * Vaso e autoclave nunca recebem o carimbo — o registro deles não muda.
 */

export const CATALOGO_CALDEIRA = 'caldeira-flamotubular-1';

export const ITENS_VE_CALDEIRA: readonly string[] = [
  'Corpo',
  'Apoio e suportes',
  'Conexões e abertura para inspeção',
  'Cordão de solda',
  'Fundações e piso',
  'Pintura',
  'Acessibilidade ao equipamento',
  'Iluminação normal / emergência',
  'Ventilação',
  'Dispositivo de alívio de pressão',
  'Indicador de pressão',
  'Aterramento',
  'Placa de identificação',
  'Dispositivo de drenagem',
  'Termômetro',
  'Detector de gás',
];

export const ITENS_VI_CALDEIRA: readonly string[] = [
  'Corpo',
  'Espelhos',
  'Feixes tubulares',
  'Tubos',
  'Portas de visita',
  'Fornalha',
  'Grelha',
  'Câmara de reversão de gases',
  'Chaminé',
  'Isolamento térmico',
  'Refratários',
];

interface RegistroVisual {
  catalogo?: unknown;
  itens?: unknown;
}

function temResposta(r: RegistroVisual | null | undefined): boolean {
  const itens = r?.itens;
  if (!itens || typeof itens !== 'object') return false;
  return Object.values(itens as Record<string, unknown>).some((v) => typeof v === 'string' && v.trim() !== '');
}

/** O registro usa (ou deve passar a usar) o catálogo de caldeira? */
export function usaCatalogoCaldeira(r: RegistroVisual | null | undefined, ehCaldeira: boolean): boolean {
  if (r?.catalogo === CATALOGO_CALDEIRA) return true;
  if (temResposta(r)) return false;
  return ehCaldeira;
}

/**
 * A lista de perguntas do registro — a que dá sentido a cada número gravado.
 * `padrao` é a lista de sempre (a do formulário de vaso), recebida para este
 * módulo não importar os formulários que o importam.
 */
export function itensDoExame(
  exame: 'externo' | 'interno',
  r: RegistroVisual | null | undefined,
  ehCaldeira: boolean,
  padrao: readonly string[],
): readonly string[] {
  if (usaCatalogoCaldeira(r, ehCaldeira)) return exame === 'externo' ? ITENS_VE_CALDEIRA : ITENS_VI_CALDEIRA;
  return padrao;
}
