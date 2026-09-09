import { useMemo, useState } from 'react';
import { arquivoCalibracao, listarCalibracoes } from '../calibracoes/calibracaoService';
import type { DadosCalibracao } from '../calibracoes/tipos';
import { listarLotes, salvarLote, type LoteCal } from '../calibracoes/componentesService';
import { listarContainers } from '../inspecoes/inspecaoService';
import { DOCS_POR_FORMULARIO, type FormularioEnsaio } from '../inspecoes/tipos';
import { DOCUMENTOS_DISPONIVEIS, type TipoInspecao } from './tipos';
import '../equipamento/equipamento.css';
import './modalCriarRelatorio.css';

const TIPOS: TipoInspecao[] = ['Inspeção Inicial', 'Inspeção Periódica', 'Inspeção Extraordinária'];

// Ensaios importados da inspeção de campo: começam DESMARCADOS para o usuário escolher o que imprimir.
// Quando existe container com o formulário preenchido, eles sobem para o bloco de
// "Injeção Automática" (ver `automaticos`); sem container, ficam na lista com o selo de aviso.
const ENSAIOS = new Set<string>([
  'VISUAL-EXTERNO.html',
  'VISUAL-INTERNO.html',
  'ULTRASSOM.html',
  'TESTE-HIDROSTATICO.html',
]);

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

/**
 * Nome curto do ensaio no bloco azul.
 *
 * O rótulo da LISTA carrega a composição da folha entre parênteses ("checklist +
 * folhas de fotos"), que ali é útil — o usuário está escolhendo folhas. No bloco
 * de injeção a pergunta é outra: "o que veio de campo?". "Medição de Espessura"
 * responde; "Laudo de Ultrassom (checklist + folhas de fotos)" atrapalha.
 */
const ROTULO_CURTO: Record<string, string> = {
  'ULTRASSOM.html': 'Medição de Espessura',
  'VISUAL-EXTERNO.html': 'Inspeção Visual Externa',
  'VISUAL-INTERNO.html': 'Inspeção Visual Interna',
  'TESTE-HIDROSTATICO.html': 'Teste Hidrostático',
};

interface Props {
  onClose: () => void;
  onGerar: (tipo: TipoInspecao, documentos: string[]) => void;
  tag?: string;
  /**
   * Passo 2 da criação em `/relatorios`: o resumo do equipamento já escolhido.
   *
   * Sem ele o modal abre falando de "documentos a agrupar" sem dizer de qual
   * equipamento — no fluxo antigo isso não incomodava porque a TAG estava na
   * tela atrás; em modal sobre a LISTA, a tela atrás fala de outra coisa.
   */
  resumo?: { tag: string; descricao?: string | null; tipo?: string | null };
  /** "← Trocar equipamento": volta ao passo 1 sem sair da rota. */
  aoVoltar?: () => void;
}

// Item selecionável da seção "Calibrações": um LOTE inteiro (todas as calibrações da
// rodada) ou uma calibração avulsa antiga. Marcar o lote injeta todos os certificados
// dele; os PDFs dos padrões (por tipo) entram automaticamente no final do PDF.
interface ItemCalibracao {
  id: string;
  rotulo: string;
  certs: DadosCalibracao[];
  lote?: LoteCal;
}

/**
 * Uma linha do bloco "Injeção Automática": o que o sistema ACHOU salvo para
 * este equipamento, e que o usuário decide levar ou não para o documento.
 *
 * `origem` é o que a linha de baixo mostra ("Container: …"). Ela é sempre um
 * dado real — container que existe, lote que existe. Nada é inventado: sem
 * fonte, o item não entra neste bloco (fica na lista comum).
 */
interface ItemAutomatico {
  chave: string;
  rotulo: string;
  origem: string;
  marcado: boolean;
  alternar: () => void;
  titulo: string;
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

/** O documento do relatório → o formulário de campo que o alimenta. */
const FORM_DO_DOC = new Map<string, FormularioEnsaio>(
  (Object.entries(DOCS_POR_FORMULARIO) as [FormularioEnsaio, string[]][])
    .flatMap(([form, docs]) => docs.map((d) => [d, form] as [string, FormularioEnsaio])),
);

/**
 * Para cada ensaio, o CONTAINER que tem esse formulário PREENCHIDO.
 *
 * "Preenchido" é `container.dados[formulario]` existir — é o mesmo critério que
 * o resto do sistema usa para saber se o técnico salvou aquele formulário em
 * campo. Container criado e nunca aberto não conta: prometer injeção de um
 * formulário vazio é pior do que não prometer nada.
 *
 * Mais de um container com o mesmo formulário é caso real (reinspeção): mostra
 * o mais recente e diz quantos outros existem, em vez de escolher em silêncio.
 */
function origemDeCampo(tag: string): Map<string, string> {
  const mapa = new Map<string, string>();
  if (!tag) return mapa;
  const containers = listarContainers(tag);
  for (const doc of ENSAIOS) {
    const form = FORM_DO_DOC.get(doc);
    if (!form) continue;
    const comDado = containers.filter((c) => c.dados && c.dados[form] !== undefined);
    if (comDado.length === 0) continue;
    const recente = comDado[comDado.length - 1];
    const extras = comDado.length - 1;
    mapa.set(doc, `Container: ${recente.nome}${extras > 0 ? ` (+${extras})` : ''}`);
  }
  return mapa;
}

export default function ModalNovaInspecao({ onClose, onGerar, tag = '', resumo, aoVoltar }: Props) {
  const [tipo, setTipo] = useState<TipoInspecao>('Inspeção Periódica');
  const [marcados, setMarcados] = useState<string[]>(
    DOCUMENTOS_DISPONIVEIS.filter((d) => !ENSAIOS.has(d)),
  );
  // 3 últimas calibrações (lote conta como 1 item; avulsas antigas idem), mais recentes primeiro.
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
  const [calibSelecionados, setCalibSelecionados] = useState<Set<string>>(new Set());

  const origens = useMemo(() => origemDeCampo(tag), [tag]);

  function toggle(doc: string) {
    setMarcados((m) => (m.includes(doc) ? m.filter((d) => d !== doc) : [...m, doc]));
  }

  function toggleCalib(id: string) {
    setCalibSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  /**
   * O conteúdo do bloco azul. É uma VISTA sobre os dois estados que já existiam
   * (`marcados` e `calibSelecionados`) — nenhum estado novo, nenhuma regra nova:
   * marcar aqui é exatamente marcar a mesma caixa que estava na lista.
   */
  const automaticos = useMemo<ItemAutomatico[]>(() => {
    const doCampo: ItemAutomatico[] = DOCUMENTOS_DISPONIVEIS.filter(
      (d) => ENSAIOS.has(d) && origens.has(d),
    ).map((doc) => ({
      chave: doc,
      rotulo: ROTULO_CURTO[doc] ?? ROTULOS[doc] ?? doc,
      origem: origens.get(doc)!,
      marcado: marcados.includes(doc),
      alternar: () => toggle(doc),
      titulo: 'Dados de campo já salvos neste equipamento — marque para injetar no relatório',
    }));
    const dasCalibracoes: ItemAutomatico[] = itensCalibracao.map((i) => ({
      chave: `cal:${i.id}`,
      rotulo: i.rotulo,
      origem: i.lote ? 'Lote de calibração' : 'Calibração avulsa',
      marcado: calibSelecionados.has(i.id),
      alternar: () => toggleCalib(i.id),
      titulo:
        'Injeta todos os certificados de calibração do lote e anexa os PDFs dos padrões (por tipo) ao final do relatório',
    }));
    return [...doCampo, ...dasCalibracoes];
  }, [origens, marcados, itensCalibracao, calibSelecionados]);

  // O que sobe para o bloco azul sai da lista de baixo — senão a mesma caixa
  // apareceria duas vezes, e desmarcar numa "desmarcaria sozinha" na outra.
  const naLista = DOCUMENTOS_DISPONIVEIS.filter((d) => !origens.has(d));

  async function gerar() {
    const ordenados = DOCUMENTOS_DISPONIVEIS.filter((d) => marcados.includes(d));
    const selecionados = itensCalibracao.filter((i) => calibSelecionados.has(i.id));
    // Lote marcado = TODAS as calibrações dele viram folhas no fim do relatório; os PDFs
    // dos certificados padrão (por tipo presente) são anexados no export/impressão.
    const calibDocs = selecionados.flatMap((i) =>
      i.certs.map((c) => `${arquivoCalibracao(c.tipo)}?calibId=${c.id}`),
    );
    // Lote entra na fila de vínculo: salvarHistorico captura via vincularLotesPendentes
    // (alimenta as colunas de validade de válvula/manômetro no histórico).
    if (tag) {
      for (const i of selecionados) {
        if (i.lote && !i.lote.relatorioId) {
          await salvarLote(tag, { ...i.lote, vincularProximoRelatorio: true });
        }
      }
    }
    onGerar(tipo, [...ordenados, ...calibDocs]);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content mni-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header mni-header">
          <h3>Configurar Novo Relatório</h3>
          <button type="button" className="btn-close-modal" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body mni-body">
          {resumo && (
            <div className="mni-resumo">
              <div className="mni-resumo-txt">
                <strong>{resumo.tag}</strong>
                <span>
                  {[resumo.descricao, resumo.tipo].filter(Boolean).join(' · ') || 'Equipamento'}
                </span>
              </div>
              {aoVoltar && (
                <button type="button" className="fj-btn fj-btn-ghost mni-trocar" onClick={aoVoltar}>
                  ← Trocar equipamento
                </button>
              )}
            </div>
          )}
          <div className="campo-bloco-modal">
            <label className="label-bloco-modal" htmlFor="mni-tipo">
              Tipo de Inspeção
            </label>
            <select
              id="mni-tipo"
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

          {/* ── INJEÇÃO AUTOMÁTICA ────────────────────────────────────────────
              O bloco só existe quando há o que injetar. Um painel azul dizendo
              "o sistema localizou formulários salvos" com nada dentro afirmaria
              o contrário do que é verdade. */}
          {automaticos.length > 0 && (
            <div className="mni-auto">
              <div className="mni-auto-titulo">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
                </svg>
                Injeção Automática de Dados (Containers)
              </div>
              <p className="mni-auto-sub">
                O sistema localizou formulários salvos para este equipamento. Marque abaixo o que
                deseja injetar automaticamente neste relatório:
              </p>
              <div className="mni-auto-lista">
                {automaticos.map((a) => (
                  <label key={a.chave} className="mni-auto-item" title={a.titulo}>
                    <input type="checkbox" checked={a.marcado} onChange={a.alternar} />
                    <span className="mni-auto-texto">
                      <strong>{a.rotulo}</strong>
                      <small>{a.origem}</small>
                    </span>
                    <span className="mni-auto-ok" title="Dados salvos e disponíveis" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="campo-bloco-modal">
            <div className="mni-secao">
              <span className="label-bloco-modal">Documentos a agrupar</span>
              <span className="texto-ajuda-modal-inline">
                ↓ Selecione os documentos abaixo que irão compor o seu relatório
              </span>
            </div>
            <div className="lista-documentos-scroll">
              {naLista.map((doc) => (
                <label key={doc} className="item-documento-check">
                  <input type="checkbox" checked={marcados.includes(doc)} onChange={() => toggle(doc)} />
                  {(ROTULOS[doc] || doc).toUpperCase()}
                  {ENSAIOS.has(doc) && (
                    <span className="ensaio-selo" title="Ensaio importado da inspeção de campo — marque para incluir no relatório">
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
        </div>

        {/* O rodapé saiu do corpo rolável: com a lista longa, "Gerar Documento"
            ficava abaixo da dobra do modal e só aparecia depois de rolar tudo. */}
        <div className="modal-actions mni-rodape">
          <button type="button" className="btn-secundario" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primario" onClick={() => void gerar()} disabled={marcados.length === 0}>
            Gerar Documento
          </button>
        </div>
      </div>
    </div>
  );
}
