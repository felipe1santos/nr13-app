import { useSyncExternalStore } from 'react';

/**
 * FOTOS AINDA EM PROCESSAMENTO na tela (24/11/2026).
 *
 * Achado no E2E em produção: o editor de fotos processa (comprime + guarda) uma
 * imagem por vez, e o botão Salvar do formulário continuava liberado nesse
 * meio-tempo. Salvar antes de terminar gravava o registro SEM as últimas
 * fotos — 3 de 5 no Relatório de Imagens — e, saindo da tela, elas se perdiam
 * sem aviso nenhum.
 *
 * O editor avisa aqui quantas faltam; os formulários travam o Salvar enquanto
 * houver alguma. Contador simples em memória: é estado da TELA, não do dado.
 */
let pendentes = 0;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const o of ouvintes) o();
}

export function iniciarProcessamentoFotos(quantidade: number): void {
  pendentes += Math.max(0, quantidade);
  avisar();
}

export function concluirProcessamentoFoto(): void {
  pendentes = Math.max(0, pendentes - 1);
  avisar();
}

export function fotosEmProcessamento(): number {
  return pendentes;
}

/** Só para testes. */
export function zerarProcessamentoFotos(): void {
  pendentes = 0;
  avisar();
}

export function useFotosEmProcessamento(): number {
  return useSyncExternalStore(
    (ouvir) => {
      ouvintes.add(ouvir);
      return () => ouvintes.delete(ouvir);
    },
    () => pendentes,
    () => pendentes,
  );
}

/** Texto do botão Salvar enquanto há foto sendo processada. */
export function rotuloAguardandoFotos(n: number): string {
  return `Aguarde: processando ${n === 1 ? '1 foto' : `${n} fotos`}…`;
}
