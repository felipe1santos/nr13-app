import { ler, salvar } from '../../services/storage';

/**
 * Componentes de calibração do equipamento (válvulas de segurança e manômetros).
 * Como os instrumentos são sempre os mesmos no equipamento, o usuário cadastra
 * UMA vez (com foto opcional) e depois calibra os mesmos componentes a cada
 * inspeção — cada rodada vira um LOTE de calibração, agrupando os certificados.
 *
 * Chaves: nr13_componentes_cal_<TAG> e nr13_lotes_cal_<TAG>.
 */
export interface ComponenteCal {
  id: string;
  tipo: 'manometro' | 'psv';
  nome: string;          // ex.: "Manômetro principal", "PSV-01"
  fabricante?: string;
  modelo?: string;
  serie?: string;
  foto?: string;         // base64 (opcional — sem foto, a UI mostra o ícone do tipo)
  criadoEm: string;
}

export interface LoteCal {
  id: string;
  criadoEm: string;      // dd/mm/aaaa
  descricao: string;     // ex.: "Calibração inspeção 07/2026"
}

const chaveComp = (tag: string) => `nr13_componentes_cal_${tag}`;
const chaveLotes = (tag: string) => `nr13_lotes_cal_${tag}`;

export function listarComponentes(tag: string): ComponenteCal[] {
  return ler<ComponenteCal[]>(chaveComp(tag)) ?? [];
}

export async function salvarComponente(tag: string, comp: ComponenteCal): Promise<void> {
  const lista = listarComponentes(tag);
  const i = lista.findIndex((c) => c.id === comp.id);
  if (i >= 0) lista[i] = comp;
  else lista.push(comp);
  await salvar(chaveComp(tag), lista);
}

export async function excluirComponente(tag: string, id: string): Promise<void> {
  await salvar(chaveComp(tag), listarComponentes(tag).filter((c) => c.id !== id));
}

export function listarLotes(tag: string): LoteCal[] {
  return ler<LoteCal[]>(chaveLotes(tag)) ?? [];
}

export async function criarLote(tag: string, descricao?: string): Promise<LoteCal> {
  const lotes = listarLotes(tag);
  const agora = new Date();
  const lote: LoteCal = {
    id: `lote-${Date.now()}`,
    criadoEm: agora.toLocaleDateString('pt-BR'),
    descricao: descricao?.trim() || `Lote de calibração — ${agora.toLocaleDateString('pt-BR')}`,
  };
  lotes.unshift(lote);
  await salvar(chaveLotes(tag), lotes);
  return lote;
}

export async function excluirLote(tag: string, id: string): Promise<void> {
  await salvar(chaveLotes(tag), listarLotes(tag).filter((l) => l.id !== id));
}
