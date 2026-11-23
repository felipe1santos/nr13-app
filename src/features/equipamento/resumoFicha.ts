import { formatarValor, type SistemaUnidade } from '../../calc/unidades';
import type { CategoriaSalva, InfoEquipamento } from './tipos';

/**
 * O RESUMO RÁPIDO DO TOPO DA FICHA (Fase 4, 24/09/2026).
 *
 * É uma REPETIÇÃO VISUAL: cada linha lê a MESMA chave e aplica a MESMA
 * formatação da seção que a mostra por extenso. Nada é calculado, nada é
 * gravado, não há fonte nova.
 *
 * | linha | fonte | seção de origem |
 * |---|---|---|
 * | Categoria NR-13 | `nr13_cat_<TAG>.catFinal` | Categoria NR-13 |
 * | PMTA adotada | `nr13_info_<TAG>.pmtaAdotadaMpa` | Pressões da Documentação |
 * | Vida remanescente | `nr13_vida_<TAG>.vidaAnos` | Vida Remanescente |
 * | Fabricante | `nr13_info_<TAG>.fabricante` | Dados do Equipamento |
 * | Volume | `nr13_cat_<TAG>.volInput` | Categoria NR-13 |
 *
 * ## PMTA: a ADOTADA, sem cair na calculada
 *
 * O resumo é o mesmo papel do cartão de `/equipamentos`, e a regra do §3-bis
 * vale aqui: sem adoção, "—". Antes desta fase o topo mostrava a CALCULADA com
 * o rótulo "PMTA", que é exatamente a confusão que o §3-bis corrigiu no cartão
 * — e o Memorial, logo abaixo, já mostra a calculada com o rótulo certo.
 */
export interface ItemResumo {
  chave: 'categoria' | 'pmta' | 'vida' | 'fabricante' | 'volume';
  rotulo: string;
  valor: string;
}

/** O pedaço de `nr13_vida_<TAG>` que o resumo lê. */
export interface VidaResumo {
  vidaAnos: number | null;
}

export function resumoDaFicha({
  info,
  categoria,
  vida,
  unidade,
  caldeira,
}: {
  info: Pick<InfoEquipamento, 'fabricante' | 'pmtaAdotadaMpa'>;
  categoria: Pick<CategoriaSalva, 'catFinal' | 'volInput'> | null;
  vida: VidaResumo | null;
  unidade: SistemaUnidade;
  /**
   * CALDEIRA (23/11/2026): categoria A/B e volume vêm da classificação da
   * caldeira (`classificacaoCaldeira.ts`), nunca da `nr13_cat_` — que guarda o
   * método de VASO (I–V) e não vale para caldeira.
   */
  caldeira?: { categoria: string; volumeM3: number | null };
}): ItemResumo[] {
  const pmta = parseFloat(String(info.pmtaAdotadaMpa ?? '').replace(',', '.'));
  return [
    {
      chave: 'categoria',
      rotulo: 'Categoria NR-13',
      valor: caldeira ? caldeira.categoria : categoria?.catFinal ?? '—',
    },
    {
      chave: 'pmta',
      rotulo: 'PMTA ADOTADA',
      valor: Number.isFinite(pmta) ? formatarValor(pmta, unidade) : '—',
    },
    {
      chave: 'vida',
      rotulo: 'Vida remanescente',
      // Mesmo texto da seção Vida Remanescente: salvo sem vida = "indeterminada".
      valor: !vida ? '—' : vida.vidaAnos == null ? 'indeterminada' : `${vida.vidaAnos.toFixed(2)} anos`,
    },
    { chave: 'fabricante', rotulo: 'Fabricante', valor: info.fabricante?.trim() || '—' },
    {
      chave: 'volume',
      rotulo: 'Volume',
      valor: caldeira
        ? caldeira.volumeM3 === null
          ? '—'
          : `${caldeira.volumeM3.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} m³`
        : categoria
          ? `${categoria.volInput} m³`
          : '—',
    },
  ];
}
