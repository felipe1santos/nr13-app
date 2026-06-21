import { useState } from 'react';
import { listarFuncionarios, salvarFuncionario, excluirFuncionario } from '../features/cadastros/cadastroService';
import type { Funcionario, TipoFuncionario } from '../features/cadastros/tipos';
import './cadastros.css';

type Tela = 'lista' | 'formulario';

const TIPOS: TipoFuncionario[] = ['Engenheiro PH', 'Inspetor Técnico'];

const VAZIO: Omit<Funcionario, 'id'> = {
  tipo: 'Engenheiro PH',
  nome: '', profissao: '', crea: '', registro: '',
  cpf: '', rg: '', endereco: '', bairro: '', cep: '',
  cidade: '', uf: '', telefone: '', email: '',
};

export default function Funcionarios() {
  const [tela, setTela] = useState<Tela>('lista');
  const [lista, setLista] = useState<Funcionario[]>(() => listarFuncionarios());
  const [form, setForm] = useState<Funcionario>({ id: '', ...VAZIO });
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [editandoExistente, setEditandoExistente] = useState(false);

  function set(chave: keyof Funcionario, valor: string) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  function novoFuncionario() {
    setForm({ id: crypto.randomUUID(), ...VAZIO });
    setEditandoExistente(false);
    setTela('formulario');
  }

  function editar(f: Funcionario) {
    setForm({ ...f });
    setEditandoExistente(true);
    setTela('formulario');
  }

  function handleImagem(chave: 'foto' | 'assinatura', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => set(chave, ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function salvar() {
    if (!form.nome.trim()) return;
    salvarFuncionario(form);
    setLista(listarFuncionarios());
    setTela('lista');
  }

  function excluir(id: string) {
    excluirFuncionario(id);
    setLista(listarFuncionarios());
    setConfirmarExcluir(null);
  }

  if (tela === 'formulario') {
    return (
      <div className="cad-page">
        <div className="cad-page-header">
          <button type="button" className="btn-voltar" onClick={() => setTela('lista')}>
            ← Voltar
          </button>
          <h2 className="cad-page-titulo">
            {editandoExistente ? 'Editar Funcionário' : 'Novo Funcionário'}
          </h2>
        </div>

        <div className="cad-card">
          <div className="cad-secao-titulo">Tipo de Responsável</div>
          <div className="cad-tipo-selector">
            {TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                className={`cad-tipo-btn${form.tipo === t ? ' ativo' : ''}`}
                onClick={() => set('tipo', t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Dados Pessoais</div>
          <div className="cad-grid">
            <div className="cad-campo cad-full">
              <label>Nome Completo *</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => set('nome', e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="cad-campo">
              <label>Profissão</label>
              <input type="text" value={form.profissao} onChange={(e) => set('profissao', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>CREA</label>
              <input type="text" value={form.crea} onChange={(e) => set('crea', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>Nº Registro</label>
              <input type="text" value={form.registro} onChange={(e) => set('registro', e.target.value)} />
            </div>
            <div className="cad-campo">
              <label>CPF</label>
              <input type="text" value={form.cpf} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div className="cad-campo">
              <label>RG</label>
              <input type="text" value={form.rg} onChange={(e) => set('rg', e.target.value)} />
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
              <label>UF</label>
              <input type="text" value={form.uf} onChange={(e) => set('uf', e.target.value)} maxLength={2} placeholder="UF" />
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Foto e Assinatura</div>
          <div className="cad-uploads-row">
            <div className="cad-upload-bloco">
              <div className="cad-upload-label">Foto</div>
              {form.foto ? (
                <img src={form.foto} alt="Foto" className="cad-foto-preview" />
              ) : (
                <div className="cad-img-placeholder cad-foto-preview">Sem foto</div>
              )}
              <label className="cad-upload-btn">
                {form.foto ? 'Trocar Foto' : 'Carregar Foto'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleImagem('foto', e)}
                />
              </label>
              {form.foto && (
                <button type="button" className="btn-secundario" onClick={() => set('foto', '')}>
                  Remover
                </button>
              )}
            </div>
            <div className="cad-upload-bloco">
              <div className="cad-upload-label">Assinatura / Rubrica</div>
              {form.assinatura ? (
                <img src={form.assinatura} alt="Assinatura" className="cad-assinatura-preview" />
              ) : (
                <div className="cad-img-placeholder cad-assinatura-preview">Sem assinatura</div>
              )}
              <label className="cad-upload-btn">
                {form.assinatura ? 'Trocar Assinatura' : 'Carregar Assinatura'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleImagem('assinatura', e)}
                />
              </label>
              {form.assinatura && (
                <button type="button" className="btn-secundario" onClick={() => set('assinatura', '')}>
                  Remover
                </button>
              )}
            </div>
          </div>

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
          <h2 className="cad-page-titulo">Funcionários</h2>
          <p className="cad-page-sub">
            {lista.length} funcionário{lista.length !== 1 ? 's' : ''} cadastrado{lista.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button type="button" className="btn-primario" onClick={novoFuncionario}>
          + Novo Funcionário
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="cad-vazio">
          <div>Nenhum funcionário cadastrado ainda.</div>
          <div className="cad-vazio-sub">Cadastre engenheiros e inspetores para usar nas documentações.</div>
        </div>
      ) : (
        <div className="cad-lista">
          {lista.map((f) => (
            <div key={f.id} className="cad-item-card">
              <div className="cad-item-foto">
                {f.foto ? (
                  <img src={f.foto} alt={f.nome} />
                ) : (
                  <div className="cad-sem-foto">{f.nome.charAt(0).toUpperCase()}</div>
                )}
              </div>
              <div className="cad-item-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div className="cad-item-nome">{f.nome}</div>
                  <span className={`badge-func-tipo ${f.tipo === 'Engenheiro PH' ? 'eng' : 'tec'}`}>
                    {f.tipo}
                  </span>
                </div>
                {f.profissao && <div className="cad-item-sub">{f.profissao}</div>}
                <div className="cad-item-meta">
                  {f.crea && <span>CREA: {f.crea}</span>}
                  {f.cpf && <span>CPF: {f.cpf}</span>}
                  {f.telefone && <span>{f.telefone}</span>}
                  {f.email && <span>{f.email}</span>}
                </div>
              </div>
              <div className="cad-item-acoes">
                <button type="button" className="btn-editar-pencil" onClick={() => editar(f)} title="Editar">
                  ✏️
                </button>
                {confirmarExcluir === f.id ? (
                  <>
                    <button type="button" className="btn-danger-sm" onClick={() => excluir(f.id)}>
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
                    onClick={() => setConfirmarExcluir(f.id)}
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
