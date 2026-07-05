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

// Exibição pt-BR: decimais com vírgula e sinal de menos tipográfico. Só na
// camada visual — o log salvo (nr13_calc_<TAG>) continua com ponto.
function ptBR(texto: string): string {
  return texto.replace(/(\d)\.(\d)/g, '$1,$2');
}

// Converte LaTeX simples em texto mono (padrão do design painel_pmta: fórmulas
// na própria fonte do terminal). Devolve null quando a expressão usa construções
// que só o KaTeX renderiza bem (raiz, subscrito aninhado etc.) — aí cai no fallback.
function latexParaTexto(latex: string): string | null {
  let t = latex
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\alpha/g, 'α')
    .replace(/\\pi/g, 'π')
    .replace(/\\cos/g, 'cos')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/_\{([^{}\\]*)\}/g, '_$1')
    .replace(/\^\{([^{}\\]*)\}/g, '^$1');
  if (t.includes('\\')) return null;
  t = t.replace(/\s+/g, ' ').trim();
  return ptBR(t).replace(/ - /g, ' − ');
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
          if (/^Norma Base[:.]/i.test(texto)) return { tipo: 'compSub' as const, key: i, texto: texto.replace(/ - /g, ' — ') };
          // "PARÂMETROS GERAIS DE ENTRADA" e afins — mesmo título de seção com
          // retângulo laranja das etapas numeradas (padrão do design)
          if (/^PAR[ÂA]METROS[^=()]*:?$/i.test(texto)) return { tipo: 'secao' as const, key: i, texto: texto.replace(/:$/, '') };
          // "1. ESPESSURA MÍNIMA..." — título de etapa com retângulo laranja
          if (/^\d+\.\s/.test(texto)) return { tipo: 'secao' as const, key: i, texto };
          // "Tútil = Tnom - CA = ..." — linha da espessura útil, itálico
          if (/^T[úu]til\s*=/.test(texto)) return { tipo: 'util' as const, key: i, texto: ptBR(texto).replace(/ - /g, ' − ') };
          // "P = 1.5000 MPa (Pressão de Projeto estipulada)" — parâmetro em grade:
          // símbolo, valor e descrição na cor de texto do terminal
          const mParam = texto.match(/^([A-Za-zÀ-ú][\w.ÀàáâãéêíóôõúüçÇ]{0,7})\s*=\s*(.+?)\s*\((.+)\)$/);
          if (mParam) return { tipo: 'param' as const, key: i, sym: mParam[1], val: ptBR(mParam[2]), desc: ptBR(mParam[3]) };
          return { tipo: 'comentario' as const, key: i, texto: ptBR(texto) };
        }
        if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
          const latex = trimmed.slice(2, -2).trim();
          // Fração simples "LHS = \frac{num}{den}" — vira pilha mono como no design.
          // Num/den aceitam um nível de chaves internas (T_{util} etc.).
          const mFrac = latex.match(/^(.+?)=\s*\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}$/);
          if (mFrac) {
            const lhs = latexParaTexto(mFrac[1]);
            const num = latexParaTexto(mFrac[2]);
            const den = latexParaTexto(mFrac[3]);
            if (lhs != null && num != null && den != null)
              return { tipo: 'frac' as const, key: i, lhs, num, den };
          }
          // Resultado direto "LHS = 6.4433 \text{ mm}" — valor em laranja escuro
          const mRes = latex.match(/^(.+?)=\s*(-?[\d.]+)\s*\\text\{\s*([^{}]*?)\s*\}$/);
          if (mRes) {
            const lhs = latexParaTexto(mRes[1]);
            if (lhs != null) return { tipo: 'res' as const, key: i, lhs, val: ptBR(mRes[2]), unidade: mRes[3] };
          }
          let html: string;
          try {
            html = katex.renderToString(latex, { throwOnError: false, displayMode: true });
          } catch {
            html = latex;
          }
          // Resultado que não casou com o padrão simples — mantém o destaque laranja
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
              <span className="p-desc">({l.desc})</span>
            </div>
          );
        if (l.tipo === 'frac')
          return (
            <div key={l.key} className="memorial-log-frac">
              <span className="f-lhs">{l.lhs}</span>
              <span className="f-eq">=</span>
              <span className="f-stack">
                <span className="f-num">{l.num}</span>
                <span className="f-bar" />
                <span className="f-den">{l.den}</span>
              </span>
            </div>
          );
        if (l.tipo === 'res')
          return (
            <div key={l.key} className="memorial-log-res">
              <span className="f-lhs">{l.lhs}</span>
              <span className="f-eq">=</span>
              <span className="r-val">
                {l.val} <span className="r-un">{l.unidade}</span>
              </span>
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
