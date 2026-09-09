import { useEffect, useMemo, useRef, useState } from 'react';
import { Icone, type NomeIcone } from '../../components/Icone';
import { arquivoCalibracao, listarCalibracoes } from '../calibracoes/calibracaoService';
import type { DadosCalibracao } from '../calibracoes/tipos';
import { listarLotes, salvarLote, type LoteCal } from '../calibracoes/componentesService';
import { listarContainers } from '../inspecoes/inspecaoService';
import { resumirContainer, rotuloConteudo, type ResumoContainer } from '../inspecoes/resumoContainer';
import type { TipoEnsaio } from '../inspecoes/tipos';
import { DOCUMENTOS_DISPONIVEIS, type TipoInspecao } from './tipos';
import {
  PASSOS,
  alternarDocumento,
  documentosFinais,
  ensaiosRevisaveis,
  estadoDoPasso,
  passoAnterior,
  passoSeguinte,
  podeAvancar,
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
 * vez, no "Gerar Documento", já com TUDO decidido.
 *
 * ## As três etapas, e por que são três
 *
 * 1. **Documentos** — quais partes compõem o relatório. É estrutura.
 * 2. **Inspeção** — de onde vêm os dados de campo. É origem.
 * 3. **Revisar** — o que foi decidido, junto, antes de virar documento.
 *
 * O modal antigo misturava 1 e 2 num bloco azul chamado "Injeção Automática de
 * Dados (Containers)": ele listava ensaios com o nome de um container do lado,
 * mas as caixas dele eram as MESMAS da lista de folhas, e o container de
 * verdade só era escolhido depois, noutra tela. Marcar "Medição de Espessura ·
 * Container A" e escolher o container B no passo seguinte injetava B, sem aviso.
 *
 * ## Atribuído × salvo
 *
 * Tudo que esta tela afirma sobre conteúdo vem de `resumirContainer`, e só do
 * que está SALVO. Ver o cabeçalho de `inspecoes/resumoContainer.ts`.
 */

const TIPOS: TipoInspecao[] = ['Inspeção Inicial', 'Inspeção Periódica', 'Inspeção Extraordinária'];

const ROTULOS: Record<string, string> = {
  'CAPA.html': 'Capa',
  'SUMARIO.html': 'Sumário',
  'PLACA.html': 'Placa de Identificação',
  'PRONTUARIO.html': 'Prontuário',
  'CLASSIFICACAO-RISCO.html': 'Caracterização (Classificação de Risco)',
  'RESUMO-MEMORIAL.html': 'Resumo do Memorial',
  'MEMORIAL.html': 'Memorial de Cálculo (folhas automáticas)',
  'INSPECOES.html': 'Inspeções',
  'VERIFICACAO-DOCUMENTACAO.html': 'Verificação de Documentação',
  'checklist1.html': 'Checklist 1',
  'checklist2.html': 'Checklist 2',
  'checklist3.html': 'Checklist 3',
  'CONCLUSAO.html': 'Conclusão',
  'ULTRASSOM.html': 'Laudo de Ultrassom',
  'TESTE-HIDROSTATICO.html': 'Teste Hidrostático (2 folhas — dados + fotos)',
  'VISUAL-EXTERNO.html': 'Inspeção Visual Externa (checklist + folhas de fotos)',
  'VISUAL-INTERNO.html': 'Inspeção Visual Interna (checklist + folhas de fotos)',
  'LIVRO-REGISTRO.html': 'Livro de Registro de Segurança (NR-13)',
};

/** Folhas que só têm conteúdo se a inspeção de campo tiver sido feita. */
const ENSAIOS = new Set<string>([
  'VISUAL-EXTERNO.html',
  'VISUAL-INTERNO.html',
  'ULTRASSOM.html',
  'TESTE-HIDROSTATICO.html',
]);

const ICONE_ENSAIO: Record<TipoEnsaio, NomeIcone> = {
  checklist: 'clipboard',
  ultrassom: 'gauge',
  visual_externo: 'eye',
  visual_interno: 'search',
  teste_hidrostatico: 'cylinder',
};

/** Item da seção de calibrações: um LOTE inteiro ou uma calibração avulsa antiga. */
interface ItemCalibracao {
  id: string;
  rotulo: string;
  certs: DadosCalibracao[];
  lote?: LoteCal;
}

const tsDoId = (id: string) => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);

function contagemPorTipo(certs: DadosCalibracao[]): string {
  const man = certs.filter((c) => c.tipo === 'manometro').length;
  const psv = certs.filter((c) => c.tipo === 'psv').length;
  const partes: string[] = [];
  if (man) partes.push(`${man} manômetro${man > 1 ? 's' : ''}`);
  if (psv) partes.push(`${psv} válvula${psv > 1 ? 's' : ''}`);
  return partes.join(', ');
}

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

export default function ModalCriarRelatorio({ tag, resumo, aoVoltar, onClose, onGerar }: Props) {
  const [passo, setPasso] = useState<PassoWizard>(1);
  const [tipo, setTipo] = useState<TipoInspecao>('Inspeção Periódica');
  const [marcados, setMarcados] = useState<string[]>(
    DOCUMENTOS_DISPONIVEIS.filter((d) => !ENSAIOS.has(d)),
  );
  const [calibSelecionados, setCalibSelecionados] = useState<Set<string>>(new Set());
  const [containerId, setContainerId] = useState<string | null>(null);
  /** O olho: id do container em pré-visualização. Não fecha o assistente. */
  const [preview, setPreview] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Os containers e os resumos são calculados UMA vez: `listarContainers` lê do
  // cache em memória, e refazer a conta a cada passo faria a lista piscar.
  const resumos = useMemo<ResumoContainer[]>(
    () => (tag ? listarContainers(tag).map(resumirContainer) : []),
    [tag],
  );
  const escolhido = useMemo(
    () => resumos.find((r) => r.id === containerId) ?? null,
    [resumos, containerId],
  );
  const emPreview = useMemo(() => resumos.find((r) => r.id === preview) ?? null, [resumos, preview]);

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
      .filter((c) => !c.loteId)
      .map((c) => ({
        id: c.id,
        rotulo: `${c.tipo === 'manometro' ? 'Manômetro' : 'PSV'} — ${c.nome} (${c.dataCalibracao || c.criadoEm})`,
        certs: [c],
      }));
    return [...doLote, ...avulsas].sort((a, b) => tsDoId(b.id) - tsDoId(a.id)).slice(0, 3);
  }, [tag]);

  // ESC fecha o preview antes do assistente: fechar tudo de uma vez perderia a
  // etapa e as escolhas por causa de uma tecla.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (preview) setPreview(null);
      else onClose();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [preview, onClose]);

  const toggle = (doc: string) => setMarcados((m) => alternarDocumento(m, doc));

  function toggleCalib(id: string) {
    setCalibSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const revisaveis = useMemo(() => ensaiosRevisaveis(escolhido), [escolhido]);

  async function gerar() {
    if (gerando) return;
    setGerando(true);
    const selecionados = itensCalibracao.filter((i) => calibSelecionados.has(i.id));
    const docsCalibracao = selecionados.flatMap((i) =>
      i.certs.map((c) => `${arquivoCalibracao(c.tipo)}?calibId=${c.id}`),
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
    onGerar({ tipo, documentos: documentosFinais(marcados, docsCalibracao), containerId });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content mni-modal wz-modal" ref={caixa} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header mni-header">
          <h3>Configurar novo relatório</h3>
          <button type="button" className="btn-close-modal" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        {/* ── BARRA DE ETAPAS ────────────────────────────────────────────────
            Ela também NAVEGA para trás: voltar de "Revisar" para "Documentos"
            em um clique é o que o usuário tenta fazer primeiro. Para a frente
            não, porque a etapa 1 tem uma condição (pelo menos uma folha). */}
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
                    {st === 'feito' ? <Icone nome="check" tam={12} /> : p.n}
                  </span>
                  <span className="wz-passo-rot">{p.rotulo}</span>
                  <span className="wz-passo-rot-curto">{p.curto}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="modal-body mni-body">
          <div className="mni-resumo">
            <div className="mni-resumo-txt">
              <strong>{resumo.tag}</strong>
              <span>{[resumo.descricao, resumo.tipo].filter(Boolean).join(' · ') || 'Equipamento'}</span>
            </div>
            {aoVoltar && passo === 1 && (
              <button type="button" className="fj-btn fj-btn-ghost mni-trocar" onClick={aoVoltar}>
                ← Trocar equipamento
              </button>
            )}
          </div>

          {/* ══ ETAPA 1 · DOCUMENTOS ══════════════════════════════════════ */}
          {passo === 1 && (
            <>
              <div className="campo-bloco-modal">
                <label className="label-bloco-modal" htmlFor="wz-tipo">
                  Tipo de Inspeção
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
                  <span className="label-bloco-modal">Documentos do relatório</span>
                  <span className="texto-ajuda-modal-inline">
                    ↓ Quais partes vão compor o documento
                  </span>
                </div>
                <div className="lista-documentos-scroll">
                  {DOCUMENTOS_DISPONIVEIS.map((doc) => (
                    <label key={doc} className="item-documento-check">
                      <input
                        type="checkbox"
                        checked={marcados.includes(doc)}
                        onChange={() => toggle(doc)}
                      />
                      {(ROTULOS[doc] || doc).toUpperCase()}
                      {ENSAIOS.has(doc) && (
                        <span
                          className="ensaio-selo"
                          title="Folha de ensaio: o conteúdo vem da inspeção de campo, escolhida na próxima etapa"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          <span className="ensaio-bolinha" />
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Calibrações continuam AQUI, e não na etapa da inspeção: marcar
                  um lote ACRESCENTA FOLHAS ao documento (`?calibId=`), que é a
                  pergunta desta etapa. Elas nunca vieram de container. */}
              {itensCalibracao.length > 0 && (
                <div className="campo-bloco-modal">
                  <div className="mni-secao">
                    <span className="label-bloco-modal">Certificados de calibração</span>
                    <span className="texto-ajuda-modal-inline">
                      ↓ Entram como folhas no fim do relatório
                    </span>
                  </div>
                  <div className="lista-documentos-scroll">
                    {itensCalibracao.map((i) => (
                      <label key={i.id} className="item-documento-check" title={i.lote ? 'Lote de calibração' : 'Calibração avulsa'}>
                        <input
                          type="checkbox"
                          checked={calibSelecionados.has(i.id)}
                          onChange={() => toggleCalib(i.id)}
                        />
                        {i.rotulo}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══ ETAPA 2 · INSPEÇÃO ════════════════════════════════════════ */}
          {passo === 2 && (
            <div className="campo-bloco-modal">
              <div className="mni-secao">
                <span className="label-bloco-modal">Selecione a inspeção</span>
                <span className="texto-ajuda-modal-inline">
                  ↓ De onde vêm os dados de campo deste relatório
                </span>
              </div>

              <div className="wz-containers">
                {resumos.map((r) => (
                  <label
                    key={r.id}
                    className={`wz-container${containerId === r.id ? ' is-sel' : ''}`}
                  >
                    <input
                      type="radio"
                      name="wz-container"
                      checked={containerId === r.id}
                      onChange={() => setContainerId(r.id)}
                    />
                    {/* DUAS LINHAS, altura fixa. Os ícones dos ensaios ficam na
                        MESMA linha da meta: como bloco próprio eles somavam uma
                        terceira linha e o cartão chegava a 153 px no celular —
                        um container virava um painel. */}
                    <span className="wz-container-txt">
                      <strong>{r.nome}</strong>
                      <small>
                        <span className="wz-container-icones" aria-hidden="true">
                          {r.salvos.map((e) => (
                            <span key={e.ensaio} title={e.rotulo}>
                              <Icone nome={ICONE_ENSAIO[e.ensaio] ?? 'filetext'} tam={13} />
                            </span>
                          ))}
                        </span>
                        {r.data} · {rotuloConteudo(r)}
                        {r.responsavel ? ` · ${r.responsavel}` : ''}
                      </small>
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
                        setPreview(r.id);
                      }}
                    >
                      <Icone nome="eye" tam={16} />
                    </button>
                  </label>
                ))}

                <label className={`wz-container wz-container-sem${containerId === null ? ' is-sel' : ''}`}>
                  <input
                    type="radio"
                    name="wz-container"
                    checked={containerId === null}
                    onChange={() => setContainerId(null)}
                  />
                  <span className="wz-container-txt">
                    <strong>Não usar container</strong>
                    <small>Gerar relatório sem injeção de dados de inspeção</small>
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
          )}

          {/* ══ ETAPA 3 · REVISAR ═════════════════════════════════════════ */}
          {passo === 3 && (
            <div className="wz-revisao">
              <section className="wz-rev-bloco">
                <h4>Equipamento</h4>
                <p className="wz-rev-forte">{resumo.tag}</p>
                <p className="wz-rev-sub">
                  {[resumo.descricao, resumo.tipo].filter(Boolean).join(' · ') || 'Equipamento'}
                </p>
              </section>

              <section className="wz-rev-bloco">
                <h4>Tipo</h4>
                <p className="wz-rev-forte">{tipo}</p>
              </section>

              <section className="wz-rev-bloco wz-rev-larga">
                <h4>
                  Documentos <span className="wz-rev-cont">{marcados.length}</span>
                </h4>
                <ul className="wz-rev-lista">
                  {DOCUMENTOS_DISPONIVEIS.filter((d) => marcados.includes(d)).map((d) => (
                    <li key={d}>
                      <Icone nome="check" tam={12} /> {ROTULOS[d] || d}
                    </li>
                  ))}
                  {calibSelecionados.size > 0 && (
                    <li>
                      <Icone nome="check" tam={12} /> Certificados de calibração (
                      {calibSelecionados.size})
                    </li>
                  )}
                </ul>
              </section>

              <section className="wz-rev-bloco wz-rev-larga">
                <h4>Inspeção selecionada</h4>
                {escolhido ? (
                  <>
                    <p className="wz-rev-forte">{escolhido.nome}</p>
                    <p className="wz-rev-sub">
                      {escolhido.data}
                      {escolhido.responsavel ? ` · ${escolhido.responsavel}` : ''}
                      {escolhido.totalFotos > 0 ? ` · ${escolhido.totalFotos} foto${escolhido.totalFotos > 1 ? 's' : ''}` : ''}
                      {escolhido.totalMedicoes > 0 ? ` · ${escolhido.totalMedicoes} ${escolhido.totalMedicoes > 1 ? 'medições' : 'medição'}` : ''}
                    </p>
                    {revisaveis.length > 0 ? (
                      <>
                        <p className="wz-rev-ajuda">
                          Dados disponíveis. Desmarque o que não deve sair no documento:
                        </p>
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
                    ) : (
                      <p className="wz-rev-ajuda">
                        Esta inspeção ainda não tem ensaio preenchido — as folhas de ensaio sairão
                        em branco.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="wz-rev-sub">
                    Nenhum container selecionado. O relatório será gerado sem dados de inspeção.
                  </p>
                )}
              </section>
            </div>
          )}
        </div>

        <div className="modal-actions mni-rodape wz-rodape">
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
            <button type="button" className="btn-primario" disabled={gerando} onClick={() => void gerar()}>
              {gerando ? 'Gerando…' : 'Gerar Documento'}
            </button>
          )}
        </div>

        {/* ── O OLHO ─────────────────────────────────────────────────────────
            Painel SOBRE o assistente, dentro da mesma caixa: fechar devolve a
            etapa 2 exatamente como estava, com o radio onde estava. Nada é
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
                    setContainerId(emPreview.id);
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
    </div>
  );
}
