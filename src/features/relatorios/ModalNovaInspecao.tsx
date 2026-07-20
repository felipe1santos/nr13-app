import { useMemo, useState } from 'react';
import { arquivoCalibracao, listarCalibracoes } from '../calibracoes/calibracaoService';
import type { DadosCalibracao } from '../calibracoes/tipos';
import { listarLotes, salvarLote, type LoteCal } from '../calibracoes/componentesService';
import { DOCUMENTOS_DISPONIVEIS, type TipoInspecao } from './tipos';
import '../equipamento/equipamento.css';

const TIPOS: TipoInspecao[] = ['Inspeção Inicial', 'Inspeção Periódica', 'Inspeção Extraordinária'];

// Ensaios importados da inspeção de campo: começam DESMARCADOS para o usuário escolher o que imprimir.
// Recebem o selo (⚠ + bolinha amarela) indicando que o conteúdo vem importado da inspeção.
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

interface Props {
  onClose: () => void;
  onGerar: (tipo: TipoInspecao, documentos: string[]) => void;
  tag?: string;
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

const tsDoId = (id: string) => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);

function contagemPorTipo(certs: DadosCalibracao[]): string {
  const man = certs.filter((c) => c.tipo === 'manometro').length;
  const psv = certs.filter((c) => c.tipo === 'psv').length;
  const partes: string[] = [];
  if (man) partes.push(`${man} manômetro${man > 1 ? 's' : ''}`);
  if (psv) partes.push(`${psv} válvula${psv > 1 ? 's' : ''}`);
  return partes.join(', ');
}

export default function ModalNovaInspecao({ onClose, onGerar, tag = '' }: Props) {
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
      <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Configurar Novo Relatório</h3>
          <button type="button" className="btn-close-modal" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="campo-bloco-modal">
            <label className="label-bloco-modal">Tipo de Inspeção</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoInspecao)}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="campo-bloco-modal">
            <label className="label-bloco-modal">
              Documentos a agrupar <span className="texto-ajuda-modal-inline">↓ Selecione os documentos abaixo que irão compor o seu relatório</span>
            </label>
            <div className="lista-documentos-scroll">
              {DOCUMENTOS_DISPONIVEIS.map((doc) => (
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
              {itensCalibracao.length > 0 && (
                <>
                  <div style={{ marginTop: 10, marginBottom: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-2)', letterSpacing: '0.04em' }}>
                    Calibrações
                  </div>
                  {itensCalibracao.map((i) => (
                    <label key={i.id} className="item-documento-check" title="Injeta todos os certificados de calibração do lote e anexa os PDFs dos padrões (por tipo) ao final do relatório">
                      <input type="checkbox" checked={calibSelecionados.has(i.id)} onChange={() => toggleCalib(i.id)} />
                      {i.rotulo.toUpperCase()}
                    </label>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secundario" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn-primario" onClick={() => void gerar()} disabled={marcados.length === 0}>
              Gerar Documento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
