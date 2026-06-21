import type { DadosCalibracao } from './tipos';

const chaveListar = (tag: string) => `nr13_calibracoes_${tag}`;
const chaveItem = (id: string) => `nr13_calibracao_item_${id}`;

export function listarCalibracoes(tag: string): DadosCalibracao[] {
  try {
    return JSON.parse(localStorage.getItem(chaveListar(tag)) || '[]') as DadosCalibracao[];
  } catch { return []; }
}

export function salvarCalibracao(tag: string, dados: DadosCalibracao): void {
  const lista = listarCalibracoes(tag);
  const idx = lista.findIndex((c) => c.id === dados.id);
  if (idx >= 0) lista[idx] = dados;
  else lista.push(dados);
  localStorage.setItem(chaveListar(tag), JSON.stringify(lista));
  localStorage.setItem(chaveItem(dados.id), JSON.stringify(dados));
}

export function excluirCalibracao(tag: string, id: string): void {
  const lista = listarCalibracoes(tag).filter((c) => c.id !== id);
  localStorage.setItem(chaveListar(tag), JSON.stringify(lista));
  localStorage.removeItem(chaveItem(id));
}

export function arquivoCalibracao(tipo: 'manometro' | 'psv'): string {
  return tipo === 'manometro' ? 'CERTIFICADO-CAL-MANOMETRO.html' : 'CERTIIFCADO-CAL-PSV.html';
}

export function calcularErro(vc: string, vi: string): string {
  const v = parseFloat(vc.replace(',', '.'));
  const i = parseFloat(vi.replace(',', '.'));
  if (isNaN(v) || isNaN(i)) return '----';
  return (v - i).toFixed(2).replace('.', ',');
}
