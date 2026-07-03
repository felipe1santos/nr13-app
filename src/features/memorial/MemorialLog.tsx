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
        if (trimmed.startsWith('//')) {
          const texto = trimmed.slice(2).trim();
          // Linhas de moldura (====/----) viram divisor visual discreto.
          if (/^[=\-─]{6,}$/.test(texto)) return { tipo: 'hr' as const, key: i };
          // Cabeçalho de componente (barra azul, padrão painel_pmta): identifica qual
          // componente do equipamento está sendo calculado.
          if (/^MEMORIAL DE C[ÁA]LCULO[:.]/i.test(texto)) return { tipo: 'compHeader' as const, key: i, texto };
          if (/^Norma Base[:.]/i.test(texto)) return { tipo: 'compSub' as const, key: i, texto };
          // "PARÂMETROS DE ENTRADA:" e afins — legenda pequena de grupo
          if (/^PAR[ÂA]METROS[^:]*:$/i.test(texto)) return { tipo: 'caption' as const, key: i, texto };
          // "1. CÁLCULO DA ESPESSURA..." — título de etapa com quadrado laranja
          if (/^\d+\.\s/.test(texto)) return { tipo: 'secao' as const, key: i, texto };
          // "Tútil = Tnom - CA = ..." — linha da espessura útil, itálico
          if (/^T[úu]til\s*=/.test(texto)) return { tipo: 'util' as const, key: i, texto };
          // "P = 1.5000 MPa (Pressão de Projeto estipulada)" — parâmetro em grade:
          // símbolo escuro, valor violeta, descrição cinza
          const mParam = texto.match(/^([A-Za-zÀ-ú][\w.ÀàáâãéêíóôõúüçÇ]{0,7})\s*=\s*(.+?)\s*\((.+)\)$/);
          if (mParam) return { tipo: 'param' as const, key: i, sym: mParam[1], val: mParam[2], desc: mParam[3] };
          return { tipo: 'comentario' as const, key: i, texto };
        }
        if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
          const latex = trimmed.slice(2, -2);
          let html: string;
          try {
            html = katex.renderToString(latex, { throwOnError: false, displayMode: true });
          } catch {
            html = latex;
          }
          // Resultado direto (sem fração) — "t_req = 6,4433 mm" — destaca em laranja
          const resultado = !latex.includes('\\frac') && /=\s*-?[\d.]/.test(latex);
          return { tipo: 'katex' as const, key: i, html, resultado };
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
        if (l.tipo === 'hr') return <div key={l.key} className="memorial-log-hr" />;
        if (l.tipo === 'compHeader')
          return (
            <div key={l.key} className="memorial-log-comp-header">
              {l.texto}
            </div>
          );
        if (l.tipo === 'compSub')
          return (
            <div key={l.key} className="memorial-log-comp-sub">
              {l.texto}
            </div>
          );
        if (l.tipo === 'caption')
          return (
            <div key={l.key} className="memorial-log-caption">
              {l.texto}
            </div>
          );
        if (l.tipo === 'secao')
          return (
            <div key={l.key} className="memorial-log-secao">
              {l.texto}
            </div>
          );
        if (l.tipo === 'param')
          return (
            <div key={l.key} className="memorial-log-param">
              <span className="p-sym">{l.sym}</span>
              <span className="p-val">= {l.val}</span>
              <span className="p-desc">{l.desc}</span>
            </div>
          );
        if (l.tipo === 'util')
          return (
            <div key={l.key} className="memorial-log-util">
              {l.texto}
            </div>
          );
        if (l.tipo === 'comentario')
          return (
            <div key={l.key} className="memorial-log-comentario">
              {l.texto}
            </div>
          );
        if (l.tipo === 'katex')
          return (
            <div
              key={l.key}
              className={`memorial-log-katex${l.resultado ? ' memorial-log-resultado' : ''}`}
              dangerouslySetInnerHTML={{ __html: l.html }}
            />
          );
        return <div key={l.key} dangerouslySetInnerHTML={{ __html: l.html }} />;
      })}
    </div>
  );
}
