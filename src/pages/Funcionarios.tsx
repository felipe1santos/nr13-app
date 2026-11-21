import { useState } from 'react';
import { Icone } from '../components/Icone';
import AvatarPessoa from '../features/cadastros/AvatarPessoa';
import ModalVerFuncionario from '../features/cadastros/ModalVerFuncionario';
import { listarFuncionarios, salvarFuncionario, excluirFuncionario } from '../features/cadastros/cadastroService';
import type { Funcionario } from '../features/cadastros/tipos';
import { PAGINAS_PRONTUARIO } from '../features/prontuarios/tipos';
import { FOLHAS_RELATORIO_ASSINAVEIS } from '../features/relatorios/tipos';
import { comprimirImagem, processarAssinaturaComBlob } from '../services/imagem';
import { paraGravar, ESCOPO_ASSINATURA } from '../services/identidadeVisual';
import './cadastros.css';
import { Ilustracao } from '../components/Ilustracao';

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

// Rótulos das folhas assináveis do relatório (capa e sumário nunca recebem carimbo).
const ROTULOS_RELATORIO: Record<string, string> = {
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
  return tipo === 'Engenheiro' ? [...FOLHAS_RELATORIO_ASSINAVEIS] : [];
}

const VAZIO: Omit<Funcionario, 'id'> = {
  nome: '', crea: '', tipo: 'Engenheiro', assinatura: '', funcao: '',
};

export default function Funcionarios() {
  const [tela, setTela] = useState<Tela>('lista');
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>(() => listarFuncionarios());
  // Cobalto: busca da barra (protótipo) — nome, função ou registro.
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<Funcionario>({ id: '', ...VAZIO });
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  /** O profissional aberto em LEITURA (botão do olho). `null` = nenhum. */
  const [vendo, setVendo] = useState<Funcionario | null>(null);
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
      // FASE 7B — gravação dupla (D-11): a dataURL continua na chave viva, e a
      // referência entra quando o servidor confirma o arquivo. Ver MinhaEmpresa
      // para o custo declarado da convivência.
      const { dataUrl, ref } = await paraGravar(await processarAssinaturaComBlob(file), ESCOPO_ASSINATURA);
      setForm((f) => ({ ...f, assinatura: dataUrl, ...(ref ? { assinaturaRef: ref } : {}) }));
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
              <label>E-mail</label>
              <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="nome@empresa.com.br" />
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
                  onClick={() => marcarTodasFolhas('folhasRelatorio', FOLHAS_RELATORIO_ASSINAVEIS)}
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
              {FOLHAS_RELATORIO_ASSINAVEIS.map((arquivo) => (
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
    <div className="cad-page cad2">
      {/* Cobalto: padrão de cadastro do SimplesDental — UM cartão com o título,
          a contagem e o botão de criar, e a lista em linhas. */}
      <section className="cad2-cartao">
      {/* 21/11/2026: barra de UMA linha, igual às outras listas — sem título
          (a topbar já diz "Equipe"); a contagem vai para o lado da busca. */}
      <div className="cad-page-header cad2-cab">
        <label className="cad2-busca">
          <Icone nome="search" tam={15} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite o nome, função ou registro..." aria-label="Buscar na equipe" />
        </label>
        <span className="lc-conta" title="Os profissionais assinam a documentação gerada">
          <b>{funcionarios.length}</b> profissiona{funcionarios.length !== 1 ? 'is' : 'l'}
        </span>
        <span className="cad2-esp" />
        <button type="button" className="lc-criar" onClick={novoFuncionario}>
          <Icone nome="plus" tam={18} /> Novo profissional
        </button>
      </div>

      {funcionarios.length === 0 ? (
        <div className="cad-vazio vz-centro">
          <Ilustracao nome="assinatura" largura={200} />
          <div>Nenhum profissional cadastrado ainda.</div>
          <div className="cad-vazio-sub">Cadastre engenheiros e inspetores para selecionar a assinatura nos relatórios (ULTRASSOM, Teste Hidrostático).</div>
        </div>
      ) : (
        <div className="cad-lista cad2-lista">
          <div className="cad2-linha cad2-cabcol" aria-hidden="true">
            <span>Nome</span>
            <span>Função</span>
            <span>Registro</span>
            <span>E-mail</span>
            <span>Assina</span>
            <span />
          </div>
          {funcionarios
            .filter((f) => {
              const t = busca.trim().toLowerCase();
              return !t || [f.nome, f.tipo, f.funcao, f.crea].some((v) => (v ?? '').toLowerCase().includes(t));
            })
            .map((f) => (
            <div key={f.id} className="cad-item-card cad2-linha">
              {/* AVATAR antes do nome. Sem foto no cadastro: iniciais, com cor
                  derivada do próprio nome — é o que faz achar alguém numa
                  lista. Ver `AvatarPessoa`. */}
              <div className="cad-item-pessoa">
              <AvatarPessoa nome={f.nome} />
              <div className="cad-item-info">
                <div className="cad-item-nome">{f.nome}</div>
                {f.funcao && <div className="cad2-funcao">{f.funcao}</div>}
              </div>
              </div>
              <span className={`cad2-fun f-${(f.tipo || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}`}>{f.tipo || '—'}</span>
              <span className="cad2-reg">{f.crea || '—'}</span>
              <span className="cad2-email" title={f.email || undefined}>{f.email || '—'}</span>
              {/* Assina: rubrica cadastrada (caneta) e quantas folhas de cada
                  documento a pessoa carimba — derivado do cadastro. */}
              <span className="cad2-assina">
                <span className={`cad2-rub ${f.assinatura || f.assinaturaRef ? 'ok' : 'off'}`} title={f.assinatura || f.assinaturaRef ? 'Rubrica cadastrada' : 'Sem rubrica'}>
                  <Icone nome="pencil" tam={13} />
                </span>
                <span className="cad2-folhas">
                  <span>Relatório <b>{rotuloFolhas(f.folhasRelatorio ?? defaultFolhasRelatorio(f.tipo), FOLHAS_RELATORIO_ASSINAVEIS.length)}</b></span>
                  <span>Prontuário <b>{rotuloFolhas(f.folhasProntuario ?? defaultFolhasProntuario(f.tipo), PAGINAS_PRONTUARIO.length)}</b></span>
                </span>
              </span>
              <div className="cad-item-acoes">
                {/* VER antes de EDITAR, e à esquerda do lápis: conferir é o gesto
                    mais frequente, e fazê-lo pelo formulário significa abrir uma
                    tela de escrita para uma pergunta de leitura — um clique numa
                    caixa de folha ali muda quem carimba o próximo documento. */}
                <button type="button" className="btn-editar-pencil cad2-ra vis" onClick={() => setVendo(f)} title="Ver dados cadastrados" aria-label={`Ver ${f.nome}`}>
                  <Icone nome="eye" tam={15} />
                </button>
                <button type="button" className="btn-editar-pencil cad2-ra edit" onClick={() => editarFuncionario(f)} title="Editar" aria-label={`Editar ${f.nome}`}>
                  <Icone nome="pencil" tam={15} />
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
                  <button type="button" className="btn-danger-sm cad2-ra del" onClick={() => setConfirmarExcluir(f.id)} title="Excluir" aria-label={`Excluir ${f.nome}`}>
                    <Icone nome="trash" tam={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </section>

      {vendo && (
        <ModalVerFuncionario
          funcionario={vendo}
          folhasProntuario={PAGINAS_PRONTUARIO}
          folhasRelatorio={FOLHAS_RELATORIO_ASSINAVEIS}
          rotulosProntuario={ROTULOS_PRONTUARIO}
          rotulosRelatorio={ROTULOS_RELATORIO}
          onFechar={() => setVendo(null)}
          // Ver → Editar sem passar pela lista: é o caminho de quem abriu para
          // conferir e achou o que corrigir.
          onEditar={() => {
            const alvo = vendo;
            setVendo(null);
            editarFuncionario(alvo);
          }}
        />
      )}
    </div>
  );
}

/** "todas" / "nenhuma" / "N folhas" — quantas folhas o assinante carimba. */
function rotuloFolhas(folhas: string[] | undefined, total: number): string {
  const n = folhas?.length ?? 0;
  if (n === 0) return 'nenhuma';
  if (n >= total) return 'todas';
  return `${n} folha${n === 1 ? '' : 's'}`;
}
