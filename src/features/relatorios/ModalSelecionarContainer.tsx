import { useState } from 'react';
import { Icone, type NomeIcone } from '../../components/Icone';
import { listarContainers } from '../inspecoes/inspecaoService';
import { ENSAIOS_DISPONIVEIS, FORM_POR_ENSAIO, type TipoEnsaio } from '../inspecoes/tipos';
import '../equipamento/equipamento.css';

interface Props {
  tag: string;
  onClose: () => void;
  onConfirmar: (containerId: string | null) => void;
}

// Ícone por tipo de ensaio (sprite próprio do sistema) — visualização rápida no item.
const ICONE_ENSAIO: Record<TipoEnsaio, NomeIcone> = {
  checklist: 'clipboard',
  ultrassom: 'gauge',
  visual_externo: 'eye',
  visual_interno: 'search',
  teste_hidrostatico: 'cylinder',
};

function rotuloEnsaio(e: TipoEnsaio): string {
  return ENSAIOS_DISPONIVEIS.find((d) => d.value === e)?.label ?? e;
}

// dd/mm/aaaa para exibição; datas ISO dos inputs date (aaaa-mm-dd) são convertidas.
function dataBR(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v.trim();
}

// Data preenchida no formulário do ensaio (primeiro campo `data*` com valor); sem
// campo de data no blob, cai na data de criação do container.
function dataDoEnsaio(dados: unknown, fallback: string): string {
  if (dados && typeof dados === 'object') {
    for (const [k, v] of Object.entries(dados as Record<string, unknown>)) {
      if (/^data/i.test(k) && typeof v === 'string' && v.trim()) return dataBR(v);
    }
  }
  return fallback;
}

export default function ModalSelecionarContainer({ tag, onClose, onConfirmar }: Props) {
  const containers = listarContainers(tag);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  // Popup de detalhes (olhinho): abre por hover e trava/destrava no clique. Position
  // FIXED calculada do botão — a lista tem overflow e cortaria um popup absoluto.
  const [popAberto, setPopAberto] = useState<string | null>(null);
  const [popFixo, setPopFixo] = useState(false);
  const [popPos, setPopPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  function posicionarPop(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const largura = 300;
    setPopPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.right - largura, window.innerWidth - largura - 8)),
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Selecionar Container de Inspeção</h3>
          <button type="button" className="btn-close-modal" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="texto-ajuda-modal">
            Selecione um container de inspeção pra injetar automaticamente os dados de campo já coletados (ultrassom, checklist,
            calibrações...) neste relatório. Opcional.
          </p>

          <div className="lista-documentos-scroll">
            <label className="item-documento-check">
              <input type="radio" name="container" checked={selecionado === null} onChange={() => setSelecionado(null)} />
              Não injetar dados (relatório em branco)
            </label>
            {containers.map((c) => (
              <div key={c.id} style={{ position: 'relative' }}>
                <label className="item-documento-check" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" name="container" checked={selecionado === c.id} onChange={() => setSelecionado(c.id)} />
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.nome}
                  </span>
                  <span style={{ color: 'var(--muted, #6b7280)', fontSize: 11.5, flexShrink: 0 }}>{c.criadoEm}</span>
                  <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto', flexShrink: 0, color: '#1d4ed8' }}>
                    {c.ensaios.map((e) => (
                      <span key={e} title={rotuloEnsaio(e)} style={{ display: 'inline-flex' }}>
                        <Icone nome={ICONE_ENSAIO[e] ?? 'filetext'} tam={15} />
                      </span>
                    ))}
                  </span>
                  <button
                    type="button"
                    title="Ver detalhes do container"
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      color: 'var(--muted, #6b7280)',
                      flexShrink: 0,
                      display: 'inline-flex',
                    }}
                    onMouseEnter={(e) => { if (!popFixo) { posicionarPop(e.currentTarget); setPopAberto(c.id); } }}
                    onMouseLeave={() => { if (!popFixo) setPopAberto(null); }}
                    onClick={(e) => {
                      // Dentro do <label>: sem preventDefault o clique marcaria o radio.
                      e.preventDefault();
                      e.stopPropagation();
                      if (popAberto === c.id && popFixo) {
                        setPopFixo(false);
                        setPopAberto(null);
                      } else {
                        posicionarPop(e.currentTarget);
                        setPopAberto(c.id);
                        setPopFixo(true);
                      }
                    }}
                  >
                    <Icone nome="eye" tam={16} />
                  </button>
                </label>

                {popAberto === c.id && (
                  <div
                    style={{
                      position: 'fixed',
                      top: popPos.top,
                      left: popPos.left,
                      zIndex: 1000,
                      width: 300,
                      background: '#fff',
                      border: '1px solid #d5d9dd',
                      borderRadius: 10,
                      boxShadow: '0 8px 24px rgba(0,0,0,.15)',
                      padding: '10px 12px',
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 2 }}>{c.nome}</div>
                    <div style={{ color: 'var(--muted, #6b7280)', fontSize: 11.5, marginBottom: 8 }}>
                      Criado em {c.criadoEm} · {c.ensaios.length} ensaio{c.ensaios.length !== 1 ? 's' : ''}
                    </div>
                    {c.ensaios.map((e) => (
                      <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0' }}>
                        <span style={{ color: '#1d4ed8', display: 'inline-flex' }}>
                          <Icone nome={ICONE_ENSAIO[e] ?? 'filetext'} tam={13} />
                        </span>
                        <span style={{ flex: 1 }}>{rotuloEnsaio(e)}</span>
                        <span style={{ color: 'var(--muted, #6b7280)', fontSize: 11 }}>
                          {dataDoEnsaio(c.dados?.[FORM_POR_ENSAIO[e]], c.criadoEm)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {containers.length === 0 && (
              <p className="dashboard-vazio" style={{ padding: 16 }}>
                Nenhum container de inspeção salvo pra este equipamento ainda.
              </p>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secundario" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn-primario" onClick={() => onConfirmar(selecionado)}>
              Gerar Documento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
