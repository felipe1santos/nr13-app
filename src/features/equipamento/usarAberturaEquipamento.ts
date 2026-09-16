/**
 * O ESTADO da busca de um equipamento por TAG — 16/09/2026.
 *
 * Mora fora do `PortaEquipamento.tsx` porque um arquivo `.tsx` que exporta
 * componente E função perde o fast refresh (regra `react-refresh`). A regra de
 * DADOS continua em `aberturaFicha.ts`; aqui é só a ligação com o React, usada
 * pela ficha e pelo Memorial.
 */
import { useEffect, useState } from 'react';
import { aberturaDoCache, abrirFicha, type AberturaFicha } from './aberturaFicha';

export interface PortaEquipamento {
  abertura: AberturaFicha;
  /** Refaz a busca. É o que o botão "Tentar de novo" chama. */
  tentarDeNovo: () => void;
}

/**
 * Resolve o equipamento da TAG: cache primeiro (inclusive OFFLINE), servidor
 * depois.
 *
 * Quem chama deve estar sob uma `key={tag}`: trocar de equipamento REMONTA a
 * tela, e o estado nasce do cache daquela TAG. Sem isso, o equipamento anterior
 * ficaria desenhado enquanto o novo carrega.
 */
export function useAberturaEquipamento(tag: string): PortaEquipamento {
  const [abertura, setAbertura] = useState<AberturaFicha>(() => aberturaDoCache(tag));
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    // Já em cache (inclusive OFFLINE): nada a buscar.
    if (abertura.estado === 'encontrado') return;
    let vivo = true;
    void abrirFicha(tag).then((r) => {
      if (vivo) setAbertura(r);
    });
    return () => {
      vivo = false;
    };
    // `abertura` de propósito FORA das dependências: ela é o RESULTADO deste
    // efeito, e reagir a ela faria a busca recomeçar a cada resposta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, tentativa]);

  return {
    abertura,
    tentarDeNovo: () => {
      setAbertura({ estado: 'carregando' });
      setTentativa((n) => n + 1);
    },
  };
}
