import { useState } from 'react';
import { Icone } from '../components/Icone';
import { listarClientes, salvarCliente, excluirCliente } from '../features/cadastros/cadastroService';
import type { Cliente } from '../features/cadastros/tipos';
import { criarAcessoCliente, excluirSub, listarSubUsuarios, resetarSenhaSub, type SubUsuario } from '../services/orgAdmin';
import { isMestre } from '../services/auth';
import { excluirPermissoes } from '../services/permissoes';
import { buscarEmpresas, faviconDe, urlMapaEmbed, GOOGLE_MAPS_KEY, type ResultadoPlace } from '../services/googlePlaces';
import './cadastros.css';

type Tela = 'lista' | 'formulario' | 'detalhe';

const VAZIO: Omit<Cliente, 'id'> = {
  razaoSocial: '', nomeFantasia: '', cnpj: '', atividade: '',
  endereco: '', bairro: '', cidade: '', estado: '', cep: '',
  telefone: '', email: '', contato: '',
};

/** Logo do cliente: favicon salvo, ou derivado do website, ou vazio (inicial no fallback). */
function logoDe(c: Cliente): string {
  return c.logoUrl || (c.website ? faviconDe(c.website) : '');
}

function LogoCliente({ cliente, tam = 48 }: { cliente: Cliente; tam?: number }) {
  const [erro, setErro] = useState(false);
  const url = logoDe(cliente);
  return (
    <div className="cad-item-foto" style={{ width: tam, height: tam }}>
      {url && !erro ? (
        <img src={url} alt={cliente.razaoSocial} onError={() => setErro(true)} style={{ objectFit: 'contain', background: '#fff', padding: 6, boxSizing: 'border-box' }} />
      ) : (
        <span className="cad-sem-foto">{(cliente.nomeFantasia || cliente.razaoSocial).slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

export default function Empresas() {
  const [tela, setTela] = useState<Tela>('lista');
  const [clientes, setClientes] = useState<Cliente[]>(() => listarClientes());
  const [form, setForm] = useState<Cliente>({ id: '', ...VAZIO });
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [editandoExistente, setEditandoExistente] = useState(false);
  const [clienteDet, setClienteDet] = useState<Cliente | null>(null);

  // Busca no Google Places (autofill do cadastro)
  const [buscaTexto, setBuscaTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoPlace[] | null>(null);
  const [buscaErro, setBuscaErro] = useState<string | null>(null);

  // Acesso ao portal do cliente (criado via Edge Function org_admin — só mestre)
  const [portalEmail, setPortalEmail] = useState('');
  const [portalSenha, setPortalSenha] = useState('');
  const [portalMsg, setPortalMsg] = useState<string | null>(null);
  const [criandoPortal, setCriandoPortal] = useState(false);

  // Logins reais do portal (detalhe; só mestre consegue listar via Edge Function)
  const [loginsPortal, setLoginsPortal] = useState<SubUsuario[] | null>(null);

  function set(chave: keyof Cliente, valor: string) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  function limparBusca() {
    setBuscaTexto('');
    setResultados(null);
    setBuscaErro(null);
  }

  function novoCliente() {
    setForm({ id: crypto.randomUUID(), ...VAZIO });
    setEditandoExistente(false);
    limparBusca();
    setPortalMsg(null);
    setTela('formulario');
  }

  function editarCliente(c: Cliente) {
    setForm({ ...c });
    setEditandoExistente(true);
    limparBusca();
    setPortalMsg(null);
    setTela('formulario');
  }

  function recarregarLoginsPortal(clienteId: string) {
    listarSubUsuarios()
      .then((subs) => setLoginsPortal(subs.filter((s) => s.papel === 'cliente' && s.cliente_id === clienteId)))
      .catch(() => setLoginsPortal(null)); // sem migração/offline: fica só o portalEmail gravado
  }

  function abrirDetalhe(c: Cliente) {
    setClienteDet(c);
    setLoginsPortal(null);
    setTela('detalhe');
    if (isMestre()) recarregarLoginsPortal(c.id);
  }

  async function resetarSenhaAcesso(login: SubUsuario) {
    const nova = window.prompt(`Nova senha para ${login.email} (mín. 6):`);
    if (!nova || nova.length < 6) return;
    try {
      await resetarSenhaSub(login.id, nova);
      window.alert('Senha atualizada.');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function excluirAcessoPortal(login: SubUsuario, cliente: Cliente) {
    if (!window.confirm(`Excluir o acesso de ${login.email}? Essa ação não tem volta. Os dados do cliente continuam salvos.`)) return;
    try {
      await excluirSub(login.id);
      await excluirPermissoes(login.id);
      if (cliente.portalEmail) {
        const atualizado = { ...cliente, portalEmail: undefined };
        salvarCliente(atualizado);
        setClientes(listarClientes());
        setClienteDet(atualizado);
      }
      recarregarLoginsPortal(cliente.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  function apagarLoginLegado(cliente: Cliente) {
    if (!window.confirm(`Remover o login "${cliente.portalEmail}" deste cliente?`)) return;
    const atualizado = { ...cliente, portalEmail: undefined };
    salvarCliente(atualizado);
    setClientes(listarClientes());
    setClienteDet(atualizado);
  }

  async function buscarNoGoogle() {
    const texto = buscaTexto.trim();
    if (!texto) return;
    setBuscando(true);
    setBuscaErro(null);
    setResultados(null);
    try {
      setResultados(await buscarEmpresas(texto));
    } catch (e) {
      setBuscaErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBuscando(false);
    }
  }

  function aplicarResultado(r: ResultadoPlace) {
    setForm((f) => ({
      ...f,
      razaoSocial: f.razaoSocial || r.nome,
      nomeFantasia: f.nomeFantasia || r.nome,
      endereco: r.endereco || r.enderecoCompleto,
      bairro: r.bairro,
      cidade: r.cidade,
      estado: r.estado,
      cep: r.cep,
      telefone: f.telefone || r.telefone,
      website: r.website,
      logoUrl: r.logoUrl,
      placeId: r.placeId,
      lat: r.lat,
      lng: r.lng,
    }));
    setResultados(null);
  }

  function salvar() {
    if (!form.razaoSocial.trim()) return;
    salvarCliente(form);
    setClientes(listarClientes());
    setTela('lista');
  }

  function excluir(id: string) {
    excluirCliente(id);
    setClientes(listarClientes());
    setConfirmarExcluir(null);
  }

  /* ── DETALHE ─────────────────────────────────────── */
  if (tela === 'detalhe' && clienteDet) {
    const c = clienteDet;
    const mapa = urlMapaEmbed(c);
    const enderecoCompleto = [c.endereco, c.bairro, c.cidade && `${c.cidade}${c.estado ? `/${c.estado}` : ''}`, c.cep]
      .filter(Boolean)
      .join(' — ');
    const emailsPortal = loginsPortal && loginsPortal.length > 0
      ? loginsPortal
      : null;
    return (
      <div className="cad-page">
        <div className="cad-page-header">
          <button type="button" className="btn-voltar" onClick={() => setTela('lista')}>
            ← Voltar
          </button>
          <button type="button" className="btn-secundario-sm" onClick={() => editarCliente(c)}>
            <Icone nome="pencil" tam={12} /> Editar
          </button>
        </div>

        <div className="cad-card">
          <div className="cli-det-header">
            <LogoCliente cliente={c} tam={64} />
            <div style={{ minWidth: 0 }}>
              <h2 className="cad-page-titulo" style={{ marginBottom: 2 }}>{c.razaoSocial}</h2>
              {c.nomeFantasia && c.nomeFantasia !== c.razaoSocial && <div className="cad-item-sub">{c.nomeFantasia}</div>}
              {c.website && (
                <a className="cli-det-site" href={c.website} target="_blank" rel="noreferrer">
                  {c.website}
                </a>
              )}
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 20 }}>Dados da Empresa</div>
          <div className="cli-det-grid">
            <div><span>CNPJ</span><strong>{c.cnpj || '—'}</strong></div>
            <div><span>Atividade</span><strong>{c.atividade || '—'}</strong></div>
            <div><span>Telefone</span><strong>{c.telefone || '—'}</strong></div>
            <div><span>E-mail</span><strong>{c.email || '—'}</strong></div>
            <div><span>Representante / Contato</span><strong>{c.contato || '—'}</strong></div>
            <div className="cli-det-full"><span>Endereço completo</span><strong>{enderecoCompleto || '—'}</strong></div>
            {c.anotacoes && (
              <div className="cli-det-full"><span>Anotações</span><strong style={{ whiteSpace: 'pre-wrap', fontWeight: 400 }}>{c.anotacoes}</strong></div>
            )}
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 20 }}>Acesso ao Portal do Cliente</div>
          {emailsPortal ? (
            <div className="cli-det-portal">
              {emailsPortal.map((s) => (
                <div key={s.id} className="cli-det-portal-item ativo">
                  <Icone nome="key" tam={14} />
                  <strong style={{ color: '#1e3a8a' }}>{s.email}</strong>
                  <span className={`badge-func-tipo ${s.ativo ? 'tec' : ''}`}>{s.ativo ? 'Ativo' : 'Desativado'}</span>
                  {s.ultimo_acesso && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Último acesso: {new Date(s.ultimo_acesso).toLocaleString('pt-BR')}</span>}
                  {isMestre() && (
                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                      <button type="button" className="btn-secundario-sm" title="Trocar senha" onClick={() => resetarSenhaAcesso(s)}>
                        <Icone nome="key" tam={12} />
                      </button>
                      <button type="button" className="btn-danger-sm" title="Excluir acesso" onClick={() => excluirAcessoPortal(s, c)}>
                        <Icone nome="trash" tam={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : c.portalEmail ? (
            <div className="cli-det-portal">
              <div className="cli-det-portal-item ativo">
                <Icone nome="key" tam={14} />
                <strong style={{ color: '#1e3a8a' }}>{c.portalEmail}</strong>
                <span className="badge-func-tipo tec">Login do portal</span>
                {isMestre() && (
                  <button type="button" className="btn-danger-sm" title="Remover login" style={{ marginLeft: 'auto' }} onClick={() => apagarLoginLegado(c)}>
                    <Icone nome="trash" tam={12} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="cli-det-portal">
              <div className="cli-det-portal-item">
                <Icone nome="key" tam={14} />
                <span>Sem acesso criado.</span>
                {isMestre() && (
                  <button type="button" className="btn-secundario-sm" onClick={() => editarCliente(c)}>
                    Criar acesso
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="cad-secao-titulo" style={{ marginTop: 20 }}>Localização</div>
          {mapa ? (
            <div className="cli-det-mapa">
              <iframe
                src={mapa}
                title={`Mapa — ${c.razaoSocial}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          ) : (
            <p className="cad-page-sub">
              {GOOGLE_MAPS_KEY ? 'Sem endereço cadastrado para exibir o mapa.' : 'Configure VITE_GOOGLE_MAPS_KEY para exibir o mapa.'}
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ── FORMULÁRIO ──────────────────────────────────── */
  if (tela === 'formulario') {
    return (
      <div className="cad-page">
        <div className="cad-page-header">
          <button type="button" className="btn-voltar" onClick={() => setTela('lista')}>
            ← Voltar
          </button>
          <h2 className="cad-page-titulo">{editandoExistente ? 'Editar Empresa' : 'Nova Empresa'}</h2>
        </div>

        <div className="cad-card">
          {GOOGLE_MAPS_KEY && (
            <>
              <div className="cad-secao-titulo">Buscar empresa no Google</div>
              <div className="cli-busca-row">
                <input
                  type="text"
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscarNoGoogle()}
                  placeholder="Nome da empresa e cidade — ex.: ES Engenharia Vitória"
                />
                <button type="button" className="btn-primario" disabled={buscando} onClick={buscarNoGoogle}>
                  <Icone nome="search" tam={13} /> {buscando ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
              {buscaErro && <p className="cli-busca-erro">{buscaErro}</p>}
              {resultados && resultados.length === 0 && <p className="cad-page-sub" style={{ marginTop: 8 }}>Nenhum resultado.</p>}
              {resultados && resultados.length > 0 && (
                <div className="cli-busca-resultados">
                  {resultados.map((r) => (
                    <button type="button" key={r.placeId} className="cli-busca-item" onClick={() => aplicarResultado(r)}>
                      {r.logoUrl ? (
                        <img src={r.logoUrl} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                      ) : (
                        <span className="cad-sem-foto" style={{ width: 28, height: 28, borderRadius: 6, fontSize: 13 }}>{r.nome.slice(0, 1)}</span>
                      )}
                      <span className="cli-busca-item-txt">
                        <strong>{r.nome}</strong>
                        <span>{r.enderecoCompleto}</span>
                      </span>
                      <span className="cli-busca-usar">Usar dados →</span>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ marginBottom: 20 }} />
            </>
          )}

          <div className="cad-secao-titulo">Identificação</div>
          <div className="cad-grid">
            <div className="cad-campo cad-full">
              <label>Razão Social *</label>
              <input
                type="text"
                value={form.razaoSocial}
                onChange={(e) => set('razaoSocial', e.target.value)}
                placeholder="Razão Social da empresa"
              />
            </div>
            <div className="cad-campo">
              <label>Nome Fantasia</label>
              <input type="text" value={form.nomeFantasia} onChange={(e) => set('nomeFantasia', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>CNPJ</label>
              <input type="text" value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div className="cad-campo">
              <label>Atividade Principal</label>
              <input type="text" value={form.atividade} onChange={(e) => set('atividade', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>Site</label>
              <input
                type="text"
                value={form.website ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value, logoUrl: faviconDe(e.target.value) }))}
                placeholder="https://empresa.com.br"
              />
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Contato</div>
          <div className="cad-grid">
            <div className="cad-campo">
              <label>Pessoa de Contato / Representante</label>
              <input type="text" value={form.contato} onChange={(e) => set('contato', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>Telefone</label>
              <input type="text" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="cad-campo">
              <label>E-mail</label>
              <input type="text" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Endereço</div>
          <div className="cad-grid">
            <div className="cad-campo cad-full">
              <label>Endereço</label>
              <input type="text" value={form.endereco} onChange={(e) => set('endereco', e.target.value)} placeholder="Rua, número, complemento" />
            </div>
            <div className="cad-campo">
              <label>Bairro</label>
              <input type="text" value={form.bairro} onChange={(e) => set('bairro', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>CEP</label>
              <input type="text" value={form.cep} onChange={(e) => set('cep', e.target.value)} placeholder="00000-000" />
            </div>
            <div className="cad-campo">
              <label>Cidade</label>
              <input type="text" value={form.cidade} onChange={(e) => set('cidade', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>Estado</label>
              <input type="text" value={form.estado} onChange={(e) => set('estado', e.target.value)} maxLength={2} placeholder="UF" />
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Anotações</div>
          <div className="cad-campo">
            <textarea
              className="cli-anotacoes"
              value={form.anotacoes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, anotacoes: e.target.value }))}
              placeholder="Observações internas sobre este cliente (horários, portaria, contatos extras...)"
              rows={4}
            />
          </div>

          {editandoExistente && isMestre() && (
            <>
              <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Acesso ao Portal do Cliente</div>
              <p className="cad-page-sub" style={{ marginBottom: 10 }}>
                Crie um login para esta empresa acompanhar os próprios equipamentos e documentos num
                portal somente-leitura. Requer a migração de controle de acesso aplicada no banco.
              </p>
              {form.portalEmail && (
                <p style={{ fontSize: 13, marginBottom: 10 }}>
                  Login já criado: <strong>{form.portalEmail}</strong>
                </p>
              )}
              <div className="cad-grid" style={{ alignItems: 'end' }}>
                <div className="cad-campo">
                  <label>E-mail de acesso</label>
                  <input type="email" value={portalEmail} onChange={(e) => setPortalEmail(e.target.value)} placeholder="cliente@empresa.com" />
                </div>
                <div className="cad-campo">
                  <label>Senha (mín. 6)</label>
                  <input type="text" value={portalSenha} onChange={(e) => setPortalSenha(e.target.value)} />
                </div>
                <button
                  type="button"
                  className="btn-secundario"
                  disabled={criandoPortal}
                  onClick={async () => {
                    setPortalMsg(null);
                    if (!portalEmail.trim() || portalSenha.length < 6) {
                      setPortalMsg('Informe e-mail e senha com pelo menos 6 caracteres.');
                      return;
                    }
                    setCriandoPortal(true);
                    try {
                      const email = portalEmail.trim();
                      await criarAcessoCliente(email, portalSenha, form.id);
                      // Grava o login no cliente para ficar visível no detalhe (a qualquer usuário)
                      const atualizado = { ...form, portalEmail: email };
                      salvarCliente(atualizado);
                      setForm(atualizado);
                      setClientes(listarClientes());
                      setPortalMsg(`Acesso do portal criado para ${email}.`);
                      setPortalEmail('');
                      setPortalSenha('');
                    } catch (er) {
                      setPortalMsg(er instanceof Error ? er.message : String(er));
                    } finally {
                      setCriandoPortal(false);
                    }
                  }}
                >
                  {criandoPortal ? 'Criando...' : 'Criar acesso do cliente'}
                </button>
              </div>
              {portalMsg && <p style={{ marginTop: 8, fontWeight: 600 }}>{portalMsg}</p>}
            </>
          )}

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button type="button" className="btn-primario" onClick={salvar}>
              Salvar
            </button>
            <button type="button" className="btn-secundario" onClick={() => setTela('lista')}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── LISTA ───────────────────────────────────────── */
  return (
    <div className="cad-page">
      <div className="cad-page-header">
        <div>
          <h2 className="cad-page-titulo">Empresas Cadastradas</h2>
          <p className="cad-page-sub">
            {clientes.length} empresa{clientes.length !== 1 ? 's' : ''} cadastrada{clientes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button type="button" className="btn-primario" onClick={novoCliente}>
          + Nova Empresa
        </button>
      </div>

      {clientes.length === 0 ? (
        <div className="cad-vazio">
          <div>Nenhuma empresa cadastrada ainda.</div>
          <div className="cad-vazio-sub">Cadastre empresas clientes para selecionar rapidamente nos equipamentos.</div>
        </div>
      ) : (
        <div className="cad-lista">
          {clientes.map((c) => (
            <div
              key={c.id}
              className="cad-item-card cli-card-clicavel"
              role="button"
              tabIndex={0}
              onClick={() => abrirDetalhe(c)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && abrirDetalhe(c)}
            >
              <LogoCliente cliente={c} />
              <div className="cad-item-info">
                <div className="cad-item-nome">{c.razaoSocial}</div>
                {c.website ? (
                  <div className="cli-card-site">{c.website}</div>
                ) : (
                  c.nomeFantasia && <div className="cad-item-sub">{c.nomeFantasia}</div>
                )}
                <div className="cad-item-meta">
                  {c.cnpj && <span>CNPJ: {c.cnpj}</span>}
                  {c.telefone && <span>{c.telefone}</span>}
                  {(c.endereco || c.cidade) && (
                    <span>
                      {[c.endereco, c.cidade && `${c.cidade}${c.estado ? `/${c.estado}` : ''}`].filter(Boolean).join(' — ')}
                    </span>
                  )}
                  {c.contato && <span>Contato: {c.contato}</span>}
                  {c.portalEmail && (
                    <span>
                      Portal: <strong style={{ color: '#1e3a8a' }}>{c.portalEmail}</strong>
                    </span>
                  )}
                </div>
              </div>
              <div className="cad-item-acoes" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn-editar-pencil" onClick={() => editarCliente(c)} title="Editar">
                  <Icone nome="pencil" tam={14} />
                </button>
                {confirmarExcluir === c.id ? (
                  <>
                    <button type="button" className="btn-danger-sm" onClick={() => excluir(c.id)}>
                      Confirmar
                    </button>
                    <button
                      type="button"
                      className="btn-secundario-sm"
                      onClick={() => setConfirmarExcluir(null)}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-danger-sm"
                    onClick={() => setConfirmarExcluir(c.id)}
                  >
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
