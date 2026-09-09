import type { DestinoEdicao } from './oQueFalta';

/**
 * 09/09/2026 · PARA ONDE O CLIQUE NA PENDÊNCIA LEVA.
 *
 * A maioria dos campos do documento se edita NO DOCUMENTO: a prévia põe um alvo
 * transparente sobre a caixa que o gerador registrou, e clicar abre o editor.
 * Para esses, o destino é `null` e a navegação é ir até a página e piscar o
 * campo.
 *
 * Alguns, porém, **não são editáveis na folha** — eles nascem de um painel:
 *
 * | painel | o que se preenche lá |
 * |---|---|
 * | Configurações do Relatório | código, datas, ART, quem assina |
 * | Medições de espessura | a grade do ultrassom |
 * | Laudo | o apto/inapto da conclusão |
 *
 * Mandar o revisor para a folha nesses casos seria levá-lo a um lugar onde ele
 * não consegue preencher — o defeito que esta tabela existe para evitar.
 *
 * ## Por que uma tabela explícita, e não uma regra por prefixo
 *
 * Porque a divisão não é por prefixo: `proximas.interna` vem das Configurações,
 * mas `proximas.nota` é texto livre da folha; `ultrassom.resultado` se digita
 * na folha, e as MEDIÇÕES vêm da grade. Uma regra esperta erraria nos dois
 * sentidos, e errar aqui manda o usuário para a tela errada.
 *
 * Campo que não estiver aqui é editado no documento. É o padrão certo: um id
 * novo nasce clicável na folha, e só entra nesta tabela se for exceção.
 */
export interface DestinoCampo {
  onde: DestinoEdicao;
  /**
   * No modal de Configurações, qual campo focar e destacar. É o `name` do
   * input — ver `CAMPOS_CONFIG` em `Relatorios.tsx`.
   */
  campo?: string;
}

export const DESTINO_POR_CAMPO: Record<string, DestinoCampo> = {
  // ── Configurações do Relatório ───────────────────────────────────────────
  'capa.n-do-relatorio': { onde: 'configuracoes', campo: 'codigo' },
  'inspecao.numero-relatorio': { onde: 'configuracoes', campo: 'codigo' },
  'capa.data-da-inspecao': { onde: 'configuracoes', campo: 'execucaoInspecao' },
  'datas.execucao': { onde: 'configuracoes', campo: 'execucaoInspecao' },
  'inspecao.data-inicio': { onde: 'configuracoes', campo: 'execucaoInspecao' },
  'inspecao.data-termino': { onde: 'configuracoes', campo: 'execucaoInspecao' },
  'capa.validade': { onde: 'configuracoes', campo: 'validade' },
  'datas.validade': { onde: 'configuracoes', campo: 'validade' },
  'proximas.interna': { onde: 'configuracoes', campo: 'proximaInterna' },
  'proximas.externa': { onde: 'configuracoes', campo: 'proximaExterna' },
  'capa.art': { onde: 'configuracoes', campo: 'art' },
  'inspecao.art': { onde: 'configuracoes', campo: 'art' },
  'capa.responsavel': { onde: 'configuracoes', campo: 'tecnicoNome' },

  // ── Grade de medições ────────────────────────────────────────────────────
  'ultrassom.espessura-nominal': { onde: 'medicoes' },

  // ── Laudo (o apto/inapto da conclusão) ───────────────────────────────────
  'parecer.laudo': { onde: 'laudo' },
  'inspecao.resultado-ensaios': { onde: 'laudo' },
};

/**
 * A SEÇÃO do campo, para o agrupamento discreto da barra lateral.
 *
 * Sai do prefixo do id — que é semântico e escolhido no gerador, não do rótulo.
 * Prefixo desconhecido cai em "Documento": um id novo aparece na barra sob um
 * título genérico, o que é bem melhor do que não aparecer.
 */
const SECAO_POR_PREFIXO: Record<string, string> = {
  capa: 'Capa',
  objetivo: 'Objetivo',
  referencias: 'Documentos de referência',
  identificacao: 'Identificação',
  placa: 'Placa de identificação',
  datas: 'Datas',
  categoria: 'Categorização de risco',
  categorizacao: 'Categorização de risco',
  prontuario: 'Prontuário',
  memoria: 'Memorial de cálculo',
  resumo: 'Resumo de cálculos',
  inspecao: 'Exames realizados',
  documentacao: 'Verificação da documentação',
  checklist: 'Checklist NR-13',
  externo: 'Exame visual externo',
  interno: 'Exame visual interno',
  ultrassom: 'Ultrassom',
  vida: 'Vida remanescente',
  th: 'Teste hidrostático',
  fotos: 'Registros fotográficos',
  recomendacoes: 'Recomendações',
  parecer: 'Parecer técnico',
  proximas: 'Próximas inspeções',
  escopo: 'Escopo',
  cabecalho: 'Cabeçalho',
  // Prefixos vistos no inventário de 09/09/2026 que caíam em "Documento":
  pressoes: 'Pressões',
  operacionais: 'Dados operacionais',
  componente: 'Memorial de cálculo',
  instrumentos: 'Instrumentos de medição',
  checklist1: 'Checklist NR-13',
  checklist2: 'Checklist NR-13',
  checklist3: 'Checklist NR-13',
};

export function secaoDoCampo(id: string): string {
  const prefixo = id.split('.')[0].split('-')[0];
  return SECAO_POR_PREFIXO[prefixo] ?? 'Documento';
}
