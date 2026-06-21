import { ler, lerTudo, listarChavesComPrefixo, salvar } from '../../services/storage';
import type {
  CalculoSalvo,
  CategoriaSalva,
  EquipamentoResumo,
  FotoEquipamento,
  InfoEquipamento,
  TipoEquipamento,
} from './tipos';

const PREFIXO_INFO = 'nr13_info_';

export async function listarEquipamentos(): Promise<EquipamentoResumo[]> {
  await lerTudo();
  const chaves = listarChavesComPrefixo(PREFIXO_INFO);

  return chaves
    .map((chave) => chave.slice(PREFIXO_INFO.length))
    .map((tag) => montarResumo(tag))
    .filter((r): r is EquipamentoResumo => r !== null);
}

function montarResumo(tag: string): EquipamentoResumo | null {
  const info = ler<InfoEquipamento>(`nr13_info_${tag}`);
  if (!info) return null;

  const categoria = ler<CategoriaSalva>(`nr13_cat_${tag}`);
  const calculo = ler<CalculoSalvo>(`nr13_calc_${tag}`);
  const fotos = ler<FotoEquipamento[]>(`nr13_fotos_${tag}`) || [];
  const unidade = ler<string>(`nr13_pref_unidade_${tag}`) || 'SI';

  const capa = fotos.find((f) => f.isCapa) || fotos[0] || null;

  return {
    tag,
    info,
    categoria,
    calculo,
    fotoCapa: capa ? capa.src : null,
    unidade: unidade as EquipamentoResumo['unidade'],
  };
}

export async function tagJaExiste(tag: string): Promise<boolean> {
  await lerTudo();
  return ler<InfoEquipamento>(`nr13_info_${tag}`) !== null;
}

export function carregarInfo(tag: string): InfoEquipamento | null {
  return ler<InfoEquipamento>(`nr13_info_${tag}`);
}

export async function salvarInfo(info: InfoEquipamento): Promise<void> {
  await salvar(`nr13_info_${info.tag}`, info);
}

export function carregarUnidade(tag: string): import('../../calc/unidades').SistemaUnidade {
  return (ler<string>(`nr13_pref_unidade_${tag}`) as import('../../calc/unidades').SistemaUnidade) || 'SI';
}

export async function salvarUnidade(tag: string, unidade: string): Promise<void> {
  await salvar(`nr13_pref_unidade_${tag}`, unidade);
}

export async function criarEquipamento(
  tag: string,
  tipo: TipoEquipamento,
  subtipo: InfoEquipamento['subtipo'] = '',
): Promise<void> {
  const info: InfoEquipamento = {
    tag,
    tipo,
    // mantém o subtipo escolhido para autoclave E caldeira; vaso não tem subtipo.
    subtipo: tipo === 'autoclave' || tipo === 'caldeira' ? subtipo : '',
  };
  await salvar(`nr13_info_${tag}`, info);
}
