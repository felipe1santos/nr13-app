import { useEffect, useRef } from 'react';
import { salvarDadosFormulario } from './inspecaoService';
import type { FormularioEnsaio } from './tipos';

// Autosave: salva o formulário automaticamente ~1s após a última edição (debounce) e também ao
// desmontar (ex.: botão Voltar / navegação). O localStorage é síncrono, então o flush no unmount
// garante o cache mesmo se a navegação acontecer logo em seguida. Erros (ex.: container fora do
// cache) são engolidos — o salvar manual é quem avisa o usuário.
export function useAutosaveFormulario(
  tag: string,
  containerId: string,
  formulario: FormularioEnsaio,
  dados: unknown,
  enabled = true,
): void {
  const primeira = useRef(true);
  const ref = useRef({ tag, containerId, formulario, dados, enabled });
  ref.current = { tag, containerId, formulario, dados, enabled };

  // Debounce por edição
  useEffect(() => {
    if (!enabled) return;
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const t = setTimeout(() => {
      void salvarDadosFormulario(tag, containerId, formulario, dados).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [dados, enabled, tag, containerId, formulario]);

  // Flush ao desmontar (Voltar) — usa refs pra não pegar valores velhos
  useEffect(() => {
    return () => {
      const r = ref.current;
      if (!primeira.current && r.enabled) {
        void salvarDadosFormulario(r.tag, r.containerId, r.formulario, r.dados).catch(() => {});
      }
    };
  }, []);
}
