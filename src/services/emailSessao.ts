import { useEffect, useState } from 'react';
import { usuarioLogado } from './auth';
import { supabase } from './supabase';

/**
 * E-mail de quem está logado, para EXIBIR (chip do topo, Meus dados).
 *
 * `nr13_usuario_logado` só é gravado no login por formulário; numa sessão
 * restaurada pelo Supabase (aba nova, PWA reaberto) ele não existe e a tela
 * mostrava "—". Aqui o e-mail cai na sessão do Supabase quando a chave falta.
 * Só leitura: nada é gravado, e nenhuma regra de acesso depende disto.
 */
export function useEmailDaSessao(): string | null {
  const [email, setEmail] = useState<string | null>(() => usuarioLogado());
  useEffect(() => {
    if (email) return;
    let vivo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const e = data.session?.user?.email;
        if (vivo && e) setEmail(e);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [email]);
  return email;
}
