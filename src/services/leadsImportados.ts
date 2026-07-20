import * as XLSX from 'xlsx';
import { supabase } from './supabase';

/**
 * Leads importados/cadastrados manualmente no painel Admin (tabela leads_importados,
 * criada por supabase/leads_setup.sql — RLS só superadmin).
 *
 * SEGURANÇA: o parser é o SheetJS 0.20.3 instalado do CDN oficial
 * (https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz). NÃO trocar por `npm install xlsx`:
 * o pacote do npm está congelado em 0.18.5 com vulnerabilidades altas sem correção, e esta
 * feature parseia arquivo fornecido pelo usuário — exatamente o vetor exposto.
 *
 * Fluxo em DUAS PASSADAS (mesmo padrão da importação de equipamentos): valida TODAS as
 * linhas antes de gravar qualquer coisa; e-mail repetido nunca sobrescreve lead existente.
 */

export interface LeadImportado {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  origem: string;
  criado_em: string;
}

export const COLUNAS_LEADS = ['nome', 'email', 'telefone', 'empresa', 'origem'] as const;
export const EXTENSOES_ACEITAS_LEADS = ['.xlsx', '.xls', '.ods', '.csv'] as const;

export interface LinhaLeadPreparada {
  linha: number; // 1-based, como o usuário vê no Excel
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  origem: string;
}

export interface LinhaLeadProblema {
  linha: number;
  email: string;
  motivo: string;
}

export interface AnalisePlanilhaLeads {
  totalLinhas: number;
  validas: LinhaLeadPreparada[];
  duplicadas: LinhaLeadProblema[];
  rejeitadas: LinhaLeadProblema[];
}

/* ───────────────────────── CRUD (tabela leads_importados) ───────────────────────── */

/** Lista todos os leads importados. `null` = tabela não existe (rodar leads_setup.sql). */
export async function listarLeadsImportados(): Promise<LeadImportado[] | null> {
  const { data, error } = await supabase
    .from('leads_importados')
    .select('*')
    .order('criado_em', { ascending: false });
  if (error) return null;
  return (data as LeadImportado[]) ?? [];
}

export interface DadosLead {
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  origem: string;
}

/** Cria um lead (cadastro manual). Lança erro legível em e-mail duplicado. */
export async function criarLeadImportado(dados: DadosLead): Promise<void> {
  const { error } = await supabase.from('leads_importados').insert({
    ...dados,
    email: dados.email.trim().toLowerCase(),
  });
  if (error) {
    throw new Error(
      error.code === '23505' ? 'Já existe um lead importado com este e-mail.' : error.message,
    );
  }
}

export async function atualizarLeadImportado(id: string, dados: DadosLead): Promise<void> {
  const { error } = await supabase
    .from('leads_importados')
    .update({ ...dados, email: dados.email.trim().toLowerCase(), atualizado_em: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    throw new Error(
      error.code === '23505' ? 'Já existe um lead importado com este e-mail.' : error.message,
    );
  }
}

export async function excluirLeadImportado(id: string): Promise<void> {
  const { error } = await supabase.from('leads_importados').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ───────────────────────── planilha: modelo ───────────────────────── */

/** Gera e baixa o modelo .xlsx (cabeçalho + 2 linhas de exemplo). */
export function baixarModeloPlanilhaLeads(): void {
  const dados = [
    [...COLUNAS_LEADS],
    ['João da Silva', 'joao.silva@empresa.com.br', '(51) 99999-0000', 'Metalúrgica Exemplo', 'Planilha antiga'],
    ['Maria Souza', 'maria@industria.com.br', '(11) 98888-1111', 'Indústria Modelo', 'Feira 2025'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(dados);
  ws['!cols'] = [{ wch: 24 }, { wch: 30 }, { wch: 18 }, { wch: 24 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, 'modelo-importacao-leads.xlsx');
}

/* ───────────────────────── planilha: leitura e validação ───────────────────────── */

function texto(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** "E-mail" / "E-MAIL" / "Nome completo" → nome canônico da coluna. */
function canonizar(bruto: unknown): string {
  const base = String(bruto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[\s\-./]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const alias: Record<string, string> = {
    e_mail: 'email',
    mail: 'email',
    nome_completo: 'nome',
    contato: 'nome',
    fone: 'telefone',
    celular: 'telefone',
    whatsapp: 'telefone',
    empresa_nome: 'empresa',
    companhia: 'empresa',
    origem_do_lead: 'origem',
    fonte: 'origem',
  };
  return alias[base] ?? base;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Mesma decodificação tolerante do importador de equipamentos (CSV do Excel BR em ANSI). */
function lerWorkbook(buffer: ArrayBuffer, nomeArquivo: string): XLSX.WorkBook {
  if (!nomeArquivo.toLowerCase().endsWith('.csv')) {
    return XLSX.read(buffer, { type: 'array' });
  }
  const bytes = new Uint8Array(buffer);
  const temBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (temBom) {
    return XLSX.read(new TextDecoder('utf-8').decode(bytes.subarray(3)), { type: 'string' });
  }
  try {
    return XLSX.read(new TextDecoder('utf-8', { fatal: true }).decode(bytes), { type: 'string' });
  } catch {
    return XLSX.read(buffer, { type: 'array', codepage: 1252 });
  }
}

/**
 * Lê o arquivo e devolve a análise completa (nada é gravado aqui).
 * `emailsExistentes` = e-mails já no sistema (leads importados + leads do trial),
 * em minúsculas — linhas com esses e-mails caem em `duplicadas`.
 */
export async function analisarPlanilhaLeads(
  arquivo: File,
  emailsExistentes: Set<string>,
): Promise<AnalisePlanilhaLeads> {
  const ext = arquivo.name.toLowerCase();
  if (!EXTENSOES_ACEITAS_LEADS.some((e) => ext.endsWith(e))) {
    throw new Error('Formato não suportado. Use .xlsx, .xls, .ods ou .csv.');
  }

  const wb = lerWorkbook(await arquivo.arrayBuffer(), arquivo.name);
  const primeira = wb.SheetNames[0];
  if (!primeira) throw new Error('A planilha não tem nenhuma aba.');

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[primeira], {
    header: 1,
    blankrows: false,
    defval: '',
  });

  const idxCabecalho = matriz.findIndex(
    (l) => Array.isArray(l) && l.some((c) => canonizar(c) === 'email'),
  );
  if (idxCabecalho < 0) {
    throw new Error('Não encontrei a coluna "email" na planilha. Baixe o modelo e use os mesmos cabeçalhos.');
  }
  const cabecalhos = (matriz[idxCabecalho] as unknown[]).map((c) => canonizar(c));

  const validas: LinhaLeadPreparada[] = [];
  const duplicadas: LinhaLeadProblema[] = [];
  const rejeitadas: LinhaLeadProblema[] = [];
  const vistosNaPlanilha = new Set<string>();
  let totalLinhas = 0;

  for (let i = idxCabecalho + 1; i < matriz.length; i++) {
    const bruta = matriz[i];
    if (!Array.isArray(bruta)) continue;
    const campos: Record<string, string> = Object.create(null);
    cabecalhos.forEach((chave, col) => {
      if (chave) campos[chave] = texto(bruta[col]);
    });
    if (!Object.values(campos).some((v) => v !== '')) continue; // linha vazia: ignora

    totalLinhas++;
    const numeroLinha = i + 1;
    const email = (campos.email || '').toLowerCase();

    if (!email) {
      rejeitadas.push({ linha: numeroLinha, email: '—', motivo: 'E-mail vazio' });
      continue;
    }
    if (!RE_EMAIL.test(email)) {
      rejeitadas.push({ linha: numeroLinha, email, motivo: 'E-mail inválido' });
      continue;
    }
    if (vistosNaPlanilha.has(email)) {
      duplicadas.push({ linha: numeroLinha, email, motivo: 'E-mail repetido na planilha' });
      continue;
    }
    if (emailsExistentes.has(email)) {
      duplicadas.push({ linha: numeroLinha, email, motivo: 'E-mail já cadastrado no sistema' });
      continue;
    }

    vistosNaPlanilha.add(email);
    validas.push({
      linha: numeroLinha,
      nome: campos.nome || '',
      email,
      telefone: campos.telefone || '',
      empresa: campos.empresa || '',
      origem: campos.origem || 'Planilha importada',
    });
  }

  return { totalLinhas, validas, duplicadas, rejeitadas };
}

/** Grava as linhas válidas em blocos. Retorna quantidade criada + falhas por linha. */
export async function importarLeads(
  linhas: LinhaLeadPreparada[],
): Promise<{ criados: number; falhas: LinhaLeadProblema[] }> {
  let criados = 0;
  const falhas: LinhaLeadProblema[] = [];
  const BLOCO = 100;
  for (let i = 0; i < linhas.length; i += BLOCO) {
    const bloco = linhas.slice(i, i + BLOCO);
    const { error } = await supabase.from('leads_importados').insert(
      bloco.map((l) => ({
        nome: l.nome,
        email: l.email,
        telefone: l.telefone,
        empresa: l.empresa,
        origem: l.origem,
      })),
    );
    if (!error) {
      criados += bloco.length;
      continue;
    }
    // Bloco falhou (ex.: corrida com outra importação): tenta linha a linha para
    // aproveitar o máximo e apontar exatamente quais falharam.
    for (const l of bloco) {
      const { error: e1 } = await supabase.from('leads_importados').insert({
        nome: l.nome,
        email: l.email,
        telefone: l.telefone,
        empresa: l.empresa,
        origem: l.origem,
      });
      if (e1) {
        falhas.push({
          linha: l.linha,
          email: l.email,
          motivo: e1.code === '23505' ? 'E-mail já cadastrado' : e1.message,
        });
      } else {
        criados++;
      }
    }
  }
  return { criados, falhas };
}
