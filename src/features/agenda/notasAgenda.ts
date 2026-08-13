import { ler, salvar } from '../../services/storage';

/**
 * Anotações da agenda — o caderno do usuário dentro do calendário.
 *
 * POR QUE EXISTE: até aqui o calendário do Dashboard só mostrava VENCIMENTOS,
 * que são derivados do que já está salvo (inspeções, calibrações, vida
 * remanescente). Não havia onde anotar "combinei a visita com o cliente dia 20"
 * ou "levar o bloco padrão na próxima ida". Isso ia para papel e sumia.
 *
 * O que estas notas NÃO são: elas não alimentam relatório, prontuário, livro de
 * registro nem cálculo de vencimento. São controle pessoal. Nenhum template de
 * `public/` as lê — por isso a chave fica FORA DO PALCO (ver §2-ter do
 * CLAUDE.md): ocupar orçamento do documento com dado que nenhuma folha imprime
 * foi exatamente o bug que recusava relatório na conta do cliente.
 */
const CHAVE = 'nr13_agenda_notas';

export type TipoNota = 'inspecao' | 'manutencao' | 'visita' | 'lembrete';

export interface NotaAgenda {
  id: string;
  /** Data do compromisso em ISO curto, `AAAA-MM-DD`. */
  data: string;
  titulo: string;
  descricao?: string;
  tipo: TipoNota;
  /** TAG do equipamento, quando a anotação é sobre um. Opcional. */
  tag?: string;
  criadoEm: string;
}

export const ROTULO_TIPO_NOTA: Record<TipoNota, string> = {
  inspecao: 'Inspeção',
  manutencao: 'Manutenção',
  visita: 'Visita',
  lembrete: 'Lembrete',
};

/**
 * `AAAA-MM-DD` a partir de um Date, pelos componentes LOCAIS.
 *
 * `toISOString()` converte para UTC: no Brasil (UTC-3) toda data anterior às 3h
 * volta um dia, e a anotação de dia 20 apareceria no dia 19 do calendário.
 */
export function dataISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Date local a partir de `AAAA-MM-DD` (mesmo cuidado com fuso, no sentido inverso). */
export function dataDeISO(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1);
}

export function listarNotas(): NotaAgenda[] {
  const lista = ler<NotaAgenda[]>(CHAVE);
  if (!Array.isArray(lista)) return [];
  return [...lista].sort((a, b) => a.data.localeCompare(b.data));
}

export function notasDoDia(iso: string, notas = listarNotas()): NotaAgenda[] {
  return notas.filter((n) => n.data === iso);
}

/** Grava uma nota nova ou substitui a de mesmo id. */
export function salvarNota(nota: NotaAgenda): Promise<void> {
  const lista = listarNotas();
  const idx = lista.findIndex((n) => n.id === nota.id);
  if (idx >= 0) lista[idx] = nota;
  else lista.push(nota);
  return salvar(CHAVE, lista);
}

export function excluirNota(id: string): Promise<void> {
  return salvar(CHAVE, listarNotas().filter((n) => n.id !== id));
}

export function novaNota(data: string): NotaAgenda {
  return {
    id: `nota_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    data,
    titulo: '',
    tipo: 'lembrete',
    criadoEm: new Date().toISOString(),
  };
}

/**
 * Separa o que passou do que está por vir, para a visão de tela cheia.
 * O dia de HOJE conta como futuro: um compromisso de hoje ainda não passou.
 */
export function separarPorTempo(
  notas: NotaAgenda[],
  hoje = dataISO(new Date()),
): { passadas: NotaAgenda[]; futuras: NotaAgenda[] } {
  return {
    passadas: notas.filter((n) => n.data < hoje).reverse(),
    futuras: notas.filter((n) => n.data >= hoje),
  };
}
