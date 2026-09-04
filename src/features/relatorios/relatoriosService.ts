import { excluirChave, ler, salvar } from '../../services/storage';
import { emitirDadosAlterados } from '../../services/eventos';
import { listarFuncionarios } from '../cadastros/cadastroService';
import { camposDaRubrica } from './livroAssinatura';
import type { Funcionario } from '../cadastros/tipos';
import {
  DOCUMENTOS_DISPONIVEIS,
  FOLHAS_RELATORIO_ASSINAVEIS,
  type AssinanteSnapshot,
  type RelatorioIndiceItem,
  type RelatorioMeta,
  type RelatorioSalvo,
  type TipoInspecao,
} from './tipos';
import { excluirRelatorio, listarIndice, salvarRelatorio } from './historicoRelatorios';

export function filtrarDocumentosValidos(lista: string[]): string[] {
  return (lista || []).filter((doc) => doc.split('?')[0].toLowerCase().endsWith('.html'));
}

export interface LivroEntrada {
  id: string;
  data: string;
  /** Entradas automáticas: TipoInspecao. Entradas manuais: tipo de ocorrência livre (ex.: "Manutenção corretiva"). */
  tipo: TipoInspecao | string;
  descricao: string;
  /** Vazio nas entradas manuais (ocorrência sem relatório de inspeção). */
  relatorioCodigo: string;
  phNome: string;
  phCrea: string;
  origem: 'auto' | 'manual';
  criadoEm: string;
  // ── Campos opcionais (entradas novas; ausentes nas antigas — compatibilidade) ──
  /** Tipo de inspeção do relatório (meta.tipoInspecao) — redundante com `tipo`, mantido explícito. */
  tipoInspecao?: string;
  /** Rótulos dos ensaios realizados, derivados das folhas do relatório (ver ENSAIO_POR_DOC). */
  ensaios?: string[];
  /** Laudo APTO/INAPTO da folha CONCLUSAO (nr13_laudo_<TAG>); null = não marcado no relatório. */
  apto?: boolean | null;
  /** Técnico/inspetor que acompanhou (meta.tecnicoNome). */
  tecnicoNome?: string;
  /** id do engenheiro assinante em nr13_lista_phs (nr13_assinantes_rel_<TAG>) — a folha do livro busca a assinatura por ele. */
  phId?: string;
  // Congelados na criação (bug fix 14/07/2026): a folha do livro resolvia o funcionário AO VIVO
  // por phId em nr13_lista_phs — trocar a rubrica/cargo no cadastro depois mudava entradas já
  // impressas. Rubrica e cargo agora são copiados para a entrada; phId vira só fallback de
  // compatibilidade para entradas antigas sem os campos congelados (phNome/phCrea já eram congelados).
  /** dataURL da rubrica do assinante, congelada na criação da entrada. */
  assinaturaImg?: string;
  /** Cargo/função do assinante, congelado na criação da entrada. */
  assinanteFuncao?: string;
  /** Entradas manuais: quem executou a ocorrência (texto livre — empresa/técnico executante). */
  quemRealizou?: string;
  // ── Ciclo de vida (19/07/2026) ──
  // A entrada só é criada no momento em que o relatório é SALVO — e a partir daí é imutável.
  // Por isso toda entrada nova nasce `lacrado: true`. AUSENTE = entrada ANTIGA, também tratada
  // como lacrada (o livro sempre foi de fato imutável). A edição do termo acontece ANTES, na
  // própria folha LIVRO-REGISTRO.html (rascunho em nr13_termo_livro_<TAG>, consumido aqui).
  lacrado?: boolean;
  /** id da entrada (lacrada) que este registro retifica — ambas permanecem no livro. */
  retificaDe?: string;
  /** Texto do termo digitado pelo usuário na folha LIVRO-REGISTRO.html antes de salvar o relatório. */
  termoTexto?: string;
  // ── Fase 10B.2 ──
  /**
   * Estado explícito do registro. Ver `features/livro/estadoRegistro.ts`:
   * `'trancado'` = oficial e imutável, `'rascunho'` = em edição (e fora de
   * `nr13_livro_<TAG>`), **ausente** = registro ANTIGO, que também é oficial.
   */
  estado?: 'rascunho' | 'trancado';
  /** ISO do trancamento. Ausente em registro antigo e em rascunho. */
  trancadoEm?: string;
  /** ISO da última gravação do RASCUNHO. Some ao trancar. */
  atualizadoEm?: string;
  /** SHA-256 do conteúdo canônico — presente só depois de trancado. */
  sha256?: string;
  shaAnterior?: string | null;
  lacradaEm?: string;
}

/**
 * Discriminador do ciclo de vida: só `lacrado === false` é rascunho editável.
 * Entrada antiga (campo ausente) conta como LACRADA — nunca vira editável retroativamente.
 */
export function estaLacrada(e: Pick<LivroEntrada, 'lacrado'>): boolean {
  return e.lacrado !== false;
}

// Laudo APTO/INAPTO gravado pela folha CONCLUSAO.html quando o usuário marca SIM/NÃO.
interface LaudoConclusao {
  apto: boolean;
  relatorioCodigo: string;
  atualizadoEm: string;
}

// Folha do relatório → rótulo do ensaio correspondente na entrada do livro de registro.
const ENSAIO_POR_DOC: Record<string, string> = {
  'ULTRASSOM.html': 'Medição de espessura (ultrassom)',
  'TESTE-HIDROSTATICO.html': 'Teste hidrostático',
  'VISUAL-EXTERNO.html': 'Exame visual externo',
  'VISUAL-INTERNO.html': 'Exame visual interno',
};

// Deriva a lista de ensaios realizados das folhas do relatório (ignora query string das
// folhas expandidas, ex.: MEMORIAL.html?part=1 — e deduplica).
export function ensaiosDoRelatorio(documentos: string[]): string[] {
  const out: string[] = [];
  for (const doc of documentos || []) {
    const rotulo = ENSAIO_POR_DOC[doc.split('?')[0]];
    if (rotulo && !out.includes(rotulo)) out.push(rotulo);
  }
  return out;
}

function chaveLivro(tag: string): string {
  return `nr13_livro_${tag}`;
}

// Rascunho do termo digitado pelo usuário na folha LIVRO-REGISTRO.html enquanto o relatório está
// em montagem. É VOLÁTIL: consumido (copiado para a entrada) e APAGADO quando o relatório é
// salvo — senão o texto de um relatório vazaria para o próximo do mesmo equipamento.
function chaveTermoLivro(tag: string): string {
  return `nr13_termo_livro_${tag}`;
}

function consumirTermoRascunho(tag: string): string | undefined {
  const bruto = ler<unknown>(chaveTermoLivro(tag));
  const texto = typeof bruto === 'string' ? bruto.trim() : '';
  void excluirChave(chaveTermoLivro(tag));
  return texto || undefined;
}

// ── Assinantes do relatório (motor de assinatura — mesmo padrão do prontuário) ─────────────────
// ids referem-se a Funcionario.id de nr13_lista_phs; null = "sem assinatura" para aquele papel.
// A chave nr13_assinantes_rel_<TAG> é lida pelo public/rel-assinatura.js nas folhas do relatório.
const chaveAssinantesRel = (tag: string) => `nr13_assinantes_rel_${tag}`;

/** Papel que assina o Termo do Livro de Registro (folha LIVRO-REGISTRO.html). */
export type AssinanteTermoLivro = 'engenheiro' | 'tecnico';

export interface AssinantesRelatorio {
  engenheiroId: string | null;
  tecnicoId: string | null;
  /** Escolhido no modal Configurações do Relatório. Default histórico: engenheiro. */
  assinanteTermoLivro: AssinanteTermoLivro;
}

export function obterAssinantesRel(tag: string): AssinantesRelatorio {
  const salvo = ler<Partial<AssinantesRelatorio>>(chaveAssinantesRel(tag));
  return {
    engenheiroId: salvo?.engenheiroId ?? null,
    tecnicoId: salvo?.tecnicoId ?? null,
    assinanteTermoLivro: salvo?.assinanteTermoLivro === 'tecnico' ? 'tecnico' : 'engenheiro',
  };
}

export function gravarAssinantesRel(tag: string, a: AssinantesRelatorio): void {
  // salvar() grava o localStorage de forma síncrona antes de persistir remoto — os iframes
  // remontados logo em seguida já leem o valor novo.
  void salvar(chaveAssinantesRel(tag), a);
}

// ── Snapshots congelados na meta (bug fix 14/07/2026) ─────────────────────────────────────────
// Relatório salvo guardava só ids/chaves vivas — trocar logo da empresa ou assinante depois
// alterava relatórios já emitidos. Os helpers abaixo copiam o estado ATUAL para dentro da
// RelatorioMeta na geração; rel-empresa.js/rel-assinatura.js preferem meta.empresa/meta.assinantes.

// Snapshot da empresa executante (nr13_minha_empresa) para congelar na meta do relatório.
/**
 * Snapshot da empresa congelado na geração.
 *
 * FASE 7B — quando a chave viva já tem `logoRef`, o snapshot congela **só a
 * referência** e a dataURL sai. É daqui que vem o ganho da fase: o registro do
 * relatório deixa de carregar uma cópia da logo (~7 KB) e passa a carregar
 * ~150 bytes. O palco (7A) resolve a referência na montagem, e os 41 templates
 * continuam lendo `.logo` sem saber de nada.
 *
 * **A imutabilidade fica mais forte, não mais fraca:** o path É o hash do
 * conteúdo, então trocar a logo depois gera outro arquivo e este relatório
 * continua apontando para o hash de hoje. Antes isso dependia de a cópia ter
 * sido feita; agora é consequência do endereço.
 *
 * Sem `logoRef` (organização que ainda não regravou o cadastro), nada muda: a
 * dataURL é congelada como sempre foi.
 */
export function snapshotEmpresa(): Record<string, unknown> | undefined {
  const viva = ler<Record<string, unknown>>('nr13_minha_empresa') ?? undefined;
  if (!viva) return undefined;
  const ref = viva.logoRef as { path?: string } | undefined;
  if (!ref?.path) return viva;
  const { logo: _dataUrl, ...resto } = viva;
  return resto;
}

// Snapshots dos assinantes escolhidos, resolvidos AGORA contra nr13_lista_phs — congela nome,
// cargo, CREA, rubrica e campos extras na meta (rel-assinatura.js lê meta.assinantes).
export function snapshotAssinantes(
  a: AssinantesRelatorio,
  funcs: Funcionario[],
): {
  engenheiro: AssinanteSnapshot | null;
  tecnico: AssinanteSnapshot | null;
  // Congela também QUEM assina o termo do livro (LIVRO-REGISTRO.html lê meta.assinantes com
  // ?ctx=rel). Campo extra em relação a RelatorioMeta['assinantes'] — atribuir o RETORNO desta
  // função a meta.assinantes é válido (excess property check só vale para object literal) e o
  // campo sobrevive no JSON que a folha lê do localStorage.
  assinanteTermoLivro: AssinanteTermoLivro;
} {
  const snap = (id: string | null): AssinanteSnapshot | null => {
    const f = funcs.find((x) => id != null && x.id === id);
    if (!f) return null;
    // FASE 7B — mesma regra da logo: com referência, ela é o que congela, e a
    // dataURL sai do snapshot. Sem referência, congela a dataURL como antes.
    const rubrica = f.assinaturaRef?.path
      ? { assinaturaRef: f.assinaturaRef }
      : { assinatura: f.assinatura };
    return {
      nome: f.nome,
      funcao: f.funcao,
      crea: f.crea,
      ...rubrica,
      camposExtras: f.camposExtras,
      // Regra padrão do motor (mesma de Funcionarios.tsx defaultFolhasRelatorio):
      // engenheiro assina todas as folhas assináveis, inspetor nenhuma.
      folhasRelatorio: f.folhasRelatorio ?? (f.tipo === 'Engenheiro' ? [...FOLHAS_RELATORIO_ASSINAVEIS] : []),
    };
  };
  return {
    engenheiro: snap(a.engenheiroId),
    tecnico: snap(a.tecnicoId),
    assinanteTermoLivro: a.assinanteTermoLivro === 'tecnico' ? 'tecnico' : 'engenheiro',
  };
}

// NR-13 13.4.1.9 — injeta TERMO-ABERTURA.html antes de LIVRO-REGISTRO.html só quando é a
// 1ª inspeção do livro daquele equipamento (livro vazio).
// Também injeta automaticamente TESTE-HIDROSTATICO-FOTOS.html após TESTE-HIDROSTATICO.html.
export function montarListaComTermoAbertura(
  tag: string,
  docsSelecionados: string[],
  dadosContainer?: unknown,
): string[] {
  const precisaAbertura =
    docsSelecionados.includes('LIVRO-REGISTRO.html') &&
    (ler<LivroEntrada[]>(chaveLivro(tag)) || []).length === 0;

  // Só injeta a folha de fotos (VE/VI/TH) quando há fotos de campo no container — sem fotos,
  // nada de slots vazios na folha (decisão do usuário: "se não anexou imagem, não aparece nada").
  const d = (dadosContainer ?? {}) as Record<string, { fotos?: unknown[] } | undefined>;
  const temFotos = (etapa: string): boolean => {
    const arr = d?.[etapa]?.fotos;
    return Array.isArray(arr) && arr.length > 0;
  };
  // Fotos da documentação e do checklist vivem em checklist.fotosDocumentacao / checklist.fotos.
  const checklist = (d?.['checklist'] ?? {}) as { fotos?: unknown[]; fotosDocumentacao?: unknown[] };
  const temFotosDoc = Array.isArray(checklist.fotosDocumentacao) && checklist.fotosDocumentacao.length > 0;
  const temFotosCL = Array.isArray(checklist.fotos) && checklist.fotos.length > 0;

  const precisaFotosTH = docsSelecionados.includes('TESTE-HIDROSTATICO.html') && temFotos('th');
  const precisaFotosVE = docsSelecionados.includes('VISUAL-EXTERNO.html') && temFotos('visual_externo');
  const precisaFotosVI = docsSelecionados.includes('VISUAL-INTERNO.html') && temFotos('visual_interno');
  const precisaFotosDoc = docsSelecionados.includes('checklist3.html') && temFotosDoc;
  const precisaFotosCL = docsSelecionados.includes('checklist3.html') && temFotosCL;

  if (!precisaAbertura && !precisaFotosTH && !precisaFotosVE && !precisaFotosVI && !precisaFotosDoc && !precisaFotosCL)
    return docsSelecionados;

  const resultado: string[] = [];
  for (const doc of docsSelecionados) {
    if (doc === 'LIVRO-REGISTRO.html' && precisaAbertura) resultado.push('CAPA-LIVRO-REGISTRO.html', 'TERMO-ABERTURA.html');
    resultado.push(doc);
    if (doc === 'TESTE-HIDROSTATICO.html' && precisaFotosTH) resultado.push('TESTE-HIDROSTATICO-FOTOS.html');
    if (doc === 'VISUAL-EXTERNO.html' && precisaFotosVE) resultado.push('VISUAL-EXTERNO-FOTOS.html');
    if (doc === 'VISUAL-INTERNO.html' && precisaFotosVI) resultado.push('VISUAL-INTERNO-FOTOS.html');
    // markdown #11 e #12: "Fotos da documentação" vem ANTES de "Fotos do checklist". Cada uma só
    // entra se houver foto da sua etapa — sem foto, a folha não aparece.
    if (doc === 'checklist3.html') {
      if (precisaFotosDoc) resultado.push('FOTOS-DOCUMENTACAO.html');
      if (precisaFotosCL) resultado.push('CHECKLIST-FOTOS.html');
    }
  }
  return resultado;
}

// Remove as folhas de fotos (VE/VI/TH) da lista quando o container não tem fotos daquela etapa.
// Usado ao REABRIR um relatório salvo: a lista já vem montada (r.documentos) e não passa pela
// auto-injeção de montarListaComTermoAbertura, então a folha de fotos vazia precisa ser filtrada
// aqui — senão o usuário vê quadros de foto em branco (decisão: "sem imagem, não aparece nada").
const FOTO_PAGE_ETAPA: Record<string, string> = {
  'TESTE-HIDROSTATICO-FOTOS.html': 'th',
  'VISUAL-EXTERNO-FOTOS.html': 'visual_externo',
  'VISUAL-INTERNO-FOTOS.html': 'visual_interno',
};

export function filtrarFolhasFotoVazias(documentos: string[], dadosContainer?: unknown): string[] {
  const d = (dadosContainer ?? {}) as Record<string, { fotos?: unknown[] } | undefined>;
  const checklist = (d?.['checklist'] ?? {}) as { fotos?: unknown[]; fotosDocumentacao?: unknown[] };
  const naoVazio = (arr: unknown): boolean => Array.isArray(arr) && arr.length > 0;
  return documentos.filter((doc) => {
    if (doc === 'FOTOS-DOCUMENTACAO.html') return naoVazio(checklist.fotosDocumentacao);
    if (doc === 'CHECKLIST-FOTOS.html') return naoVazio(checklist.fotos);
    const etapa = FOTO_PAGE_ETAPA[doc];
    if (!etapa) return true;
    return naoVazio(d?.[etapa]?.fotos);
  });
}

// Escreve os metadados que os templates leem diretamente de localStorage (nr13_relatorio_meta_atual)
// antes de montar os iframes — precisa estar gravado ANTES do iframe carregar.
export async function gravarMetaAtual(meta: RelatorioMeta): Promise<void> {
  await salvar('nr13_relatorio_meta_atual', meta);
}

// Dados de campo (ultrassom, checklist, etc.) do container de inspeção escolhido na geração do
// relatório, disponíveis pros templates de arquivos-inspecao/ consumirem (mesmo padrão de "chave
// atual" do gravarMetaAtual acima). Grava nas DUAS chaves porque os templates não são uniformes:
// VERIFICACAO/checklist1-3/CHECKLIST-FOTOS leem `nr13_inspecao_atual`, enquanto VISUAL-EXTERNO/
// INTERNO, *-FOTOS, TESTE-HIDROSTATICO, ULTRASSOM e CERTIFICADO-CAL-* leem `nr13_injecao_atual`.
export async function gravarInspecaoOrigemAtual(dadosContainer: unknown): Promise<void> {
  const dados = dadosContainer ?? {};
  await salvar('nr13_inspecao_atual', dados);
  await salvar('nr13_injecao_atual', dados);
}

/**
 * Lista LEVE do histórico do equipamento (§achado 1, 14/08/2026).
 *
 * Antes isto devolvia `RelatorioSalvo[]` a partir de um array único com o
 * histórico da organização inteira — snapshots de logo e rubrica em base64
 * inclusos, ~125 KB por relatório. Agora devolve só o resumo; quem precisa do
 * relatório completo chama `carregarRelatorio(id, tag)`.
 */
export function listarHistorico(tag: string): RelatorioIndiceItem[] {
  return listarIndice(tag);
}

export { carregarRelatorio, contarRelatorios } from './historicoRelatorios';

export async function salvarNoHistorico(relatorio: RelatorioSalvo): Promise<void> {
  await salvarRelatorio(relatorio);
  // Painel de vencimentos vivo: proximaInspecaoInterna/Externa do meta acabaram de mudar.
  emitirDadosAlterados();
}

export async function excluirDoHistorico(id: string, tag: string): Promise<void> {
  await excluirRelatorio(id, tag);
  emitirDadosAlterados();
}

/**
 * A entrada do Livro correspondente a um relatório — MONTADA, não gravada.
 *
 * ── FASE 10B.2: ISTO NÃO É MAIS AUTOMÁTICO ──────────────────────────────────
 * Até 04/09/2026 esta função era chamada dentro do "salvar" do relatório e
 * escrevia direto em `nr13_livro_<TAG>`: finalizar um relatório criava, sozinho,
 * um registro oficial e imutável no Livro de Segurança. O usuário nunca via o
 * que estava sendo registrado no documento legal do equipamento dele, e não
 * tinha como revisá-lo antes — depois de gravado, o lacre impede corrigir.
 *
 * Agora ela só MONTA a entrada, com os mesmos campos de sempre (ensaios, laudo,
 * rubrica congelada, termo), e quem decide o que fazer com ela é a tela do
 * Livro: o registro nasce RASCUNHO, o usuário revisa, e TRANCA quando quiser.
 *
 * Devolve `null` quando já existe registro daquele relatório — a mesma guarda de
 * duplicidade de antes, agora respondida em vez de silenciosa.
 */
export async function montarEntradaLivroDoRelatorio(
  relatorio: RelatorioSalvo,
): Promise<LivroEntrada | null> {
  const livro = ler<LivroEntrada[]>(chaveLivro(relatorio.tagVaso)) || [];
  if (livro.some((l) => l.relatorioCodigo === relatorio.meta.codigo)) return null;

  // Laudo APTO/INAPTO marcado na folha CONCLUSAO — só vale se for do relatório sendo salvo.
  const laudo = ler<LaudoConclusao>(`nr13_laudo_${relatorio.tagVaso}`);
  const apto =
    laudo && laudo.relatorioCodigo === relatorio.meta.codigo && typeof laudo.apto === 'boolean'
      ? laudo.apto
      : null;

  // Rubrica/cargo do assinante congelados NA CRIAÇÃO (bug fix 14/07/2026): prefere o snapshot
  // já congelado na meta do relatório; fallback (relatórios sem snapshot): resolve o funcionário
  // UMA vez agora, pelo mesmo engenheiroId usado no phId.
  const engenheiroId = obterAssinantesRel(relatorio.tagVaso).engenheiroId ?? undefined;
  const snapEng = relatorio.meta.assinantes?.engenheiro;
  const funcVivo = !snapEng && engenheiroId
    ? listarFuncionarios().find((f) => f.id === engenheiroId)
    : undefined;

  const entrada: LivroEntrada = {
    id: `LIV-${Date.now()}`,
    data: relatorio.meta.execucaoInspecao || relatorio.data,
    tipo: relatorio.tipo,
    descricao: `Relatório de inspeção gerado: ${relatorio.nome}`,
    relatorioCodigo: relatorio.meta.codigo,
    phNome: relatorio.meta.phNome,
    phCrea: relatorio.meta.phCrea,
    origem: 'auto',
    criadoEm: new Date().toISOString(),
    // Campos novos (folha do livro imprime tipo/ensaios/situação/assinatura a partir deles):
    tipoInspecao: relatorio.meta.tipoInspecao,
    ensaios: ensaiosDoRelatorio(relatorio.meta.documentos ?? relatorio.documentos),
    apto,
    tecnicoNome: relatorio.meta.tecnicoNome,
    phId: engenheiroId,
    // A rubrica vai por REFERÊNCIA de conteúdo, não embutida: 54,9 KB dos 56 KB
    // de uma entrada eram a assinatura, e o livro é cumulativo (ver
    // `livroAssinatura.ts`). Sem bucket disponível, cai no base64 — pesado,
    // porém salvo, que é o que um registro de segurança exige.
    ...(await camposDaRubrica(snapEng ? snapEng.assinatura : funcVivo?.assinatura)),
    assinanteFuncao: snapEng ? snapEng.funcao : funcVivo?.funcao,
    // Termo digitado na folha do livro ANTES de salvar (nr13_termo_livro_<TAG>): copiado para
    // dentro da entrada e a chave é apagada — rascunho consumido não vaza para o próximo relatório.
    termoTexto: consumirTermoRascunho(relatorio.tagVaso),
    // 10B.2 · nasce RASCUNHO. O lacre acontece no TRANCAR, na tela do Livro —
    // ver `features/livro/rascunhosLivro.ts`. `lacrado: true` sempre foi só uma
    // flag; o que protege é o hash, e ele passa a ser aplicado no momento em que
    // o usuário decide que aquele registro é oficial.
    lacrado: false,
    estado: 'rascunho',
  };
  return entrada;
}

// ── Ocorrência manual no Livro de Registro ─────────────────────────────────────
// Nem tudo é inspeção: manutenções/reparos pontuais entre inspeções também DEVEM ser
// registrados (NR-13 13.4.1.9). A entrada manual entra CRONOLOGICAMENTE entre as existentes.

// Timestamp para ordenação cronológica: aceita "aaaa-mm-dd" (input date / execucaoInspecao)
// e "dd/mm/aaaa" (entradas automáticas antigas). Data inválida vai pro fim da lista.
export function timestampDataLivro(data: string): number {
  const s = (data || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.MAX_SAFE_INTEGER; // inválida/vazia: fim da lista (sort é estável — empates mantêm a ordem)
}

export interface DadosOcorrenciaManual {
  /** Data da ocorrência — "aaaa-mm-dd" (input date) ou "dd/mm/aaaa". */
  data: string;
  /** Ex.: "Manutenção corretiva", "Reparo", "Substituição de dispositivo"… */
  tipoOcorrencia: string;
  oQueFoiFeito: string;
  descricao: string;
  /** Quem executou (texto livre — empresa/técnico executante). */
  quemRealizou: string;
  /** Funcionário (nr13_lista_phs) que assina o registro; null = sem assinatura. */
  phId: string | null;
  /** Preenchido quando a ocorrência é um REGISTRO DE RETIFICAÇÃO de uma entrada já lacrada. */
  retificaDe?: string;
}

// ASSÍNCRONA desde 14/08/2026: a rubrica sobe ao bucket antes de a entrada
// nascer, para não voltar a ser embutida em base64 (ver `livroAssinatura.ts`).
export async function montarEntradaLivroManual(
  dados: DadosOcorrenciaManual,
): Promise<LivroEntrada> {
  const func = dados.phId ? listarFuncionarios().find((f) => f.id === dados.phId) : undefined;
  const descricao = [dados.oQueFoiFeito.trim(), dados.descricao.trim()].filter(Boolean).join(' — ');

  const entrada: LivroEntrada = {
    id: `LIV-M-${Date.now()}`,
    data: dados.data,
    tipo: dados.tipoOcorrencia,
    descricao,
    relatorioCodigo: '', // ocorrência manual não nasce de relatório
    phNome: func?.nome ?? '',
    phCrea: func?.crea ?? '',
    origem: 'manual',
    criadoEm: new Date().toISOString(),
    quemRealizou: dados.quemRealizou.trim() || undefined,
    phId: func?.id,
    // Rubrica/cargo congelados na criação (bug fix 14/07/2026) — mesma regra da
    // entrada automática, agora por referência de conteúdo.
    ...(await camposDaRubrica(func?.assinatura)),
    assinanteFuncao: func?.funcao,
    // Nasce lacrada (mesma regra da entrada automática): registro de livro é imutável.
    lacrado: true,
    retificaDe: dados.retificaDe || undefined,
  };

  // 10B.2 · MONTA e devolve. Não grava, não ordena, não lacra.
  //
  // Antes esta função escrevia direto em `nr13_livro_<TAG>` e reordenava o array
  // por data. As duas coisas saíram, e a segunda por um motivo que virou regra: a
  // cadeia de lacres é uma sequência de TRANCAMENTOS, e o gatilho do banco
  // (`livro_imutavel.sql`) exige que a sequência lacrada nova comece pela antiga.
  // Reordenar o array com entradas lacradas dentro seria recusado pelo servidor.
  // Quem grava agora é `features/livro/rascunhosLivro.ts` — rascunho primeiro,
  // trancamento depois, sempre acrescentando ao fim.
  return entrada;
}

// Entrada do livro é IMUTÁVEL desde a criação (nasce lacrada): não existe mais edição/exclusão
// de entrada. Erro em registro se corrige com um REGISTRO DE RETIFICAÇÃO (entrada manual nova
// com retificaDe apontando para ela) — ambas permanecem no livro, como manda um livro legal.

export function listaPadraoDocumentos(): string[] {
  return [...DOCUMENTOS_DISPONIVEIS];
}

// ── Memorial de cálculo: folhas automáticas ────────────────────────────────────
// MEMORIAL.html é UMA folha que renderiza a fatia "part de N". Como cada slot do relatório é uma
// folha A4 fixa (uma iframe = uma página), a quantidade de folhas é decidida AQUI, no momento da
// montagem, conforme o tamanho do cálculo salvo — caldeira gera mais folhas que autoclave.
// Orçamento em UNIDADES DE ALTURA (1 = uma linha de texto simples no design novo do memorial —
// frações empilhadas, banners e caixas de status ocupam mais que uma linha, ver pesoLinha()).
const UNIDADES_POR_FOLHA_MEMORIAL = 42; // folha de continuação
const UNIDADES_PRIMEIRA_FOLHA = 30; // 1ª folha tem a seção "Dados do Cliente/Equipamento"
// Bloco até ~15% acima do orçamento ainda cabe inteiro numa folha (o auto-shrink do template
// reduz a fonte de 12px para ~11px) — só subdivide em seções blocos maiores que isso.
const LIMIAR_SUBDIVISAO = 48;

// Altura estimada de cada linha do log no design novo (memorial-calc-novo.css).
function pesoLinha(texto: string): number {
  const s = texto.trim();
  if (s.startsWith('$$')) return s.includes('\\frac') ? 3.5 : 1.8; // fração empilhada / equação linear
  if (/STATUS:|^OK:|^REPROVADO:|^FALHA:|N[ÃA]O VERIFICADO|^RESULTADO FINAL:|ATEN[ÇC][ÃA]O/i.test(s)) return 2.6; // caixa de status
  if (/^MEMORIAL DE C[ÁA]LCULO\b/i.test(s)) return 2.6; // banner azul
  if (/^-{6,}$/.test(s)) return 0.8; // divisor
  if (/^(\d+\.\s|PAR[ÂA]METROS)/i.test(s)) return 1.6; // título de seção
  // Comentário longo (observações da revisão de engenharia) quebra em 2+ linhas na folha —
  // subestimar aqui estourava a folha e o auto-shrink batia no piso de fonte cortando o fim.
  return s.length > 90 ? 2.2 : 1.15; // parâmetro / comentário
}

function ehCabecalhoMemorial(t: string): boolean {
  const u = t.toUpperCase();
  return (
    u.includes('MEMÓRIA DE CÁLCULO COMPLETA') ||
    u.includes('AVALIAÇÃO DE INTEGRIDADE ESTRUTURAL') ||
    (u.startsWith('PRESSÃO DE PROJETO') && u.includes('(P):')) ||
    (u.startsWith('DIÂMETRO INTERNO') && u.includes('(D):')) ||
    /^={4,}$/.test(u)
  );
}

function linhasDeMemorialHTML(html: string): string[] {
  const m = html.match(/<div class="katex-render">([\s\S]*)<\/div>/i);
  const corpo = m ? m[1] : html;
  return corpo
    .split(/<br\s*\/?>/i)
    .map((l) => l.replace(/<[^>]+>/g, '').trim())
    .filter((t) => t && t !== '&nbsp;' && !ehCabecalhoMemorial(t));
}

// Mesmo filtro de linhas do template MEMORIAL.html (1:1 por índice) — base da paginação.
// GV do autoclave (nr13_calc_gv_<TAG>) é mesclado APÓS o principal, na LEITURA — o template
// MEMORIAL.html faz a mesma concatenação, mantendo o contrato de índices from/to.
export function linhasMemorial(tag: string): string[] {
  const calc = ler<{ memorialHTML?: string }>(`nr13_calc_${tag}`);
  const linhas = calc?.memorialHTML ? linhasDeMemorialHTML(calc.memorialHTML) : [];
  const gv = ler<{ memorialHTML?: string }>(`nr13_calc_gv_${tag}`);
  if (gv?.memorialHTML) linhas.push(...linhasDeMemorialHTML(gv.memorialHTML));
  return linhas;
}

// Início de um bloco de componente: linha "MEMORIAL DE CÁLCULO - <nome>".
function ehInicioBloco(t: string): boolean {
  return /^MEMORIAL DE C[ÁA]LCULO\b/i.test(t.trim());
}

// Troca 'MEMORIAL.html' por N entradas 'MEMORIAL.html?part=k&of=N&from=a&to=b'.
// Empacota BLOCOS inteiros por folha (header + parâmetros + fórmulas + resultado ficam juntos,
// nunca cortados entre folhas) e preenche cada folha o máximo possível (menos espaço em branco).
export function expandirMemorial(tag: string, docs: string[]): string[] {
  const idx = docs.findIndex((d) => d.split('?')[0] === 'MEMORIAL.html');
  if (idx < 0) return docs;

  const linhas = linhasMemorial(tag);
  if (linhas.length === 0) {
    return [...docs.slice(0, idx), 'MEMORIAL.html?part=1&of=1&from=0&to=0', ...docs.slice(idx + 1)];
  }

  // Agrupa em blocos [início,fim) delimitados pelos headers de componente.
  const inicios: number[] = [];
  linhas.forEach((l, i) => { if (ehInicioBloco(l)) inicios.push(i); });
  if (inicios.length === 0 || inicios[0] !== 0) inicios.unshift(0);
  const brutos: { ini: number; fim: number }[] = inicios.map((ini, k) => ({
    ini,
    fim: k + 1 < inicios.length ? inicios[k + 1] : linhas.length,
  }));

  const pesoBloco = (b: { ini: number; fim: number }) =>
    linhas.slice(b.ini, b.fim).reduce((soma, l) => soma + pesoLinha(l), 0);

  // Bloco maior que uma folha inteira (ex.: autoclave = um componente só) seria espremido pelo
  // auto-shrink até fonte ilegível — subdivide nos títulos de seção ("1. ...", "2. ...") para o
  // empacotador poder quebrar em mais folhas.
  const blocos: { ini: number; fim: number }[] = [];
  for (const b of brutos) {
    if (pesoBloco(b) <= LIMIAR_SUBDIVISAO) { blocos.push(b); continue; }
    const cortes = [b.ini];
    for (let i = b.ini + 1; i < b.fim; i++) if (/^\d+\.\s/.test(linhas[i])) cortes.push(i);
    cortes.push(b.fim);
    for (let k = 0; k + 1 < cortes.length; k++) blocos.push({ ini: cortes[k], fim: cortes[k + 1] });
  }

  // Empacota blocos em folhas respeitando o orçamento de altura (sem dividir bloco).
  const ranges: { from: number; to: number }[] = [];
  let from = 0;
  let count = 0;
  let primeira = true;
  for (const b of blocos) {
    const tam = pesoBloco(b);
    const orcamento = primeira ? UNIDADES_PRIMEIRA_FOLHA : UNIDADES_POR_FOLHA_MEMORIAL;
    if (count > 0 && count + tam > orcamento) {
      ranges.push({ from, to: b.ini });
      from = b.ini;
      count = 0;
      primeira = false;
    }
    count += tam;
  }
  ranges.push({ from, to: linhas.length });

  const n = ranges.length;
  const partes = ranges.map((r, k) => `MEMORIAL.html?part=${k + 1}&of=${n}&from=${r.from}&to=${r.to}`);
  return [...docs.slice(0, idx), ...partes, ...docs.slice(idx + 1)];
}

// ── Folhas de foto: expansão em 1 slot por folha A4 ────────────────────────────
// Cada folha de foto rende no máximo 4 fotos por A4 (§5). Como cada slot do relatório é UMA folha
// (1 iframe = 1 imagem A4 na impressão), aqui pré-expandimos a folha em N entradas — 1 por página —
// igual ao expandirMemorial. Sem isto, >4 fotos viravam várias .page dentro de um único iframe e
// eram cortadas na tela / esmagadas na impressão. Cada template renderiza só sua fatia via ?fpag.
const FOTOS_POR_FOLHA = 4;
const FOLHA_FOTO_FONTE: Record<string, (d: Record<string, { fotos?: unknown[]; fotosDocumentacao?: unknown[] } | undefined>) => unknown[] | undefined> = {
  'CHECKLIST-FOTOS.html': (d) => d?.['checklist']?.fotos,
  'FOTOS-DOCUMENTACAO.html': (d) => d?.['checklist']?.fotosDocumentacao,
  'VISUAL-EXTERNO-FOTOS.html': (d) => d?.['visual_externo']?.fotos,
  'VISUAL-INTERNO-FOTOS.html': (d) => d?.['visual_interno']?.fotos,
  'TESTE-HIDROSTATICO-FOTOS.html': (d) => d?.['th']?.fotos,
};

export function expandirFolhasFoto(docs: string[], dadosContainer?: unknown): string[] {
  const d = (dadosContainer ?? {}) as Record<string, { fotos?: unknown[]; fotosDocumentacao?: unknown[] } | undefined>;
  const out: string[] = [];
  for (const doc of docs) {
    const base = doc.split('?')[0];
    const fonte = FOLHA_FOTO_FONTE[base];
    // Idempotente: se já expandido (?fpag=) ou não é folha de foto, mantém como está.
    if (!fonte || doc.includes('fpag=')) {
      out.push(doc);
      continue;
    }
    const arr = fonte(d);
    const n = Array.isArray(arr) ? arr.length : 0;
    const total = Math.max(1, Math.ceil(n / FOTOS_POR_FOLHA));
    if (total <= 1) {
      // ≤4 fotos: 1 página — comportamento idêntico ao de hoje (sem ?fpag).
      out.push(doc);
      continue;
    }
    const sep = doc.includes('?') ? '&' : '?';
    for (let k = 1; k <= total; k++) out.push(`${doc}${sep}fpag=${k}&fof=${total}`);
  }
  return out;
}
