// Auto-preenchimento dos formulários de inspeção a partir do que já está cadastrado no sistema
// (ficha do equipamento, memorial, cliente, rastreabilidade dos padrões). O usuário em campo não
// redigita o que o escritório já cadastrou.
//
// REGRAS:
//  - Funções PURAS e DEFENSIVAS: chave ausente/corrompida => campo omitido, NUNCA lança.
//  - Nunca devolvem `undefined` num campo tipado como string — a chave simplesmente não vem.
//  - O valor digitado pelo usuário SEMPRE vence (ver `mesclarPreenchimento`).
import { ler } from '../../../services/storage';
import type { CategoriaSalva, EmpresaEquipamento, InfoEquipamento } from '../../equipamento/tipos';
import type { ComponenteResumo } from '../../memorial/tiposMemorial';
import type { VasoSalvo } from '../../memorial/vasoMemorialService';
import { listarRastreabilidades, type Rastreabilidade } from '../../relatorios/rastreabilidadeService';

const MPA_PARA_KGFCM2 = 10.19716;

/** Lê uma chave sem nunca lançar (localStorage corrompido / JSON inválido). */
function lerSeguro<T>(chave: string): T | null {
  try {
    return ler<T>(chave) ?? null;
  } catch {
    return null;
  }
}

/** Texto utilizável? (não nulo, não vazio depois de trim) */
function texto(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  return t ? t : null;
}

/** Grava a chave só quando há valor — mantém o objeto parcial sem `undefined`. */
function por<T extends object>(alvo: T, chave: keyof T, valor: string | null): void {
  if (valor !== null) (alvo as Record<string, unknown>)[chave as string] = valor;
}

/** MPa (string ou número) => kgf/cm² com 2 casas. */
function mpaParaKgf(valor: unknown): string | null {
  const bruto = texto(valor);
  if (bruto === null) return null;
  const n = Number(bruto.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return (n * MPA_PARA_KGFCM2).toFixed(2);
}

function lerInfo(tag: string): InfoEquipamento | null {
  return lerSeguro<InfoEquipamento>(`nr13_info_${tag}`);
}

/** Descrição do equipamento para os campos "Equipamento"/"Tipo de Equipamento". */
function descricaoEquipamento(info: InfoEquipamento | null): string | null {
  if (!info) return null;
  return texto(info.descricao) ?? texto(info.tipo);
}

// ── Memorial: componente do casco ────────────────────────────────────────────
// 1ª fonte: nr13_calc_<TAG>.componentes[] (ComponenteResumo — já traz material/tNom prontos).
// 2ª fonte: nr13_vaso_<TAG>.componentes[] (dados crus do memorial: dados.mat / dados.t_comercial).
interface CalculoComComponentes {
  pmta?: string;
  pth?: string;
  componentes?: ComponenteResumo[];
}

function ehCasco(nome: unknown): boolean {
  return typeof nome === 'string' && /casco|costado|corpo|cilindr/i.test(nome);
}

/** { material, espNomCasco } do casco do memorial — cada campo pode faltar. */
function dadosCasco(tag: string): { material?: string; espNomCasco?: string } {
  const saida: { material?: string; espNomCasco?: string } = {};

  const calc = lerSeguro<CalculoComComponentes>(`nr13_calc_${tag}`);
  const comps = Array.isArray(calc?.componentes) ? calc.componentes : [];
  const doCalc = comps.find((c) => ehCasco(c?.nome)) ?? comps[0];
  if (doCalc) {
    por(saida, 'material', texto(doCalc.material));
    por(saida, 'espNomCasco', texto(doCalc.tNom));
  }
  if (saida.material && saida.espNomCasco) return saida;

  const vaso = lerSeguro<VasoSalvo>(`nr13_vaso_${tag}`) ?? lerSeguro<VasoSalvo>(`nr13_vaso_ac_corpo_${tag}`);
  const doVaso = Array.isArray(vaso?.componentes)
    ? (vaso.componentes.find((c) => c?.tipo === 'cilindrico' || ehCasco(c?.nome)) ?? vaso.componentes[0])
    : undefined;
  if (doVaso?.dados) {
    if (!saida.material) por(saida, 'material', texto(doVaso.dados.mat));
    if (!saida.espNomCasco) por(saida, 'espNomCasco', texto(doVaso.dados.t_comercial));
  }
  return saida;
}

// ── Rastreabilidade ──────────────────────────────────────────────────────────
function todasRastreabilidades(): Rastreabilidade[] {
  try {
    const lista = listarRastreabilidades();
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/** Padrão de ultrassom: prefere o que tem validade preenchida; senão o 1º de ultrassom. */
function rastreabilidadeUltrassom(): Rastreabilidade | null {
  const us = todasRastreabilidades().filter((r) => r?.tipoInstrumento === 'ultrassom');
  return us.find((r) => texto(r.validade) !== null) ?? us[0] ?? null;
}

/** Padrão citado no relatório: prefere o marcado `injetarNoRelatorio`; senão o 1º cadastrado. */
function rastreabilidadeDoRelatorio(): Rastreabilidade | null {
  const todas = todasRastreabilidades();
  return todas.find((r) => r?.injetarNoRelatorio) ?? todas[0] ?? null;
}

/** "<a> — <b>" / só o que existir / null. */
function juntar(a: string | null, b: string | null, prefixoB: string): string | null {
  if (a && b) return `${a} — ${prefixoB}${b}`;
  if (a) return a;
  if (b) return `${prefixoB}${b}`;
  return null;
}

// ── Prefills ─────────────────────────────────────────────────────────────────

export interface PrefillUltrassom {
  equipamento?: string;
  area?: string;
  espNomCasco?: string;
  ano?: string;
  material?: string;
  aparelho?: string;
  acoplante?: string;
  tempSup?: string;
  estadoSup?: string;
  cabecote?: string;
  velSonica?: string;
}

/** Ultrassom/ME: ficha (nr13_info_) + memorial (nr13_calc_/nr13_vaso_) + padrão de ultrassom. */
export function prefillUltrassom(tag: string): PrefillUltrassom {
  const saida: PrefillUltrassom = {};
  if (!tag) return saida;

  const info = lerInfo(tag);
  por(saida, 'equipamento', descricaoEquipamento(info));
  por(saida, 'ano', texto(info?.ano));
  por(saida, 'area', texto(info?.localizacao));

  const casco = dadosCasco(tag);
  por(saida, 'material', casco.material ?? null);
  por(saida, 'espNomCasco', casco.espNomCasco ?? null);

  const r = rastreabilidadeUltrassom();
  if (r) {
    por(saida, 'aparelho', juntar(texto(r.aparelho), texto(r.numeroSerie), 'Nº '));
    por(saida, 'acoplante', texto(r.acoplante));
    por(saida, 'cabecote', texto(r.cabecote));
    por(saida, 'velSonica', texto(r.velocidadeSonica));
    por(saida, 'estadoSup', texto(r.estadoSuperficie));
    por(saida, 'tempSup', texto(r.tempSuperficie));
  }
  return saida;
}

export interface PrefillVisual {
  contratante?: string;
  endereco?: string;
  rastreabilidade?: string;
  serie?: string;
  tipoEquipamento?: string;
  fabricante?: string;
}

/** Endereço legível do cliente: logradouro, bairro, cidade/UF. */
function enderecoCliente(emp: EmpresaEquipamento | null): string | null {
  if (!emp) return null;
  const cidade = texto(emp.cidade) ?? texto(emp.localidade);
  const cidadeUf = cidade && texto(emp.estado) ? `${cidade}/${texto(emp.estado)}` : cidade;
  const partes = [texto(emp.endereco), texto(emp.bairro), cidadeUf].filter((p): p is string => p !== null);
  return partes.length ? partes.join(', ') : null;
}

/** Visual externo/interno: cliente (nr13_emp_) + ficha (nr13_info_) + padrão do relatório. */
export function prefillVisual(tag: string): PrefillVisual {
  const saida: PrefillVisual = {};
  if (!tag) return saida;

  const emp = lerSeguro<EmpresaEquipamento>(`nr13_emp_${tag}`);
  por(saida, 'contratante', texto(emp?.razaoSocial) ?? texto(emp?.nomeFantasia));
  por(saida, 'endereco', enderecoCliente(emp));

  const info = lerInfo(tag);
  por(saida, 'serie', texto(info?.numeroSerie));
  por(saida, 'tipoEquipamento', descricaoEquipamento(info));
  por(saida, 'fabricante', texto(info?.fabricante));

  const r = rastreabilidadeDoRelatorio();
  if (r) por(saida, 'rastreabilidade', juntar(texto(r.nome), texto(r.certificadoPadrao), 'Cert. '));

  return saida;
}

export interface PrefillTH {
  cliente?: string;
  equipamento?: string;
  pressaoProj?: string;
  pressaoTeste?: string;
  fluido?: string;
}

/** Teste hidrostático: cliente + ficha; PMTA/PTH em kgf/cm² (adotadas vencem as calculadas). */
export function prefillTH(tag: string): PrefillTH {
  const saida: PrefillTH = {};
  if (!tag) return saida;

  const emp = lerSeguro<EmpresaEquipamento>(`nr13_emp_${tag}`);
  por(saida, 'cliente', texto(emp?.razaoSocial) ?? texto(emp?.nomeFantasia));

  const info = lerInfo(tag);
  por(saida, 'equipamento', descricaoEquipamento(info));

  // Pressões adotadas na ficha têm prioridade sobre as calculadas no memorial (ambas em MPa).
  const calc = lerSeguro<CalculoComComponentes>(`nr13_calc_${tag}`);
  por(saida, 'pressaoProj', mpaParaKgf(info?.pmtaAdotadaMpa) ?? mpaParaKgf(calc?.pmta));
  por(saida, 'pressaoTeste', mpaParaKgf(info?.pthAdotadaMpa) ?? mpaParaKgf(calc?.pth));

  const cat = lerSeguro<CategoriaSalva>(`nr13_cat_${tag}`);
  por(saida, 'fluido', texto(cat?.fluidoInput));

  return saida;
}

// ── Mesclagem ────────────────────────────────────────────────────────────────

/**
 * Ordem de precedência por campo: valor salvo (se string NÃO vazia) > prefill > padrão.
 *
 * Só campos string de 1º nível entram nessa disputa. Arrays/objetos (`medidas`, `itens`,
 * `itemObs`, `fotos`, `curva`) vêm do salvo quando presentes — o prefill não os toca.
 * Assim, um blob salvo cheio de strings vazias (usuário abriu e não preencheu) não apaga
 * o auto-preenchimento, mas qualquer coisa que ele digitou é preservada.
 */
export function mesclarPreenchimento<T extends object>(
  base: T,
  prefill: Partial<T>,
  salvo: Partial<T> | null | undefined,
): T {
  const resultado: Record<string, unknown> = { ...base, ...prefill };
  if (!salvo) return resultado as T;

  for (const [chave, valor] of Object.entries(salvo)) {
    if (valor === undefined) continue;
    if (typeof valor === 'string') {
      // String vazia do salvo NÃO derruba o prefill; qualquer texto digitado derruba.
      if (valor.trim() !== '') resultado[chave] = valor;
      else if (!(chave in prefill)) resultado[chave] = valor;
      continue;
    }
    resultado[chave] = valor; // arrays/objetos/números/booleans: o salvo manda
  }
  return resultado as T;
}
