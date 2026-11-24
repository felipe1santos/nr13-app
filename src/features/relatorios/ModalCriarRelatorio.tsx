import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icone, type NomeIcone } from '../../components/Icone';
import { definicaoDe } from '../calibracoes/instrumentos';
import { contagemParaRelatorio, folhaDoRelatorio, listarCalibracoes } from '../calibracoes/calibracaoService';
import type { DadosCalibracao } from '../calibracoes/tipos';
import { listarLotes, salvarLote, type LoteCal } from '../calibracoes/componentesService';
import { listarContainers } from '../inspecoes/inspecaoService';
import { resumirContainer, rotuloConteudo, type ResumoContainer } from '../inspecoes/resumoContainer';
import type { TipoEnsaio } from '../inspecoes/tipos';
import type { TipoInspecao } from './tipos';
import { documentosDoTipo, tipoDaTag } from '../equipamento/perfilEquipamento';
import {
  FOLHAS_ENSAIO,
  folhasOferecidas,
  PASSOS,
  alternarDocumento,
  documentosFinais,
  documentosPadraoParaContainer,
  ensaiosRevisaveis,
  estadoDoPasso,
  folhasComDados,
  folhasEnsaioSemDados,
  passoAnterior,
  passoSeguinte,
  podeAvancar,
  podeGerar,
  containerPadrao,
  progressoDoPasso,
  rotuloDaFolha,
  type PassoWizard,
} from './wizardCriacao';
import '../equipamento/equipamento.css';
import './modalCriarRelatorio.css';

/**
 * CRIAR UM RELATÓRIO, DO COMEÇO AO FIM, SEM SAIR DE `/relatorios` — 09/09/2026.
 *
 * ## O que isto substitui
 *
 * O caminho anterior era: modal de folhas → `navigate('?editor=1&tag=…')` →
 * outro componente (`RelatoriosLegado`) → um SEGUNDO modal, o do container. E
 * como `avancarParaEtapaContainer` não trocava a tela de fundo, o segundo modal
 * abria em cima de "Para qual equipamento?" — a pergunta que o usuário já tinha
 * respondido, aparecendo de novo no meio do trabalho.
 *
 * Aqui o shell é UM só e fica montado do começo ao fim. Trocar de etapa é
 * trocar o miolo; o equipamento, o tipo, as folhas, o container escolhido e a
 * rolagem continuam onde estavam. A navegação para o editor acontece uma única
 * vez, no "Gerar documento", já com TUDO decidido.
 *
 * ## As três etapas (reordenadas em 23/11/2026, a pedido do dono)
 *
 * 1. **Inspeção** — o tipo de inspeção e de onde vêm os dados de campo.
 * 2. **Certificados** — as calibrações que entram como folhas no fim.
 * 3. **Resumo** — o que vai ser gerado, com aviso em cada folha de ensaio
 *    marcada que vai sair em branco.
 *
 * A composição fina das folhas deixou de ser uma etapa: mora na ENGRENAGEM do
 * cabeçalho (um painel dentro da caixa, como o olho), disponível nas três. E a
 * inspeção escolhida decide sozinha as folhas de ensaio
 * (`documentosPadraoParaContainer`) — até o usuário mexer nelas à mão; daí em
 * diante a escolha dele vence (`docsEditados`), e "Restaurar padrão" devolve.
 *
 * ## Atribuído × salvo
 *
 * Tudo que esta tela afirma sobre conteúdo vem de `resumirContainer`, e só do
 * que está SALVO. Ver o cabeçalho de `inspecoes/resumoContainer.ts`.
 */

const TIPOS: TipoInspecao[] = ['Inspeção Inicial', 'Inspeção Periódica', 'Inspeção Extraordinária'];

const ICONE_ENSAIO: Record<TipoEnsaio, NomeIcone> = {
  checklist: 'clipboard',
  ultrassom: 'gauge',
  visual_externo: 'eye',
  visual_interno: 'search',
  teste_hidrostatico: 'cylinder',
  relatorio_imagens: 'camera',
  acumulacao: 'manometro',
  verificacao_caldeira: 'clipboard',
  alimentacao_agua: 'gauge',
};

/** A folha que traz a Verificação NR-13 da caldeira (ela não tem folha própria). */
const FOLHA_VERIFICACAO_CALDEIRA = 'CALD-RELATORIO-INSPECAO.html';

/** Item da seção de calibrações: um LOTE inteiro ou uma calibração avulsa antiga. */
interface ItemCalibracao {
  id: string;
  rotulo: string;
  certs: DadosCalibracao[];
  lote?: LoteCal;
}

const tsDoId = (id: string) => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);

const contagemPorTipo = contagemParaRelatorio;

export interface EscolhaCriacao {
  tipo: TipoInspecao;
  documentos: string[];
  /** `null` = relatório sem injeção de dados de campo. Vira `meta.containerOrigemId`. */
  containerId: string | null;
}

interface Props {
  tag: string;
  resumo: { tag: string; descricao?: string | null; tipo?: string | null };
  /** "← Trocar equipamento": volta ao seletor sem sair da rota. */
  aoVoltar?: () => void;
  onClose: () => void;
  onGerar: (escolha: EscolhaCriacao) => void;
}

/** Os ensaios salvos do container, como etiquetas coloridas com TEXTO. */
function ChipsEnsaios({ r }: { r: ResumoContainer }) {
  if (r.salvos.length === 0) return null;
  return (
    <span className="wz-chips">
      {r.salvos.map((e) => (
        <span key={e.ensaio} className={`wz-chip ens-${e.ensaio}`}>
          <Icone nome={ICONE_ENSAIO[e.ensaio] ?? 'filetext'} tam={12} />
          {e.rotulo}
        </span>
      ))}
    </span>
  );
}

export default function ModalCriarRelatorio({ tag, resumo, aoVoltar, onClose, onGerar }: Props) {
  const [passo, setPasso] = useState<PassoWizard>(1);
  const [tipo, setTipo] = useState<TipoInspecao>('Inspeção Periódica');
  // As folhas que ESTE equipamento oferece: vaso e autoclave recebem a lista de
  // sempre; caldeira, a dela (perfilEquipamento.DOCUMENTOS_CALDEIRA).
  // Sem o Livro de Registro: ele é manual (Registros de Segurança), 23/11/2026.
  const folhasDoTipo = useMemo(() => folhasOferecidas(documentosDoTipo(tipoDaTag(tag))), [tag]);
  // Os containers e os resumos são calculados UMA vez: `listarContainers` lê do
  // cache em memória, e refazer a conta a cada passo faria a lista piscar.
  const resumos = useMemo<ResumoContainer[]>(
    () => (tag ? listarContainers(tag).map(resumirContainer) : []),
    [tag],
  );
  // 23/11/2026 · a inspeção mais recente com dado já vem escolhida (antes vinha
  // "Não usar container" e o relatório saía sem nada do campo).
  const inicial = useMemo(() => resumos.find((r) => r.id === containerPadrao(resumos)) ?? null, [resumos]);
  const [marcados, setMarcados] = useState<string[]>(() => documentosPadraoParaContainer(folhasDoTipo, inicial));
  /** O usuário mexeu nas folhas à mão: trocar de inspeção não pode desfazer isso. */
  const [docsEditados, setDocsEditados] = useState(false);
  // 23/11/2026 · as calibrações oferecidas (as 3 mais recentes, já oficiais)
  // vêm MARCADAS: antes vinham desmarcadas e o relatório saía sem os
  // certificados de quem não marcava. Desmarcar continua livre.
  const [calibSelecionados, setCalibSelecionados] = useState<Set<string> | null>(null);
  const [containerId, setContainerId] = useState<string | null>(() => inicial?.id ?? null);
  /** O olho: id do container em pré-visualização. Não fecha o assistente. */
  const [preview, setPreview] = useState<string | null>(null);
  /** A engrenagem: painel dos documentos, dentro da mesma caixa. */
  const [painelDocs, setPainelDocs] = useState(false);
  const [gerando, setGerando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const escolhido = useMemo(
    () => resumos.find((r) => r.id === containerId) ?? null,
    [resumos, containerId],
  );
  const emPreview = useMemo(() => resumos.find((r) => r.id === preview) ?? null, [resumos, preview]);
  const comDados = useMemo(() => folhasComDados(escolhido), [escolhido]);
  const verificacaoSalva = !!escolhido?.salvos.some((e) => e.ensaio === 'verificacao_caldeira');

  const itensCalibracao = useMemo<ItemCalibracao[]>(() => {
    if (!tag) return [];
    const cals = listarCalibracoes(tag);
    const doLote: ItemCalibracao[] = listarLotes(tag)
      .map((lote) => ({ lote, certs: cals.filter((c) => c.loteId === lote.id) }))
      .filter((x) => x.certs.length > 0)
      .map(({ lote, certs }) => ({
        id: lote.id,
        rotulo: `${lote.descricao || `Lote de calibração — ${lote.criadoEm}`} (${contagemPorTipo(certs)})`,
        certs,
        lote,
      }));
    const avulsas: ItemCalibracao[] = cals
      // Avulsa sem folha (terceiro, rascunho) não entra aqui: não viraria folha
      // nenhuma — a de laboratório é citada no quadro 7.1.1.
      .filter((c) => !c.loteId && folhaDoRelatorio(c) !== null)
      .map((c) => ({
        id: c.id,
        rotulo: `${definicaoDe(c.tipo).curto} — ${c.nome} · ${c.numeroCertificado || 's/ nº'} (${c.dataCalibracao || c.criadoEm})`,
        certs: [c],
      }));
    return [...doLote, ...avulsas].sort((a, b) => tsDoId(b.id) - tsDoId(a.id)).slice(0, 3);
  }, [tag]);
  const calibMarcadas = useMemo(
    () => calibSelecionados ?? new Set(itensCalibracao.map((i) => i.id)),
    [calibSelecionados, itensCalibracao],
  );

  // ESC fecha o painel de dentro (olho ou engrenagem) antes do assistente:
  // fechar tudo de uma vez perderia a etapa e as escolhas por causa de uma tecla.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (preview) setPreview(null);
      else if (painelDocs) setPainelDocs(false);
      else onClose();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [preview, painelDocs, onClose]);

  /** Escolher a inspeção aplica o padrão inteligente — se o usuário ainda não mexeu. */
  function escolherContainer(id: string | null) {
    setContainerId(id);
    if (docsEditados) return;
    const r = resumos.find((x) => x.id === id) ?? null;
    setMarcados(documentosPadraoParaContainer(folhasDoTipo, r));
  }

  const toggle = (doc: string) => {
    setDocsEditados(true);
    setMarcados((m) => alternarDocumento(m, doc));
  };

  function restaurarPadrao() {
    setDocsEditados(false);
    setMarcados(documentosPadraoParaContainer(folhasDoTipo, escolhido));
  }

  function toggleCalib(id: string) {
    setCalibSelecionados(() => {
      const n = new Set(calibMarcadas);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // Só ensaio SALVO e com folha própria de ensaio: a Verificação NR-13 da
  // caldeira aponta para o Relatório de inspeção (estrutura), e desmarcá-la
  // tiraria a folha inteira — ela aparece como nota, não como caixa.
  const revisaveis = useMemo(
    () => ensaiosRevisaveis(escolhido).filter((e) => FOLHAS_ENSAIO.has(e.doc)),
    [escolhido],
  );
  const marcadosDoTipo = useMemo(() => folhasDoTipo.filter((d) => marcados.includes(d)), [folhasDoTipo, marcados]);
  const semDados = useMemo(() => new Set(folhasEnsaioSemDados(marcadosDoTipo, escolhido)), [marcadosDoTipo, escolhido]);
  const calibEscolhidas = itensCalibracao.filter((i) => calibMarcadas.has(i.id));
  const estrutura = folhasDoTipo.filter((d) => !FOLHAS_ENSAIO.has(d));
  const deEnsaio = folhasDoTipo.filter((d) => FOLHAS_ENSAIO.has(d));
  const geravel = podeGerar(marcadosDoTipo);

  async function gerar() {
    if (gerando || !geravel) return;
    setGerando(true);
    const selecionados = itensCalibracao.filter((i) => calibMarcadas.has(i.id));
    const docsCalibracao = selecionados.flatMap((i) =>
      i.certs.map(folhaDoRelatorio).filter((d): d is string => d !== null),
    );
    // Lote marcado entra na fila de vínculo — `salvarHistorico` captura depois
    // (alimenta as validades de válvula/manômetro no histórico). Regra antiga,
    // preservada palavra por palavra.
    if (tag) {
      for (const i of selecionados) {
        if (i.lote && !i.lote.relatorioId) {
          await salvarLote(tag, { ...i.lote, vincularProximoRelatorio: true });
        }
      }
    }
    onGerar({ tipo, documentos: documentosFinais(marcados, docsCalibracao, folhasDoTipo), containerId });
  }

  const descricaoEquip = [resumo.descricao, resumo.tipo].filter(Boolean).join(' · ') || 'Equipamento';

  // PORTAL no <body> (23/11/2026): dentro da página o overlay ficava ABAIXO da
  // barra do topo do sistema, que escondia a barra de progresso e — no celular,
  // onde o assistente ocupa a tela inteira — o cabeçalho e o ×. Mesmo padrão de
  // ModalCliente / ModalNovoRegistro (z-index --z-modal-app).
  return createPortal(
    // O fundo NAO fecha: sao as 3 etapas do assistente, e um clique fora voltava
    // ao zero. Ver `modaisComEdicao.test.ts`.
    <div className="modal-overlay wz-overlay">
      <div className="modal-content mni-modal wz-modal" ref={caixa} onClick={(e) => e.stopPropagation()}>
        {/* ── TOPO FIXO: progresso, título e etapas ───────────────────────────
            Fora do corpo que rola: com vinte containers a lista desce, e o
            usuário continua vendo onde está. */}
        <div
          className="wz-progresso"
          role="progressbar"
          aria-label="Progresso da criação"
          aria-valuemin={1}
          aria-valuemax={PASSOS.length}
          aria-valuenow={passo}
        >
          <span className="wz-progresso-fill" style={{ transform: `scaleX(${progressoDoPasso(passo)})` }} />
        </div>

        <div className="modal-header mni-header wz-header">
          <h3>Configurar novo relatório</h3>
          <div className="wz-header-acoes">
            <button
              type="button"
              className={`wz-engrenagem${painelDocs ? ' is-ativo' : ''}`}
              aria-label="Documentos do relatório"
              title="Documentos do relatório"
              aria-expanded={painelDocs}
              onClick={() => {
                setPreview(null);
                setPainelDocs((v) => !v);
              }}
            >
              <Icone nome="engrenagem" tam={18} />
              <span className="wz-engrenagem-cont" aria-hidden="true">
                {marcadosDoTipo.length}
              </span>
            </button>
            <button type="button" className="btn-close-modal" onClick={onClose} aria-label="Fechar">
              ×
            </button>
          </div>
        </div>

        {/* ── ETAPAS ─────────────────────────────────────────────────────────
            Elas também NAVEGAM para trás: voltar do Resumo para a Inspeção em
            um clique é o que o usuário tenta fazer primeiro. */}
        <ol className="wz-passos" aria-label="Etapas da criação">
          {PASSOS.map((p) => {
            const st = estadoDoPasso(p.n, passo);
            return (
              <li key={p.n} className={`wz-passo is-${st}`}>
                <button
                  type="button"
                  className="wz-passo-btn"
                  disabled={st === 'futuro'}
                  aria-current={st === 'atual' ? 'step' : undefined}
                  onClick={() => st === 'feito' && setPasso(p.n)}
                >
                  <span className="wz-passo-num" aria-hidden="true">
                    {st === 'feito' ? <Icone nome="check" tam={11} /> : p.n}
                  </span>
                  <span className="wz-passo-rot">{p.rotulo}</span>
                  <span className="wz-passo-rot-curto">{p.curto}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="modal-body mni-body">
          {/* No Resumo o equipamento já tem bloco próprio — a faixa não se repete. */}
          {passo !== 3 && (
            <div className="mni-resumo">
              <div className="mni-resumo-txt">
                <strong>{resumo.tag}</strong>
                <span>{descricaoEquip}</span>
              </div>
              {aoVoltar && passo === 1 && (
                <button type="button" className="fj-btn fj-btn-ghost mni-trocar" onClick={aoVoltar}>
                  ← Trocar equipamento
                </button>
              )}
            </div>
          )}

          {/* ══ ETAPA 1 · INSPEÇÃO ════════════════════════════════════════ */}
          {passo === 1 && (
            <>
              <div className="campo-bloco-modal">
                <label className="label-bloco-modal" htmlFor="wz-tipo">
                  Tipo de inspeção
                </label>
                <select
                  id="wz-tipo"
                  className="mni-select"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoInspecao)}
                >
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo-bloco-modal">
                <div className="mni-secao">
                  <span className="label-bloco-modal">Selecione a inspeção</span>
                  <span className="texto-ajuda-modal-inline">
                    De onde vêm os dados de campo. As folhas de ensaio acompanham o que ela tem salvo.
                  </span>
                </div>

                {/* Cartões que QUEBRAM linha: nome, meta e etiquetas dos ensaios
                    salvos aparecem inteiros. A altura fixa de 64 px de antes
                    cortava o nome e escondia os ensaios atrás de ícones. */}
                <div className="wz-containers" role="radiogroup" aria-label="Inspeções salvas">
                  {resumos.map((r) => (
                    <label
                      key={r.id}
                      className={`wz-container${containerId === r.id ? ' is-sel' : ''}`}
                    >
                      <input
                        type="radio"
                        name="wz-container"
                        checked={containerId === r.id}
                        onChange={() => escolherContainer(r.id)}
                      />
                      <span className="wz-container-marca" aria-hidden="true">
                        <Icone nome="check" tam={12} />
                      </span>
                      <span className="wz-container-txt">
                        <strong className="wz-container-nome">{r.nome}</strong>
                        <span className="wz-container-meta">
                          {[r.data, r.responsavel, rotuloConteudo(r)].filter(Boolean).join(' · ')}
                        </span>
                        <ChipsEnsaios r={r} />
                      </span>
                      <button
                        type="button"
                        className="wz-olho"
                        title={`Ver o conteúdo de ${r.nome}`}
                        aria-label={`Ver o conteúdo de ${r.nome}`}
                        onClick={(e) => {
                          // Dentro do <label>: sem isto o clique marcaria o radio.
                          e.preventDefault();
                          e.stopPropagation();
                          setPainelDocs(false);
                          setPreview(r.id);
                        }}
                      >
                        <Icone nome="eye" tam={17} />
                      </button>
                    </label>
                  ))}

                  <label className={`wz-container wz-container-sem${containerId === null ? ' is-sel' : ''}`}>
                    <input
                      type="radio"
                      name="wz-container"
                      checked={containerId === null}
                      onChange={() => escolherContainer(null)}
                    />
                    <span className="wz-container-marca" aria-hidden="true">
                      <Icone nome="check" tam={12} />
                    </span>
                    <span className="wz-container-txt">
                      <strong className="wz-container-nome">Não usar container</strong>
                      <span className="wz-container-meta">Gerar relatório sem injeção de dados de inspeção</span>
                    </span>
                  </label>
                </div>

                {resumos.length === 0 && (
                  <p className="wz-vazio">
                    Nenhuma inspeção salva para este equipamento ainda. O relatório será gerado sem
                    dados de campo — o que já é um caminho válido.
                  </p>
                )}
              </div>
            </>
          )}

          {/* ══ ETAPA 2 · CERTIFICADOS ════════════════════════════════════
              Marcar um lote ACRESCENTA FOLHAS ao documento (`?calibId=`). Elas
              nunca vieram de container. */}
          {passo === 2 && (
            <div className="campo-bloco-modal">
              <div className="mni-secao">
                <span className="label-bloco-modal">Certificados de calibração</span>
                <span className="texto-ajuda-modal-inline">Entram como folhas no fim do relatório</span>
              </div>
              {itensCalibracao.length > 0 ? (
                <div className="wz-certs">
                  {itensCalibracao.map((i) => (
                    <label
                      key={i.id}
                      className={`wz-cert${calibMarcadas.has(i.id) ? ' is-sel' : ''}`}
                      title={i.lote ? 'Lote de calibração' : 'Calibração avulsa'}
                    >
                      <input
                        type="checkbox"
                        checked={calibMarcadas.has(i.id)}
                        onChange={() => toggleCalib(i.id)}
                      />
                      <span className="wz-cert-txt">
                        <span className="wz-cert-tipo">{i.lote ? 'Lote de calibração' : 'Calibração avulsa'}</span>
                        <span className="wz-cert-nome">{i.rotulo}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="wz-vazio-caixa">
                  <Icone nome="award" tam={22} />
                  <strong>Nenhuma calibração para anexar</strong>
                  <span>
                    Este equipamento não tem lote nem calibração com folha. Siga para o resumo — o
                    relatório sai sem certificados.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ══ ETAPA 3 · RESUMO ══════════════════════════════════════════ */}
          {passo === 3 && (
            <div className="wz-revisao">
              <section className="wz-rev-bloco">
                <h4>Equipamento</h4>
                <p className="wz-rev-forte">{resumo.tag}</p>
                <p className="wz-rev-sub">{descricaoEquip}</p>
              </section>

              <section className="wz-rev-bloco">
                <h4>Tipo</h4>
                <p className="wz-rev-forte">{tipo}</p>
              </section>

              <section className="wz-rev-bloco wz-rev-larga">
                <h4>Inspeção</h4>
                {escolhido ? (
                  <>
                    <p className="wz-rev-forte">{escolhido.nome}</p>
                    <p className="wz-rev-sub">
                      {[
                        escolhido.data,
                        escolhido.responsavel,
                        escolhido.totalFotos > 0 ? `${escolhido.totalFotos} foto${escolhido.totalFotos > 1 ? 's' : ''}` : null,
                        escolhido.totalMedicoes > 0
                          ? `${escolhido.totalMedicoes} ${escolhido.totalMedicoes > 1 ? 'medições' : 'medição'}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {escolhido.salvos.length > 0 ? (
                      <ChipsEnsaios r={escolhido} />
                    ) : (
                      <p className="wz-rev-ajuda">Esta inspeção ainda não tem ensaio preenchido.</p>
                    )}
                    {revisaveis.length > 0 && (
                      <>
                        <p className="wz-rev-ajuda">Desmarque o ensaio que não deve sair no documento:</p>
                        <div className="wz-rev-ensaios">
                          {revisaveis.map((e) => (
                            <label key={e.ensaio} className="item-documento-check">
                              <input
                                type="checkbox"
                                checked={marcados.includes(e.doc)}
                                onChange={() => toggle(e.doc)}
                              />
                              {e.rotulo}
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <p className="wz-rev-sub">Nenhum container selecionado. O relatório será gerado sem dados de inspeção.</p>
                )}
              </section>

              <section className="wz-rev-bloco wz-rev-larga">
                <div className="wz-rev-titulo">
                  <h4>
                    Documentos que serão gerados <span className="wz-rev-cont">{marcadosDoTipo.length}</span>
                  </h4>
                  <button type="button" className="wz-link" onClick={() => setPainelDocs(true)}>
                    <Icone nome="engrenagem" tam={14} /> Ajustar documentos
                  </button>
                </div>
                {marcadosDoTipo.length === 0 ? (
                  <p className="wz-aviso-geral" role="alert">
                    <Icone nome="alerttri" tam={14} /> Nenhuma folha marcada. Marque ao menos uma em
                    “Ajustar documentos” para gerar o relatório.
                  </p>
                ) : (
                  <ol className="wz-rev-lista">
                    {marcadosDoTipo.map((d) => (
                      <li key={d}>
                        <span className="wz-rev-doc">
                          <Icone nome="check" tam={12} />
                          <span>{rotuloDaFolha(d)}</span>
                        </span>
                        {d === FOLHA_VERIFICACAO_CALDEIRA && verificacaoSalva && (
                          <span className="wz-rev-nota">inclui a Verificação NR-13 da inspeção</span>
                        )}
                        {semDados.has(d) && (
                          <span className="wz-tag-aviso">
                            <Icone nome="alerttri" tam={12} />
                            sem dados na inspeção — sai em branco
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="wz-rev-bloco wz-rev-larga">
                <h4>
                  Certificados <span className="wz-rev-cont">{calibEscolhidas.length}</span>
                </h4>
                {calibEscolhidas.length > 0 ? (
                  <ul className="wz-rev-lista">
                    {calibEscolhidas.map((i) => (
                      <li key={i.id}>
                        <span className="wz-rev-doc">
                          <Icone nome="check" tam={12} />
                          <span>{i.rotulo}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="wz-rev-sub">Nenhum certificado anexado.</p>
                )}
              </section>
            </div>
          )}
        </div>

        <div className="modal-actions mni-rodape wz-rodape">
          {passo === 3 && !geravel && (
            <span className="wz-rodape-motivo">Marque ao menos uma folha para gerar.</span>
          )}
          {passo === 1 ? (
            <button type="button" className="btn-secundario" onClick={onClose}>
              Cancelar
            </button>
          ) : (
            <button type="button" className="btn-secundario" onClick={() => setPasso(passoAnterior(passo))}>
              Voltar
            </button>
          )}
          {passo < 3 ? (
            <button
              type="button"
              className="btn-primario"
              disabled={!podeAvancar(passo, marcados)}
              onClick={() => setPasso(passoSeguinte(passo))}
            >
              Próximo
            </button>
          ) : (
            <button
              type="button"
              className={`btn-primario${gerando ? ' is-gerando' : ''}`}
              disabled={gerando || !geravel}
              aria-busy={gerando}
              onClick={() => void gerar()}
            >
              {gerando && <span className="wz-spinner" aria-hidden="true" />}
              {gerando ? 'Gerando…' : 'Gerar documento'}
            </button>
          )}
        </div>

        {/* ── A ENGRENAGEM ───────────────────────────────────────────────────
            Mesmo desenho do olho: painel SOBRE o assistente, dentro da mesma
            caixa. Fechar devolve a etapa em que o usuário estava. */}
        {painelDocs && (
          <div className="wz-preview wz-painel" role="dialog" aria-modal="true" aria-label="Documentos do relatório">
            <div className="wz-preview-caixa wz-painel-caixa">
              <div className="wz-preview-head">
                <div>
                  <div className="fj-eyebrow">Composição</div>
                  <h4>Documentos do relatório</h4>
                </div>
                <button type="button" className="btn-close-modal" onClick={() => setPainelDocs(false)} aria-label="Fechar">
                  ×
                </button>
              </div>
              <div className="wz-preview-corpo">
                <h5 className="wz-preview-titulo">Estrutura do relatório</h5>
                <div className="wz-docs">
                  {folhasDoTipo.map((doc) =>
                    FOLHAS_ENSAIO.has(doc) ? null : (
                      <label key={doc} className="wz-doc">
                        <input type="checkbox" checked={marcados.includes(doc)} onChange={() => toggle(doc)} />
                        <span className="wz-doc-txt">
                          <span className="wz-doc-nome">{rotuloDaFolha(doc)}</span>
                          {doc === FOLHA_VERIFICACAO_CALDEIRA && (
                            <span className="wz-doc-dica">
                              inclui a Verificação NR-13 da inspeção
                              {verificacaoSalva ? ' (com dados)' : ''}
                            </span>
                          )}
                        </span>
                      </label>
                    ),
                  )}
                </div>
                {estrutura.length === 0 && <p className="wz-preview-nada">Sem folhas de estrutura.</p>}

                {deEnsaio.length > 0 && (
                  <>
                    <h5 className="wz-preview-titulo">Folhas de ensaio (dados da inspeção)</h5>
                    <div className="wz-docs">
                      {deEnsaio.map((doc) => (
                        <label key={doc} className="wz-doc">
                          <input type="checkbox" checked={marcados.includes(doc)} onChange={() => toggle(doc)} />
                          <span className="wz-doc-txt">
                            <span className="wz-doc-nome">{rotuloDaFolha(doc)}</span>
                          </span>
                          <span className={`wz-doc-estado${comDados.has(doc) ? ' is-ok' : ''}`}>
                            {comDados.has(doc) ? 'com dados' : 'sem dados'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {!geravel && (
                  <p className="wz-aviso-geral" role="alert">
                    <Icone nome="alerttri" tam={14} /> Marque ao menos uma folha — sem nenhuma, não há
                    documento para gerar.
                  </p>
                )}
              </div>
              <div className="wz-preview-rodape">
                <button type="button" className="btn-secundario" onClick={restaurarPadrao}>
                  Restaurar padrão
                </button>
                <button type="button" className="btn-primario" onClick={() => setPainelDocs(false)}>
                  Concluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── O OLHO ─────────────────────────────────────────────────────────
            Painel SOBRE o assistente, dentro da mesma caixa: fechar devolve a
            etapa 1 exatamente como estava, com o radio onde estava. Nada é
            desmontado — é por isso que ele não pode ser outro modal. */}
        {emPreview && (
          <div
            className="wz-preview"
            role="dialog"
            aria-modal="true"
            aria-label={`Conteúdo de ${emPreview.nome}`}
            onClick={(e) => e.target === e.currentTarget && setPreview(null)}
          >
            <div className="wz-preview-caixa">
              <div className="wz-preview-head">
                <div>
                  <div className="fj-eyebrow">Inspeção</div>
                  <h4>{emPreview.nome}</h4>
                </div>
                <button
                  type="button"
                  className="btn-close-modal"
                  onClick={() => setPreview(null)}
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>
              <div className="wz-preview-corpo">
                <p className="wz-preview-meta">
                  Criado em {emPreview.criadoEm}
                  {emPreview.responsavel ? ` · Responsável: ${emPreview.responsavel}` : ''}
                </p>

                <h5 className="wz-preview-titulo">Salvo</h5>
                {emPreview.salvos.length === 0 ? (
                  <p className="wz-preview-nada">Nenhum ensaio preenchido nesta inspeção.</p>
                ) : (
                  <ul className="wz-preview-lista">
                    {emPreview.salvos.map((e) => (
                      <li key={e.ensaio} className="is-ok">
                        <Icone nome="check" tam={13} />
                        <span className="wz-preview-nome">{e.rotulo}</span>
                        <span className="wz-preview-detalhe">
                          {[
                            e.data,
                            e.respostas > 0 ? `${e.respostas} resposta${e.respostas > 1 ? 's' : ''}` : null,
                            e.medicoes > 0 ? `${e.medicoes} ${e.medicoes > 1 ? 'medições' : 'medição'}` : null,
                            e.fotos > 0 ? `${e.fotos} foto${e.fotos > 1 ? 's' : ''}` : null,
                            e.resultado,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {emPreview.pendentes.length > 0 && (
                  <>
                    <h5 className="wz-preview-titulo">Não preenchido</h5>
                    <ul className="wz-preview-lista">
                      {emPreview.pendentes.map((e) => (
                        <li key={e.ensaio}>
                          <span className="wz-preview-vazio" aria-hidden="true" />
                          <span className="wz-preview-nome">{e.rotulo}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div className="wz-preview-rodape">
                <button type="button" className="btn-secundario" onClick={() => setPreview(null)}>
                  Fechar
                </button>
                <button
                  type="button"
                  className="btn-primario"
                  onClick={() => {
                    escolherContainer(emPreview.id);
                    setPreview(null);
                  }}
                >
                  Usar esta inspeção
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
