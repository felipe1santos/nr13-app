import type { ProntuarioDados } from './tipos';
import { ler, salvar, excluirChave } from '../../services/storage';

const CHAVE_ATUAL = 'nr13_prontuario_atual';
const chave = (tag: string) => `nr13_prontuario_${tag}`;
const chaveMeta = (tag: string) => `nr13_prontuario_meta_${tag}`;
const chaveCroqui3d = (tag: string) => `nr13_croqui3d_${tag}`;

export interface MetaProntuario {
  numero: string;
  emissao: string;
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

export async function gravarCroqui3d(tag: string, b64: string): Promise<void> {
  await salvar(chaveCroqui3d(tag), b64);
}

export async function gravarProntuarioAtual(dados: ProntuarioDados): Promise<void> {
  await salvar(CHAVE_ATUAL, dados);
}
