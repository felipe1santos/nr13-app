import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { emitirAviso } from '../../services/eventos';

/**
 * Alerta ao sair da calculadora com cálculo de memorial não salvo:
 * - navegação interna (menu/rotas do app) → useBlocker + modal do sistema (emitirAviso);
 * - fechar/recarregar a aba → beforeunload nativo.
 * `dirty` = campos editados ou cálculo gerado sem clicar em Salvar.
 */
export function useAvisoSairSemSalvar(dirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    // Cobalto: o aviso sai pelo modal do sistema (centralizado, mesmo desenho
    // do "Cálculo salvo"), não pela caixa cinza do navegador. Sair só com o
    // botão explícito; fechar, Esc ou clique fora = continuar editando.
    let saiu = false;
    emitirAviso({
      variante: 'alerta',
      titulo: 'Sair sem salvar o memorial?',
      texto: 'O cálculo deste memorial ainda não foi salvo. Se você sair agora, as informações não salvas serão perdidas.',
      acao: {
        rotulo: 'Sair sem salvar',
        aoClicar: () => {
          saiu = true;
          blocker.proceed();
        },
      },
      rotuloFechar: 'Continuar editando',
      aoFechar: () => {
        if (!saiu) blocker.reset();
      },
    });
  }, [blocker]);

  useEffect(() => {
    function aviso(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [dirty]);
}
