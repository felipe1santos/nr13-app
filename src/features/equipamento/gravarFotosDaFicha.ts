import { salvar } from '../../services/storage';
import { emitirDadosAlterados } from '../../services/eventos';
import type { FotoEquipamento } from './tipos';

/**
 * Grava `nr13_fotos_<TAG>` a partir da ficha E avisa a ficha (21/11/2026).
 *
 * O BUG: a foto enviada só aparecia na ficha depois do F5. A foto grande do
 * topo é desenhada por `Equipamento.tsx`, que lê `nr13_fotos_` no render; quem
 * grava é `FotoIdentificacao`, com estado próprio. Gravar atualizava o cache e
 * a miniatura do slot, mas nada fazia o componente da foto grande renderizar
 * de novo — ele continuava com a lista lida na abertura.
 *
 * A ficha já assina o barramento `emitirDadosAlterados` (é por ele que o resumo
 * do topo reage à Categoria e à Vida). O aviso sai DEPOIS do `await`: na v2 o
 * cache só recebe o valor novo dentro da gravação, e avisar antes faria a
 * releitura enxergar a lista antiga.
 */
export async function gravarFotosDaFicha(tag: string, fotos: FotoEquipamento[]): Promise<void> {
  await salvar(`nr13_fotos_${tag}`, fotos);
  emitirDadosAlterados();
}
