import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { lerTudo } from '../services/storage';

// Gate de sessão: confere a sessão Supabase e hidrata o cache local (localStorage) que os
// templates HTML em iframe leem. Sem sessão, manda pro /login.
export default function RotaProtegida() {
  const [estado, setEstado] = useState<'carregando' | 'autenticado' | 'anonimo'>('carregando');

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!vivo) return;
      if (data.session) {
        await lerTudo();
        if (vivo) setEstado('autenticado');
      } else {
        setEstado('anonimo');
      }
    });
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
