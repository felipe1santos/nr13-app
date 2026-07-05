// ============================================================================
// Renderizador do memorial de cálculo nas folhas do relatório — porta o parser
// do terminal da calculadora (src/features/memorial/MemorialLog.tsx) para JS
// puro. Recebe cada linha { text, html } já extraída/filtrada pelo template
// (o filtro e a INDEXAÇÃO das linhas não mudam — a paginação from/to calculada
// em relatoriosService.ts continua 1:1) e devolve o HTML no design novo.
// Requer memorial-calc-novo.css. Linhas $$...$$ não linearizáveis voltam como
// .mc-katex para o renderMathInElement do template.
// ============================================================================
window.nr13MemorialNovo = (function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function ptBR(s) {
    return s.replace(/(\d)\.(\d)/g, '$1,$2');
  }

  // Lineariza LaTeX: \frac → (a) / (b), \sqrt → √( ), ² ³, símbolos gregos.
  // null = tem comando que só o KaTeX resolve.
  function linearizarLatex(latex) {
    var t = latex
      .replace(/\\left\s*/g, '')
      .replace(/\\right\s*/g, '')
      .replace(/\\cdot/g, '·')
      .replace(/\\times/g, '×')
      .replace(/\\pi/g, 'π')
      .replace(/\\alpha/g, 'α')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\cos/g, 'cos')
      .replace(/\\quad/g, '   ')
      .replace(/\\text\{([^{}]*)\}/g, '$1')
      .replace(/\\_/g, '_');
    for (var i = 0; i < 6 && /[\\{]/.test(t); i++) {
      t = t
        .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1) / ($2)')
        .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
        .replace(/_\{([^{}]*)\}/g, '_$1')
        .replace(/\^\{([^{}]*)\}/g, '^$1');
    }
    if (/[\\{}]/.test(t)) return null;
    t = t.replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/\s+/g, ' ').trim();
    return ptBR(t).replace(/ - /g, ' − ');
  }

  function latexSimples(parte) {
    var t = parte
      .replace(/\\cdot/g, '·')
      .replace(/\\times/g, '×')
      .replace(/\\alpha/g, 'α')
      .replace(/\\pi/g, 'π')
      .replace(/\\cos/g, 'cos')
      .replace(/\\text\{([^{}]*)\}/g, '$1')
      .replace(/_\{([^{}\\]*)\}/g, '_$1')
      .replace(/\^\{([^{}\\]*)\}/g, '^$1');
    if (t.indexOf('\\') !== -1) return null;
    t = t.replace(/\s+/g, ' ').trim();
    return ptBR(t).replace(/ - /g, ' − ');
  }

  function secao(txt) {
    return '<div class="mc-secao">' + esc(txt) + '</div>';
  }

  function equacao(latex) {
    // fração empilhada simples: LHS = \frac{num}{den}
    var mFrac = latex.match(/^(.+?)=\s*\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}$/);
    if (mFrac) {
      var lhs = latexSimples(mFrac[1]);
      var num = latexSimples(mFrac[2]);
      var den = latexSimples(mFrac[3]);
      if (lhs != null && num != null && den != null) {
        return '<div class="mc-frac"><span class="lhs">' + esc(lhs) + '</span><span class="eq">=</span>' +
          '<span class="mc-stack"><span class="mc-num">' + esc(num) + '</span><span class="mc-fbar"></span>' +
          '<span class="mc-den">' + esc(den) + '</span></span></div>';
      }
    }
    // resultado direto: LHS = 6.4433 \text{ mm}
    var mRes = latex.match(/^(.+?)=\s*(-?[\d.]+)\s*\\text\{\s*([^{}]*?)\s*\}$/);
    if (mRes) {
      var lhsR = latexSimples(mRes[1]);
      if (lhsR != null) {
        return '<div class="mc-res"><span class="lhs">' + esc(lhsR) + '</span><span class="eq">=</span>' +
          '<span class="val">' + esc(ptBR(mRes[2])) + ' ' + esc(mRes[3]) + '</span></div>';
      }
    }
    // linha genérica (raiz, cadeia A = B = valor)
    var linear = linearizarLatex(latex);
    if (linear != null) {
      var partes = linear.split('=').map(function (s) { return s.trim(); });
      var html = '<div class="mc-linha">';
      if (partes.length === 1) {
        html += '<span>' + esc(linear) + '</span>';
      } else {
        var ult = partes[partes.length - 1];
        var temValor = /^-?[\d.,]+(?:\s*\S{1,8})?$/.test(ult);
        var meio = temValor ? partes.slice(1, -1).join(' = ') : partes.slice(1).join(' = ');
        html += '<span class="lhs">' + esc(partes[0]) + '</span>';
        if (meio !== '') html += '<span>= ' + esc(meio) + '</span>';
        if (temValor) html += '<span class="eq">=</span><span class="val">' + esc(ult) + '</span>';
      }
      return html + '</div>';
    }
    // só o KaTeX resolve — o template chama renderMathInElement depois
    return '<div class="mc-katex">$$' + latex + '$$</div>';
  }

  // O text do template vem do innerHTML com as tags removidas — entidades (&gt; &amp; &nbsp;)
  // chegam literais. Decodifica antes de re-escapar, senão o esc() as duplica ("&amp;gt;").
  function decodificar(s) {
    return String(s)
      .replace(/&nbsp;/g, ' ')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  // item: { text, html } — text sem tags; html pode trazer os spans/divs de status do log salvo
  function render(item) {
    var t = decodificar((item.text || '').trim());
    var h = item.html || '';

    // status (classe do vaso, div inline do autoclave, ou texto)
    if (/msg-aprovado/.test(h) || /STATUS:\s*APROVADO/i.test(t) || /^OK:/.test(t) || /^RESULTADO FINAL:\s*APROVADO/i.test(t))
      return '<div class="mc-ok">' + esc(t) + '</div>';
    if (/msg-reprovado/.test(h) || /STATUS:\s*REPROVADO/i.test(t) || /^(REPROVADO|FALHA):/.test(t) || /^RESULTADO FINAL:\s*REPROVADO/i.test(t))
      return '<div class="mc-erro">' + esc(t) + '</div>';
    if (/N[ÃA]O VERIFICADO|ATEN[ÇC][ÃA]O/i.test(t) && t.length < 400)
      return '<div class="mc-aviso">' + esc(t) + '</div>';

    if (/^-{6,}\s*$/.test(t)) return '<hr class="mc-hr">';
    if (/^MEMORIAL DE C[ÁA]LCULO\b/i.test(t)) return '<div class="mc-banner">' + esc(t) + '</div>';
    if (/^(Norma Base|M[ée]todo)[:.]/i.test(t)) return '<div class="mc-norma">' + esc(t.replace(/ - /g, ' — ')) + '</div>';
    if (/^PAR[ÂA]METROS[^=()]*:?$/i.test(t)) return secao(t.replace(/:$/, ''));
    if (/^\d+\.\s/.test(t)) return secao(t);
    if (/^T[úu]til\s*=/i.test(t))
      return '<div class="mc-util">' + esc(ptBR(t).replace(/ - /g, ' − ')) + '</div>';

    var mEq = t.match(/^\$\$([\s\S]+)\$\$$/);
    if (mEq) return equacao(mEq[1].trim());

    var mParam = t.match(/^([A-Za-zÀ-ú][\w.ÀàáâãéêíóôõúüçÇ]{0,7})\s*=\s*(.+?)\s*\((.+)\)$/);
    if (mParam) {
      return '<div class="mc-param"><span>' + esc(mParam[1]) + '</span><span>= ' + esc(ptBR(mParam[2])) +
        '</span><span>(' + esc(ptBR(mParam[3])) + ')</span></div>';
    }

    return '<div class="mc-coment">' + esc(ptBR(t)) + '</div>';
  }

  return { render: render };
})();
