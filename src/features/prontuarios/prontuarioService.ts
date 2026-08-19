import type { ProntuarioDados } from './tipos';
import { ler, salvar, excluirChave } from '../../services/storage';

export const CHAVE_PRONTUARIO_ATUAL = 'nr13_prontuario_atual';
const CHAVE_ATUAL = CHAVE_PRONTUARIO_ATUAL;
const chave = (tag: string) => `nr13_prontuario_${tag}`;
const chaveMeta = (tag: string) => `nr13_prontuario_meta_${tag}`;
// Assinantes escolhidos para o prontuário da TAG (motor de assinatura)
const chaveAssinantes = (tag: string) => `nr13_assinantes_pront_${tag}`;
// Chave legada do croqui 3D (PNG) — não é mais gravada; mantida só para limpeza em excluirProntuario.
const chaveCroqui3d = (tag: string) => `nr13_croqui3d_${tag}`;

export interface MetaProntuario {
  numero: string;
  emissao: string;
}

// Assinantes (engenheiro + técnico) escolhidos no visualizador do prontuário. ids referem-se a
// Funcionario.id de nr13_lista_phs; null = "sem assinatura" para aquele papel.
export interface AssinantesProntuario {
  engenheiroId: string | null;
  tecnicoId: string | null;
}

export function obterAssinantes(tag: string): AssinantesProntuario {
  const salvo = ler<Partial<AssinantesProntuario>>(chaveAssinantes(tag));
  return {
    engenheiroId: salvo?.engenheiroId ?? null,
    tecnicoId: salvo?.tecnicoId ?? null,
  };
}

export function gravarAssinantes(tag: string, a: AssinantesProntuario): void {
  // salvar() grava o localStorage de forma síncrona antes de persistir remoto — os iframes
  // remontados logo em seguida já leem o valor novo.
  void salvar(chaveAssinantes(tag), a);
}

export async function salvarProntuario(tag: string, dados: ProntuarioDados): Promise<void> {
  await salvar(chave(tag), dados);
}

export function carregarProntuario(tag: string): ProntuarioDados | null {
  return ler<ProntuarioDados>(chave(tag));
}

export async function excluirProntuario(tag: string): Promise<void> {
  await excluirChave(chave(tag));
  await excluirChave(chaveMeta(tag));
  await excluirChave(chaveAssinantes(tag));
  await excluirChave(chaveCroqui3d(tag));
}

export async function obterOuCriarMeta(tag: string): Promise<MetaProntuario> {
  const existente = ler<MetaProntuario>(chaveMeta(tag));
  if (existente?.numero) return existente;
  const meta: MetaProntuario = {
    numero: `REL-${Date.now()}`,
    emissao: new Date().toLocaleDateString('pt-BR'),
  };
  await salvar(chaveMeta(tag), meta);
  return meta;
}

export async function gravarProntuarioAtual(dados: ProntuarioDados): Promise<void> {
  await salvar(CHAVE_ATUAL, dados);
}

/**
 * Materializa o prontuário para os TEMPLATES, sem escrita sincronizada.
 *
 * `nr13_prontuario_atual` não é dado do usuário: é insumo de renderização que
 * as folhas em iframe leem no `DOMContentLoaded`. Passá-la por `salvar()`
 * enfileira uma mutação para o servidor — e o papel `cliente` é somente
 * leitura, então o gate recusa e a exceção derruba a abertura do documento.
 * Era esse o defeito medido em 19/08/2026: no Portal, o botão "Visualizar" do
 * prontuário não abria nada, para qualquer equipamento.
 *
 * No Portal os templates leem do `localStorage` semeado pela Edge
 * (`portalService`), então é exatamente lá que a chave precisa estar.
 *
 * Não lança: falha de cota vira documento incompleto, que é ruim — mas melhor
 * que exceção crua na cara do cliente com o documento não abrindo.
 */
export function materializarProntuarioAtual(dados: ProntuarioDados): void {
  try {
    localStorage.setItem(CHAVE_PRONTUARIO_ATUAL, JSON.stringify(dados));
  } catch {
    console.error('[portal] prontuário não coube no armazenamento do navegador.');
  }
}
