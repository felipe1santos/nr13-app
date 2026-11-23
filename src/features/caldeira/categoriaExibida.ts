/**
 * A CATEGORIA QUE A TELA MOSTRA, por TAG (23/11/2026).
 *
 * Vaso e autoclave: `nr13_cat_<TAG>.catFinal` (I–V), como sempre.
 * Caldeira: A/B DERIVADA da pressão escolhida na ficha (`pressaoClassificacao`:
 * PMO adotada, a norma; ou PMTA adotada ?? calculada) e do
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

export function categoriaExibida(
  tag: string,
  info?: Pick<InfoEquipamento, 'tipo' | 'pmoAdotadaMpa' | 'pmtaAdotadaMpa' | 'pressaoClassificacao'> | null,
): string | null {
  const i = info ?? ler<InfoEquipamento>(`nr13_info_${tag}`);
  if (i?.tipo === 'caldeira') {
    const calc = ler<{ pmta?: string }>(`nr13_calc_${tag}`);
    const { classificacao } = classificacaoDaFicha(carregarDadosCaldeira(tag), i, calc?.pmta);
    if (classificacao.categoria) return classificacao.categoria;
    if (classificacao.naoCategorizado) return 'Não categorizado';
    return null;
  }
  return ler<{ catFinal?: string }>(`nr13_cat_${tag}`)?.catFinal ?? null;
}
