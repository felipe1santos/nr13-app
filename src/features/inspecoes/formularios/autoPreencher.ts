// Auto-preenchimento dos formulários de inspeção a partir do que já está cadastrado no sistema
// (ficha do equipamento, memorial, cliente, rastreabilidade dos padrões). O usuário em campo não
// redigita o que o escritório já cadastrou.
//
// REGRAS:
//  - Funções PURAS e DEFENSIVAS: chave ausente/corrompida => campo omitido, NUNCA lança.
//  - Nunca devolvem `undefined` num campo tipado como string — a chave simplesmente não vem.
//  - O valor digitado pelo usuário SEMPRE vence (ver `mesclarPreenchimento`).
import { ler } from '../../../services/storage';
import type { EmpresaEquipamento, InfoEquipamento } from '../../equipamento/tipos';
import type { ComponenteResumo } from '../../memorial/tiposMemorial';
import type { VasoSalvo } from '../../memorial/vasoMemorialService';
import { aplicaAoEquipamento, listarRastreabilidades, type Rastreabilidade } from '../../relatorios/rastreabilidadeService';
import { pressaoDeProjetoMpa } from '../../memorial/pressaoProjeto';
import { valorNaUnidade, type SistemaUnidade } from '../../../calc/unidades';

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

/**
 * MPa (string ou número) => texto na unidade pedida, pelo helper OFICIAL.
 *
 * Até 18/09/2026 esta função se chamava `mpaParaKgf` e tinha a sua própria
 * constante 10,19716: o teste hidrostático saía em kgf/cm² fosse qual fosse a
 * unidade escolhida na criação do equipamento.
 */
function mpaNaUnidade(valor: unknown, unidade: SistemaUnidade): string | null {
  const bruto = texto(valor);
  if (bruto === null) return null;
  const n = Number(bruto.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return valorNaUnidade(n, unidade);
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

/** Padrões válidos para a TAG: vinculado a outra TAG sai; vinculado a ESTA TAG vem antes do global. */
function rastreabilidadesDaTag(tag: string): Rastreabilidade[] {
  // Versões soft-substituídas ficam de fora do prefill — só valem para relatórios salvos.
  const validas = todasRastreabilidades().filter((r) => !r.substituidoEm && aplicaAoEquipamento(r, tag));
  return [...validas.filter((r) => r.tags?.length), ...validas.filter((r) => !r.tags?.length)];
}

/** Padrão de ultrassom: prefere o que tem validade preenchida; senão o 1º de ultrassom. */
function rastreabilidadeUltrassom(tag: string): Rastreabilidade | null {
  const us = rastreabilidadesDaTag(tag).filter((r) => r?.tipoInstrumento === 'ultrassom');
  return us.find((r) => texto(r.validade) !== null) ?? us[0] ?? null;
}

/** Padrão citado no relatório: prefere o marcado `injetarNoRelatorio`; senão o 1º cadastrado. */
function rastreabilidadeDoRelatorio(tag: string): Rastreabilidade | null {
  const todas = rastreabilidadesDaTag(tag);
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

  const r = rastreabilidadeUltrassom(tag);
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

  const r = rastreabilidadeDoRelatorio(tag);
  if (r) por(saida, 'rastreabilidade', juntar(texto(r.nome), texto(r.certificadoPadrao), 'Cert. '));

  return saida;
}

export interface PrefillTH {
  cliente?: string;
  equipamento?: string;
  /**
   * PRESSÃO DE PROJETO — o `P` do MEMORIAL (`pressaoDeProjetoMpa`). Nunca a
   * PMTA: até 18/09/2026 este campo era pré-preenchido com a PMTA, e o laudo
   * imprimia um número com o nome de outro. Sem memorial, fica vazio.
   */
  pressaoProj?: string;
  /**
   * Pressão de TRABALHO. Não é campo novo em lugar nenhum: é a PMO que o
   * usuário já declarou no card "Pressões da Documentação" da ficha. Criar uma
   * fonte própria para ela seria pedir o mesmo número duas vezes.
   */
  pressaoTrabalho?: string;
  /** Sugestão: a PTH adotada ?? calculada. O técnico corrige para a que aplicou. */
  pressaoTeste?: string;
  // SEM `fluido`, de propósito. O fluido do TESTE é o que encheu o vaso no
  // ensaio; `nr13_cat_.fluidoInput` é o fluido de OPERAÇÃO com a classe de
  // risco ("A - Hidrogênio"). Pré-preencher um com o outro punha no laudo o
  // fluido errado. O técnico informa.
}

/**
 * Teste hidrostático: cliente + ficha + memorial, com as pressões NA UNIDADE
 * pedida — a do equipamento num teste novo, a do próprio registro num antigo.
 */
export function prefillTH(tag: string, unidade: SistemaUnidade): PrefillTH {
  const saida: PrefillTH = {};
  if (!tag) return saida;

  const emp = lerSeguro<EmpresaEquipamento>(`nr13_emp_${tag}`);
  por(saida, 'cliente', texto(emp?.razaoSocial) ?? texto(emp?.nomeFantasia));

  const info = lerInfo(tag);
  por(saida, 'equipamento', descricaoEquipamento(info));

  // Cada grandeza da SUA fonte (ver `memorial/pressaoProjeto.ts`). Adotada
  // vence calculada onde as duas existem; a de projeto só existe no memorial.
  const calc = lerSeguro<CalculoComComponentes>(`nr13_calc_${tag}`);
  por(saida, 'pressaoProj', valorNaUnidade(pressaoDeProjetoMpa(tag), unidade));
  por(saida, 'pressaoTrabalho', mpaNaUnidade(info?.pmoAdotadaMpa, unidade));
  por(saida, 'pressaoTeste', mpaNaUnidade(info?.pthAdotadaMpa, unidade) ?? mpaNaUnidade(calc?.pth, unidade));

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
