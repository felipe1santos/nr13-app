import { useEffect, useId, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import LogoCliente from '../cadastros/LogoCliente';
import type { Cliente } from '../cadastros/tipos';
import { indicePorLetra, proximoIndice, ROTULO_MANUAL, rotuloCliente } from './opcoesSeletorEmpresa';

/**
 * "Selecionar empresa cadastrada" com a LOGO do cliente (21/11/2026).
 *
 * O `<select>` nativo não desenha imagem nas opções, então este é um listbox
 * próprio no padrão WAI-ARIA: botão com `aria-haspopup="listbox"`, lista com
 * `aria-activedescendant`, setas/Home/End/letra para navegar, Enter ou Espaço
 * para escolher, Esc ou clique fora para fechar (o foco volta ao botão).
 *
 * A logo é a MESMA da tela de Clientes (`LogoCliente`: favicon salvo, ou o do
 * site, ou a inicial). Nada novo é baixado nem gravado.
 */
export default function SeletorEmpresa({
  clientes,
  valor,
  aoEscolher,
  idRotulo,
}: {
  clientes: Cliente[];
  /** id do cliente escolhido; '' = preencher manualmente. */
  valor: string;
  aoEscolher: (id: string) => void;
  /** id do elemento que rotula o seletor. */
  idRotulo: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const base = useId();

  // Opção 0 é "preencher manualmente" (o '' de sempre); depois, os clientes.
  const opcoes: { id: string; rotulo: string; cliente: Cliente | null }[] = [
    { id: '', rotulo: ROTULO_MANUAL, cliente: null },
    ...clientes.map((c) => ({ id: c.id, rotulo: rotuloCliente(c), cliente: c })),
  ];
  const idxAtual = Math.max(0, opcoes.findIndex((o) => o.id === valor));
  const atual = opcoes[idxAtual];
  const idOpcao = (i: number) => `${base}-op-${i}`;

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    lista.current?.focus();
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  // Mantém a opção ativa à vista quando a lista rola (só DOM, sem estado).
  useEffect(() => {
    if (!aberto) return;
    document.getElementById(`${base}-op-${ativo}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [aberto, ativo, base]);

  function abrir() {
    setAtivo(idxAtual);
    setAberto(true);
  }

  function fechar(devolverFoco = true) {
    setAberto(false);
    if (devolverFoco) botao.current?.focus();
  }

  function escolher(i: number) {
    const o = opcoes[i];
    fechar();
    if (o && o.id !== valor) aoEscolher(o.id);
  }

  function teclaNoBotao(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      abrir();
    }
  }

  function teclaNaLista(e: React.KeyboardEvent<HTMLUListElement>) {
    const prox = proximoIndice(ativo, e.key, opcoes.length);
    if (prox != null) {
      e.preventDefault();
      setAtivo(prox);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      escolher(ativo);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    } else if (e.key === 'Tab') {
      fechar(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = indicePorLetra(opcoes.map((o) => o.rotulo), ativo, e.key);
      if (i != null) setAtivo(i);
    }
  }

  return (
    <div className="ficha-emp-sel" ref={raiz}>
      <button
        ref={botao}
        type="button"
        id={`${base}-botao`}
        className={`ficha-emp-sel-botao${aberto ? ' aberto' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? `${base}-lista` : undefined}
        aria-labelledby={`${idRotulo} ${base}-botao`}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={teclaNoBotao}
      >
        <MarcaOpcao cliente={atual.cliente} />
        <span className="ficha-emp-sel-texto">{atual.rotulo}</span>
        <Icone nome="chevdown" tam={16} className="ficha-emp-sel-seta" />
      </button>
      {aberto && (
        <ul
          ref={lista}
          id={`${base}-lista`}
          className="ficha-emp-sel-lista"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={idRotulo}
          aria-activedescendant={idOpcao(ativo)}
          onKeyDown={teclaNaLista}
        >
          {opcoes.map((o, i) => (
            <li
              key={o.id || 'manual'}
              id={idOpcao(i)}
              role="option"
              aria-selected={i === idxAtual}
              className={`ficha-emp-sel-opcao${i === ativo ? ' ativa' : ''}${i === idxAtual ? ' marcada' : ''}`}
              // mousedown, não click: o clique não pode tirar o foco da lista antes de escolher.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setAtivo(i)}
              onClick={() => escolher(i)}
            >
              <MarcaOpcao cliente={o.cliente} />
              <span className="ficha-emp-sel-texto">{o.rotulo}</span>
              {i === idxAtual && <Icone nome="check" tam={14} className="ficha-emp-sel-check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Logo do cliente (ou inicial); "preencher manualmente" ganha o lápis. */
function MarcaOpcao({ cliente }: { cliente: Cliente | null }) {
  if (!cliente) {
    return (
      <span className="ficha-emp-logo ficha-emp-logo-manual" aria-hidden="true">
        <Icone nome="pencil" tam={13} />
      </span>
    );
  }
  return <LogoCliente cliente={cliente} tam={28} classe="ficha-emp-logo" />;
}
