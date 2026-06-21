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

// NR-13 13.4.1.9 — injeta TERMO-ABERTURA.html antes de LIVRO-REGISTRO.html só quando é a
// 1ª inspeção do livro daquele equipamento (livro vazio).
// Também injeta automaticamente TESTE-HIDROSTATICO-FOTOS.html após TESTE-HIDROSTATICO.html.
export function montarListaComTermoAbertura(tag: string, docsSelecionados: string[]): string[] {
  const precisaAbertura =
    docsSelecionados.includes('LIVRO-REGISTRO.html') &&
    (ler<LivroEntrada[]>(chaveLivro(tag)) || []).length === 0;

  const precisaFotosTH = docsSelecionados.includes('TESTE-HIDROSTATICO.html');
  const precisaFotosVE = docsSelecionados.includes('VISUAL-EXTERNO.html');
  const precisaFotosVI = docsSelecionados.includes('VISUAL-INTERNO.html');
  const precisaFotosCL = docsSelecionados.includes('checklist3.html');

  if (!precisaAbertura && !precisaFotosTH && !precisaFotosVE && !precisaFotosVI && !precisaFotosCL) return docsSelecionados;

  const resultado: string[] = [];
  for (const doc of docsSelecionados) {
    if (doc === 'LIVRO-REGISTRO.html' && precisaAbertura) resultado.push('TERMO-ABERTURA.html');
    resultado.push(doc);
    if (doc === 'TESTE-HIDROSTATICO.html') resultado.push('TESTE-HIDROSTATICO-FOTOS.html');
    if (doc === 'VISUAL-EXTERNO.html') resultado.push('VISUAL-EXTERNO-FOTOS.html');
    if (doc === 'VISUAL-INTERNO.html') resultado.push('VISUAL-INTERNO-FOTOS.html');
    // markdown #11 e #12: "Fotos da documentação" vem ANTES de "Fotos do checklist".
    if (doc === 'checklist3.html') {
      resultado.push('FOTOS-DOCUMENTACAO.html');
      resultado.push('CHECKLIST-FOTOS.html');
    }
  }
  return resultado;
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
