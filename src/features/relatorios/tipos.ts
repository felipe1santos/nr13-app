export type TipoInspecao = 'Inspeção Inicial' | 'Inspeção Periódica' | 'Inspeção Extraordinária';

// Ordem-fonte do relatório — segue o CLAUDE.md (Organização do Relatório / Ordem de Montagem).
// As folhas de fotos (CHECKLIST-FOTOS, VISUAL-*-FOTOS, TESTE-HIDROSTATICO-FOTOS) e TERMO-ABERTURA
// NÃO entram aqui: são auto-injetadas por montarListaComTermoAbertura() logo após sua folha-pai,
// pra não duplicar nem precisar de seleção manual.
export const DOCUMENTOS_DISPONIVEIS = [
  'CAPA.html',
  'SUMARIO.html',
  'PLACA.html',
  'CLASSIFICACAO-RISCO.html', // Caracterização — vem ANTES do Prontuário (markdown)
  'PRONTUARIO.html',
  'RESUMO-MEMORIAL.html',
  'MEMORIAL1.html',
  'MEMORIAL2.html',
  'MEMORIAL3.html',
  'INSPECOES.html',
  'VERIFICACAO-DOCUMENTACAO.html',
  'checklist1.html',
  'checklist2.html',
  'checklist3.html',
  'VISUAL-EXTERNO.html',
  'VISUAL-INTERNO.html',
  'CONCLUSAO.html',
  'ULTRASSOM.html',
  'TESTE-HIDROSTATICO.html',
  'LIVRO-REGISTRO.html',
] as const;

export interface RelatorioMeta {
  codigo: string;
  emissao: string; // DD/MM/AAAA
  validade: string;
  execucaoInspecao: string;
  proximaInspecaoInterna: string;
  proximaInspecaoExterna: string;
  validadeValvula: string;
  tipoInspecao: TipoInspecao;
  phNome: string;
  phCrea: string;
  tecnicoNome: string;
  // id do container de inspeção (nr13_docs_<TAG>) cujos dados de campo foram injetados nesse relatório.
  containerOrigemId?: string;
}

export interface RelatorioSalvo {
  id: string;
  tagVaso: string;
  nome: string;
  tipo: TipoInspecao;
  data: string;
  documentos: string[];
  meta: RelatorioMeta;
  status: 'Aprovado';
}
