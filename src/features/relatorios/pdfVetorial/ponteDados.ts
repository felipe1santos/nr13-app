/**
 * Fase 11 · A PONTE DE DADOS — o passo 11.3 da especificação da 10C.
 *
 * ## Por que ela vem ANTES das folhas
 *
 * As 27 folhas de hoje leem `localStorage` cada uma por conta própria, com
 * `JSON.parse(... || '{}')`. Quando a chave falta, a folha imprime "-" e
 * **ninguém vê erro nenhum** — foi assim que a CAPA saiu com
 * "Nº RELATÓRIO: -" por dias em 13/08/2026. Portar o visual primeiro e ligar os
 * dados depois repetiria exatamente isso.
 *
 * Então a ordem é a inversa: primeiro um MODELO explícito do documento, com
 * cada campo declarando de onde vem; as folhas só desenham o que este módulo
 * entrega. Campo sem fonte não chega ao desenho — ele aparece aqui, como
 * `null`, e o `textoOu()` decide o que imprimir.
 *
 * ## O que NÃO acontece aqui
 *
 * Nenhuma REGRA DE NEGÓCIO nova. Categoria, PMTA, PTH, vencimento e laudo já
 * têm dono no sistema; esta ponte só LÊ o que eles gravaram. Recalcular
 * qualquer um deles aqui criaria uma segunda verdade — e a segunda verdade de
 * um número que vai para um documento assinado é o pior defeito possível.
 */
import { ler } from '../../../services/storage';
import type { RelatorioMeta } from '../tipos';

export interface DadosEmpresa {
  razao: string;
  endereco: string;
  contato: string;
  logo: string | null;
}

export interface FotoDoc {
  dataUrl: string;
  descricao: string;
}

export interface ModeloDocumento {
  tag: string;
  empresa: DadosEmpresa;
  numeroRelatorio: string;
  /** Capa. */
  cliente: string | null;
  tipoInspecao: string | null;
  emissao: string | null;
  fotoCapa: string | null;
  /** Identificação. */
  equipamento: Record<string, string | null>;
  pressoes: { rotulo: string; mpa: string | null; kgf: string | null; bar: string | null }[];
  datas: { execucao: string | null; validade: string | null };
  /** Exame externo. */
  exameExterno: { itens: { titulo: string; resposta: string }[]; observacoes: string | null; resultado: string | null };
  /** Fotos do exame externo. */
  fotos: FotoDoc[];
  /** Parecer. */
  laudo: { apto: boolean | null };
  proximas: { interna: string | null; externa: string | null };
  assinantes: { nome: string; funcao: string; registro: string; rubrica: string | null }[];
}

/** Texto de um campo ausente. NUNCA inventa valor: diz que não tem. */
export function textoOu(v: string | null | undefined, vazio = '—'): string {
  return v && String(v).trim() !== '' ? String(v).trim() : vazio;
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** MPa → kgf/cm² e bar. Fator do sistema (§3), não arredondado aqui. */
export function converterPressao(mpa: number | null): { mpa: string | null; kgf: string | null; bar: string | null } {
  if (mpa === null || !Number.isFinite(mpa)) return { mpa: null, kgf: null, bar: null };
  return {
    mpa: mpa.toFixed(3),
    kgf: (mpa * 10.19716).toFixed(2),
    bar: (mpa * 10).toFixed(2),
  };
}

interface InfoEquip {
  descricao?: string; tipo?: string; fabricante?: string; numeroSerie?: string;
  ano?: string; codigoProjeto?: string; localizacao?: string; fluido?: string;
}
interface Categoria { catFinal?: string; grupo?: string; volume?: number | string; classeFluido?: string; fluido?: string }
interface Calc { pmta?: number; pth?: number }
interface Laudo { apto?: boolean | null }

/**
 * Monta o modelo a partir das chaves reais. É a ÚNICA função deste módulo que
 * toca o armazenamento — o resto é puro e testável sem DOM.
 */
export function montarModelo(tag: string): ModeloDocumento {
  const meta = ler<RelatorioMeta>('nr13_relatorio_meta_atual');
  const info = ler<InfoEquip>(`nr13_info_${tag}`) ?? {};
  const cat = ler<Categoria>(`nr13_cat_${tag}`) ?? {};
  const calc = ler<Calc>(`nr13_calc_${tag}`) ?? {};
  const laudo = ler<Laudo>(`nr13_laudo_${tag}`);
  const campo = ler<Record<string, unknown>>('nr13_injecao_atual') ?? {};
  const fotosFicha = ler<{ capa?: string; fotos?: { base64?: string }[] }>(`nr13_fotos_${tag}`) ?? {};

  // A empresa vem do SNAPSHOT congelado quando existe (§7-bis): relatório
  // emitido não muda quando a logo do cadastro muda.
  const emp = (meta?.empresa ?? ler<Record<string, unknown>>('nr13_minha_empresa') ?? {}) as Record<string, unknown>;

  const pmta = converterPressao(typeof calc.pmta === 'number' ? calc.pmta : null);
  const pth = converterPressao(typeof calc.pth === 'number' ? calc.pth : null);

  const ve = (campo.visual_externo ?? {}) as {
    itens?: Record<string, string>;
    itemObs?: Record<string, string>;
    observacoes?: string;
    resultado?: string;
    fotos?: { base64?: string; descricao?: string }[];
  };

  return {
    tag,
    empresa: {
      razao: textoOu(texto(emp.razaoSocial ?? emp.razao ?? emp.nome), ''),
      endereco: [emp.endereco, emp.cidade, emp.cnpj ? `CNPJ: ${emp.cnpj}` : '']
        .filter((p) => p && String(p).trim() !== '')
        .join(' • '),
      contato: [emp.telefone, emp.site, emp.email]
        .filter((p) => p && String(p).trim() !== '')
        .join(' – '),
      logo: texto(emp.logo ?? emp.logoUrl),
    },
    numeroRelatorio: textoOu(texto(meta?.codigo), ''),
    cliente: texto((ler<Record<string, unknown>>(`nr13_emp_${tag}`) ?? {}).razaoSocial),
    tipoInspecao: texto(meta?.tipoInspecao),
    emissao: texto(meta?.emissao),
    fotoCapa: texto(fotosFicha.capa) ?? texto(fotosFicha.fotos?.[0]?.base64),
    equipamento: {
      'IDENTIFICAÇÃO / T.A.G.': tag,
      'TIPO DE EQUIPAMENTO': texto(info.tipo) ?? texto(info.descricao),
      FABRICANTE: texto(info.fabricante),
      'NÚMERO DE SÉRIE': texto(info.numeroSerie),
      'ANO DE FABRICAÇÃO': texto(info.ano),
      'CÓDIGO DE PROJETO': texto(info.codigoProjeto),
      'FLUIDO DE OPERAÇÃO': texto(cat.fluido) ?? texto(info.fluido),
      'CLASSE DO FLUIDO': texto(cat.classeFluido),
      'VOLUME (m³)': texto(cat.volume),
      'GRUPO DE RISCO': texto(cat.grupo),
      'CATEGORIA DO VASO': texto(cat.catFinal),
      'LOCAL DA INSTALAÇÃO': texto(info.localizacao),
    },
    pressoes: [
      { rotulo: 'PMTA — Pressão Máxima de Trabalho Admissível', ...pmta },
      { rotulo: 'PTH — Pressão de Teste Hidrostático', ...pth },
    ],
    datas: { execucao: texto(meta?.execucaoInspecao), validade: texto(meta?.validade) },
    exameExterno: {
      itens: Object.entries(ve.itens ?? {})
        .filter(([, v]) => v !== undefined)
        .map(([titulo, resposta]) => ({ titulo, resposta: String(resposta || '').toUpperCase() || '—' })),
      observacoes: texto(ve.observacoes),
      resultado: texto(ve.resultado),
    },
    fotos: (ve.fotos ?? [])
      .map((f) => ({ dataUrl: String(f.base64 ?? ''), descricao: String(f.descricao ?? '') }))
      .filter((f) => f.dataUrl.startsWith('data:image')),
    laudo: { apto: typeof laudo?.apto === 'boolean' ? laudo.apto : null },
    // As próximas inspeções vêm da META — a MESMA fonte que alimenta o
    // vencimento oficial (`vencimentos_org` lê o índice, que copia daqui).
    // Recalcular prazo neste módulo criaria a segunda regra que a decisão (B)
    // do dono proíbe.
    proximas: {
      interna: texto(meta?.proximaInspecaoInterna),
      externa: texto(meta?.proximaInspecaoExterna),
    },
    assinantes: [
      meta?.assinantes?.engenheiro
        ? {
            nome: textoOu(meta.assinantes.engenheiro.nome, ''),
            funcao: textoOu(meta.assinantes.engenheiro.funcao, 'Engenheiro'),
            registro: textoOu(meta.assinantes.engenheiro.crea, ''),
            rubrica: texto(meta.assinantes.engenheiro.assinatura),
          }
        : { nome: textoOu(meta?.phNome, ''), funcao: 'Engenheiro', registro: textoOu(meta?.phCrea, ''), rubrica: null },
      meta?.assinantes?.tecnico
        ? {
            nome: textoOu(meta.assinantes.tecnico.nome, ''),
            funcao: textoOu(meta.assinantes.tecnico.funcao, 'Inspetor'),
            registro: textoOu(meta.assinantes.tecnico.crea, ''),
            rubrica: texto(meta.assinantes.tecnico.assinatura),
          }
        : { nome: textoOu(meta?.tecnicoNome, ''), funcao: 'Inspetor', registro: '', rubrica: null },
    ].filter((a) => a.nome !== ''),
  };
}

/** Quantas folhas de fotos as N fotos exigem — 4 por folha (§5). */
export const FOTOS_POR_FOLHA = 4;
export function folhasDeFotos(n: number): number {
  return Math.max(1, Math.ceil(n / FOTOS_POR_FOLHA));
}
