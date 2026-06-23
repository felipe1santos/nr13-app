import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { logout } from '../services/auth';
import './admin.css';

interface Profile {
  id: string;
  email: string | null;
  plano: string | null;
  ativo: boolean;
  role: string;
  acesso_expira_em: string | null;
  criado_em: string | null;
  aprovado_em: string | null;
  aprovado_por: string | null;
}

interface LoginEvent {
  user_id: string;
  tipo: string; // 'login' | 'logout'
  sessao_id: string | null;
  criado_em: string;
}

interface AuthMeta {
  id: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

interface Metricas {
  sessoesHoje: number;
  sessoesTotal: number;
  duracaoMediaMin: number | null;
}

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

function fmtSomenteData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function ehHoje(iso: string): boolean {
  const d = new Date(iso);
  const h = new Date();
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
}

// Calcula métricas de uso por usuário a partir dos eventos login/logout.
function calcularMetricas(eventos: LoginEvent[]): Map<string, Metricas> {
  const porUsuario = new Map<string, LoginEvent[]>();
  for (const e of eventos) {
    const arr = porUsuario.get(e.user_id) ?? [];
    arr.push(e);
    porUsuario.set(e.user_id, arr);
  }
  const out = new Map<string, Metricas>();
  for (const [userId, evs] of porUsuario) {
    const logins = evs.filter((e) => e.tipo === 'login');
    const sessoesHoje = logins.filter((e) => ehHoje(e.criado_em)).length;
    const sessoesTotal = logins.length;

    // Duração média: pareia login/logout por sessao_id.
    const duracoes: number[] = [];
    const porSessao = new Map<string, { login?: string; logout?: string }>();
    for (const e of evs) {
      if (!e.sessao_id) continue;
      const s = porSessao.get(e.sessao_id) ?? {};
      if (e.tipo === 'login') s.login = e.criado_em;
      if (e.tipo === 'logout') s.logout = e.criado_em;
      porSessao.set(e.sessao_id, s);
    }
    for (const s of porSessao.values()) {
      if (s.login && s.logout) {
        const ms = new Date(s.logout).getTime() - new Date(s.login).getTime();
        if (ms > 0) duracoes.push(ms);
      }
    }
    const duracaoMediaMin =
      duracoes.length > 0
        ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length / 60000)
        : null;

    out.set(userId, { sessoesHoje, sessoesTotal, duracaoMediaMin });
  }
  return out;
}

function statusUsuario(p: Profile): { label: string; cls: string } {
  if (!p.ativo) return { label: 'Pendente', cls: 'pendente' };
  if (p.acesso_expira_em && new Date(p.acesso_expira_em).getTime() < Date.now())
    return { label: 'Expirado', cls: 'expirado' };
  return { label: 'Ativo', cls: 'ativo' };
}

export default function Admin() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [eventos, setEventos] = useState<LoginEvent[]>([]);
  const [metas, setMetas] = useState<Map<string, AuthMeta>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null);
  const navigate = useNavigate();

  async function sair() {
    await logout();
    navigate('/login');
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [resProfiles, resEventos] = await Promise.all([
        supabase.from('profiles').select('*').order('criado_em', { ascending: false }),
        supabase.from('login_events').select('user_id, tipo, sessao_id, criado_em'),
      ]);
      if (resProfiles.error) throw resProfiles.error;
      setProfiles((resProfiles.data as Profile[]) ?? []);
      setEventos((resEventos.data as LoginEvent[]) ?? []);

      // Metadados do Auth (último login real, e-mail confirmado) via Edge Function.
      const { data: metaData, error: metaErr } = await supabase.functions.invoke('admin', {
        body: { action: 'auth_meta' },
      });
      if (!metaErr && metaData?.metas) {
        const m = new Map<string, AuthMeta>();
        for (const meta of metaData.metas as AuthMeta[]) m.set(meta.id, meta);
        setMetas(m);
      }
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar dados.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // carregar() liga o spinner e busca os dados no mount; setState aqui é intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const metricas = useMemo(() => calcularMetricas(eventos), [eventos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => (p.email ?? '').toLowerCase().includes(q));
  }, [profiles, busca]);

  const resumo = useMemo(() => {
    const total = profiles.length;
    const pendentes = profiles.filter((p) => !p.ativo).length;
    const ativosHoje = new Set(
      eventos.filter((e) => e.tipo === 'login' && ehHoje(e.criado_em)).map((e) => e.user_id),
    ).size;
    return { total, pendentes, ativosHoje };
  }, [profiles, eventos]);

  // ---- Ações ----
  async function atualizarPerfil(id: string, patch: Partial<Profile>, msg: string) {
    setAcaoEmAndamento(id);
    setErro(null);
    setAviso(null);
    try {
      const { error } = await supabase.from('profiles').update(patch).eq('id', id);
      if (error) throw error;
      setProfiles((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      setAviso(msg);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha na ação.');
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  function liberar(p: Profile) {
    void atualizarPerfil(
      p.id,
      {
        ativo: true,
        aprovado_em: new Date().toISOString(),
        aprovado_por: localStorage.getItem('nr13_usuario_logado') ?? 'admin',
      },
      `Acesso liberado para ${p.email}.`,
    );
  }

  function bloquear(p: Profile) {
    void atualizarPerfil(p.id, { ativo: false }, `Acesso bloqueado para ${p.email}.`);
  }

  function definirExpiracao(p: Profile) {
    const atual = p.acesso_expira_em ? p.acesso_expira_em.slice(0, 10) : '';
    const entrada = window.prompt(
      `Data de expiração do acesso de ${p.email} (AAAA-MM-DD). Vazio = sem expiração:`,
      atual,
    );
    if (entrada === null) return;
    const valor = entrada.trim();
    if (valor === '') {
      void atualizarPerfil(p.id, { acesso_expira_em: null }, 'Expiração removida.');
      return;
    }
    const d = new Date(valor + 'T23:59:59');
    if (isNaN(d.getTime())) {
      setErro('Data inválida. Use o formato AAAA-MM-DD.');
      return;
    }
    void atualizarPerfil(
      p.id,
      { acesso_expira_em: d.toISOString() },
      `Expiração definida para ${fmtSomenteData(d.toISOString())}.`,
    );
  }

  function alternarAdmin(p: Profile) {
    const novo = p.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Tornar ${p.email} ${novo === 'admin' ? 'ADMIN' : 'usuário comum'}?`)) return;
    void atualizarPerfil(p.id, { role: novo }, `Papel alterado para ${novo}.`);
  }

  async function resetarSenha(p: Profile) {
    const nova = window.prompt(`Nova senha para ${p.email} (mín. 6 caracteres):`);
    if (nova === null) return;
    if (nova.length < 6) {
      setErro('Senha muito curta (mínimo 6).');
      return;
    }
    setAcaoEmAndamento(p.id);
    setErro(null);
    setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'reset_password', user_id: p.id, nova_senha: nova },
      });
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
      setAviso(`Senha de ${p.email} redefinida.`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao resetar senha.');
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  async function excluir(p: Profile) {
    if (!window.confirm(`EXCLUIR permanentemente ${p.email}? Esta ação não pode ser desfeita.`)) return;
    setAcaoEmAndamento(p.id);
    setErro(null);
    setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'delete_user', user_id: p.id },
      });
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
      setProfiles((ps) => ps.filter((x) => x.id !== p.id));
      setAviso(`Usuário ${p.email} excluído.`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao excluir.');
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  return (
    <div className="admin-standalone">
      <header className="admin-topbar">
        <span className="admin-topbar-logo">NR-13 · Admin</span>
        <div className="admin-topbar-right">
          <span className="admin-topbar-email">{localStorage.getItem('nr13_usuario_logado')}</span>
          <button type="button" className="admin-topbar-sair" onClick={sair}>
            Sair
          </button>
        </div>
      </header>
      <div className="admin-page">
        <div className="admin-header">
          <h1>Painel de Administração</h1>
          <button type="button" className="admin-btn-refresh" onClick={carregar} disabled={carregando}>
            {carregando ? 'Carregando…' : '↻ Atualizar'}
          </button>
        </div>

      <div className="admin-cards">
        <div className="admin-card">
          <span className="admin-card-num">{resumo.total}</span>
          <span className="admin-card-label">Usuários</span>
        </div>
        <div className="admin-card pendente">
          <span className="admin-card-num">{resumo.pendentes}</span>
          <span className="admin-card-label">Pendentes</span>
        </div>
        <div className="admin-card ativo">
          <span className="admin-card-num">{resumo.ativosHoje}</span>
          <span className="admin-card-label">Ativos hoje</span>
        </div>
      </div>

      {erro && <p className="admin-erro">{erro}</p>}
      {aviso && <p className="admin-aviso">{aviso}</p>}

      <input
        className="admin-busca"
        type="search"
        placeholder="Buscar por e-mail…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      <div className="admin-tabela-wrap">
        <table className="admin-tabela">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Status</th>
              <th>Papel</th>
              <th>Cadastro</th>
              <th>Último login</th>
              <th>Confirmado</th>
              <th>Sessões hoje</th>
              <th>Sessões total</th>
              <th>Duração média</th>
              <th>Expira em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => {
              const st = statusUsuario(p);
              const m = metricas.get(p.id);
              const meta = metas.get(p.id);
              const ocupado = acaoEmAndamento === p.id;
              return (
                <tr key={p.id} className={ocupado ? 'ocupado' : ''}>
                  <td data-label="E-mail" className="admin-email">{p.email}</td>
                  <td data-label="Status">
                    <span className={`admin-badge ${st.cls}`}>{st.label}</span>
                  </td>
                  <td data-label="Papel">{p.role === 'admin' ? '👑 admin' : 'usuário'}</td>
                  <td data-label="Cadastro">{fmtSomenteData(p.criado_em)}</td>
                  <td data-label="Último login">{fmtData(meta?.last_sign_in_at ?? null)}</td>
                  <td data-label="Confirmado">{meta?.email_confirmed_at ? '✓' : '—'}</td>
                  <td data-label="Sessões hoje">{m?.sessoesHoje ?? 0}</td>
                  <td data-label="Sessões total">{m?.sessoesTotal ?? 0}</td>
                  <td data-label="Duração média">
                    {m?.duracaoMediaMin != null ? `${m.duracaoMediaMin} min` : '—'}
                  </td>
                  <td data-label="Expira em">{fmtSomenteData(p.acesso_expira_em)}</td>
                  <td data-label="Ações" className="admin-acoes">
                    {p.ativo ? (
                      <button type="button" className="b b-bloq" onClick={() => bloquear(p)} disabled={ocupado}>
                        Bloquear
                      </button>
                    ) : (
                      <button type="button" className="b b-lib" onClick={() => liberar(p)} disabled={ocupado}>
                        Liberar
                      </button>
                    )}
                    <button type="button" className="b" onClick={() => definirExpiracao(p)} disabled={ocupado}>
                      Expiração
                    </button>
                    <button type="button" className="b" onClick={() => resetarSenha(p)} disabled={ocupado}>
                      Resetar senha
                    </button>
                    <button type="button" className="b" onClick={() => alternarAdmin(p)} disabled={ocupado}>
                      {p.role === 'admin' ? 'Remover admin' : 'Tornar admin'}
                    </button>
                    <button type="button" className="b b-del" onClick={() => excluir(p)} disabled={ocupado}>
                      Excluir
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && !carregando && (
              <tr>
                <td colSpan={11} className="admin-vazio">Nenhum usuário encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
