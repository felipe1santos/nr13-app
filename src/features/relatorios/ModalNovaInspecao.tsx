import { useState } from 'react';
import { arquivoCalibracao, listarCalibracoes } from '../calibracoes/calibracaoService';
import { DOCUMENTOS_DISPONIVEIS, type TipoInspecao } from './tipos';
import '../equipamento/equipamento.css';

const TIPOS: TipoInspecao[] = ['Inspeção Inicial', 'Inspeção Periódica', 'Inspeção Extraordinária'];

const ROTULOS: Record<string, string> = {
  'CAPA.html': 'Capa',
  'SUMARIO.html': 'Sumário',
  'PLACA.html': 'Placa de Identificação',
  'PRONTUARIO.html': 'Prontuário',
  'CLASSIFICACAO-RISCO.html': 'Caracterização (Classificação de Risco)',
  'RESUMO-MEMORIAL.html': 'Resumo do Memorial',
  'MEMORIAL1.html': 'Memorial de Cálculo (1/3)',
  'MEMORIAL2.html': 'Memorial de Cálculo (2/3)',
  'MEMORIAL3.html': 'Memorial de Cálculo (3/3)',
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

export default function ModalNovaInspecao({ onClose, onGerar, tag = '' }: Props) {
  const [tipo, setTipo] = useState<TipoInspecao>('Inspeção Periódica');
  const [marcados, setMarcados] = useState<string[]>([...DOCUMENTOS_DISPONIVEIS]);
  const calibracoes = tag ? listarCalibracoes(tag) : [];
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

  function gerar() {
    const ordenados = DOCUMENTOS_DISPONIVEIS.filter((d) => marcados.includes(d));
    const calibDocs = calibracoes
      .filter((c) => calibSelecionados.has(c.id))
      .map((c) => `${arquivoCalibracao(c.tipo)}?calibId=${c.id}`);
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
                </label>
              ))}
              {calibracoes.length > 0 && (
                <>
                  <div style={{ marginTop: 10, marginBottom: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-2)', letterSpacing: '0.04em' }}>
                    Certificados de Calibração Disponíveis
                  </div>
                  {calibracoes.map((c) => (
                    <label key={c.id} className="item-documento-check">
                      <input type="checkbox" checked={calibSelecionados.has(c.id)} onChange={() => toggleCalib(c.id)} />
                      {`${c.tipo === 'manometro' ? 'MANÔMETRO' : 'PSV'} — ${c.nome} (${c.dataCalibracao || c.criadoEm})`}
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
            <button type="button" className="btn-primario" onClick={gerar} disabled={marcados.length === 0}>
              Gerar Documento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
