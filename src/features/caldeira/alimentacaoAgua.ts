/**
 * ENSAIO DOS DISPOSITIVOS DE ALIMENTAÇÃO DE ÁGUA E CONTROLE DE NÍVEL
 * (23/11/2026) — só caldeira.
 *
 * O relatório de referência (CAL-25/5340, folha 1.3) lista "Ensaio de
 * Dispositivos de Alimentação de Água" entre os ensaios realizados. A NR-13 exige
 * o "sistema automático de controle do nível de água com intertravamento que
 * evite o superaquecimento por alimentação deficiente" (13.4.1.2 e) e, para
 * combustível sólido não atomizado, a alimentação independente (13.4.1.2 c).
 *
 * Gravado no container como `dados.alimentacao`. Respostas 'sim' / 'nao' / 'na'
 * (vazio = não verificado). As fotos do teste vão no Relatório de Imagens
 * (seção 8 do relatório de caldeira) — este ensaio não tem folha de fotos própria.
 */

export type RespostaTeste = 'sim' | 'nao' | 'na';

export interface PerguntaAlimentacao {
  id: string;
  texto: string;
  /** Item da NR-13 a que a pergunta responde, quando há. */
  item?: string;
}

export const PERGUNTAS_ALIMENTACAO: PerguntaAlimentacao[] = [
  { id: 'bombaPrincipal', texto: 'A bomba de alimentação principal partiu e restabeleceu o nível de água' },
  { id: 'alimentacaoIndependente', texto: 'O injetor / sistema de alimentação independente do principal operou', item: '13.4.1.2 c)' },
  { id: 'controleAutomatico', texto: 'O controle automático ligou e desligou a alimentação nos níveis previstos' },
  { id: 'alarmeNivelBaixo', texto: 'O alarme de nível baixo atuou' },
  { id: 'intertravamento', texto: 'O intertravamento por nível muito baixo desligou o queimador (proteção contra superaquecimento)', item: '13.4.1.2 e)' },
  { id: 'visores', texto: 'Os indicadores de nível (visores) estão legíveis e com as válvulas de dreno operando' },
];

export interface DadosAlimentacao {
  /** ISO `aaaa-mm-dd`. */
  dataEnsaio: string;
  respostas: Record<string, RespostaTeste | undefined>;
  observacoes: string;
  resultado: '' | 'aprovado' | 'reprovado';
  laudo: string;
}

export const LAUDO_PADRAO_ALIMENTACAO = 'Dispositivos de alimentação de água e controle de nível aprovados no ensaio.';

export function dadosPadraoAlimentacao(hojeIso = ''): DadosAlimentacao {
  return { dataEnsaio: hojeIso, respostas: {}, observacoes: '', resultado: '', laudo: '' };
}

export function normalizarAlimentacao(bruto: unknown): DadosAlimentacao {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Partial<DadosAlimentacao>;
  const respostas: Record<string, RespostaTeste> = {};
  for (const [k, v] of Object.entries(b.respostas ?? {})) if (v === 'sim' || v === 'nao' || v === 'na') respostas[k] = v;
  return {
    dataEnsaio: typeof b.dataEnsaio === 'string' ? b.dataEnsaio : '',
    respostas,
    observacoes: typeof b.observacoes === 'string' ? b.observacoes : '',
    resultado: b.resultado === 'aprovado' || b.resultado === 'reprovado' ? b.resultado : '',
    laudo: typeof b.laudo === 'string' ? b.laudo : '',
  };
}

/** O ensaio foi feito? (ao menos uma resposta ou o resultado). */
export function alimentacaoPreenchida(bruto: unknown): boolean {
  const d = normalizarAlimentacao(bruto);
  return Object.keys(d.respostas).length > 0 || d.resultado !== '';
}

export interface AvisoAlimentacao {
  nivel: 'erro' | 'alerta';
  texto: string;
}

/**
 * Regras: "não" no intertravamento com resultado APROVADO é contraditório
 * (13.4.1.2 e é dispositivo obrigatório) — erro; qualquer outro "não" com
 * aprovado é alerta (a decisão é do PLH); reprovado com o laudo padrão de
 * aprovação é erro.
 */
export function verificarAlimentacao(bruto: unknown): AvisoAlimentacao[] {
  const d = normalizarAlimentacao(bruto);
  const avisos: AvisoAlimentacao[] = [];
  const naos = PERGUNTAS_ALIMENTACAO.filter((p) => d.respostas[p.id] === 'nao');
  if (d.resultado === 'aprovado' && d.respostas.intertravamento === 'nao') {
    avisos.push({ nivel: 'erro', texto: 'O intertravamento por nível muito baixo falhou (13.4.1.2 e): o ensaio não pode sair aprovado.' });
  } else if (d.resultado === 'aprovado' && naos.length > 0) {
    avisos.push({ nivel: 'alerta', texto: `Resultado aprovado com ${naos.length} resposta(s) "não": confirme com o engenheiro.` });
  }
  if (d.resultado === 'reprovado' && d.laudo.trim() === LAUDO_PADRAO_ALIMENTACAO) {
    avisos.push({ nivel: 'erro', texto: 'Resultado REPROVADO com o laudo padrão de aprovação: reescreva o laudo.' });
  }
  return avisos;
}
