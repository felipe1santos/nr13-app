import { useEffect, useId, useRef, useState } from 'react';
import { Icone } from './Icone';
import { iconeDoTipo } from './listaCobalto';
import './seletor-tipo.css';

/**
 * Seletor do TIPO de equipamento das barras de lista — 21/11/2026.
 *
 * Substitui os quatro chips "Todos · Vasos · Caldeiras · Autoclaves", que
 * sozinhos ocupavam ~430px e empurravam o botão de criar para uma segunda
 * linha. Agora é UM botão ("Tipo: Todos") que abre uma caixinha ancorada nele.
 * O valor e a URL continuam os mesmos — só muda o controle.
 *
 * Usado em /equipamentos, /inspecoes e /livro-registro.
 */
const TIPOS_EQUIPAMENTO = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'vaso', rotulo: 'Vasos' },
  { valor: 'caldeira', rotulo: 'Caldeiras' },
  { valor: 'autoclave', rotulo: 'Autoclaves' },
] as const;

export default function SeletorTipo({
  valor,
  aoMudar,
  contagens,
}: {
  valor: string;
  aoMudar: (tipo: string) => void;
  /** Contagem por tipo ('' = todos). Ausente = não mostra número. */
  contagens?: Partial<Record<string, number | null | undefined>>;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const idLista = useId();
  const atual = TIPOS_EQUIPAMENTO.find((t) => t.valor === valor) ?? TIPOS_EQUIPAMENTO[0];

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setAberto(false);
        botao.current?.focus();
      }
    }
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    // Foco na opção marcada ao abrir: teclado entra direto na escolha.
    caixa.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  function moverFoco(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const itens = [...(caixa.current?.querySelectorAll<HTMLButtonElement>('.stipo-item') ?? [])];
    const i = itens.indexOf(document.activeElement as HTMLButtonElement);
    const prox = e.key === 'ArrowDown' ? (i + 1) % itens.length : (i - 1 + itens.length) % itens.length;
    itens[prox]?.focus();
  }

  const filtrado = valor !== '';

  return (
    <div className="stipo" ref={caixa}>
      <button
        ref={botao}
        type="button"
        className={`stipo-botao${filtrado ? ' ativo' : ''}${aberto ? ' aberto' : ''}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idLista : undefined}
        aria-label={`Tipo de equipamento: ${atual.rotulo}`}
        onClick={() => setAberto((v) => !v)}
      >
        <Icone nome={filtrado ? iconeDoTipo(valor) : 'grid'} tam={15} />
        <span className="stipo-rotulo">{atual.rotulo}</span>
        <Icone nome="chevdown" tam={14} className="stipo-seta" />
      </button>
      {aberto && (
        <div className="stipo-lista" id={idLista} role="menu" aria-label="Tipo de equipamento" onKeyDown={moverFoco}>
          {TIPOS_EQUIPAMENTO.map((t) => {
            const n = contagens?.[t.valor];
            const marcado = t.valor === valor;
            return (
              <button
                key={t.valor || 'todos'}
                type="button"
                role="menuitemradio"
                aria-checked={marcado}
                className="stipo-item"
                onClick={() => {
                  setAberto(false);
                  botao.current?.focus();
                  if (!marcado) aoMudar(t.valor);
                }}
              >
                <Icone nome={t.valor ? iconeDoTipo(t.valor) : 'grid'} tam={15} />
                <span>{t.rotulo}</span>
                {n != null && <i>{n}</i>}
                {marcado && <Icone nome="check" tam={14} className="stipo-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
