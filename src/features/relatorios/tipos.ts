import type { RefFoto } from '../../services/fotos';

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
  'MEMORIAL.html', // folha única auto-paginada: gera N folhas internas conforme o tamanho do cálculo
  'INSPECOES.html',
  'VERIFICACAO-DOCUMENTACAO.html',
  // checklist1.html removido: era duplicata exata da VERIFICACAO-DOCUMENTACAO (mesmos 15 itens v51-*)
  'checklist2.html',
  'checklist3.html',
  'VISUAL-EXTERNO.html',
  'VISUAL-INTERNO.html',
  'CONCLUSAO.html',
  'ULTRASSOM.html',
  'TESTE-HIDROSTATICO.html',
  'LIVRO-REGISTRO.html',
] as const;

// Folhas do relatório que podem receber carimbo de assinatura — capa e sumário nunca recebem.
export const FOLHAS_RELATORIO_ASSINAVEIS = DOCUMENTOS_DISPONIVEIS.filter(
  (d) => d !== 'CAPA.html' && d !== 'SUMARIO.html',
);

// Snapshot de um assinante congelado na geração do relatório (motor de assinatura / carimbo).
// Lido por public/rel-assinatura.js via meta.assinantes — relatório salvo não muda quando o
// usuário troca assinantes ou edita o cadastro de funcionários depois.
export interface AssinanteSnapshot {
  nome: string;
  funcao?: string;
  crea?: string;
  assinatura?: string; // dataURL da rubrica
  camposExtras?: { rotulo: string; valor: string }[];
  // Quais folhas do relatório ele carimba — congelado junto com o resto;
  // as folhas auto-injetadas seguem a folha-pai no rel-assinatura.js.
  folhasRelatorio?: string[];
}

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
  // Lista final de documentos do relatório (na ordem montada). Gravada na meta pra que os
  // templates que dependem da composição — SUMARIO (TOC) e INSPECOES (ensaios realizados) —
  // saibam quais folhas existem. Sem isso o TOC e a tabela de ensaios saem vazios.
  documentos?: string[];
  // Snapshots congelados na geração (bug fix 14/07/2026): relatório salvo não pode mudar quando
  // o usuário troca a logo da empresa ou os assinantes depois. `empresa` = cópia de
  // nr13_minha_empresa (lida por public/rel-empresa.js quando a folha roda com ?ctx=rel);
  // `assinantes` = snapshots do engenheiro/técnico (lidos por public/rel-assinatura.js).
  empresa?: Record<string, unknown>;
  assinantes?: { engenheiro: AssinanteSnapshot | null; tecnico: AssinanteSnapshot | null };
  // Snapshot dos certificados de calibração injetados (folhas ?calibId=): dados congelados na
  // geração — editar/excluir a calibração depois NÃO altera o relatório salvo. Chave = calibId.
  // Lido pelos templates CERTIFICADO-CAL-*.html (preferido sobre nr13_calibracao_item_<id>).
  certCalibracoes?: Record<string, unknown>;
  // Ids das rastreabilidades (certificados dos padrões) resolvidos na geração. A edição na aba
  // Certificados Calibração é soft-replace (versão antiga fica retida com `substituidoEm`), então
  // o PDF congelado aqui por id continua disponível para reimpressão/re-download.
  rastreabIds?: string[];
}

export interface RelatorioSalvo {
  id: string;
  tagVaso: string;
  nome: string;
  tipo: TipoInspecao;
  data: string;
  /**
   * A RECEITA do documento. Até 11/08/2026 era a única coisa guardada, e o
   * relatório salvo era remontado a partir dela com os dados VIVOS — por isso
   * editar a ficha mudava relatório assinado.
   *
   * Com `pdfRef` presente, `documentos` e `meta` continuam gravados APENAS para
   * auditoria e compatibilidade. NÃO devem mais ser usados para reconstruir o
   * documento histórico: quem manda é o arquivo.
   */
  documentos: string[];
  meta: RelatorioMeta;
  status: 'Aprovado';

  // ── Artefato imutável (11/08/2026) ───────────────────────────────────────
  /** O PDF no bucket. Presente = relatório finalizado no modelo novo. */
  pdfRef?: RefFoto;
  /** SHA-256 do PDF, hex. A prova de que o documento não foi trocado. */
  sha256?: string;
  /** ISO da geração do artefato. */
  geradoEm?: string;
  paginas?: number;
  /**
   * `true` enquanto o upload não confirmou (salvo offline). O relatório ESTÁ
   * salvo e o arquivo existe no cofre local; falta só chegar ao bucket, e a fila
   * das fotos cuida disso. Serve para a UI dizer a verdade em vez de fingir que
   * está tudo no servidor.
   */
  pdfPendente?: boolean;
  /**
   * LEGADO (12/08 → 14/08/2026): cópia INTEIRA de `nr13_livro_<TAG>` na emissão.
   *
   * Nada no sistema lia este campo — nem template, nem tela, nem serviço. E o
   * custo era quadrático: `nr13_livro_` é acumulativo por equipamento, então a
   * 20ª inspeção guardava um snapshot com 20 entradas, e as 19 cópias anteriores
   * continuavam gravadas. Registros que já o têm continuam com ele; nenhum novo
   * o recebe.
   */
  livroSnapshot?: unknown;
  /**
   * O CORTE do livro na emissão, no lugar da cópia (14/08/2026): `sha256` da
   * última entrada lacrada e quantas entradas existiam. ~100 bytes.
   *
   * É o suficiente para responder "o livro como estava naquela inspeção" sem
   * copiá-lo: a cadeia de lacres (§7-quinquies) liga cada entrada à anterior,
   * então o sha identifica o ponto exato da cadeia e `verificarCadeia` prova que
   * o trecho até ali não mudou. E a folha daquela inspeção já está dentro do PDF
   * imutável do relatório (§7-quater) — congelar o livro em cópia era guardar
   * pela terceira vez o que já estava guardado duas.
   */
  livroCorte?: { sha256: string | null; entradas: number; em: string };
}

/**
 * O que a LISTA precisa saber de um relatório, sem abrir o relatório.
 *
 * Alimenta a tela de Relatórios, o card do Dashboard, `listarVencimentos` e a
 * linha do tempo do Portal. Guardado em `nr13_historico_indice_<TAG>` (ver
 * `historicoRelatorios.ts`).
 *
 * O QUE FICA DE FORA É O PONTO: `meta.empresa` (logo em base64),
 * `meta.assinantes` (rubricas em base64), `meta.certCalibracoes`, `documentos` e
 * `livroSnapshot` — os snapshots congelados que faziam uma entrada pesar ~125 KB.
 * As datas entram porque sem elas o Dashboard teria que abrir todos os
 * relatórios de todos os equipamentos para calcular um vencimento.
 */
export interface RelatorioIndiceItem {
  id: string;
  tagVaso: string;
  nome: string;
  tipo: TipoInspecao;
  data: string;
  status: 'Aprovado';
  /** `meta.codigo` — o número impresso no documento. */
  codigo: string;
  emissao: string;
  validade: string;
  execucaoInspecao: string;
  proximaInspecaoInterna: string;
  proximaInspecaoExterna: string;
  /** Coluna "Val. válvula" da lista; o valor derivado do lote vem de `validadesPorRelatorio`. */
  validadeValvula: string;
  // Artefato (§7-quater): o suficiente para a lista mostrar o selo e abrir o PDF
  // sem carregar o registro inteiro.
  pdfRef?: RefFoto;
  sha256?: string;
  geradoEm?: string;
  paginas?: number;
  pdfPendente?: boolean;
}

/** Relatório finalizado no modelo novo — serve o arquivo, não remonta nada. */
export function temArtefato(r: Pick<RelatorioSalvo, 'pdfRef'> | null | undefined): boolean {
  return !!r?.pdfRef?.path;
}
