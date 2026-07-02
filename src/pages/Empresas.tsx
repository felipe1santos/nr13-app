import { useState } from 'react';
import { listarClientes, salvarCliente, excluirCliente } from '../features/cadastros/cadastroService';
import type { Cliente } from '../features/cadastros/tipos';
import { criarAcessoCliente } from '../services/orgAdmin';
import { isMestre } from '../services/auth';
import './cadastros.css';

type Tela = 'lista' | 'formulario';

const VAZIO: Omit<Cliente, 'id'> = {
  razaoSocial: '', nomeFantasia: '', cnpj: '', atividade: '',
  endereco: '', bairro: '', cidade: '', estado: '', cep: '',
  telefone: '', email: '', contato: '',
};

export default function Empresas() {
  const [tela, setTela] = useState<Tela>('lista');
  const [clientes, setClientes] = useState<Cliente[]>(() => listarClientes());
  const [form, setForm] = useState<Cliente>({ id: '', ...VAZIO });
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [editandoExistente, setEditandoExistente] = useState(false);

  // Acesso ao portal do cliente (criado via Edge Function org_admin — só mestre)
  const [portalEmail, setPortalEmail] = useState('');
  const [portalSenha, setPortalSenha] = useState('');
  const [portalMsg, setPortalMsg] = useState<string | null>(null);
  const [criandoPortal, setCriandoPortal] = useState(false);

  function set(chave: keyof Cliente, valor: string) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  function novoCliente() {
    setForm({ id: crypto.randomUUID(), ...VAZIO });
    setEditandoExistente(false);
    setTela('formulario');
  }

  function editarCliente(c: Cliente) {
    setForm({ ...c });
    setEditandoExistente(true);
    setTela('formulario');
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
            <div className="cad-campo cad-full">
              <label>Atividade Principal</label>
              <input type="text" value={form.atividade} onChange={(e) => set('atividade', e.target.value)} />
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Contato</div>
          <div className="cad-grid">
            <div className="cad-campo">
              <label>Pessoa de Contato</label>
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

          {editandoExistente && isMestre() && (
            <>
              <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Acesso ao Portal do Cliente</div>
              <p className="cad-page-sub" style={{ marginBottom: 10 }}>
                Crie um login para esta empresa acompanhar os próprios equipamentos e documentos num
                portal somente-leitura. Requer a migração de controle de acesso aplicada no banco.
              </p>
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
                      await criarAcessoCliente(portalEmail.trim(), portalSenha, form.id);
                      setPortalMsg(`Acesso do portal criado para ${portalEmail.trim()}.`);
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
            <div key={c.id} className="cad-item-card">
              <div className="cad-item-info">
                <div className="cad-item-nome">{c.razaoSocial}</div>
                {c.nomeFantasia && <div className="cad-item-sub">{c.nomeFantasia}</div>}
                <div className="cad-item-meta">
                  {c.cnpj && <span>CNPJ: {c.cnpj}</span>}
                  {c.cidade && (
                    <span>
                      {c.cidade}
                      {c.estado ? `/${c.estado}` : ''}
                    </span>
                  )}
                  {c.telefone && <span>{c.telefone}</span>}
                  {c.email && <span>{c.email}</span>}
                  {c.contato && <span>Contato: {c.contato}</span>}
                </div>
              </div>
              <div className="cad-item-acoes">
                <button type="button" className="btn-editar-pencil" onClick={() => editarCliente(c)} title="Editar">
                  ✏️
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
