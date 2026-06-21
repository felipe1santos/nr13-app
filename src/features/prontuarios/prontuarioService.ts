import type { ProntuarioDados } from './tipos';

const CHAVE_ATUAL = 'nr13_prontuario_atual';
const chave = (tag: string) => `nr13_prontuario_${tag}`;

export function salvarProntuario(tag: string, dados: ProntuarioDados): void {
  localStorage.setItem(chave(tag), JSON.stringify(dados));
}

export function carregarProntuario(tag: string): ProntuarioDados | null {
  const raw = localStorage.getItem(chave(tag));
  if (!raw) return null;
  try { return JSON.parse(raw) as ProntuarioDados; } catch { return null; }
}

export function excluirProntuario(tag: string): void {
  localStorage.removeItem(chave(tag));
}

export function gravarProntuarioAtual(dados: ProntuarioDados): void {
  localStorage.setItem(CHAVE_ATUAL, JSON.stringify(dados));
}
