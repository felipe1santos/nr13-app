import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { listarClientes, salvarCliente } from '../features/cadastros/cadastroService';
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
  // Cobalto: a busca da barra vale também para a equipe (e-mail ou papel).
  const equipeFiltrada = termo
    ? equipe.filter((u) => (u.email ?? '').toLowerCase().includes(termo) || (u.papel ?? '').toLowerCase().includes(termo))
    : equipe;

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
    <div className="cad-page acesso-page-larga">

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
      <div className="bloco-dados acesso2">
        {/* Cobalto · barra do protótipo: título, busca, recorte e criar. */}
        {/* 21/11/2026: barra de UMA linha, igual às outras listas — sem título
            (a topbar já diz "Acessos"), recarregar à vista e o criar dentro dela. */}
        <div className="acesso2-cab">
          <label className="cad2-busca">
            <Icone nome="search" tam={15} />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={aba === 'equipe' ? 'Digite o e-mail de login...' : 'Buscar por e-mail ou empresa...'}
              aria-label="Buscar acesso"
            />
          </label>
          <div className="rel-chips" role="group" aria-label="Tipo de acesso">
            <button type="button" aria-pressed={aba === 'equipe'} onClick={() => setAba('equipe')}>
              Equipe <i>{equipe.length}</i>
            </button>
            <button type="button" aria-pressed={aba === 'clientes'} onClick={() => setAba('clientes')}>
              Clientes <i>{clientesLogins.length}</i>
            </button>
          </div>
          <span className="cad2-esp" />
          <button
            type="button"
            className="acesso2-atualizar"
            title="Atualizar lista"
            aria-label="Atualizar lista"
            onClick={() => void recarregar()}
          >
            <Icone nome="refresh" tam={16} />
          </button>
          {aba === 'equipe' && !formAberto && (
            <button type="button" className="lc-criar acesso2-novo" onClick={() => { setFormAberto(true); setAviso(null); }}>
              <Icone nome="plus" tam={18} /> Novo acesso
            </button>
          )}
          {aba === 'clientes' && (
            <button type="button" className="acesso2-ir" onClick={() => navigate('/empresas')}>
              Criar acesso em Clientes <Icone nome="arrowright" tam={12} style={{ display: 'inline-block', verticalAlign: -1 }} />
            </button>
          )}
        </div>

        {carregando ? (
          <p className="acesso2-carregando">Carregando…</p>
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
          <div className="cad-tabela-wrap">
            {/* O `overflow-x` do contêiner não segurava nada: sem `min-width: 0` o
                próprio div cresce com a tabela e quem estoura é a página. No celular
                a lista vira cartões (cadastros.css), com o rótulo de cada campo
                saindo do `data-rot`. */}
            <table className="cad-tabela acesso2-tabela" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>E-mail</th>
                  {aba === 'equipe' ? <th>Papel</th> : <th>Empresa</th>}
                  <th>Módulos</th>
                  <th>Último acesso</th>
                  <th>Última sincronização</th>
                  <th>Status</th>
                  <th>Sessão</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {(aba === 'equipe' ? equipeFiltrada : clientesFiltrados).map((u) => (
                  <tr key={u.id}>
                    <td className="cel-titulo" style={{ fontWeight: 600 }}>
                      {/* 21/11/2026: ícone de perfil à esquerda do e-mail. */}
                      <span className="acesso2-usuario">
                        <span className={`acesso2-av${u.papel === 'cliente' ? ' cliente' : ''}`} aria-hidden="true">
                          <Icone nome="user" tam={15} />
                        </span>
                        <span className="acesso2-email">{u.email}</span>
                      </span>
                    </td>
                    <td data-rot={aba === 'equipe' ? 'Papel' : 'Empresa'}>
                      {u.papel === 'cliente' ? (
                        <span
                          className="acesso-empresa-nome"
                          title={nomesClientes.get(u.cliente_id ?? '') || ROTULO_PAPEL.cliente}
                        >
                          {nomesClientes.get(u.cliente_id ?? '') || ROTULO_PAPEL.cliente}
                        </span>
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
                    {/* Cobalto · Módulos (protótipo): quantos módulos o login enxerga.
                        Cliente vê só o Portal. Sem restrição gravada = todos. */}
                    <td data-rot="Módulos">
                      {u.papel === 'cliente' ? (
                        <span className="acesso2-mod-txt">Só o Portal do Cliente</span>
                      ) : (
                        (() => {
                          const lib = carregarPermissoes(u.id);
                          const n = lib === null ? MODULOS.length : lib.length;
                          return n >= MODULOS.length ? (
                            <span className="acesso2-mod-txt"><b>Todos</b> os módulos</span>
                          ) : (
                            <span className="acesso2-mod">
                              <span className="trk"><i style={{ width: `${(n / MODULOS.length) * 100}%` }} /></span>
                              <b>{n}</b> de {MODULOS.length}
                            </span>
                          );
                        })()
                      )}
                    </td>
                    <td data-rot="Último acesso"><CarimboTempo iso={u.ultimo_acesso ?? null} rotulo="Último acesso" vazio="Nunca acessou" /></td>
                    <td data-rot="Sincronização"><CarimboTempo iso={u.ultima_sync ?? null} rotulo="Sincronizou" vazio="Nunca sincronizou" /></td>
                    <td data-rot="Status">
                      {u.ativo ? <span className="fj-badge ok">Liberado</span> : <span className="fj-badge crit">Bloqueado</span>}
                    </td>
                    <td data-rot="Sessão">
                      {u.sessao_ativa ? <span className="fj-badge warn">Em uso</span> : <span className="fj-badge neutro">Livre</span>}
                    </td>
                    <td className="cel-acoes">
                      <div className="acesso-acoes lc-acoes">
                        {u.papel !== 'cliente' && (
                          <button type="button" title="Permissões" aria-label={`Permissões de ${u.email}`} onClick={() => abrirPermissoes(u)}>
                            <Icone nome="sliders" tam={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Resetar senha"
                          aria-label={`Resetar a senha de ${u.email}`}
                          onClick={() => {
                            const nova = window.prompt(`Nova senha para ${u.email} (mín. 6):`);
                            if (nova && nova.length >= 6) void acao(() => resetarSenhaSub(u.id, nova), 'Senha atualizada.');
                          }}
                        >
                          <Icone nome="key" tam={13} />
                        </button>
                        <button
                          type="button"
                          title={u.ativo ? 'Bloquear' : 'Liberar'}
                          aria-label={`${u.ativo ? 'Bloquear' : 'Liberar'} ${u.email}`}
                          onClick={() => acao(() => definirAtivoSub(u.id, !u.ativo), u.ativo ? 'Acesso bloqueado.' : 'Acesso liberado.')}
                        >
                          <Icone nome="shield" tam={13} />
                        </button>
                        <button
                          type="button"
                          className="perigo"
                          title="Excluir"
                          aria-label={`Excluir o acesso de ${u.email}`}
                          onClick={() => {
                            if (window.confirm(`Excluir o acesso de ${u.email}? Essa ação não tem volta.`))
                              void acao(async () => {
                                await excluirSub(u.id);
                                await excluirPermissoes(u.id);
                                // Login excluído aqui não pode continuar aparecendo em Clientes (portalEmail é cache local).
                                if (u.papel === 'cliente' && u.cliente_id) {
                                  const cliente = listarClientes().find((c) => c.id === u.cliente_id);
                                  if (cliente?.portalEmail) salvarCliente({ ...cliente, portalEmail: undefined });
                                }
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
      </div>
      <p className="acesso2-nota">
        Crie logins para sua equipe e marque o que cada um pode acessar. Acessos de <b>cliente</b>{' '}
        (portal somente-leitura) são criados na tela <b>Clientes</b>, dentro da empresa do cliente.
        Todos os papéis têm sessão única: a mesma conta não abre em dois aparelhos ao mesmo tempo.
      </p>

      {/* ── Modal de permissões ── */}
      {editandoPermissoes && (
        // O fundo NAO fecha: as permissoes marcadas se perdiam. Ver
        // `modaisComEdicao.test.ts`.
        <div className="fj-modal-overlay">
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
