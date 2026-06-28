import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { supabase } from './services/supabase';
import { encerrarSessaoLocal } from './services/auth';

function App() {
  // BUG #8a — detecta perda de sessão DURANTE o uso (sessão revogada/expirada/refresh falho).
  // O gate do RotaProtegida só revalida no mount; numa SPA sem navegação completa, um usuário
  // bloqueado seguiria operando do cache. Aqui assinamos UMA vez o onAuthStateChange e reagimos
  // APENAS a sinais explícitos de perda de sessão — nunca a SIGNED_IN/INITIAL_SESSION/USER_UPDATED
  // nem a erro de rede transitório.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Sinais claros de sessão perdida: logout efetivo OU refresh de token sem sessão de volta.
      const perdaDeSessao =
        event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session);
      if (!perdaDeSessao) return;
      // Guarda anti-loop: só age se ainda houver sessão local marcada como logada. Após a faxina
      // a chave some, então um 2º evento (inclusive o disparado por logout()/signOut()) é no-op.
      if (!localStorage.getItem('nr13_usuario_logado')) return;
      encerrarSessaoLocal();
      // Navegação COMPLETA para /login: zera com segurança todo o estado da SPA. Evita redirecionar
      // se já estamos no /login (não recria loop).
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
