import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import LoadingGlobalOverlay from './app/LoadingGlobalOverlay';
import { supabase } from './services/supabase';
import { encerrarSessaoDesteDispositivo, encerrarSessaoLocal, iniciarHeartbeatSessao } from './services/auth';

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

  // Sessão única: heartbeat mantém o lock; se OUTRO dispositivo assumir a conta,
  // derruba esta sessão com aviso (PLANO-CONTROLE-DE-ACESSO §7).
  //
  // SEM a guarda `if (!usuarioLogado()) return`: com deps `[]`, o efeito roda uma
  // única vez, no mount do App. Quem entra pelo formulário de login não remonta o
  // App (é navegação da SPA), então naquela aba o heartbeat NUNCA começava — a
  // sessão nem se anunciava viva nem detectava tomada. Ligar sempre é barato: o
  // `bater()` já sai na hora enquanto não existir `nr13_sessao_token`.
  useEffect(() => {
    const parar = iniciarHeartbeatSessao(() => {
      window.alert('Sua sessão foi encerrada: a conta foi aberta em outro dispositivo.');
      // Precisa derrubar a sessão do SUPABASE, não só as chaves locais: o token de
      // acesso continuaria válido e um F5 traria o aparelho de volta para dentro —
      // a tomada de posse seria puramente cosmética.
      void encerrarSessaoDesteDispositivo().finally(() => window.location.assign('/login'));
    });
    return parar;
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <LoadingGlobalOverlay />
    </>
  );
}

export default App;
