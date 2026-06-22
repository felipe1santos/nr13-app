import type { ProntuarioDados } from './tipos';
import { ler, salvar, excluirChave } from '../../services/storage';

const CHAVE_ATUAL = 'nr13_prontuario_atual';
const chave = (tag: string) => `nr13_prontuario_${tag}`;

export async function salvarProntuario(tag: string, dados: ProntuarioDados): Promise<void> {
  await salvar(chave(tag), dados);
}

export function carregarProntuario(tag: string): ProntuarioDados | null {
  return ler<ProntuarioDados>(chave(tag));
}

export async function excluirProntuario(tag: string): Promise<void> {
  await excluirChave(chave(tag));
}

export async function gravarProntuarioAtual(dados: ProntuarioDados): Promise<void> {
  await salvar(CHAVE_ATUAL, dados);
}
