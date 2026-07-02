// Vida remanescente por taxa de corrosão (API 510 §7 adaptado à NR-13).
//
//   taxa (mm/ano)    = (t_anterior − t_atual) / Δanos
//   sobremetal (mm)  = t_atual − t_requerida
//   vida (anos)      = sobremetal / taxa
//   próxima inspeção = min(vida/2, teto NR-13 de inspeção interna sem SPIE)
//
// Tetos NR-13 (inspeção interna, estabelecimento SEM SPIE): vasos/autoclaves por categoria
// (I=3, II=4, III=6, IV=8, V=10 anos); caldeiras = 1 ano (12 meses).
import type { Categoria } from './categoria';

export interface EntradaVidaRemanescente {
  tAtualMm: number; // menor espessura medida na inspeção atual
  dataAtual: string; // dd/mm/aaaa
  tAnteriorMm: number; // menor espessura da inspeção anterior (ou nominal de fabricação)
  dataAnterior: string; // dd/mm/aaaa (fabricação: 01/01/<ano>)
  tRequeridaMm: number; // espessura mínima requerida (memorial)
  categoria?: Categoria | null;
  tipo?: 'vaso' | 'autoclave' | 'caldeira';
}

export interface ResultadoVidaRemanescente {
  taxaMmAno: number | null; // null = sem desgaste mensurável ou datas inválidas
  sobremetalMm: number;
  vidaAnos: number | null; // null = indeterminada (taxa nula); 0 = esgotada
  prazoNR13Anos: number | null;
  proximaInspecaoAnos: number | null;
  avisos: string[];
  log: string[];
}

const TETO_NR13_VASO: Record<Categoria, number> = { I: 3, II: 4, III: 6, IV: 8, V: 10 };

export function parseDataBR(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s ?? '').trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const d = new Date(ano, mes - 1, dia);
  // rejeita overflow silencioso do Date (ex.: 31/02 → 03/03)
  if (d.getDate() !== dia || d.getMonth() !== mes - 1) return null;
  return d;
}

const ANO_MS = 365.25 * 24 * 3600 * 1000;

export function calcularVidaRemanescente(e: EntradaVidaRemanescente): ResultadoVidaRemanescente {
  const avisos: string[] = [];

  const dAtual = parseDataBR(e.dataAtual);
  const dAnterior = parseDataBR(e.dataAnterior);
  const deltaAnos = dAtual && dAnterior ? (dAtual.getTime() - dAnterior.getTime()) / ANO_MS : 0;

  const sobremetalMm = e.tAtualMm - e.tRequeridaMm;

  // taxa de corrosão
  let taxaMmAno: number | null = null;
  if (!dAtual || !dAnterior) {
    avisos.push('Datas inválidas — use o formato dd/mm/aaaa.');
  } else if (deltaAnos <= 0) {
    avisos.push('A data da inspeção anterior deve ser anterior à data atual — taxa não calculada.');
  } else {
    const desgaste = e.tAnteriorMm - e.tAtualMm;
    if (desgaste <= 0) {
      avisos.push('Sem desgaste mensurável entre as medições (espessura atual ≥ anterior) — vida indeterminada por taxa.');
    } else {
      taxaMmAno = desgaste / deltaAnos;
    }
  }

  // vida remanescente
  let vidaAnos: number | null = null;
  if (sobremetalMm <= 0) {
    vidaAnos = 0;
    avisos.push('Espessura atual já está abaixo da mínima requerida — vida remanescente esgotada. Reprovar/reparar.');
  } else if (taxaMmAno != null && taxaMmAno > 0) {
    vidaAnos = sobremetalMm / taxaMmAno;
  }

  // teto NR-13
  const tipo = e.tipo ?? 'vaso';
  const prazoNR13Anos =
    tipo === 'caldeira' ? 1 : e.categoria ? (TETO_NR13_VASO[e.categoria] ?? null) : null;
  if (tipo !== 'caldeira' && !e.categoria) {
    avisos.push('Categoria NR-13 não calculada — teto normativo de prazo não aplicado.');
  }

  // próxima inspeção sugerida
  let proximaInspecaoAnos: number | null = null;
  if (vidaAnos === 0) {
    proximaInspecaoAnos = 0;
  } else if (vidaAnos != null) {
    proximaInspecaoAnos = prazoNR13Anos != null ? Math.min(vidaAnos / 2, prazoNR13Anos) : vidaAnos / 2;
  } else if (prazoNR13Anos != null) {
    proximaInspecaoAnos = prazoNR13Anos;
  }

  const fmt = (n: number | null, unidade: string) => (n == null ? '—' : `${n.toFixed(2)} ${unidade}`);
  const log = [
    '// ====================================================',
    '// VIDA REMANESCENTE — TAXA DE CORROSÃO (API 510 / NR-13)',
    '// ====================================================',
    `// Inspeção anterior: ${e.dataAnterior} — t = ${e.tAnteriorMm.toFixed(2)} mm`,
    `// Inspeção atual:    ${e.dataAtual} — t = ${e.tAtualMm.toFixed(2)} mm`,
    `// Espessura mínima requerida (memorial): ${e.tRequeridaMm.toFixed(2)} mm`,
    `// Intervalo entre inspeções: ${deltaAnos > 0 ? deltaAnos.toFixed(2) : '—'} anos`,
    ' ',
    '// 1. TAXA DE CORROSÃO',
    `$$taxa = \\frac{t_{ant} - t_{atual}}{\\Delta anos} = \\frac{${e.tAnteriorMm.toFixed(2)} - ${e.tAtualMm.toFixed(2)}}{${deltaAnos > 0 ? deltaAnos.toFixed(2) : '?'}} = ${taxaMmAno != null ? taxaMmAno.toFixed(4) : '—'} \\text{ mm/ano}$$`,
    ' ',
    '// 2. SOBREMETAL DISPONÍVEL',
    `$$sobremetal = t_{atual} - t_{req} = ${e.tAtualMm.toFixed(2)} - ${e.tRequeridaMm.toFixed(2)} = ${sobremetalMm.toFixed(2)} \\text{ mm}$$`,
    ' ',
    '// 3. VIDA REMANESCENTE',
    `$$vida = \\frac{sobremetal}{taxa} = ${fmt(vidaAnos, 'anos')}$$`,
    ' ',
    '// 4. PRÓXIMA INSPEÇÃO (menor entre metade da vida e o teto NR-13)',
    `// Teto NR-13 (interna, sem SPIE): ${prazoNR13Anos != null ? `${prazoNR13Anos} ano(s)` : 'não aplicado'}`,
    `// Próxima inspeção sugerida: ${fmt(proximaInspecaoAnos, 'anos')}`,
    ...avisos.map((a) => `// AVISO: ${a}`),
  ];

  return { taxaMmAno, sobremetalMm, vidaAnos, prazoNR13Anos, proximaInspecaoAnos, avisos, log };
}
