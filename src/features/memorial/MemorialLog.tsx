import { useEffect, useRef, useState, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './memorial.css';

interface Props {
  log: string[];
  animado?: boolean;
  placeholder?: string;
  showPlaceholder?: boolean;
  className?: string;
}

export default function MemorialLog({ log, animado = false, placeholder, showPlaceholder = false, className }: Props) {
  const [visivel, setVisivel] = useState(animado ? 0 : log.length);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animado || log.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza contador com tamanho do log (animação)
      setVisivel(log.length);
      return;
    }
    setVisivel(0);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setVisivel(i);
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
      if (i >= log.length) clearInterval(timer);
    }, 15);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linhas = useMemo(
    () =>
      log.map((linha, i) => {
        const trimmed = linha.trim();
        if (trimmed === '') return { tipo: 'espaco' as const, key: i };
        if (trimmed.startsWith('//')) return { tipo: 'comentario' as const, key: i, texto: trimmed.slice(2).trim() };
        if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
          const latex = trimmed.slice(2, -2);
          let html: string;
          try {
            html = katex.renderToString(latex, { throwOnError: false, displayMode: true });
          } catch {
            html = latex;
          }
          return { tipo: 'katex' as const, key: i, html };
        }
        return { tipo: 'html' as const, key: i, html: linha };
      }),
    [log],
  );

  const linhasVisiveis = linhas.slice(0, visivel);

  if (showPlaceholder && log.length === 0) {
    return (
      <div className={`memorial-log ${className ?? ''}`} ref={containerRef}>
        <span className="calc-terminal-prompt">{placeholder ?? '>> ...'}</span>
      </div>
    );
  }

  return (
    <div className={`memorial-log ${className ?? ''}`} ref={containerRef}>
      {linhasVisiveis.map((l) => {
        if (l.tipo === 'espaco') return <div key={l.key} className="memorial-log-spacer" />;
        if (l.tipo === 'comentario')
          return (
            <div key={l.key} className="memorial-log-comentario">
              {l.texto}
            </div>
          );
        if (l.tipo === 'katex')
          return <div key={l.key} className="memorial-log-katex" dangerouslySetInnerHTML={{ __html: l.html }} />;
        return <div key={l.key} dangerouslySetInnerHTML={{ __html: l.html }} />;
      })}
    </div>
  );
}
