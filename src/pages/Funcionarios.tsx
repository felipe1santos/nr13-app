import { useState } from 'react';
import { listarFuncionarios, salvarFuncionario, excluirFuncionario } from '../features/cadastros/cadastroService';
import type { Funcionario } from '../features/cadastros/tipos';
import { comprimirImagem } from '../services/imagem';
import './cadastros.css';

type Tela = 'lista' | 'formulario';

const VAZIO: Omit<Funcionario, 'id'> = {
  nome: '', crea: '', tipo: 'Engenheiro', assinatura: '',
};

export default function Funcionarios() {
  const [tela, setTela] = useState<Tela>('lista');
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>(() => listarFuncionarios());
  const [form, setForm] = useState<Funcionario>({ id: '', ...VAZIO });
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [editandoExistente, setEditandoExistente] = useState(false);

  function set<K extends keyof Funcionario>(chave: K, valor: Funcionario[K]) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  function novoFuncionario() {
    setForm({ id: crypto.randomUUID(), ...VAZIO });
    setEditandoExistente(false);
    setTela('formulario');
  }

  function editarFuncionario(f: Funcionario) {
    setForm({ ...f });
    setEditandoExistente(true);
    setTela('formulario');
  }

  async function handleAssinatura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Comprime como as fotos/logo: assinatura em resolução cheia estoura a cota do localStorage.
    try {
      set('assinatura', await comprimirImagem(file, 400));
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => set('assinatura', ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  function salvar() {
    if (!form.nome.trim()) return;
    salvarFuncionario(form);
    setFuncionarios(listarFuncionarios());
    setTela('lista');
  }

  function excluir(id: string) {
    excluirFuncionario(id);
    setFuncionarios(listarFuncionarios());
    setConfirmarExcluir(null);
  }

  if (tela === 'formulario') {
    return (
      <div className="cad-page">
        <div className="cad-page-header">
          <button type="button" className="btn-voltar" onClick={() => setTela('lista')}>
            ← Voltar
          </button>
          <h2 className="cad-page-titulo">{editandoExistente ? 'Editar Profissional' : 'Novo Profissional'}</h2>
        </div>

        <div className="cad-card">
          <div className="cad-secao-titulo">Assinatura</div>
          <div className="cad-logo-area">
            {form.assinatura ? (
              <img src={form.assinatura} alt="Assinatura" className="cad-logo-preview" />
            ) : (
              <div className="cad-sem-logo">Sem assinatura</div>
            )}
            <div className="cad-logo-acoes">
              <label className="cad-upload-btn">
                {form.assinatura ? 'Trocar Assinatura' : 'Carregar Assinatura'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAssinatura} />
              </label>
              {form.assinatura && (
                <button type="button" className="btn-secundario" onClick={() => set('assinatura', '')}>
                  Remover
                </button>
              )}
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Identificação</div>
          <div className="cad-grid">
            <div className="cad-campo cad-full">
              <label>Nome *</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => set('nome', e.target.value)}
                placeholder="Nome completo do profissional"
              />
            </div>
            <div className="cad-campo">
              <label>CREA / Registro</label>
              <input type="text" value={form.crea} onChange={(e) => set('crea', e.target.value)} placeholder="CREA-UF 000000" />
            </div>
            <div className="cad-campo">
              <label>Função</label>
              <select value={form.tipo} onChange={(e) => set('tipo', e.target.value as Funcionario['tipo'])}>
                <option value="Engenheiro">Engenheiro (assina o laudo)</option>
                <option value="Inspetor">Inspetor (executa o ensaio)</option>
              </select>
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
            {funcionarios.length} profissional{funcionarios.length !== 1 ? 'is' : ''} cadastrado{funcionarios.length !== 1 ? 's' : ''} — assinam a documentação gerada
          </p>
        </div>
        <button type="button" className="btn-primario" onClick={novoFuncionario}>
          + Novo Profissional
        </button>
      </div>

      {funcionarios.length === 0 ? (
        <div className="cad-vazio">
          <div>Nenhum profissional cadastrado ainda.</div>
          <div className="cad-vazio-sub">Cadastre engenheiros e inspetores para selecionar a assinatura nos relatórios (ULTRASSOM, Teste Hidrostático).</div>
        </div>
      ) : (
        <div className="cad-lista">
          {funcionarios.map((f) => (
            <div key={f.id} className="cad-item-card">
              <div className="cad-item-info">
                <div className="cad-item-nome">{f.nome}</div>
                <div className="cad-item-meta">
                  <span>{f.tipo}</span>
                  {f.crea && <span>{f.crea}</span>}
                  <span>{f.assinatura ? 'Assinatura cadastrada' : 'Sem assinatura'}</span>
                </div>
              </div>
              <div className="cad-item-acoes">
                <button type="button" className="btn-editar-pencil" onClick={() => editarFuncionario(f)} title="Editar">
                  ✏️
                </button>
                {confirmarExcluir === f.id ? (
                  <>
                    <button type="button" className="btn-danger-sm" onClick={() => excluir(f.id)}>
                      Confirmar
                    </button>
                    <button type="button" className="btn-secundario-sm" onClick={() => setConfirmarExcluir(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-danger-sm" onClick={() => setConfirmarExcluir(f.id)}>
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
