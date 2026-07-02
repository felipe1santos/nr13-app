import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldBan, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import {
  criarSubUsuario,
  definirAtivoSub,
  excluirSub,
  listarSubUsuarios,
  resetarSenhaSub,
  trocarPapelSub,
  type SubUsuario,
} from '../services/orgAdmin';
import { isMestre } from '../services/auth';
import './cadastros.css';

const ROTULO_PAPEL: Record<string, string> = {
  gerente: 'Gerente',
  funcionario: 'Funcionário',
  cliente: 'Cliente (portal)',
};

// Painel "Acesso" — só o MESTRE. Cria e gerencia sub-logins da organização:
// gerentes e funcionários aqui; acessos de cliente são criados em "Empresas".
export default function Acesso() {
  const [usuarios, setUsuarios] = useState<SubUsuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<'gerente' | 'funcionario'>('funcionario');
  const [criando, setCriando] = useState(false);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setUsuarios(await listarSubUsuarios());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (!isMestre()) {
    return <p style={{ padding: 24 }}>Apenas a conta principal (mestre) gerencia os acessos.</p>;
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    setErro(null);
    setAviso(null);
    try {
      await criarSubUsuario(email.trim(), senha, papel);
      setAviso(`Acesso ${ROTULO_PAPEL[papel]} criado para ${email.trim()}.`);
      setEmail('');
      setSenha('');
      await recarregar();
    } catch (er) {
      setErro(er instanceof Error ? er.message : String(er));
    } finally {
      setCriando(false);
    }
  }

  async function acao(fn: () => Promise<void>, msgOk: string) {
    setErro(null);
    setAviso(null);
    try {
      await fn();
      setAviso(msgOk);
      await recarregar();
    } catch (er) {
      setErro(er instanceof Error ? er.message : String(er));
    }
  }

  return (
    <div className="cad-page">
      <h1>Acesso — sub-logins da sua organização</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 18 }}>
        Crie logins para sua equipe. <b>Gerente</b> gerencia ativos e vê tudo; <b>Funcionário</b> preenche
        inspeções em campo. Acessos de <b>cliente</b> (portal somente-leitura) são criados na tela{' '}
        <b>Empresas</b>, dentro da empresa do cliente. Todos os papéis têm sessão única: a mesma conta não
        abre em dois aparelhos ao mesmo tempo.
      </p>

      {erro && <p className="erro-form">{erro}</p>}
      {aviso && <p style={{ color: 'var(--status-ok-text)', fontWeight: 600 }}>{aviso}</p>}

      <div className="bloco-dados" style={{ marginBottom: 20 }}>
        <h3><UserPlus size={16} style={{ verticalAlign: -3 }} /> Criar novo acesso</h3>
        <form onSubmit={handleCriar} className="cad-grid" style={{ alignItems: 'end' }}>
          <label>
            E-mail
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Senha (mín. 6)
            <input type="text" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
          <label>
            Papel
            <select value={papel} onChange={(e) => setPapel(e.target.value as 'gerente' | 'funcionario')}>
              <option value="funcionario">Funcionário (campo)</option>
              <option value="gerente">Gerente</option>
            </select>
          </label>
          <button type="submit" className="btn-primario" disabled={criando}>
            {criando ? 'Criando...' : 'Criar acesso'}
          </button>
        </form>
      </div>

      <div className="bloco-dados">
        <h3>Sub-logins ({usuarios.length})</h3>
        {carregando ? (
          <p>Carregando...</p>
        ) : usuarios.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Nenhum sub-login criado ainda.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cad-tabela" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Papel</th>
                  <th>Status</th>
                  <th>Sessão</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>
                      {u.papel === 'cliente' ? (
                        ROTULO_PAPEL.cliente
                      ) : (
                        <select
                          value={u.papel}
                          onChange={(e) =>
                            acao(
                              () => trocarPapelSub(u.id, e.target.value as 'gerente' | 'funcionario'),
                              'Papel atualizado.',
                            )
                          }
                        >
                          <option value="funcionario">Funcionário</option>
                          <option value="gerente">Gerente</option>
                        </select>
                      )}
                    </td>
                    <td>{u.ativo ? 'Liberado' : 'Bloqueado'}</td>
                    <td>{u.sessao_ativa ? '🟢 Em uso' : '⚪ Livre'}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-secundario"
                        title="Resetar senha"
                        onClick={() => {
                          const nova = window.prompt(`Nova senha para ${u.email} (mín. 6):`);
                          if (nova && nova.length >= 6) void acao(() => resetarSenhaSub(u.id, nova), 'Senha atualizada.');
                        }}
                      >
                        <KeyRound size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-secundario"
                        title={u.ativo ? 'Bloquear' : 'Liberar'}
                        onClick={() => acao(() => definirAtivoSub(u.id, !u.ativo), u.ativo ? 'Acesso bloqueado.' : 'Acesso liberado.')}
                      >
                        {u.ativo ? <ShieldBan size={14} /> : <ShieldCheck size={14} />}
                      </button>
                      <button
                        type="button"
                        className="btn-secundario"
                        title="Excluir"
                        onClick={() => {
                          if (window.confirm(`Excluir o acesso de ${u.email}? Essa ação não tem volta.`))
                            void acao(() => excluirSub(u.id), 'Acesso excluído.');
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="btn-secundario" style={{ marginTop: 10 }} onClick={() => void recarregar()}>
          <RefreshCw size={13} style={{ verticalAlign: -2 }} /> Atualizar lista
        </button>
      </div>
    </div>
  );
}
