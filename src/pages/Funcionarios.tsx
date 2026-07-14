import { useState } from 'react';
import { Icone } from '../components/Icone';
import { listarFuncionarios, salvarFuncionario, excluirFuncionario } from '../features/cadastros/cadastroService';
import type { Funcionario } from '../features/cadastros/tipos';
import { PAGINAS_PRONTUARIO } from '../features/prontuarios/tipos';
import { DOCUMENTOS_DISPONIVEIS } from '../features/relatorios/tipos';
import { comprimirImagem, processarAssinatura } from '../services/imagem';
import './cadastros.css';

type Tela = 'lista' | 'formulario';

// Rótulos amigáveis das 6 folhas do prontuário (PAGINAS_PRONTUARIO) — motor de assinatura.
const ROTULOS_PRONTUARIO: Record<string, string> = {
  'PRONT-ULTRASSOM.html': 'Medição de Espessura (folha 1)',
  'PRONT-CROQUI2D.html': 'Croqui Detalhado (folha 2)',
  'PRONT-FOLHA-DADOS.html': 'Folha de Dados / Anexo Técnico (folha 3)',
  'PRONT-PRONTUARIO.html': 'Prontuário — Dados Construtivos (folha 4)',
  'PRONT-CONTINUACAO.html': 'Continuação — Procedimentos (folha 5)',
  'PRONT-MEMORIAL.html': 'Resumo do Memorial (folha 6)',
};

// Rótulos dos documentos do relatório (mesmos nomes exibidos no Modal de Nova Inspeção).
const ROTULOS_RELATORIO: Record<string, string> = {
  'CAPA.html': 'Capa',
  'SUMARIO.html': 'Sumário',
  'PLACA.html': 'Placa de Identificação',
  'CLASSIFICACAO-RISCO.html': 'Caracterização (Classificação de Risco)',
  'PRONTUARIO.html': 'Prontuário',
  'RESUMO-MEMORIAL.html': 'Resumo do Memorial',
  'MEMORIAL.html': 'Memorial de Cálculo (folhas automáticas)',
  'INSPECOES.html': 'Inspeções',
  'VERIFICACAO-DOCUMENTACAO.html': 'Verificação de Documentação',
  'checklist2.html': 'Checklist 2',
  'checklist3.html': 'Checklist 3',
  'VISUAL-EXTERNO.html': 'Inspeção Visual Externa',
  'VISUAL-INTERNO.html': 'Inspeção Visual Interna',
  'CONCLUSAO.html': 'Conclusão',
  'ULTRASSOM.html': 'Laudo de Ultrassom',
  'TESTE-HIDROSTATICO.html': 'Teste Hidrostático',
  'LIVRO-REGISTRO.html': 'Livro de Registro de Segurança (NR-13)',
};

// Regra padrão do motor de assinatura (também aplicada a dados antigos sem o campo):
// Engenheiro assina todas as folhas; Inspetor nenhuma.
function defaultFolhasProntuario(tipo: Funcionario['tipo']): string[] {
  return tipo === 'Engenheiro' ? [...PAGINAS_PRONTUARIO] : [];
}

function defaultFolhasRelatorio(tipo: Funcionario['tipo']): string[] {
  return tipo === 'Engenheiro' ? [...DOCUMENTOS_DISPONIVEIS] : [];
}

const VAZIO: Omit<Funcionario, 'id'> = {
  nome: '', crea: '', tipo: 'Engenheiro', assinatura: '', funcao: '',
};

export default function Funcionarios() {
  const [tela, setTela] = useState<Tela>('lista');
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>(() => listarFuncionarios());
  const [form, setForm] = useState<Funcionario>({ id: '', ...VAZIO });
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [editandoExistente, setEditandoExistente] = useState(false);
  // Enquanto o usuário não mexer nos checkboxes, trocar o Tipo re-aplica a regra padrão de folhas.
  const [folhasTocadas, setFolhasTocadas] = useState(false);

  function set<K extends keyof Funcionario>(chave: K, valor: Funcionario[K]) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  function novoFuncionario() {
    setForm({
      id: crypto.randomUUID(),
      ...VAZIO,
      camposExtras: [],
      folhasProntuario: defaultFolhasProntuario(VAZIO.tipo),
      folhasRelatorio: defaultFolhasRelatorio(VAZIO.tipo),
    });
    setEditandoExistente(false);
    setFolhasTocadas(false);
    setTela('formulario');
  }

  function editarFuncionario(f: Funcionario) {
    // Dado antigo sem os campos novos: aplica a regra padrão já refletida nos checkboxes.
    setForm({
      ...f,
      funcao: f.funcao ?? '',
      camposExtras: (f.camposExtras ?? []).map((c) => ({ ...c })),
      folhasProntuario: f.folhasProntuario ?? defaultFolhasProntuario(f.tipo),
      folhasRelatorio: f.folhasRelatorio ?? defaultFolhasRelatorio(f.tipo),
    });
    setEditandoExistente(true);
    // Se já havia escolha salva, trocar o Tipo não pode sobrescrever a seleção.
    setFolhasTocadas(Boolean(f.folhasProntuario || f.folhasRelatorio));
    setTela('formulario');
  }

  function mudarTipo(tipo: Funcionario['tipo']) {
    setForm((f) => ({
      ...f,
      tipo,
      ...(folhasTocadas
        ? {}
        : { folhasProntuario: defaultFolhasProntuario(tipo), folhasRelatorio: defaultFolhasRelatorio(tipo) }),
    }));
  }

  // ── Informações adicionais do assinante (pares rótulo+valor) ──
  function addCampoExtra() {
    setForm((f) => ({ ...f, camposExtras: [...(f.camposExtras ?? []), { rotulo: '', valor: '' }] }));
  }

  function setCampoExtra(indice: number, chave: 'rotulo' | 'valor', valor: string) {
    setForm((f) => ({
      ...f,
      camposExtras: (f.camposExtras ?? []).map((c, i) => (i === indice ? { ...c, [chave]: valor } : c)),
    }));
  }

  function removerCampoExtra(indice: number) {
    setForm((f) => ({ ...f, camposExtras: (f.camposExtras ?? []).filter((_, i) => i !== indice) }));
  }

  // ── Folhas que o profissional assina (prontuário / relatório) ──
  type CampoFolhas = 'folhasProntuario' | 'folhasRelatorio';

  function toggleFolha(campo: CampoFolhas, arquivo: string) {
    setFolhasTocadas(true);
    setForm((f) => {
      const atual = f[campo] ?? [];
      return {
        ...f,
        [campo]: atual.includes(arquivo) ? atual.filter((a) => a !== arquivo) : [...atual, arquivo],
      };
    });
  }

  function marcarTodasFolhas(campo: CampoFolhas, lista: readonly string[]) {
    setFolhasTocadas(true);
    setForm((f) => ({ ...f, [campo]: [...lista] }));
  }

  function desmarcarTodasFolhas(campo: CampoFolhas) {
    setFolhasTocadas(true);
    setForm((f) => ({ ...f, [campo]: [] }));
  }

  async function handleAssinatura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Assinatura passa por tratamento próprio: remove o fundo (branco/preto/foto) e gera PNG
    // transparente — JPEG (comprimirImagem) mata a transparência e vira quadrado preto na folha.
    try {
      set('assinatura', await processarAssinatura(file));
    } catch {
      try {
        set('assinatura', await comprimirImagem(file, 400));
      } catch {
        const reader = new FileReader();
        reader.onload = (ev) => set('assinatura', ev.target?.result as string);
        reader.readAsDataURL(file);
      }
    }
  }

  function salvar() {
    if (!form.nome.trim()) return;
    // Descarta itens com rótulo E valor vazios; "Função" vazia fica vazia (folhas terão fallback).
    salvarFuncionario({
      ...form,
      funcao: form.funcao?.trim() ?? '',
      camposExtras: (form.camposExtras ?? []).filter((c) => c.rotulo.trim() !== '' || c.valor.trim() !== ''),
    });
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
              <label>Tipo</label>
              <select value={form.tipo} onChange={(e) => mudarTipo(e.target.value as Funcionario['tipo'])}>
                <option value="Engenheiro">Engenheiro (assina o laudo)</option>
                <option value="Inspetor">Inspetor (executa o ensaio)</option>
              </select>
            </div>
            <div className="cad-campo cad-full">
              <label>Função (exibida na assinatura)</label>
              <input
                type="text"
                value={form.funcao ?? ''}
                onChange={(e) => set('funcao', e.target.value)}
                placeholder="Ex.: Engenheiro Mecânico"
              />
            </div>
          </div>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Informações adicionais do assinante</div>
          {(form.camposExtras ?? []).map((campo, i) => (
            <div key={i} className="cad-extra-row">
              <input
                type="text"
                value={campo.rotulo}
                onChange={(e) => setCampoExtra(i, 'rotulo', e.target.value)}
                placeholder="Nome do campo (ex.: Certificação)"
              />
              <input
                type="text"
                value={campo.valor}
                onChange={(e) => setCampoExtra(i, 'valor', e.target.value)}
                placeholder="Valor (ex.: SNQC 12345)"
              />
              <button type="button" className="btn-danger-sm" onClick={() => removerCampoExtra(i)}>
                Remover
              </button>
            </div>
          ))}
          <button type="button" className="cad-upload-btn" onClick={addCampoExtra}>
            + Adicionar informação
          </button>

          <div className="cad-secao-titulo" style={{ marginTop: 24 }}>Folhas que este funcionário assina</div>
          <div className="cad-folhas-sub">
            <div className="cad-folhas-sub-header">
              <span className="cad-folhas-sub-titulo">Prontuário</span>
              <div className="cad-folhas-acoes">
                <button
                  type="button"
                  className="btn-secundario-sm"
                  onClick={() => marcarTodasFolhas('folhasProntuario', PAGINAS_PRONTUARIO)}
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  className="btn-secundario-sm"
                  onClick={() => desmarcarTodasFolhas('folhasProntuario')}
                >
                  Desmarcar todas
                </button>
              </div>
            </div>
            <div className="cad-check-grid">
              {PAGINAS_PRONTUARIO.map((arquivo) => (
                <label key={arquivo} className="cad-check-opt">
                  <input
                    type="checkbox"
                    checked={(form.folhasProntuario ?? []).includes(arquivo)}
                    onChange={() => toggleFolha('folhasProntuario', arquivo)}
                  />
                  {ROTULOS_PRONTUARIO[arquivo] ?? arquivo}
                </label>
              ))}
            </div>
          </div>
          <div className="cad-folhas-sub">
            <div className="cad-folhas-sub-header">
              <span className="cad-folhas-sub-titulo">Relatório</span>
              <div className="cad-folhas-acoes">
                <button
                  type="button"
                  className="btn-secundario-sm"
                  onClick={() => marcarTodasFolhas('folhasRelatorio', DOCUMENTOS_DISPONIVEIS)}
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  className="btn-secundario-sm"
                  onClick={() => desmarcarTodasFolhas('folhasRelatorio')}
                >
                  Desmarcar todas
                </button>
              </div>
            </div>
            <div className="cad-check-grid">
              {DOCUMENTOS_DISPONIVEIS.map((arquivo) => (
                <label key={arquivo} className="cad-check-opt">
                  <input
                    type="checkbox"
                    checked={(form.folhasRelatorio ?? []).includes(arquivo)}
                    onChange={() => toggleFolha('folhasRelatorio', arquivo)}
                  />
                  {ROTULOS_RELATORIO[arquivo] ?? arquivo}
                </label>
              ))}
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
                  <Icone nome="pencil" tam={14} />
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
