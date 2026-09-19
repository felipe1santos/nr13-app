import { ehEmitido, ehInterna, ehTerceiro, type DadosCalibracao } from './tipos';
import { ler, salvar, excluirChave } from '../../services/storage';

const chaveListar = (tag: string) => `nr13_calibracoes_${tag}`;
const chaveItem = (id: string) => `nr13_calibracao_item_${id}`;

export function listarCalibracoes(tag: string): DadosCalibracao[] {
  return ler<DadosCalibracao[]>(chaveListar(tag)) ?? [];
}

/**
 * Certificado EMITIDO não se reescreve (fase 2, C.3). A correção é uma
 * calibração NOVA que aponta `substitui` para esta — a emitida continua
 * existindo, com os mesmos bytes, para todo relatório que a anexou.
 *
 * A única escrita permitida sobre um id já existente é a própria EMISSÃO
 * (rascunho → emitido), feita por `emissaoCertificado.ts` com
 * `{ permitirEmissao: true }`.
 */
export class CertificadoEmitidoImutavel extends Error {
  constructor(id: string) {
    super(`O certificado ${id} já foi emitido e não pode ser alterado. Para corrigir, emita uma revisão.`);
    this.name = 'CertificadoEmitidoImutavel';
  }
}

export async function salvarCalibracao(
  tag: string,
  dados: DadosCalibracao,
  opcoes: { permitirEmissao?: boolean } = {},
): Promise<void> {
  const lista = listarCalibracoes(tag);
  const idx = lista.findIndex((c) => c.id === dados.id);
  const anterior = idx >= 0 ? lista[idx] : (ler<DadosCalibracao>(chaveItem(dados.id)) ?? null);
  if (anterior && ehEmitido(anterior)) throw new CertificadoEmitidoImutavel(dados.id);
  if (anterior && !opcoes.permitirEmissao && ehEmitido(dados)) throw new CertificadoEmitidoImutavel(dados.id);
  if (idx >= 0) lista[idx] = dados;
  else lista.push(dados);
  await salvar(chaveListar(tag), lista);
  await salvar(chaveItem(dados.id), dados);
}

export async function excluirCalibracao(tag: string, id: string): Promise<void> {
  const alvo = listarCalibracoes(tag).find((c) => c.id === id) ?? ler<DadosCalibracao>(chaveItem(id));
  if (alvo && ehEmitido(alvo)) throw new CertificadoEmitidoImutavel(id);
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

/**
 * A folha NOSSA daquela calibração — ou `null` quando ela não tem (e não pode
 * ter) uma: calibração de TERCEIRO nunca vira certificado interno, e
 * instrumento sem modelo interno (termômetro, pressostato…) também não.
 */
export function arquivoCalibracao(cal: Pick<DadosCalibracao, 'tipo' | 'origem'>): string | null {
  if (ehTerceiro(cal)) return null;
  if (cal.tipo === 'manometro') return 'CERTIFICADO-CAL-MANOMETRO.html';
  if (cal.tipo === 'psv') return 'CERTIIFCADO-CAL-PSV.html';
  return null;
}

/**
 * O documento que ENTRA NO RELATÓRIO por esta calibração, ou `null`.
 *
 * - terceiro → nunca (o relatório cita o laboratório no quadro 7.1.1);
 * - rascunho → não: anexar a um relatório seria emiti-lo sem a emissão;
 * - emitido → a folha, que o gerador troca pelos BYTES arquivados;
 * - legado (sem status) → a folha, como sempre entrou.
 */
export function folhaDoRelatorio(cal: DadosCalibracao): string | null {
  if (!ehInterna(cal)) return null;
  if (cal.status === 'rascunho') return null;
  const arq = arquivoCalibracao(cal);
  return arq ? `${arq}?calibId=${cal.id}` : null;
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

/**
 * O rótulo de um lote na criação do relatório: diz o que ENTRA como folha e o
 * que não entra, e por quê — rascunho precisa ser emitido; terceiro é citado no
 * quadro de instrumentos, nunca vira folha nossa.
 */
export function contagemParaRelatorio(certs: DadosCalibracao[]): string {
  const folhas = certs.filter((c) => folhaDoRelatorio(c) !== null);
  const man = folhas.filter((c) => c.tipo === 'manometro').length;
  const psv = folhas.filter((c) => c.tipo === 'psv').length;
  const rascunhos = certs.filter((c) => ehInterna(c) && c.status === 'rascunho').length;
  const terceiros = certs.filter((c) => ehTerceiro(c)).length;
  const partes: string[] = [];
  if (man) partes.push(`${man} manômetro${man > 1 ? 's' : ''}`);
  if (psv) partes.push(`${psv} válvula${psv > 1 ? 's' : ''}`);
  if (terceiros) partes.push(`${terceiros} de laboratório externo, citada${terceiros > 1 ? 's' : ''} no quadro`);
  if (rascunhos) partes.push(`${rascunhos} rascunho${rascunhos > 1 ? 's' : ''} — emita para anexar`);
  return partes.join(', ');
}
