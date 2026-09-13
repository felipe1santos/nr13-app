import { useEffect, useMemo, useRef, useState } from 'react';
import { Icone } from '../../../components/Icone';
import { textoDoErro } from '../../../services/textoDoErro';
import type { CampoEditavel } from '../pdfVetorial/documento';
import { idPermitido } from './camposPredefiniveis';
import {
  camposDoDocumento,
  planoAplicacao,
  type ModoAplicacao,
  type PlanoAplicacao,
} from './aplicacao';
import { ehDoSistema, listaComSistema } from './conjuntoSistema';
import {
  comPredefinicao,
  dataBr,
  duplicar,
  filtrarPorTexto,
  gravarPredefinicoes,
  idsDoConjunto,
  predefinicaoVazia,
  resumoPredefinicao,
  semPredefinicao,
  type Predefinicao,
} from './modelo';
import { campoPredefinivel } from './camposPredefiniveis';
import ComoFunciona from './ComoFunciona';
import EditorPredefinicao from './EditorPredefinicao';
import RevisaoAplicacao from './RevisaoAplicacao';
import { useFocoPreso } from '../../../components/useFocoPreso';

/**
 * O GERENCIADOR DE PREDEFINIÇÕES DO RELATÓRIO (12/09/2026).
 *
 * ## O que ele substituiu
 *
 * "Recomendações predefinidas": uma lista em acordeão, a criação misturada ao
 * fim da listagem, um botão "Guardar" ambíguo e um único gesto possível —
 * salvar as quatro linhas da tabela de recomendações do relatório aberto.
 *
 * ## O desenho
 *
 * Um shell só, com quatro vistas que trocam no lugar: **lista**, **detalhe**,
 * **editor** e **revisão**. Cabeçalho e rodapé ficam fixos e o corpo rola —
 * senão uma organização com trinta conjuntos empurra os botões para fora da
 * tela no celular.
 *
 * A lista é uma linha por conjunto: nome, quantos campos e quando mudou. Os
 * valores não aparecem ali. Uma lista que mostra o conteúdo de cada conjunto
 * deixa de ser uma lista depois do terceiro item.
 *
 * ## O que ele NÃO faz
 *
 * Não escreve em cadastro nenhum. Aplicar produz **overrides do relatório
 * aberto** (`nr13_ovr_<id>_<TAG>`), o mesmo caminho de quem digita o texto
 * clicando na folha. E ele nem chega a ser montado num relatório finalizado:
 * a prévia inteira só existe enquanto o documento é rascunho
 * (`Relatorios.tsx`, `fluxo === 'vetorial' && !somenteLeitura`).
 */
type Vista = 'lista' | 'detalhe' | 'editor' | 'revisao';

export default function ModalPredefinicoes({
  lista,
  editaveis,
  somenteLeitura,
  onFechar,
  onLista,
  onAplicar,
}: {
  /** Os conjuntos GRAVADOS da organização (sem o do sistema). */
  lista: Predefinicao[];
  /** O que o gerador acabou de desenhar: valor resolvido de cada campo. */
  editaveis: CampoEditavel[];
  somenteLeitura?: boolean;
  onFechar: () => void;
  onLista: (nova: Predefinicao[]) => void;
  onAplicar: (plano: PlanoAplicacao, modo: ModoAplicacao) => Promise<void> | void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  useFocoPreso(caixa, onFechar);

  const [vista, setVista] = useState<Vista>('lista');
  const [selecionado, setSelecionado] = useState<Predefinicao | null>(null);
  const [rascunho, setRascunho] = useState<Predefinicao | null>(null);
  const [busca, setBusca] = useState('');
  const [ajuda, setAjuda] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState<Predefinicao | null>(null);
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const completa = useMemo(() => listaComSistema(lista), [lista]);
  const visiveis = useMemo(() => filtrarPorTexto(completa, busca), [completa, busca]);
  const plano = useMemo<PlanoAplicacao | null>(
    () => (vista === 'revisao' && selecionado ? planoAplicacao(selecionado, editaveis) : null),
    [vista, selecionado, editaveis],
  );

  // A confirmação de sucesso some sozinha: um selo permanente vira parte da
  // moldura e deixa de ser lido como resposta a alguma coisa que se fez.
  useEffect(() => {
    if (!sucesso) return;
    const t = window.setTimeout(() => setSucesso(''), 4000);
    return () => window.clearTimeout(t);
  }, [sucesso]);

  // Um clique fora fecha o menu ⋯ aberto. Sem isto ele fica pendurado na tela
  // enquanto o usuário rola a lista.
  useEffect(() => {
    if (!menuAberto) return;
    const fechar = () => setMenuAberto(null);
    window.addEventListener('click', fechar);
    return () => window.removeEventListener('click', fechar);
  }, [menuAberto]);

  /**
   * Toda gravação passa por aqui, e o sucesso só é anunciado DEPOIS do await.
   *
   * `gravarPredefinicoes` → `salvar` → fila durável → RPC. Mostrar "salvo" antes
   * de a promessa resolver seria anunciar como concluído um trabalho que ainda
   * pode falhar por cota, conflito de versão ou recusa da RLS.
   */
  async function persistir(nova: Predefinicao[], mensagem: string): Promise<boolean> {
    setOcupado(true);
    setErro('');
    setSucesso('');
    try {
      await gravarPredefinicoes(nova);
      onLista(nova.filter((p) => !p.sistema));
      setSucesso(mensagem);
      return true;
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível salvar. Tente novamente.'));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  function abrirNova(prefill?: Record<string, string>) {
    const base = predefinicaoVazia();
    setRascunho(prefill ? { ...base, campos: prefill } : base);
    setErro('');
    setVista('editor');
  }

  function abrirEdicao(p: Predefinicao) {
    setRascunho({ ...p, campos: { ...p.campos } });
    setErro('');
    setVista('editor');
  }

  async function salvarRascunho(p: Predefinicao) {
    const ok = await persistir(
      comPredefinicao(lista, p),
      `Predefinição “${p.nome.trim()}” salva.`,
    );
    if (ok) {
      setRascunho(null);
      setVista('lista');
    }
  }

  async function duplicarConjunto(p: Predefinicao) {
    const copia = duplicar(p, completa);
    const ok = await persistir(comPredefinicao(lista, copia), `Cópia “${copia.nome}” criada.`);
    if (ok) {
      setSelecionado(copia);
      setVista('lista');
    }
  }

  async function excluirConjunto(p: Predefinicao) {
    const ok = await persistir(semPredefinicao(lista, p.id), `Predefinição “${p.nome}” excluída.`);
    if (ok) {
      setConfirmarExclusao(null);
      setSelecionado(null);
      setVista('lista');
    }
  }

  async function aplicar(modo: ModoAplicacao) {
    if (!plano) return;
    setOcupado(true);
    setErro('');
    try {
      await onAplicar(plano, modo);
      onFechar();
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível aplicar a predefinição.'));
    } finally {
      setOcupado(false);
    }
  }

  const titulo =
    vista === 'editor'
      ? rascunho && lista.some((p) => p.id === rascunho.id)
        ? 'Editar predefinição'
        : 'Nova predefinição'
      : vista === 'revisao'
        ? 'Aplicar predefinição'
        : vista === 'detalhe'
          ? selecionado?.nome ?? 'Predefinição'
          : 'Predefinições do relatório';

  const subtitulo =
    vista === 'lista'
      ? 'Conjuntos reutilizáveis desta organização'
      : vista === 'revisao'
        ? 'Confira o que será preenchido antes de confirmar'
        : vista === 'detalhe'
          ? resumoPredefinicao(selecionado ?? ({ campos: {} } as Predefinicao))
          : 'Crie conjuntos reutilizáveis para preencher automaticamente campos recorrentes deste relatório.';

  return (
    <div className="predef-overlay" onClick={() => !ocupado && onFechar()}>
      <div
        ref={caixa}
        className="predef-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Predefinições do relatório"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="predef-cab">
          {vista !== 'lista' && (
            <button
              type="button"
              className="predef-voltar"
              onClick={() => {
                setVista('lista');
                setRascunho(null);
                setErro('');
              }}
              disabled={ocupado}
              aria-label="Voltar para a lista"
            >
              <Icone nome="chevleft" tam={15} />
            </button>
          )}
          <div className="predef-cab-txt">
            <h3>{titulo}</h3>
            <p>{subtitulo}</p>
          </div>
          <div className="predef-cab-acoes">
            <button type="button" className="predef-como" onClick={() => setAjuda(true)}>
              <Icone nome="info" tam={14} />
              <span>Como funciona</span>
            </button>
            <button type="button" className="predef-x" onClick={onFechar} aria-label="Fechar">
              ×
            </button>
          </div>
        </header>

        {sucesso && (
          <p className="predef-sucesso" role="status">
            <Icone nome="checkcircle" tam={13} /> {sucesso}
          </p>
        )}

        {vista === 'lista' && (
          <>
            <div className="predef-barra">
              {completa.length > 4 && (
                <label className="predef-busca">
                  <Icone nome="search" tam={13} />
                  <input
                    value={busca}
                    placeholder="Buscar predefinição…"
                    onChange={(e) => setBusca(e.target.value)}
                  />
                  {busca && (
                    <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca">
                      ×
                    </button>
                  )}
                </label>
              )}
              <span className="predef-espaco" />
              {!somenteLeitura && (
                <>
                  <button
                    type="button"
                    className="fj-btn fj-btn-ghost"
                    disabled={ocupado}
                    title="Cria um conjunto já preenchido com os textos que este relatório tem agora"
                    onClick={() => abrirNova(camposDoDocumento(editaveis, idPermitido))}
                  >
                    <Icone nome="copy" tam={13} /> A partir deste relatório
                  </button>
                  <button
                    type="button"
                    className="fj-btn fj-btn-primary"
                    disabled={ocupado}
                    onClick={() => abrirNova()}
                  >
                    <Icone nome="plus" tam={13} /> Nova predefinição
                  </button>
                </>
              )}
            </div>

            <div className="predef-corpo">
              {visiveis.length === 0 ? (
                <p className="predef-vazio">
                  {busca
                    ? 'Nenhuma predefinição com esse nome.'
                    : 'Nenhuma predefinição ainda. Crie um conjunto com os textos que você repete em todo relatório.'}
                </p>
              ) : (
                <ul className="predef-lista">
                  {visiveis.map((p) => {
                    const sistema = ehDoSistema(p);
                    return (
                      <li key={p.id} className="predef-linha">
                        <button
                          type="button"
                          className="predef-linha-alvo"
                          onClick={() => {
                            setSelecionado(p);
                            setVista('detalhe');
                          }}
                        >
                          <span className="predef-linha-icone">
                            <Icone nome={sistema ? 'shield' : 'book'} tam={15} />
                          </span>
                          <span className="predef-linha-txt">
                            <span className="predef-linha-nome">
                              {p.nome}
                              {sistema && <em className="predef-selo">Padrão do sistema</em>}
                            </span>
                            <span className="predef-linha-meta">
                              {resumoPredefinicao(p)}
                              {!sistema && dataBr(p.atualizadoEm) && (
                                <> · Atualizado em {dataBr(p.atualizadoEm)}</>
                              )}
                              {sistema && <> · Somente leitura</>}
                            </span>
                          </span>
                        </button>

                        <div className="predef-linha-acoes">
                          {!somenteLeitura && (
                            <button
                              type="button"
                              className="fj-btn fj-btn-primary predef-usar"
                              disabled={ocupado}
                              onClick={() => {
                                setSelecionado(p);
                                setVista('revisao');
                              }}
                            >
                              Usar
                            </button>
                          )}
                          <div className="predef-menu">
                            <button
                              type="button"
                              className="predef-menu-btn"
                              aria-label={`Mais ações de ${p.nome}`}
                              aria-expanded={menuAberto === p.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuAberto(menuAberto === p.id ? null : p.id);
                              }}
                            >
                              ⋯
                            </button>
                            {menuAberto === p.id && (
                              <ul className="predef-menu-lista" onClick={(e) => e.stopPropagation()}>
                                <li>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMenuAberto(null);
                                      setSelecionado(p);
                                      setVista('detalhe');
                                    }}
                                  >
                                    <Icone nome="eye" tam={13} /> Visualizar
                                  </button>
                                </li>
                                {!somenteLeitura && !sistema && (
                                  <li>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenuAberto(null);
                                        abrirEdicao(p);
                                      }}
                                    >
                                      <Icone nome="pencil" tam={13} /> Editar
                                    </button>
                                  </li>
                                )}
                                {!somenteLeitura && (
                                  <li>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenuAberto(null);
                                        void duplicarConjunto(p);
                                      }}
                                    >
                                      <Icone nome="copy" tam={13} /> Duplicar
                                    </button>
                                  </li>
                                )}
                                {!somenteLeitura && !sistema && (
                                  <li>
                                    <button
                                      type="button"
                                      className="e-perigo"
                                      onClick={() => {
                                        setMenuAberto(null);
                                        setConfirmarExclusao(p);
                                      }}
                                    >
                                      <Icone nome="trash" tam={13} /> Excluir
                                    </button>
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {erro && <p className="med-erro">{erro}</p>}
            </div>

            <footer className="predef-rodape">
              <span className="predef-rodape-nota">
                Os conjuntos são da organização e valem para todos os relatórios.
              </span>
              <span className="predef-espaco" />
              <button type="button" className="fj-btn fj-btn-ghost" onClick={onFechar} disabled={ocupado}>
                Fechar
              </button>
            </footer>
          </>
        )}

        {vista === 'detalhe' && selecionado && (
          <>
            <div className="predef-corpo predef-detalhe">
              {selecionado.descricao && <p className="predef-det-desc">{selecionado.descricao}</p>}
              {ehDoSistema(selecionado) && (
                <p className="predef-bloco-nota">
                  Este é o conjunto de demonstração do sistema. Ele pode ser visualizado e aplicado,
                  mas não editado nem excluído — use <strong>Duplicar</strong> para criar uma versão
                  sua.
                </p>
              )}
              <dl className="predef-resumo-lista">
                {idsDoConjunto(selecionado).map((id) => (
                  <div key={id}>
                    <dt>{campoPredefinivel(id)?.rotulo ?? id}</dt>
                    <dd className={(selecionado.campos[id] ?? '').trim() === '' ? 'e-vazio' : ''}>
                      {(selecionado.campos[id] ?? '').trim() === ''
                        ? 'deixar em branco no documento'
                        : selecionado.campos[id]}
                    </dd>
                  </div>
                ))}
              </dl>
              {erro && <p className="med-erro">{erro}</p>}
            </div>
            <footer className="predef-rodape">
              <button
                type="button"
                className="fj-btn fj-btn-ghost"
                onClick={() => setVista('lista')}
                disabled={ocupado}
              >
                Voltar
              </button>
              <span className="predef-espaco" />
              {!somenteLeitura && (
                <>
                  <button
                    type="button"
                    className="fj-btn fj-btn-ghost"
                    disabled={ocupado}
                    onClick={() => void duplicarConjunto(selecionado)}
                  >
                    <Icone nome="copy" tam={13} /> Duplicar
                  </button>
                  {!ehDoSistema(selecionado) && (
                    <button
                      type="button"
                      className="fj-btn fj-btn-ghost"
                      disabled={ocupado}
                      onClick={() => abrirEdicao(selecionado)}
                    >
                      <Icone nome="pencil" tam={13} /> Editar
                    </button>
                  )}
                  <button
                    type="button"
                    className="fj-btn fj-btn-primary"
                    disabled={ocupado}
                    onClick={() => setVista('revisao')}
                  >
                    Usar neste relatório
                  </button>
                </>
              )}
            </footer>
          </>
        )}

        {vista === 'editor' && rascunho && (
          <EditorPredefinicao
            inicial={rascunho}
            lista={completa}
            ocupado={ocupado}
            erro={erro}
            onSalvar={(p) => void salvarRascunho(p)}
            onCancelar={() => {
              setRascunho(null);
              setErro('');
              setVista('lista');
            }}
          />
        )}

        {vista === 'revisao' && selecionado && plano && (
          <RevisaoAplicacao
            predefinicao={selecionado}
            plano={plano}
            ocupado={ocupado}
            erro={erro}
            onAplicar={(modo) => void aplicar(modo)}
            onVoltar={() => setVista('lista')}
          />
        )}
      </div>

      {ajuda && <ComoFunciona onFechar={() => setAjuda(false)} />}

      {confirmarExclusao && (
        <ConfirmarExclusao
          nome={confirmarExclusao.nome}
          ocupado={ocupado}
          onCancelar={() => setConfirmarExclusao(null)}
          onConfirmar={() => void excluirConjunto(confirmarExclusao)}
        />
      )}
    </div>
  );
}

/**
 * A confirmação de exclusão.
 *
 * O texto diz o que a ação NÃO faz, e isso é o essencial: quem hesita em apagar
 * um conjunto usado em vinte relatórios está com medo de estragar os vinte. Os
 * relatórios já emitidos guardam o texto que foi aplicado, não uma referência ao
 * conjunto — apagá-lo não alcança nenhum deles.
 */
function ConfirmarExclusao({
  nome,
  ocupado,
  onCancelar,
  onConfirmar,
}: {
  nome: string;
  ocupado?: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  useFocoPreso(caixa, onCancelar);
  return (
    <div className="predef-overlay predef-overlay-topo" onClick={onCancelar}>
      <div
        ref={caixa}
        className="predef-modal predef-modal-confirma"
        role="alertdialog"
        aria-modal="true"
        aria-label="Excluir predefinição"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="predef-cab">
          <div className="predef-cab-txt">
            <h3>Excluir esta predefinição?</h3>
          </div>
        </header>
        <div className="predef-corpo">
          <p className="predef-confirma-nome">{nome}</p>
          <p className="predef-bloco-nota">
            Esta ação remove apenas o conjunto salvo. Relatórios em que ela já foi utilizada não
            serão alterados.
          </p>
        </div>
        <footer className="predef-rodape">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <span className="predef-espaco" />
          <button
            type="button"
            className={`fj-btn fj-btn-danger${ocupado ? ' is-loading' : ''}`}
            onClick={onConfirmar}
            disabled={ocupado}
          >
            {ocupado ? 'Excluindo…' : 'Excluir'}
          </button>
        </footer>
      </div>
    </div>
  );
}
