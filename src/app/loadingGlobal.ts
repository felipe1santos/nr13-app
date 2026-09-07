// Overlay de carregamento global (centro da tela) — usado em salvamentos/carregamentos longos.
// UI em <LoadingGlobalOverlay/> (montado no App); estado num store zustand minúsculo.
import { create } from 'zustand';

interface LoadingGlobalState {
  ativo: boolean;
  mensagem: string;
  mostrar: (mensagem?: string) => void;
  esconder: () => void;
}

export const useLoadingGlobal = create<LoadingGlobalState>((set) => ({
  ativo: false,
  mensagem: 'Salvando...',
  mostrar: (mensagem = 'Salvando...') => set({ ativo: true, mensagem }),
  esconder: () => set({ ativo: false }),
}));

// Envolve uma operação async com o overlay: comLoadingGlobal('Salvando memorial...', () => salvar()).
//
// `minimoMs` (07/09/2026): tempo MÍNIMO que o overlay fica na tela. Salvar o
// memorial grava em cache local e volta em poucos milissegundos — o overlay
// piscava e o usuário não via nada, ficando sem saber se o clique valeu. Com um
// piso curto o feedback existe. **Só atrasa o SUCESSO**: em caso de erro o
// `finally` esconde o overlay imediatamente, porque segurar a tela para mostrar
// "salvando" enquanto a gravação já falhou é mentir por 1,5 segundo.
export async function comLoadingGlobal<T>(
  mensagem: string,
  fn: () => Promise<T>,
  opcoes: { minimoMs?: number } = {},
): Promise<T> {
  const { mostrar, esconder } = useLoadingGlobal.getState();
  mostrar(mensagem);
  const inicio = Date.now();
  try {
    const r = await fn();
    const falta = (opcoes.minimoMs ?? 0) - (Date.now() - inicio);
    if (falta > 0) await new Promise((res) => setTimeout(res, falta));
    return r;
  } finally {
    esconder();
  }
}
