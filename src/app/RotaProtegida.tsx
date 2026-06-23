import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { lerTudo } from '../services/storage';
import { verificarAcesso } from '../services/auth';

// Gate de sessão: confere a sessão Supabase, valida liberação/expiração do perfil e hidrata o cache
// local (localStorage) que os templates HTML em iframe leem. Sem sessão (ou acesso revogado/expirado),
// manda pro /login.
export default function RotaProtegida() {
  const [estado, setEstado] = useState<'carregando' | 'autenticado' | 'anonimo'>('carregando');

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      if (!data.session) {
        setEstado('anonimo');
        return;
      }
      // Revalida liberação/expiração no servidor (faz logout se revogado/expirado).
      const { ativo } = await verificarAcesso();
      if (!vivo) return;
      if (!ativo) {
        setEstado('anonimo');
        return;
      }
      await lerTudo();
      if (vivo) setEstado('autenticado');
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (estado === 'carregando') {
    return <div style={{ padding: 40, textAlign: 'center', color: '#555' }}>Carregando…</div>;
  }
  if (estado === 'anonimo') return <Navigate to="/login" replace />;
  return <Outlet />;
}
