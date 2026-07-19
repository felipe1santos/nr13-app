import * as XLSX from 'xlsx';
import { ler, lerTudo, salvar } from '../../services/storage';
import { isTrial } from '../../services/auth';
import { MSG_BLOQUEIO_IMPORTACAO } from '../../services/trial';
import type { EmpresaEquipamento, InfoEquipamento, TipoEquipamento } from './tipos';

/**
 * Importação de equipamentos por planilha (.xlsx / .xls / .ods / .csv).
 *
 * SEGURANÇA: o parser é o SheetJS 0.20.3 instalado do CDN oficial
 * (https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz). NÃO trocar por `npm install xlsx`:
 * o pacote publicado no npm está congelado em 0.18.5 com duas vulnerabilidades altas sem
 * correção (prototype pollution CVSS 7.8 / ReDoS CVSS 7.5) — e esta feature parseia arquivo
 * fornecido pelo usuário, que é exatamente o vetor exposto.
 *
 * Fluxo em DUAS PASSADAS: valida TODAS as linhas antes de gravar qualquer coisa.
 * TAG existente (nr13_info_<TAG>) ou repetida na própria planilha nunca é sobrescrita.
 */

export const COLUNAS_OBRIGATORIAS = [
  'tag',
  'tipo',
  'fabricante',
  'numero_serie',
  'ano',
  'cliente',
] as const;

export const COLUNAS_OPCIONAIS = [
  'pmta',
  'volume',
  'diametro',
  'comprimento',
  'material',
  'espessura',
  'local',
  'fluido',
  'pressao_projeto',
  'temperatura',
  'codigo_projeto',
  'observacoes',
] as const;

export const EXTENSOES_ACEITAS = ['.xlsx', '.xls', '.ods', '.csv'] as const;

export interface LinhaPreparada {
  linha: number; // número da linha na planilha (1-based, como o usuário vê)
  tag: string;
  info: InfoEquipamento;
  empresa: EmpresaEquipamento | null;
}

export interface LinhaProblema {
  linha: number;
  tag: string;
  motivo: string;
}

export interface AnalisePlanilha {
  totalLinhas: number;
  colunasEncontradas: string[];
  colunasObrigatoriasFaltando: string[];
  validas: LinhaPreparada[];
  duplicadas: LinhaProblema[];
  rejeitadas: LinhaProblema[];
}

export interface ResultadoImportacao {
  criados: string[];
  falhas: LinhaProblema[];
}

/* ───────────────────────── normalização ───────────────────────── */

/** "Nº Série" / "numero serie" / "NUMERO-SERIE" → "numero_serie". */
export function normalizarCabecalho(bruto: unknown): string {
  return String(bruto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // remove acentos
    .replace(/º|°/g, '') // "Nº" → "N"
    .toLowerCase()
    .trim()
    .replace(/[\s\-./]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Sinônimos comuns → nome canônico da coluna. */
const ALIAS: Record<string, string> = {
  n_serie: 'numero_serie',
  n_de_serie: 'numero_serie',
  num_serie: 'numero_serie',
  numero_de_serie: 'numero_serie',
  serie: 'numero_serie',
  serial: 'numero_serie',
  etiqueta: 'tag',
  tag_do_equipamento: 'tag',
  identificacao: 'tag',
  tipo_de_equipamento: 'tipo',
  tipo_equipamento: 'tipo',
  ano_fabricacao: 'ano',
  ano_de_fabricacao: 'ano',
  empresa: 'cliente',
  razao_social: 'cliente',
  cliente_razao_social: 'cliente',
  localizacao: 'local',
  localizacao_do_equipamento: 'local',
  codigo_de_projeto: 'codigo_projeto',
  norma: 'codigo_projeto',
  pressao_de_projeto: 'pressao_projeto',
  obs: 'observacoes',
  observacao: 'observacoes',
  diametro_interno: 'diametro',
  volume_m3: 'volume',
};

function canonizar(cab: string): string {
  const n = normalizarCabecalho(cab);
  return ALIAS[n] ?? n;
}

function texto(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return String(v.getFullYear());
  return String(v).trim();
}

const TIPOS_VALIDOS: Record<string, TipoEquipamento> = {
  vaso: 'vaso',
  vaso_de_pressao: 'vaso',
  vasos_de_pressao: 'vaso',
  vaso_pressao: 'vaso',
  vp: 'vaso',
  autoclave: 'autoclave',
  caldeira: 'caldeira',
};

/** Aceita variações de caixa/acento: "Vaso de Pressão", "CALDEIRA", "autoclave". */
export function normalizarTipo(bruto: string): TipoEquipamento | null {
  return TIPOS_VALIDOS[normalizarCabecalho(bruto)] ?? null;
}

/* ───────────────────────── leitura + validação ───────────────────────── */

export function extensaoAceita(nomeArquivo: string): boolean {
  const nome = nomeArquivo.toLowerCase();
  return EXTENSOES_ACEITAS.some((ext) => nome.endsWith(ext));
}

/**
 * Abre o workbook respeitando a codificação do CSV.
 *
 * Os formatos binários (.xlsx/.xls/.ods) já carregam a codificação dentro do arquivo, então vão
 * direto. CSV é texto cru: sem BOM o SheetJS assume a codepage do sistema (CP1252 no Windows), e
 * um arquivo UTF-8 sem BOM chega com os acentos quebrados — "Nº Série" virava "NÂº SÃ©rie", a
 * canonização não batia e a coluna sumia em silêncio. Isso acertava justamente o export CSV do
 * Google Sheets, que é UTF-8 sem BOM.
 *
 * Ordem: BOM presente manda; senão tenta UTF-8 estrito, e só cai para CP1252 quando a decodificação
 * falha — que é o caso do CSV salvo pelo Excel do Windows em ANSI.
 */
function lerWorkbook(buffer: ArrayBuffer, nomeArquivo: string): XLSX.WorkBook {
  if (!nomeArquivo.toLowerCase().endsWith('.csv')) {
    return XLSX.read(buffer, { type: 'array', cellDates: true });
  }

  const bytes = new Uint8Array(buffer);
  const temBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (temBom) {
    const texto = new TextDecoder('utf-8').decode(bytes.subarray(3));
    return XLSX.read(texto, { type: 'string', cellDates: true });
  }

  try {
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return XLSX.read(texto, { type: 'string', cellDates: true });
  } catch {
    // Não é UTF-8 válido: deixa o SheetJS aplicar a codepage legada (CP1252).
    return XLSX.read(buffer, { type: 'array', cellDates: true, codepage: 1252 });
  }
}

/** Lê o arquivo e devolve a análise completa (nada é gravado aqui). */
export async function analisarPlanilha(arquivo: File): Promise<AnalisePlanilha> {
  if (!extensaoAceita(arquivo.name)) {
    throw new Error('Formato não suportado. Use .xlsx, .xls, .ods ou .csv.');
  }

  const buffer = await arquivo.arrayBuffer();
  const wb = lerWorkbook(buffer, arquivo.name);
  const primeira = wb.SheetNames[0];
  if (!primeira) throw new Error('A planilha não tem nenhuma aba.');

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[primeira], {
    header: 1,
    blankrows: false,
    defval: '',
  });

  // localiza a linha de cabeçalho (a primeira que contenha a coluna "tag")
  const idxCabecalho = matriz.findIndex((linha) =>
    Array.isArray(linha) && linha.some((c) => canonizar(texto(c)) === 'tag'),
  );
  if (idxCabecalho < 0) {
    throw new Error('Não encontrei a coluna "tag" na planilha. Baixe o modelo e use os mesmos cabeçalhos.');
  }

  const cabecalhos = (matriz[idxCabecalho] as unknown[]).map((c) => canonizar(texto(c)));
  const colunasEncontradas = cabecalhos.filter(Boolean);
  const colunasObrigatoriasFaltando = COLUNAS_OBRIGATORIAS.filter(
    (c) => !colunasEncontradas.includes(c),
  );

  await lerTudo(); // garante o cache do storage antes de checar TAG existente

  const validas: LinhaPreparada[] = [];
  const duplicadas: LinhaProblema[] = [];
  const rejeitadas: LinhaProblema[] = [];
  const vistasNaPlanilha = new Set<string>();
  let totalLinhas = 0;

  for (let i = idxCabecalho + 1; i < matriz.length; i++) {
    const bruta = matriz[i];
    if (!Array.isArray(bruta)) continue;

    const campos: Record<string, string> = Object.create(null);
    cabecalhos.forEach((chave, col) => {
      if (chave) campos[chave] = texto(bruta[col]);
    });

    // linha totalmente vazia: ignorada em silêncio (não conta como rejeitada)
    if (!Object.values(campos).some((v) => v !== '')) continue;

    totalLinhas++;
    const numeroLinha = i + 1; // 1-based, como aparece no Excel
    const tag = (campos.tag || '').toUpperCase();

    if (!tag) {
      rejeitadas.push({ linha: numeroLinha, tag: '—', motivo: 'TAG vazia' });
      continue;
    }

    const tipo = normalizarTipo(campos.tipo || '');
    if (!tipo) {
      rejeitadas.push({
        linha: numeroLinha,
        tag,
        motivo: campos.tipo
          ? `Tipo inválido: "${campos.tipo}" (use vaso, autoclave ou caldeira)`
          : 'Tipo vazio (use vaso, autoclave ou caldeira)',
      });
      continue;
    }

    if (vistasNaPlanilha.has(tag)) {
      duplicadas.push({ linha: numeroLinha, tag, motivo: 'TAG repetida dentro da planilha' });
      continue;
    }
    if (ler<InfoEquipamento>(`nr13_info_${tag}`) !== null) {
      duplicadas.push({ linha: numeroLinha, tag, motivo: 'TAG já cadastrada no sistema' });
      continue;
    }

    vistasNaPlanilha.add(tag);
    validas.push({
      linha: numeroLinha,
      tag,
      info: montarInfo(tag, tipo, campos),
      empresa: montarEmpresa(campos),
    });
  }

  return { totalLinhas, colunasEncontradas, colunasObrigatoriasFaltando, validas, duplicadas, rejeitadas };
}

/* ───────────────────────── montagem dos registros ───────────────────────── */

function subtipoDe(tipo: TipoEquipamento, campos: Record<string, string>): InfoEquipamento['subtipo'] {
  // Caldeira: flamotubular é o único subtipo disponível na criação (CLAUDE.md §3).
  if (tipo === 'caldeira') return 'flamotubular';
  if (tipo === 'autoclave') {
    const s = normalizarCabecalho(campos.subtipo || '');
    if (s === 'retangular' || s === 'cilindrica' || s === 'vertical') return s;
  }
  return '';
}

/** Junta os dados técnicos opcionais num resumo legível (unidades vêm como o usuário digitou). */
function resumoTecnico(campos: Record<string, string>): string {
  const partes: string[] = [];
  const add = (rotulo: string, chave: string, sufixo = '') => {
    if (campos[chave]) partes.push(`${rotulo}: ${campos[chave]}${sufixo}`);
  };
  add('Volume', 'volume');
  add('Diâmetro', 'diametro');
  add('Comprimento', 'comprimento');
  add('Espessura', 'espessura');
  add('Material', 'material');
  add('Fluido', 'fluido');
  add('Pressão de projeto', 'pressao_projeto');
  add('Temperatura', 'temperatura');
  add('PMTA', 'pmta', ' MPa');
  return partes.join(' · ');
}

function montarInfo(
  tag: string,
  tipo: TipoEquipamento,
  campos: Record<string, string>,
): InfoEquipamento {
  const info: InfoEquipamento = { tag, tipo, subtipo: subtipoDe(tipo, campos) };

  if (campos.fabricante) info.fabricante = campos.fabricante;
  if (campos.numero_serie) info.numeroSerie = campos.numero_serie;
  if (campos.ano) info.ano = campos.ano;
  if (campos.local) info.localizacao = campos.local;
  if (campos.codigo_projeto) info.codigoProjeto = campos.codigo_projeto;
  if (campos.observacoes) info.descricao = campos.observacoes;

  const resumo = resumoTecnico(campos);
  if (resumo) info.descricaoResumida = resumo;

  // PMTA da planilha é declarada em MPa (documentado no modal e no modelo).
  const pmta = Number(String(campos.pmta || '').replace(',', '.'));
  if (campos.pmta && Number.isFinite(pmta) && pmta > 0) info.pmtaAdotadaMpa = String(pmta);

  return info;
}

function montarEmpresa(campos: Record<string, string>): EmpresaEquipamento | null {
  if (!campos.cliente) return null;
  return { razaoSocial: campos.cliente };
}

/* ───────────────────────── gravação ───────────────────────── */

/** Cede o event loop para o React pintar a barra de progresso entre as gravações. */
function respirar(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Grava as linhas já validadas, uma por vez, reportando o progresso real
 * (cada `salvar()` fala com o Supabase — o await é o que faz a barra andar de verdade).
 */
export async function importarLinhas(
  linhas: LinhaPreparada[],
  aoProgredir: (feitos: number, total: number, tag: string) => void,
): Promise<ResultadoImportacao> {
  // Defesa em profundidade: além da UI, o próprio serviço recusa no trial.
  if (isTrial()) throw new Error(MSG_BLOQUEIO_IMPORTACAO);
  const criados: string[] = [];
  const falhas: LinhaProblema[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const item = linhas[i];
    aoProgredir(i, linhas.length, item.tag);
    await respirar();
    try {
      await salvar(`nr13_info_${item.tag}`, item.info);
      if (item.empresa) await salvar(`nr13_emp_${item.tag}`, item.empresa);
      criados.push(item.tag);
    } catch (e) {
      falhas.push({
        linha: item.linha,
        tag: item.tag,
        motivo: `Falha ao gravar: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  aoProgredir(linhas.length, linhas.length, '');
  return { criados, falhas };
}

/* ───────────────────────── modelo para download ───────────────────────── */

const LINHA_EXEMPLO: Record<string, string> = {
  tag: 'V-101',
  tipo: 'vaso',
  fabricante: 'Metalúrgica Exemplo Ltda',
  numero_serie: 'SN-2024-0187',
  ano: '2018',
  cliente: 'Indústria Modelo S.A.',
  pmta: '1.05',
  volume: '2.5',
  diametro: '1200',
  comprimento: '3000',
  material: 'ASTM A516 Gr.70',
  espessura: '9.5',
  local: 'Casa de máquinas',
  fluido: 'Ar comprimido',
  pressao_projeto: '10.5',
  temperatura: '60',
  codigo_projeto: 'ASME VIII Div.1',
  observacoes: 'Equipamento importado da planilha',
};

/** Gera e baixa o modelo .xlsx (cabeçalho + 1 linha de exemplo). */
export function baixarModeloPlanilha(): void {
  if (isTrial()) {
    window.alert(MSG_BLOQUEIO_IMPORTACAO);
    return;
  }
  const colunas = [...COLUNAS_OBRIGATORIAS, ...COLUNAS_OPCIONAIS];
  const dados = [colunas, colunas.map((c) => LINHA_EXEMPLO[c] ?? '')];
  const ws = XLSX.utils.aoa_to_sheet(dados);
  ws['!cols'] = colunas.map((c) => ({ wch: Math.max(12, c.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Equipamentos');
  XLSX.writeFile(wb, 'modelo-importacao-equipamentos.xlsx');
}
