/**
 * A CATEGORIA QUE A TELA MOSTRA, por TAG (23/11/2026).
 *
 * Vaso e autoclave: `nr13_cat_<TAG>.catFinal` (I–V), como sempre.
 * Caldeira: A/B DERIVADA da PMO adotada (`nr13_info_<TAG>.pmoAdotadaMpa`) e do
 * volume da ficha da caldeira — `classificacaoCaldeira.ts`. A `nr13_cat_` de uma
 * caldeira guarda o método de VASO e nunca é mostrada para ela.
 *
 * Sem a ficha da caldeira (ex.: Portal, que não recebe essa chave) a categoria
 * sai só pela pressão — que é o que a norma usa (13.4.1.1); o volume só decide o
 * "fora da NR-13" (13.2.2 k).
 */
import { ler } from '../../services/storage';
import type { InfoEquipamento } from '../equipamento/tipos';
import { classificacaoDaFicha } from './classificacaoCaldeira';
import { carregarDadosCaldeira } from './dadosCaldeira';

export function categoriaExibida(tag: string, info?: Pick<InfoEquipamento, 'tipo' | 'pmoAdotadaMpa'> | null): string | null {
  const i = info ?? ler<InfoEquipamento>(`nr13_info_${tag}`);
  if (i?.tipo === 'caldeira') {
    const { classificacao } = classificacaoDaFicha(carregarDadosCaldeira(tag), i.pmoAdotadaMpa);
    if (classificacao.categoria) return classificacao.categoria;
    if (classificacao.situacao === 'fora-pressao' || classificacao.situacao === 'fora-volume') return 'Fora da NR-13';
    return null;
  }
  return ler<{ catFinal?: string }>(`nr13_cat_${tag}`)?.catFinal ?? null;
}
