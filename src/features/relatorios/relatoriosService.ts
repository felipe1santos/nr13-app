import { ler, salvar } from '../../services/storage';
import { DOCUMENTOS_DISPONIVEIS, type RelatorioMeta, type RelatorioSalvo, type TipoInspecao } from './tipos';

export function filtrarDocumentosValidos(lista: string[]): string[] {
  return (lista || []).filter((doc) => doc.split('?')[0].toLowerCase().endsWith('.html'));
}

interface LivroEntrada {
  id: string;
  data: string;
  tipo: TipoInspecao;
  descricao: string;
  relatorioCodigo: string;
  phNome: string;
  phCrea: string;
  origem: 'auto';
  criadoEm: string;
}

function chaveLivro(tag: string): string {
  return `nr13_livro_${tag}`;
}

// ── Assinantes do relatório (motor de assinatura — mesmo padrão do prontuário) ─────────────────
// ids referem-se a Funcionario.id de nr13_lista_phs; null = "sem assinatura" para aquele papel.
// A chave nr13_assinantes_rel_<TAG> é lida pelo public/rel-assinatura.js nas folhas do relatório.
const chaveAssinantesRel = (tag: string) => `nr13_assinantes_rel_${tag}`;

export interface AssinantesRelatorio {
  engenheiroId: string | null;
  tecnicoId: string | null;
}

export function obterAssinantesRel(tag: string): AssinantesRelatorio {
  const salvo = ler<Partial<AssinantesRelatorio>>(chaveAssinantesRel(tag));
  return {
    engenheiroId: salvo?.engenheiroId ?? null,
    tecnicoId: salvo?.tecnicoId ?? null,
  };
}

export function gravarAssinantesRel(tag: string, a: AssinantesRelatorio): void {
  // salvar() grava o localStorage de forma síncrona antes de persistir remoto — os iframes
  // remontados logo em seguida já leem o valor novo.
  void salvar(chaveAssinantesRel(tag), a);
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

export function listarHistorico(tag?: string): RelatorioSalvo[] {
  const todos = ler<RelatorioSalvo[]>('nr13_historico_relatorios') || [];
  return tag ? todos.filter((r) => r.tagVaso === tag) : todos;
}

export async function salvarNoHistorico(relatorio: RelatorioSalvo): Promise<void> {
  const todos = ler<RelatorioSalvo[]>('nr13_historico_relatorios') || [];
  const idx = todos.findIndex((r) => r.id === relatorio.id);
  if (idx >= 0) todos[idx] = relatorio;
  else todos.push(relatorio);
  await salvar('nr13_historico_relatorios', todos);
}

export async function excluirDoHistorico(id: string): Promise<void> {
  const todos = ler<RelatorioSalvo[]>('nr13_historico_relatorios') || [];
  await salvar('nr13_historico_relatorios', todos.filter((r) => r.id !== id));
}

// NR-13 13.5.1.8 — entrada automática no Livro de Registro de Segurança a cada relatório novo
// (não duplica se já existir, isto é, se for apenas reabertura/edição do mesmo relatório).
export async function adicionarEntradaLivroAuto(relatorio: RelatorioSalvo): Promise<void> {
  const livro = ler<LivroEntrada[]>(chaveLivro(relatorio.tagVaso)) || [];
  if (livro.some((l) => l.relatorioCodigo === relatorio.meta.codigo)) return;

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
  };
  await salvar(chaveLivro(relatorio.tagVaso), [...livro, entrada]);
}

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
function linhasMemorial(tag: string): string[] {
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
