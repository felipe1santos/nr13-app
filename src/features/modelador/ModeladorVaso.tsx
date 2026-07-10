// Tela do Modelador de Vaso (fase 2) — overlay full-screen estilo PVElite: painel de elementos
// à esquerda (`PainelElementos`) editando o `ModeloVaso` em memória, viewport 3D interativo à
// direita (`Viewport3D`). "Salvar" gera o PNG do viewport (captura), os croquis 2D técnicos
// (`gerarCroquis2d`) e grava tudo via `salvarModelo` (chaves `nr13_modelo3d_<TAG>` etc. — ver
// `modeladorService.ts`); "Fechar" descarta sem persistir.
import { useRef, useState } from 'react';
import { carregarOuPreCarregar, salvarModelo } from './modeladorService';
import { gerarCroquis2d } from './croqui2dService';
import Viewport3D from './Viewport3D';
import PainelElementos from './PainelElementos';
import type { ModeloVaso } from './tiposModelador';
import './modelador.css';

interface Props {
  tag: string;
  onFechar: () => void;
  onSalvo: (png3d: string | null) => void;
}

export default function ModeladorVaso({ tag, onFechar, onSalvo }: Props) {
  const [modelo, setModelo] = useState<ModeloVaso>(() => carregarOuPreCarregar(tag));
  const [translucido, setTranslucido] = useState(true);
  const [mostrarCotas, setMostrarCotas] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const capturaRef = useRef<(() => string | null) | null>(null);

  async function handleSalvar() {
    if (salvando) return;
    setSalvando(true);
    try {
      const png = capturaRef.current?.() ?? null;
      const croquis = gerarCroquis2d(modelo);
      await salvarModelo(tag, modelo, croquis, png);
      setToast(croquis === null ? 'Modelo salvo — croqui 2D pendente (preencha Ø, comprimento e espessuras)' : 'Modelo salvo');
      onSalvo(png);
      window.setTimeout(() => onFechar(), 900);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modelador-overlay" role="dialog" aria-modal="true" aria-label={`Modelador — ${tag}`}>
      <div className="modelador-box">
        <header className="modelador-header">
          <h2>Modelador — {tag}</h2>
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

        <div className="modelador-corpo">
          <div className="modelador-painel">
            <PainelElementos modelo={modelo} onChange={setModelo} />
          </div>

          <div className="modelador-viewport">
            <div className="modelador-viewport-toggles">
              <label className="modelador-toggle">
                <input type="checkbox" checked={translucido} onChange={(e) => setTranslucido(e.target.checked)} />
                <span className="modelador-toggle-caixa" />
                Translúcido
              </label>
              <label className="modelador-toggle">
                <input type="checkbox" checked={mostrarCotas} onChange={(e) => setMostrarCotas(e.target.checked)} />
                <span className="modelador-toggle-caixa" />
                Cotas
              </label>
            </div>
            <div className="modelador-viewport-canvas">
              <Viewport3D modelo={modelo} translucido={translucido} mostrarCotas={mostrarCotas} capturaRef={capturaRef} />
            </div>
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
