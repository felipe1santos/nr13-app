/**
 * Fase 9 · 9F.1 — o que a tela nova de `/inspecoes` precisa do armazenamento.
 *
 * ## Por que existe
 *
 * A tela antiga monta a lista com `listarEquipamentos()`, que começa com
 * `await lerTudo()` — hidratação COMPLETA. Sob `boot_v9` isso desfaz o boot leve
 * da 9D (20 KB × 354 KB medidos) na primeira visita. Aqui a lista vem da
 * projeção, pelo servidor (`buscaIndex`), e o equipamento só chega ao cache
 * quando é ESCOLHIDO.
 *
 * ## A ordem importa, e é o teste inteiro
 *
 * Semear primeiro, ler depois. Invertido, o aparelho que ainda não tem a TAG no
 * cache abriria a lista de containers VAZIA — trocaria "lento" por "sumiu", que
 * neste sistema é sempre o pior negócio.
 *
 * `carregarEquipamento` já existia, com teste próprio, e **nenhuma tela a
 * chamava**: só o teste. Ficava mascarado porque `lerTudo()` trazia tudo. É a
 * mesma forma do defeito de `sincronizarFlagDoServidor` na 9D — peça pronta,
 * ninguém chamando.
 */
import { carregarEquipamento } from '../equipamento/equipamentoService';
import { listarContainers } from './inspecaoService';
import type { ContainerInspecao } from './tipos';

/**
 * Traz do servidor as chaves desta TAG e devolve os containers de inspeção
 * dela.
 *
 * **Não lança.** Sem rede, o que já está no aparelho continua valendo: é a
 * promessa do próprio `carregarEquipamento`, e derrubar a navegação por causa da
 * rede transformaria uma tela degradada numa tela quebrada.
 */
export async function abrirEquipamentoParaInspecao(tag: string): Promise<ContainerInspecao[]> {
  try {
    await carregarEquipamento(tag);
  } catch {
    // Offline ou falha pontual: segue com o cache. A tela mostra o que tem.
  }
  return listarContainers(tag);
}
