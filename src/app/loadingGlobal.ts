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
export async function comLoadingGlobal<T>(mensagem: string, fn: () => Promise<T>): Promise<T> {
  const { mostrar, esconder } = useLoadingGlobal.getState();
  mostrar(mensagem);
  try {
    return await fn();
  } finally {
    esconder();
  }
}
