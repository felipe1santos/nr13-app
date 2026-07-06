import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { listarClientes } from '../features/cadastros/cadastroService';
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
import {
  MODULOS,
  PRESET_GERENTE,
  PRESET_INSPETOR,
  ROTULO_MODULO,
  carregarPermissoes,
  excluirPermissoes,
  salvarPermissoes,
  type Modulo,
} from '../services/permissoes';
import './cadastros.css';

type Perfil = 'gerente' | 'inspetor' | 'personalizado';

const ROTULO_PAPEL: Record<string, string> = {
  gerente: 'Gerente',
  funcionario: 'Inspetor',
  cliente: 'Cliente (portal)',
};

// Perfil escolhido → papel real no banco (gerente|funcionario) + pré-marcações.
const PRESETS: Record<Perfil, { papel: 'gerente' | 'funcionario'; modulos: Modulo[]; descricao: string }> = {
  gerente: {
    papel: 'gerente',
    modulos: PRESET_GERENTE,
    descricao: 'Gerencia ativos e vê quase tudo (exceto Minha Empresa e Acessos).',
  },
  inspetor: {
    papel: 'funcionario',
    modulos: PRESET_INSPETOR,
    descricao: 'Preenche inspeções em campo. Não edita fichas nem gera relatórios.',
  },
  personalizado: {
    papel: 'funcionario',
    modulos: [],
    descricao: 'Você escolhe exatamente o que este acesso pode ver.',
  },
};

const MS_DIA = 86_400_000;

// Carimbo de tempo relativo — azul para recentes (≤ 7 dias), cinza para antigos.
// Usado em "Último acesso" e "Última sincronização".
function CarimboTempo({ iso, rotulo, vazio }: { iso: string | null; rotulo: string; vazio: string }) {
  if (!iso) return <span className="acesso-ultimo antigo">{vazio}</span>;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return <span className="acesso-ultimo antigo">{vazio}</span>;
  const dias = Math.floor((Date.now() - d.getTime()) / MS_DIA);
  const recente = dias <= 7;
  const quando =
    dias <= 0
      ? `hoje às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : dias === 1
        ? 'ontem'
        : `${d.toLocaleDateString('pt-BR')}`;
  return (
    <span className={`acesso-ultimo ${recente ? 'recente' : 'antigo'}`}>
      {rotulo} {dias <= 1 ? '' : 'em '}{quando}
    </span>
  );
}

// Painel "Acessos" — só o MESTRE. Tela inicial: instrução + lista de acessos;
// o formulário de criação só aparece ao clicar em "Cadastrar novo acesso".
export default function Acesso() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState<SubUsuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aba, setAba] = useState<'equipe' | 'clientes'>('equipe');
  const [busca, setBusca] = useState('');

  // cliente_id → nome da empresa cliente (lista local de Cadastrar → Clientes).
  const nomesClientes = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of listarClientes()) mapa.set(c.id, c.razaoSocial || c.nomeFantasia || '');
    return mapa;
  }, []);

  const equipe = usuarios.filter((u) => u.papel !== 'cliente');
  const clientesLogins = usuarios.filter((u) => u.papel === 'cliente');
  const termo = busca.trim().toLowerCase();
  const clientesFiltrados = termo
    ? clientesLogins.filter(
        (u) =>
          (u.email ?? '').toLowerCase().includes(termo) ||
          (nomesClientes.get(u.cliente_id ?? '') ?? '').toLowerCase().includes(termo),
      )
    : clientesLogins;

  const [formAberto, setFormAberto] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState<Perfil>('inspetor');
  const [modulos, setModulos] = useState<Modulo[]>(PRESET_INSPETOR);
  const [criando, setCriando] = useState(false);
  const [editandoPermissoes, setEditandoPermissoes] = useState<string | null>(null);
  const [permissoesEdicao, setPermissoesEdicao] = useState<Modulo[]>([]);

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

  function escolherPerfil(p: Perfil) {
    setPerfil(p);
    setModulos(PRESETS[p].modulos);
  }

  function toggleModulo(lista: Modulo[], m: Modulo): Modulo[] {
    return lista.includes(m) ? lista.filter((x) => x !== m) : [...lista, m];
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    if (modulos.length === 0) {
      setErro('Marque pelo menos um módulo para este acesso.');
      return;
    }
    setCriando(true);
    setErro(null);
    setAviso(null);
    try {
      await criarSubUsuario(email.trim(), senha, PRESETS[perfil].papel);
      // Vincula as permissões ao usuário recém-criado (busca o id pelo e-mail).
      const lista = await listarSubUsuarios();
      const novo = lista.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
      if (novo) await salvarPermissoes(novo.id, modulos);
      setAviso(`Acesso ${perfil === 'inspetor' ? 'Inspetor' : perfil === 'gerente' ? 'Gerente' : 'Personalizado'} criado para ${email.trim()}.`);
      setEmail('');
      setSenha('');
      setFormAberto(false);
      setUsuarios(lista);
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

  function abrirPermissoes(u: SubUsuario) {
    setEditandoPermissoes(u.id);
    setPermissoesEdicao(carregarPermissoes(u.id) ?? (u.papel === 'gerente' ? PRESET_GERENTE : PRESET_INSPETOR));
  }

  async function salvarPermissoesEdicao() {
    if (!editandoPermissoes) return;
    await salvarPermissoes(editandoPermissoes, permissoesEdicao);
    setEditandoPermissoes(null);
    setAviso('Permissões atualizadas. O usuário verá o novo menu no próximo login.');
  }

  return (
    <div className="cad-page">
      <p style={{ color: 'var(--text-muted)', marginBottom: 18 }}>
        Crie logins para sua equipe e marque o que cada um pode acessar. Acessos de <b>cliente</b>{' '}
        (portal somente-leitura) são criados na tela <b>Clientes</b>, dentro da empresa do cliente.
        Todos os papéis têm sessão única: a mesma conta não abre em dois aparelhos ao mesmo tempo.
      </p>

      {erro && <p style={{ color: 'var(--crit)', fontWeight: 600 }}>{erro}</p>}
      {aviso && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{aviso}</p>}

      {/* ── Formulário (só quando aberto) ── */}
      {formAberto && (
        <div className="bloco-dados" style={{ marginBottom: 20 }}>
          <h3><Icone nome="userplus" tam={15} style={{ display: 'inline-block', verticalAlign: -2 }} /> Cadastrar novo acesso</h3>

          <div className="acesso-perfis">
            {(Object.keys(PRESETS) as Perfil[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`acesso-perfil-card${perfil === p ? ' ativo' : ''}`}
                onClick={() => escolherPerfil(p)}
              >
                <span className="acesso-perfil-nome">
                  {p === 'gerente' ? 'Gerente' : p === 'inspetor' ? 'Inspetor' : 'Personalizado'}
                </span>
                <span className="acesso-perfil-desc">{PRESETS[p].descricao}</span>
              </button>
            ))}
            <button type="button" className="acesso-perfil-card" onClick={() => navigate('/empresas')}>
              <span className="acesso-perfil-nome">Cliente <Icone nome="arrowright" tam={12} style={{ display: 'inline-block', verticalAlign: -1 }} /></span>
              <span className="acesso-perfil-desc">Criado em Clientes → editar empresa → Acesso ao Portal.</span>
            </button>
          </div>

          <form onSubmit={handleCriar}>
            <div className="cad-grid" style={{ alignItems: 'end', marginBottom: 14 }}>
              <div className="cad-campo">
                <label>E-mail</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="acesso@suaequipe.com" />
              </div>
              <div className="cad-campo">
                <label>Senha (mín. 6)</label>
                <input type="text" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
              </div>
            </div>

            <div className="acesso-permissoes-label">O que este acesso pode ver e usar:</div>
            <div className="acesso-permissoes-grid">
              {MODULOS.map((m) => (
                <label key={m} className="acesso-permissao-opt">
                  <input
                    type="checkbox"
                    checked={modulos.includes(m)}
                    onChange={() => setModulos((l) => toggleModulo(l, m))}
                  />
                  {ROTULO_MODULO[m]}
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="submit" className="btn-primario" disabled={criando}>
                {criando ? 'Criando...' : 'Criar acesso'}
              </button>
              <button type="button" className="btn-secundario" onClick={() => { setFormAberto(false); setErro(null); }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Lista (tela inicial) ── */}
      <div className="bloco-dados">
        {/* Abas: acessos da equipe (gerente/inspetor) × acessos de clientes (portal). */}
        <div className="acesso-abas">
          <button
            type="button"
            className={`acesso-aba${aba === 'equipe' ? ' ativa' : ''}`}
            onClick={() => setAba('equipe')}
          >
            Equipe ({equipe.length})
          </button>
          <button
            type="button"
            className={`acesso-aba${aba === 'clientes' ? ' ativa' : ''}`}
            onClick={() => setAba('clientes')}
          >
            Clientes ({clientesLogins.length})
          </button>
        </div>

        <div className="meta-card-header" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, border: 'none', padding: 0 }}>
            {aba === 'equipe' ? `Acessos da equipe (${equipe.length})` : `Acessos de clientes (${clientesLogins.length})`}
          </h3>
          {aba === 'equipe' && !formAberto && (
            <button type="button" className="btn-primario" onClick={() => { setFormAberto(true); setAviso(null); }}>
              + Cadastrar novo acesso
            </button>
          )}
          {aba === 'clientes' && (
            <button type="button" className="btn-secundario" onClick={() => navigate('/empresas')}>
              Criar acesso em Clientes <Icone nome="arrowright" tam={12} style={{ display: 'inline-block', verticalAlign: -1 }} />
            </button>
          )}
        </div>

        {aba === 'clientes' && clientesLogins.length > 0 && (
          <div className="cad-campo" style={{ maxWidth: 340, marginBottom: 12 }}>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por e-mail ou empresa..."
              aria-label="Buscar acesso de cliente"
            />
          </div>
        )}

        {carregando ? (
          <p>Carregando...</p>
        ) : aba === 'equipe' && equipe.length === 0 ? (
          <div className="fj-empty">
            <div className="fj-empty-ic"><Icone nome="key" tam={22} /></div>
            <div className="fj-empty-title">Nenhum acesso criado ainda</div>
            Clique em "Cadastrar novo acesso" para criar o login do seu gerente ou inspetor.
          </div>
        ) : aba === 'clientes' && clientesLogins.length === 0 ? (
          <div className="fj-empty">
            <div className="fj-empty-ic"><Icone nome="key" tam={22} /></div>
            <div className="fj-empty-title">Nenhum acesso de cliente ainda</div>
            O login do cliente é criado em Clientes → editar a empresa → "Acesso ao Portal".
          </div>
        ) : aba === 'clientes' && clientesFiltrados.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Nenhum acesso de cliente encontrado para "{busca}".</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cad-tabela" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>E-mail</th>
                  {aba === 'equipe' ? <th>Papel</th> : <th>Empresa</th>}
                  <th>Último acesso</th>
                  <th>Última sincronização</th>
                  <th>Status</th>
                  <th>Sessão</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {(aba === 'equipe' ? equipe : clientesFiltrados).map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.email}</td>
                    <td>
                      {u.papel === 'cliente' ? (
                        nomesClientes.get(u.cliente_id ?? '') || ROTULO_PAPEL.cliente
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
                          <option value="funcionario">Inspetor</option>
                          <option value="gerente">Gerente</option>
                        </select>
                      )}
                    </td>
                    <td><CarimboTempo iso={u.ultimo_acesso ?? null} rotulo="Último acesso" vazio="Nunca acessou" /></td>
                    <td><CarimboTempo iso={u.ultima_sync ?? null} rotulo="Sincronizou" vazio="Nunca sincronizou" /></td>
                    <td>
                      {u.ativo ? <span className="fj-badge ok">Liberado</span> : <span className="fj-badge crit">Bloqueado</span>}
                    </td>
                    <td>
                      {u.sessao_ativa ? <span className="fj-badge warn">Em uso</span> : <span className="fj-badge neutro">Livre</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {u.papel !== 'cliente' && (
                          <button type="button" className="btn-secundario" title="Permissões" onClick={() => abrirPermissoes(u)}>
                            <Icone nome="sliders" tam={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secundario"
                          title="Resetar senha"
                          onClick={() => {
                            const nova = window.prompt(`Nova senha para ${u.email} (mín. 6):`);
                            if (nova && nova.length >= 6) void acao(() => resetarSenhaSub(u.id, nova), 'Senha atualizada.');
                          }}
                        >
                          <Icone nome="key" tam={13} />
                        </button>
                        <button
                          type="button"
                          className="btn-secundario"
                          title={u.ativo ? 'Bloquear' : 'Liberar'}
                          onClick={() => acao(() => definirAtivoSub(u.id, !u.ativo), u.ativo ? 'Acesso bloqueado.' : 'Acesso liberado.')}
                        >
                          <Icone nome="shield" tam={13} />
                        </button>
                        <button
                          type="button"
                          className="btn-secundario"
                          title="Excluir"
                          onClick={() => {
                            if (window.confirm(`Excluir o acesso de ${u.email}? Essa ação não tem volta.`))
                              void acao(async () => {
                                await excluirSub(u.id);
                                await excluirPermissoes(u.id);
                              }, 'Acesso excluído.');
                          }}
                        >
                          <Icone nome="trash" tam={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="btn-secundario" style={{ marginTop: 10 }} onClick={() => void recarregar()}>
          <Icone nome="refresh" tam={12} style={{ display: 'inline-block', verticalAlign: -2 }} /> Atualizar lista
        </button>
      </div>

      {/* ── Modal de permissões ── */}
      {editandoPermissoes && (
        <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditandoPermissoes(null)}>
          <div className="fj-modal-box" style={{ maxWidth: 520 }}>
            <div className="fj-modal-head">
              <div>
                <div className="fj-eyebrow">Permissões</div>
                <h2>{usuarios.find((u) => u.id === editandoPermissoes)?.email}</h2>
              </div>
              <button type="button" className="fj-modal-close" onClick={() => setEditandoPermissoes(null)} aria-label="Fechar">
                <Icone nome="x" tam={15} />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <div className="acesso-permissoes-grid">
                {MODULOS.map((m) => (
                  <label key={m} className="acesso-permissao-opt">
                    <input
                      type="checkbox"
                      checked={permissoesEdicao.includes(m)}
                      onChange={() => setPermissoesEdicao((l) => toggleModulo(l, m))}
                    />
                    {ROTULO_MODULO[m]}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button type="button" className="btn-primario" onClick={salvarPermissoesEdicao}>
                  Salvar permissões
                </button>
                <button type="button" className="btn-secundario" onClick={() => setEditandoPermissoes(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
