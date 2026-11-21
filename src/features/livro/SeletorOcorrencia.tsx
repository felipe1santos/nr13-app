/**
 * O campo "Tipo de ocorrência" do modal Novo registro (21/11/2026).
 *
 * Era um `<select>` nativo — e a lista aberta de um `<select>` não aceita
 * estilo: o dono pediu que o item sob o mouse acendesse em vermelho claro e que
 * o escolhido ficasse com fundo vermelho SÓ atrás do nome (não a caixa
 * inteira). Isso exige uma lista própria, e ela segue o padrão de combobox
 * somente-seleção do WAI-ARIA: botão com `aria-haspopup="listbox"` e
 * `aria-expanded`, lista `role="listbox"` com `aria-activedescendant`,
 * opções `role="option"` com `aria-selected`.
 *
 * Teclado: ↓/↑/Enter/Espaço abrem; na lista, ↓/↑/Home/End andam, Enter/Espaço
 * escolhem, ESC e Tab fecham. O ESC para aqui (`stopPropagation`) — o modal
 * não fecha por ESC, mas nenhum ancestral deve receber o gesto que só fechava a
 * lista.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';

export default function SeletorOcorrencia({
  id,
  valor,
  opcoes,
  aoMudar,
  placeholder = 'Selecione…',
}: {
  id: string;
  valor: string;
  opcoes: readonly string[];
  aoMudar: (v: string) => void;
  placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const idLista = useId();

  // Clique fora fecha a lista (só a lista — o modal segue aberto).
  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  // Ao abrir, o foco vai para a lista e a opção ativa fica visível.
  useEffect(() => {
    if (!aberto) return;
    lista.current?.focus();
    lista.current
      ?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [aberto, ativo]);

  function abrir() {
    const i = opcoes.indexOf(valor);
    setAtivo(i >= 0 ? i : 0);
    setAberto(true);
  }

  function escolher(i: number) {
    const v = opcoes[i];
    if (v !== undefined) aoMudar(v);
    setAberto(false);
    gatilho.current?.focus();
  }

  function teclaNaLista(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAtivo((a) => Math.min(opcoes.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => Math.max(0, a - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setAtivo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setAtivo(opcoes.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      escolher(ativo);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setAberto(false);
      gatilho.current?.focus();
    } else if (e.key === 'Tab') {
      setAberto(false);
    }
  }

  return (
    <div className={`reg-tipo${aberto ? ' aberto' : ''}`} ref={raiz}>
      <button
        type="button"
        id={id}
        ref={gatilho}
        className={`reg-tipo-gatilho${valor ? ' preenchido' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={idLista}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            abrir();
          }
        }}
      >
        {/* O vermelho fica SÓ atrás do nome escolhido, não na caixa inteira. */}
        {valor ? (
          <span className="reg-tipo-sel">{valor}</span>
        ) : (
          <span className="reg-tipo-vazio">{placeholder}</span>
        )}
        <Icone nome="chevdown" tam={14} className="reg-tipo-seta" />
      </button>
      {aberto && (
        <ul
          id={idLista}
          ref={lista}
          className="reg-tipo-lista"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={id}
          aria-activedescendant={`${idLista}-${ativo}`}
          onKeyDown={teclaNaLista}
        >
          {opcoes.map((t, i) => (
            <li
              key={t}
              id={`${idLista}-${i}`}
              data-i={i}
              role="option"
              aria-selected={t === valor}
              className={`reg-tipo-opcao${i === ativo ? ' ativa' : ''}${t === valor ? ' escolhida' : ''}`}
              onMouseEnter={() => setAtivo(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(i)}
            >
              <span className="reg-tipo-nome">{t}</span>
              {t === valor && <Icone nome="check" tam={13} className="reg-tipo-check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
