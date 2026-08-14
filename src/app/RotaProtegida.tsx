import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { lerTudo, iniciarArmazenamento } from '../services/storage';
import { migrarHistoricoEmSegundoPlano } from '../features/relatorios/historicoRelatorios';
import { migrarRubricasEmSegundoPlano } from '../features/relatorios/livroAssinatura';
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
      // Envolvido em try: na v2 `lerTudo` já devolve o snapshot do disco quando o
      // servidor falha, mas uma exceção inesperada aqui deixaria o app preso em
      // "Carregando…" para sempre — pior do que abrir com o que o aparelho tem.
      try {
        await iniciarArmazenamento();
        await lerTudo();
      } catch {
        if (vivo) setSemServidor(true);
      }
      // Converte o array único `nr13_historico_relatorios` em um registro por
      // relatório (§achado 1). Depois da hidratação, porque precisa do histórico
      // já carregado; em SEGUNDO PLANO, porque não pode atrasar a primeira tela;
      // e sem apagar nada, então falhar aqui só significa que as telas seguem
      // lendo pelo legado.
      migrarHistoricoEmSegundoPlano();
      // Rubricas do Livro de Registro: base64 embutido em cada entrada vira
      // referência de conteúdo (§livroAssinatura). Entradas lacradas ficam.
      migrarRubricasEmSegundoPlano();
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
