import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Alerta ao sair da calculadora com cálculo de memorial não salvo:
 * - navegação interna (menu/rotas do app) → useBlocker + window.confirm;
 * - fechar/recarregar a aba → beforeunload nativo.
 * `dirty` = campos editados ou cálculo gerado sem clicar em Salvar.
 */
export function useAvisoSairSemSalvar(dirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const sair = window.confirm(
      'Você tem um cálculo de memorial não salvo. Sair mesmo assim?\nAs informações não salvas serão perdidas.',
    );
    if (sair) blocker.proceed();
    else blocker.reset();
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
