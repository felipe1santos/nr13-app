import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { hidratarNoBoot, migracoesDeSegundoPlano } from './bootArmazenamento';
import { verificarAcesso } from '../services/auth';
import './layout.css';

// Gate de sessão: confere a sessão Supabase, valida liberação/expiração do perfil e hidrata o cache
// local (localStorage) que os templates HTML em iframe leem. Sem sessão (ou acesso revogado/expirado),
// manda pro /login.
export default function RotaProtegida() {
  const [estado, setEstado] = useState<'carregando' | 'autenticado' | 'anonimo'>('carregando');
  const [semServidor, setSemServidor] = useState(false);

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
      // `servidorIndisponivel` = ninguém revogou nada, o servidor é que não respondeu.
      const { ativo, servidorIndisponivel } = await verificarAcesso();
      if (!vivo) return;
      if (!ativo) {
        setEstado('anonimo');
        return;
      }
      setSemServidor(!!servidorIndisponivel);
      // Barreira: organizacao, IndexedDB, Map, fila e tombstones ANTES de
      // qualquer tela. Sem isso uma tela poderia listar zero equipamentos so
      // porque chamou ler() antes da hidratacao terminar.
      //
      // O QUE a barreira espera é decisão de `hidratarNoBoot()` — sem a flag
      // `boot_v9`, a organização inteira, como sempre; com ela, só o essencial
      // (§9D). Cliente do Portal não hidrata nada (Fase 0-B, achado A-01).
      const boot = await hidratarNoBoot();
      if (boot.falhou && vivo) setSemServidor(true);
      // Migrações e reparos, em SEGUNDO PLANO — nunca atrasam a primeira tela.
      // As três varrem o cache por prefixo, então quem decide se elas podem
      // rodar é o MODO do boot (ver `migracoesDeSegundoPlano`).
      migracoesDeSegundoPlano(boot.modo);
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
  return (
    <>
      {semServidor && (
        <div className="barra-sem-servidor" role="status">
          Sem resposta do servidor. Você continua trabalhando com os dados deste aparelho — o que
          for salvo sobe sozinho quando a conexão voltar.
          <button type="button" onClick={() => setSemServidor(false)} aria-label="Dispensar aviso">
            ✕
          </button>
        </div>
      )}
      <Outlet />
    </>
  );
}
