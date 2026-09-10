import type { DimensaoProntuario } from './tipos';

/**
 * Os RÓTULOS da tabela de dimensões — um lugar só, para o formulário e para o
 * documento (10/09/2026).
 *
 * O que cada coluna significa depende do tipo do equipamento: `volume` é
 * "Volume (L)" num vaso, "Volume d'água (L)" numa flamotubular e
 * "Prod. Vapor (kg/h)" numa aquatubular; `espTampa` é "Esp. Tampa" no vaso e
 * "Esp. Espelho" na caldeira. O formulário sempre soube disso — a folha
 * vetorial não: ela imprimia oito cabeçalhos fixos e genéricos
 * (`Ø · ALTURA · COMPRIMENTO · e CORPO · e FUNDO · e TAMPA · VOLUME`), sem
 * unidade nenhuma.
 *
 * Duas consequências, e a segunda é grave:
 *
 * 1. O leitor não sabia se `500` era milímetro, polegada ou centímetro.
 * 2. Numa caldeira aquatubular, a produção de vapor em kg/h era impressa sob
 *    um cabeçalho escrito **VOLUME**, num documento assinado por engenheiro.
 *
 * Por isso os rótulos saíram de dentro de `Prontuarios.tsx` e viraram módulo:
 * enquanto viviam num componente React, a folha não tinha como importá-los
 * (a suíte roda em ambiente `node`) e a cópia divergente era inevitável.
 */
export function rotulosDimensoes(
  tipo: string,
  subtipo: string,
): Record<keyof DimensaoProntuario, string> {
  if (tipo === 'autoclave' && subtipo === 'retangular') {
    return {
      modelo: 'Modelo / Fabricante',
      diametro: 'Largura interna (mm)',
      altura: 'Altura interna (mm)',
      comprimento: 'Comprimento interno (mm)',
      espCorpo: 'Esp. Corpo (mm)',
      espFundo: 'Profundidade (mm)',
      espTampa: 'Esp. Porta/Tampa (mm)',
      volume: 'Volume (L)',
    };
  }
  if (tipo === 'autoclave') {
    return {
      modelo: 'Modelo / Fabricante',
      diametro: 'Ø Câmara (mm)',
      altura: 'Compr. Câmara (mm)',
      comprimento: 'Comprimento (mm)',
      espCorpo: 'Esp. Corpo (mm)',
      espFundo: 'Esp. Fundo (mm)',
      espTampa: 'Esp. Tampa/Porta (mm)',
      volume: 'Volume (L)',
    };
  }
  if (tipo === 'caldeira') {
    return {
      modelo: 'Modelo / Fabricante',
      diametro: 'Ø Externo Corpo (mm)',
      altura: 'Comprimento Total (mm)',
      comprimento: 'Comprimento (mm)',
      espCorpo: 'Esp. Costado (mm)',
      espFundo: 'Esp. Tampo (mm)',
      espTampa: 'Esp. Espelho (mm)',
      volume: subtipo === 'aquatubular' ? 'Prod. Vapor (kg/h)' : "Volume d'água (L)",
    };
  }
  return {
    modelo: 'Modelo / Fabricante',
    diametro: 'Ø Diâm. Interno (mm)',
    altura: 'Alt. Corpo (mm)',
    comprimento: 'Comprimento (mm)',
    espCorpo: 'Esp. Chapa Corpo (mm)',
    espFundo: 'Esp. Chapa Fundo (mm)',
    espTampa: 'Esp. Tampa (mm)',
    volume: 'Volume (L)',
  };
}

/** A ordem das colunas da tabela — a mesma do formulário. */
export const COLUNAS_DIMENSAO: (keyof DimensaoProntuario)[] = [
  'modelo',
  'diametro',
  'altura',
  'comprimento',
  'espCorpo',
  'espFundo',
  'espTampa',
  'volume',
];
