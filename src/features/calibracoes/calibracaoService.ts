import type { DadosCalibracao } from './tipos';
import { ler, salvar, excluirChave } from '../../services/storage';

const chaveListar = (tag: string) => `nr13_calibracoes_${tag}`;
const chaveItem = (id: string) => `nr13_calibracao_item_${id}`;

export function listarCalibracoes(tag: string): DadosCalibracao[] {
  return ler<DadosCalibracao[]>(chaveListar(tag)) ?? [];
}

export async function salvarCalibracao(tag: string, dados: DadosCalibracao): Promise<void> {
  const lista = listarCalibracoes(tag);
  const idx = lista.findIndex((c) => c.id === dados.id);
  if (idx >= 0) lista[idx] = dados;
  else lista.push(dados);
  await salvar(chaveListar(tag), lista);
  await salvar(chaveItem(dados.id), dados);
}

export async function excluirCalibracao(tag: string, id: string): Promise<void> {
  const lista = listarCalibracoes(tag).filter((c) => c.id !== id);
  await salvar(chaveListar(tag), lista);
  await excluirChave(chaveItem(id));
}

/**
 * Garante a chave nr13_calibracao_item_<id> no cache local (é ela que o template
 * CERTIFICADO-CAL-* lê ao abrir por `?calibId=`). Necessário no Portal do Cliente: a
 * Edge Function portal_cliente só entrega chaves terminadas em _<TAG>, então o item
 * individual não chega — mas o objeto completo já vem dentro de nr13_calibracoes_<TAG>.
 * Grava SÓ no localStorage (não é uma escrita de dados: é hidratação de cache).
 */
export function hidratarItemLocal(cal: DadosCalibracao): void {
  try {
    localStorage.setItem(chaveItem(cal.id), JSON.stringify(cal));
  } catch {
    // cota estourada: o template cai no fallback (certificado sem dados)
  }
}

export function arquivoCalibracao(tipo: 'manometro' | 'psv'): string {
  return tipo === 'manometro' ? 'CERTIFICADO-CAL-MANOMETRO.html' : 'CERTIIFCADO-CAL-PSV.html';
}

/**
 * Snapshot dos certificados de calibração referenciados pelas folhas `?calibId=` de um
 * relatório — congelado em RelatorioMeta.certCalibracoes na geração: editar/excluir a
 * calibração depois não altera o relatório salvo (imutabilidade §7-bis).
 */
export function snapshotCalibracoesDosDocs(documentos: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const doc of documentos) {
    const m = /[?&]calibId=([^&]+)/.exec(doc);
    if (!m) continue;
    const item = ler<unknown>(chaveItem(m[1]));
    if (item) out[m[1]] = item;
  }
  return out;
}

export function calcularErro(vc: string, vi: string): string {
  const v = parseFloat(vc.replace(',', '.'));
  const i = parseFloat(vi.replace(',', '.'));
  if (isNaN(v) || isNaN(i)) return '----';
  return (v - i).toFixed(2).replace('.', ',');
}
