// Tela do editor de Croqui 2D do vaso — overlay full-screen estilo PVElite: painel de elementos
// à esquerda (`PainelElementos`) editando o `ModeloVaso` em memória, preview 2D ao vivo à direita
// (`gerarCroquis2d` a cada mudança do modelo). "Salvar" grava o modelo, os croquis 2D técnicos e a
// folha de dados via `salvarModelo` (chaves `nr13_modelo3d_<TAG>` etc. — ver `modeladorService.ts`);
// "Fechar" descarta sem persistir.
import { useMemo, useState } from 'react';
import { carregarOuPreCarregar, salvarModelo } from './modeladorService';
import { gerarCroquis2d } from './croqui2dService';
import PainelElementos from './PainelElementos';
import type { ModeloVaso } from './tiposModelador';
import './modelador.css';

interface Props {
  tag: string;
  onFechar: () => void;
  /** `croquiGerado` = false quando salvou com dados mínimos incompletos (croqui 2D pendente). */
  onSalvo: (croquiGerado: boolean) => void;
  /** Aviso de contexto exibido sob o cabeçalho (ex.: croqui obrigatório vindo do memorial). */
  aviso?: string;
}

export default function ModeladorVaso({ tag, onFechar, onSalvo, aviso }: Props) {
  const [modelo, setModelo] = useState<ModeloVaso>(() => carregarOuPreCarregar(tag));
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const croquis = useMemo(() => gerarCroquis2d(modelo), [modelo]);

  async function handleSalvar() {
    if (salvando) return;
    setSalvando(true);
    try {
      await salvarModelo(tag, modelo, croquis);
      setToast(croquis === null ? 'Modelo salvo — croqui 2D pendente (preencha Ø, comprimento e espessuras)' : 'Modelo salvo');
      onSalvo(croquis !== null);
      window.setTimeout(() => onFechar(), 900);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modelador-overlay" role="dialog" aria-modal="true" aria-label={`Croqui 2D — ${tag}`}>
      <div className="modelador-box">
        <header className="modelador-header">
          <h2>Croqui do Vaso — 2D — {tag}</h2>
          <div className="modelador-header-acoes">
            <button type="button" className="btn-secundario" onClick={onFechar} disabled={salvando}>
              Fechar
            </button>
            <button
              type="button"
              className={`btn-primario ${salvando ? 'is-loading' : ''}`}
              onClick={handleSalvar}
              disabled={salvando}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </header>

        {aviso && (
          <div className="modelador-aviso" role="note">
            {aviso}
          </div>
        )}

        <div className="modelador-corpo">
          <div className="modelador-painel">
            <PainelElementos modelo={modelo} onChange={setModelo} />
          </div>

          <div className="modelador-preview">
            {croquis === null ? (
              <div className="modelador-preview-vazio">
                Preencha Ø interno, comprimento e espessuras para ver o croqui
              </div>
            ) : (
              <>
                {/* SVGs vêm do gerador confiável do próprio app (croqui2dService) — sem input de usuário */}
                <div
                  className="modelador-preview-principal"
                  dangerouslySetInnerHTML={{ __html: croquis.longitudinal }}
                />
                <div className="modelador-preview-minis">
                  <div className="modelador-preview-mini" dangerouslySetInnerHTML={{ __html: croquis.transversal }} />
                  <div className="modelador-preview-mini" dangerouslySetInnerHTML={{ __html: croquis.detalheTampo }} />
                </div>
              </>
            )}
          </div>
        </div>

        {toast && (
          <div className="modelador-toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
