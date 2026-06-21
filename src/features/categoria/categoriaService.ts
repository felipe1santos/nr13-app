import { ler, salvar } from '../../services/storage';
import { calcularCategoriaNR13 } from '../../calc/categoria';
import { paraMpa, type SistemaUnidade } from '../../calc/unidades';
import type { CategoriaSalva } from '../equipamento/tipos';

export function carregarCategoria(tag: string): CategoriaSalva | null {
  return ler<CategoriaSalva>(`nr13_cat_${tag}`);
}

export async function calcularESalvarCategoria(
  tag: string,
  volumeM3: number,
  pressaoExibida: number,
  unidade: SistemaUnidade,
  fluido: string,
): Promise<CategoriaSalva> {
  const pressaoMpa = paraMpa(pressaoExibida, unidade);
  const r = calcularCategoriaNR13(volumeM3, pressaoMpa, fluido);

  const salvo: CategoriaSalva = {
    classe: r.classe,
    grupo: r.grupo,
    PV_cat: r.pvCat.toFixed(4),
    PV_enq: r.pvEnq.toFixed(4),
    isEnquadrado: r.isEnquadrado,
    catFinal: r.catFinal,
    volInput: volumeM3,
    presInput: pressaoExibida,
    unidInput: unidade,
    fluidoInput: fluido,
  };
  await salvar(`nr13_cat_${tag}`, salvo);
  return salvo;
}
