import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FotoImg from './FotoImg';
import { Icone } from './Icone';
import { iconeDoTipo } from './listaCobalto';
import type { RefFoto } from '../services/fotos';
import { useFotoDaTag } from '../services/fotosEquipamentos';
import './foto-lista.css';

/**
 * A "cara" do equipamento numa linha de lista — 21/11/2026.
 *
 * Com foto: a miniatura no lugar do ícone do tipo. Passando o mouse, abre NA
 * HORA um quadrado maior da mesma foto, com o ícone do tipo no canto inferior
 * direito — a visualização rápida que o Registro de Segurança já tinha.
 * Sem foto: o ícone do tipo de sempre (`.lc-ico`), nada muda.
 *
 * A miniatura é a variante `thumb` (~16 KB, guardada no cofre do aparelho) e só
 * resolve quando a linha entra na tela (`FotoImg`). A ampliação usa a MESMA
 * miniatura — 400 px dão conta de um quadrado de 176 px sem nova requisição.
 *
 * A ampliação é só de mouse e é decorativa (`aria-hidden`): a linha inteira já
 * é o botão que abre o equipamento, e um segundo alvo focável dentro dele
 * quebraria a semântica do botão. No toque, nada abre — o toque abre a linha.
 */
export default function FotoLista({
  tipo,
  fotoRef,
}: {
  tipo: string | null | undefined;
  /** `fotoRef` da projeção (`equipamentos_index.foto_ref`) — null = sem foto. */
  fotoRef: RefFoto | null | undefined;
}) {
  // Memo: objeto novo a cada render faria o FotoImg resolver a foto de novo.
  const foto = useMemo(() => (fotoRef ? { ref: fotoRef } : null), [fotoRef]);
  const ancora = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const classeTipo = tipo === 'vaso' || tipo === 'caldeira' || tipo === 'autoclave' ? tipo : 'outro';

  const abrir = useCallback(() => {
    const r = ancora.current?.getBoundingClientRect();
    if (!r) return;
    const LADO = 176;
    const MARGEM = 10;
    // À direita da miniatura; se não couber, à esquerda. Verticalmente
    // centrada na linha, sem sair da janela.
    let x = r.right + MARGEM;
    if (x + LADO > window.innerWidth - 8) x = Math.max(8, r.left - MARGEM - LADO);
    const y = Math.min(Math.max(8, r.top + r.height / 2 - LADO / 2), window.innerHeight - LADO - 8);
    setPos({ x, y });
  }, []);
  const fechar = useCallback(() => setPos(null), []);

  if (!foto) {
    return (
      <span className={`lc-ico ${classeTipo}`} aria-hidden="true">
        <Icone nome={iconeDoTipo(tipo)} tam={16} />
      </span>
    );
  }

  return (
    <>
      <span
        ref={ancora}
        className="fl-mini"
        onMouseEnter={abrir}
        onMouseLeave={fechar}
        aria-hidden="true"
      >
        <FotoImg foto={foto} variante="thumb" placeholder="" />
      </span>
      {pos &&
        createPortal(
          <span className="fl-zoom" style={{ left: pos.x, top: pos.y }} aria-hidden="true">
            <FotoImg foto={foto} variante="thumb" placeholder="" />
            <span className={`fl-tipo ${classeTipo}`}>
              <Icone nome={iconeDoTipo(tipo)} tam={15} />
            </span>
          </span>,
          document.body,
        )}
    </>
  );
}

/**
 * Para listas que não trazem a foto (Relatórios, Prontuários): resolve pela
 * TAG com `useFotoDaTag` — as linhas de um mesmo render saem numa chamada só.
 */
export function FotoListaPorTag({ tag, tipo }: { tag: string; tipo?: string | null }) {
  const f = useFotoDaTag(tag);
  return <FotoLista tipo={tipo ?? f?.tipo ?? null} fotoRef={f?.fotoRef ?? null} />;
}
