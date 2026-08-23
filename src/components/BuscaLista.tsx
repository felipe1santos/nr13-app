/**
 * Fase 9 · o campo de busca das listas grandes.
 *
 * VISÍVEL, não escondido atrás de "Filtrar" — o erro que a auditoria da Fase 8
 * mediu em `/equipamentos`: fabricante estava cadastrado, não era pesquisável, e
 * o campo que existia ficava atrás de um botão.
 *
 * A RESPOSTA ANTIGA NÃO PODE SOBRESCREVER A NOVA. Este componente só avisa o pai
 * quando o termo estabiliza (debounce); quem cancela a consulta em voo é o
 * `AbortController` do pai, e quem descarta resposta fora de ordem é o
 * contador de requisição. Os dois juntos resolvem o caso "vas" × "vaso": sem
 * eles, a resposta lenta de "vas" chega depois e apaga a de "vaso".
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icone } from './Icone';
import './buscaLista.css';

export interface PropsBuscaLista {
  /** Termo aplicado (vem do pai; normalmente espelha a URL). */
  valor: string;
  /** Disparado quando o termo ESTABILIZA. Não a cada tecla. */
  aoMudar: (termo: string) => void;
  placeholder?: string;
  /** Milissegundos de espera. 300 ms porque a busca é server-side (§13). */
  atraso?: number;
  carregando?: boolean;
  /** Quantos resultados; `exato: false` vira "mais de N". */
  contagem?: { total: number; exato: boolean } | null;
  /** Ligado quando a busca está respondendo pelo catálogo do aparelho. */
  offline?: boolean;
  children?: React.ReactNode;
}

export default function BuscaLista({
  valor,
  aoMudar,
  placeholder = 'Buscar…',
  atraso = 300,
  carregando = false,
  contagem = null,
  offline = false,
  children,
}: PropsBuscaLista) {
  const [texto, setTexto] = useState(valor);
  const campo = useRef<HTMLInputElement | null>(null);
  const idContagem = useId();
  // Em ref para o debounce não reiniciar quando o pai recria a função. Atribuído
  // em efeito, não durante o render.
  const aoMudarRef = useRef(aoMudar);
  useEffect(() => {
    aoMudarRef.current = aoMudar;
  }, [aoMudar]);

  // O pai é a fonte da verdade do termo aplicado (URL, voltar do detalhe,
  // "limpar filtros" de fora). Quando ele muda por conta própria, o campo
  // acompanha — mas sem reagir ao que o próprio usuário está digitando.
  const ultimoDoPai = useRef(valor);
  useEffect(() => {
    if (valor === ultimoDoPai.current) return;
    ultimoDoPai.current = valor;
    setTexto(valor);
  }, [valor]);

  useEffect(() => {
    if (texto === ultimoDoPai.current) return;
    const t = setTimeout(() => {
      ultimoDoPai.current = texto;
      aoMudarRef.current(texto);
    }, atraso);
    return () => clearTimeout(t);
  }, [texto, atraso]);

  const limpar = useCallback(() => {
    setTexto('');
    ultimoDoPai.current = '';
    aoMudarRef.current('');
    campo.current?.focus();
  }, []);

  // Atalho `/` para focar a busca, como em toda ferramenta de trabalho. Não
  // rouba a tecla de quem está digitando em outro campo.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      const tag = alvo?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || alvo?.isContentEditable) return;
      e.preventDefault();
      campo.current?.focus();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  const rotuloContagem = !contagem
    ? ''
    : contagem.total === 0
      ? 'Nenhum resultado'
      : contagem.exato
        ? `${contagem.total} resultado${contagem.total === 1 ? '' : 's'}`
        : `mais de ${contagem.total.toLocaleString('pt-BR')} resultados`;

  return (
    <div className="busca-lista">
      <div className="busca-lista-linha">
        <div className="fj-search-box busca-lista-campo">
          <Icone nome="search" tam={15} />
          <input
            ref={campo}
            type="search"
            role="searchbox"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && texto) {
                e.preventDefault();
                limpar();
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-describedby={idContagem}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {carregando && <span className="busca-lista-girando" aria-hidden="true" />}
          {texto && (
            <button type="button" className="busca-lista-limpar" onClick={limpar} aria-label="Limpar busca">
              <Icone nome="x" tam={14} />
            </button>
          )}
        </div>
        {children}
      </div>

      <div className="busca-lista-rodape">
        {/* `aria-live` para quem usa leitor de tela ouvir quantos resultados
            sobraram sem precisar percorrer a lista. */}
        <span id={idContagem} className="busca-lista-contagem" aria-live="polite" role="status">
          {rotuloContagem}
        </span>
        {offline && (
          <span className="busca-lista-selo" title="Sem conexão: a busca está usando o catálogo já baixado neste aparelho.">
            <Icone nome="cloudoff" tam={13} /> buscando no que está neste aparelho
          </span>
        )}
      </div>
    </div>
  );
}
