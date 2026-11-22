import { useRef, useState, type KeyboardEvent, type PointerEvent as PE } from 'react';
import { Icone } from '../../../components/Icone';
import type { EstadoAnotacoes } from './contexto';
import {
  ALTURA_LINHA,
  TAMANHO_TEXTO_PADRAO,
  normalizar,
  novoId,
  simplificarTraco,
  type Ponto,
  type TextoAnotacao,
} from './modelo';
import './anotacoes.css';

/**
 * A camada de anotações de UMA página, por cima do canvas (e da camada de
 * edição de campos da prévia).
 *
 * Desligada (sem ferramenta), ela não recebe ponteiro nenhum: o toque rola a
 * página, o clique chega aos campos editáveis embaixo. Só com "Desenhar" ela
 * segura o toque (`touch-action: none`) — é a única forma de o dedo riscar em
 * vez de rolar.
 */
export default function CamadaAnotacoes({
  pagina,
  largura,
  altura,
  estado,
}: {
  pagina: number;
  largura: number;
  altura: number;
  estado: EstadoAnotacoes;
}) {
  const { ferramenta, lista, cor, espessura, selecionada, setSelecionada, adicionar } = estado;
  const [emCurso, setEmCurso] = useState<Ponto[] | null>(null);
  const [recemCriada, setRecemCriada] = useState<string | null>(null);
  const ponteiro = useRef<number | null>(null);

  const daPagina = lista.filter((a) => a.pagina === pagina);
  const pontoDe = (e: PE<Element>, el: Element) => {
    const r = el.getBoundingClientRect();
    return normalizar(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  };

  function aoBaixar(e: PE<HTMLDivElement>) {
    if (e.button !== 0) return;
    // Só o fundo da camada: o clique numa caixa de texto é dela.
    if (e.target !== e.currentTarget && !(e.target instanceof SVGElement)) return;
    if (ferramenta === 'desenhar') {
      e.preventDefault();
      capturar(e);
      ponteiro.current = e.pointerId;
      setEmCurso([pontoDe(e, e.currentTarget)]);
      return;
    }
    if (ferramenta === 'texto') {
      e.preventDefault();
      // Com uma caixa selecionada, o clique fora só tira a seleção — como em
      // qualquer editor. O próximo clique cria.
      if (selecionada) {
        setSelecionada(null);
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      const p = pontoDe(e, e.currentTarget);
      const id = novoId();
      adicionar({ id, tipo: 'texto', pagina, x: p.x, y: p.y, texto: '', cor, tamanho: TAMANHO_TEXTO_PADRAO });
      setSelecionada(id);
      setRecemCriada(id);
    }
  }

  function aoMover(e: PE<HTMLDivElement>) {
    if (ferramenta !== 'desenhar' || ponteiro.current !== e.pointerId || !emCurso) return;
    const el = e.currentTarget;
    // Caneta e dedo entregam vários pontos por quadro; sem os coalescidos o
    // traço rápido sai poligonal.
    const eventos = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    const r = el.getBoundingClientRect();
    const novos = (eventos.length ? eventos : [e.nativeEvent]).map((ev) =>
      normalizar(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height),
    );
    setEmCurso((atual) => (atual ? [...atual, ...novos] : atual));
  }

  function aoSoltar(e: PE<HTMLDivElement>) {
    if (ponteiro.current !== e.pointerId) return;
    ponteiro.current = null;
    const pontos = emCurso;
    setEmCurso(null);
    if (!pontos || pontos.length === 0) return;
    adicionar({ id: novoId(), tipo: 'traco', pagina, cor, espessura, pontos: simplificarTraco(pontos) });
  }

  const caminho = (pontos: Ponto[]) => {
    if (pontos.length === 0) return '';
    const [p0, ...resto] = pontos;
    // Um ponto só (um toque) vira um pingo: a ponta redonda desenha o círculo.
    const cauda = resto.length ? resto : [p0];
    return `M${p0.x * largura} ${p0.y * altura}` + cauda.map((p) => ` L${p.x * largura} ${p.y * altura}`).join('');
  };

  return (
    <div
      className={`anot-camada${ferramenta ? ` is-${ferramenta}` : ''}`}
      onPointerDown={aoBaixar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      data-testid={`anot-camada-${pagina}`}
    >
      <svg className="anot-svg" width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true">
        {daPagina.map((a) =>
          a.tipo === 'traco' ? (
            <path
              key={a.id}
              d={caminho(a.pontos)}
              stroke={a.cor}
              strokeWidth={a.espessura * largura}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null,
        )}
        {emCurso && (
          <path d={caminho(emCurso)} stroke={cor} strokeWidth={espessura * largura} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {daPagina.map((a) =>
        a.tipo === 'texto' ? (
          <CaixaTexto
            key={a.id}
            anotacao={a}
            largura={largura}
            altura={altura}
            estado={estado}
            editarAoMontar={recemCriada === a.id}
            aoMontar={() => setRecemCriada(null)}
          />
        ) : null,
      )}
    </div>
  );
}

/**
 * Prende o ponteiro ao elemento para o traço/arraste seguir fora dele. Pode
 * recusar (ponteiro que já terminou, evento sintético): aí segue sem captura.
 */
function capturar(e: PE<Element>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* sem captura o gesto funciona igual dentro da folha */
  }
}

function CaixaTexto({
  anotacao: a,
  largura,
  altura,
  estado,
  editarAoMontar,
  aoMontar,
}: {
  anotacao: TextoAnotacao;
  largura: number;
  altura: number;
  estado: EstadoAnotacoes;
  editarAoMontar: boolean;
  aoMontar: () => void;
}) {
  const { selecionada, setSelecionada, atualizar, remover, marcarPasso, ferramenta } = estado;
  const [editando, setEditando] = useState(editarAoMontar);
  const arraste = useRef<{ id: number; x0: number; y0: number; ax: number; ay: number; moveu: boolean } | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const ativa = selecionada === a.id;
  const tamPx = a.tamanho * largura;
  const linhas = a.texto.split('\n');

  function entrarEmEdicao() {
    marcarPasso();
    setEditando(true);
  }

  function aoBaixar(e: PE<HTMLDivElement>) {
    if (ferramenta !== 'texto' || editando || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.anot-excluir')) return;
    e.preventDefault();
    e.stopPropagation();
    setSelecionada(a.id);
    caixaRef.current?.focus();
    capturar(e);
    arraste.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: a.x, ay: a.y, moveu: false };
  }

  function aoMover(e: PE<HTMLDivElement>) {
    const d = arraste.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moveu) {
      if (Math.hypot(dx, dy) < 3) return; // tremida do dedo não é arraste
      d.moveu = true;
      marcarPasso();
    }
    atualizar(a.id, {
      x: Math.min(0.98, Math.max(0, d.ax + dx / largura)),
      y: Math.min(0.98, Math.max(0, d.ay + dy / altura)),
    });
  }

  function aoSoltar(e: PE<HTMLDivElement>) {
    const d = arraste.current;
    if (!d || d.id !== e.pointerId) return;
    arraste.current = null;
    // Clique (sem arrastar) numa caixa que JÁ estava selecionada = editar.
    if (!d.moveu && ativa) entrarEmEdicao();
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (editando) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remover(a.id);
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      entrarEmEdicao();
    }
  }

  return (
    <div
      ref={caixaRef}
      className={`anot-texto${ativa ? ' is-ativa' : ''}${editando ? ' is-editando' : ''}`}
      style={{ left: a.x * largura, top: a.y * altura, color: a.cor, fontSize: tamPx, lineHeight: ALTURA_LINHA }}
      tabIndex={ferramenta === 'texto' ? 0 : -1}
      role="group"
      aria-label={`Anotação de texto${a.texto ? `: ${a.texto}` : ''}. Enter edita, Delete exclui.`}
      onPointerDown={aoBaixar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onDoubleClick={() => !editando && ferramenta === 'texto' && entrarEmEdicao()}
      onKeyDown={aoTeclar}
      onFocus={() => ferramenta === 'texto' && setSelecionada(a.id)}
    >
      {editando ? (
        <textarea
          className="anot-texto-campo"
          // Foco direto: a caixa acabou de ser criada (ou aberta) pelo próprio usuário.
          autoFocus
          value={a.texto}
          rows={Math.max(1, linhas.length)}
          cols={Math.max(4, ...linhas.map((l) => l.length + 1))}
          aria-label="Texto da anotação"
          placeholder="Digite…"
          onFocus={aoMontar}
          onChange={(e) => atualizar(a.id, { texto: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // Esc aqui só fecha a edição; o próximo Esc desliga a ferramenta.
              e.preventDefault();
              e.stopPropagation();
              setEditando(false);
              caixaRef.current?.focus();
            }
          }}
          onBlur={() => {
            setEditando(false);
            if (!a.texto.trim()) remover(a.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="anot-texto-valor">{a.texto || ' '}</span>
      )}
      {ativa && !editando && ferramenta === 'texto' && (
        <button
          type="button"
          className="anot-excluir"
          aria-label="Excluir esta anotação"
          title="Excluir (Delete)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            remover(a.id);
          }}
        >
          <Icone nome="x" tam={11} />
        </button>
      )}
    </div>
  );
}
