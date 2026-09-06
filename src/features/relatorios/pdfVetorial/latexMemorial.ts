import type { FormulaDesenhavel } from './formulaMatematica';

/**
 * A memória de cálculo em ÁLGEBRA, e não em código-fonte de LaTeX.
 *
 * ## O defeito que isto conserta
 *
 * `nr13_calc_<TAG>.memorialHTML` guarda as equações em LaTeX, para o KaTeX
 * renderizar no navegador:
 *
 * ```
 * $$ t_{req} = \frac{P \cdot D}{2 \cdot S \cdot E - 0.2 \cdot P} $$
 * ```
 *
 * A folha 6.1 do documento imprimia essa string COMO TEXTO. E, pior, o jsPDF
 * corta o texto no primeiro caractere que a fonte embutida não tem — a barra
 * invertida existe, mas o que saía no papel era `$$ t_{req} = $$`, três vezes
 * seguidas, num documento assinado por engenheiro.
 *
 * ## O que este módulo faz — e o que ele não faz
 *
 * Ele **traduz notação**: `\frac{a}{b}` vira numerador e denominador para o
 * traço da fração ser desenhado; `\cdot` vira `·`; `\text{ mm}` vira a unidade;
 * `X_{util}` vira X com subscrito de verdade.
 *
 * Ele **não calcula nada e não reescreve equação nenhuma**. Os números que
 * aparecem são os que o motor do memorial já tinha escrito — inclusive as
 * substituições numéricas linha a linha, que são justamente o que faz a folha
 * ser uma *memória* de cálculo e não um resumo.
 */

/** Uma linha do memorial é fórmula quando o motor a delimitou com `$$`. */
export function ehFormulaLatex(linha: string): boolean {
  return /^\s*\$\$[\s\S]*\$\$\s*$/.test(linha.trim()) || /^\s*\$\$/.test(linha.trim());
}

/**
 * Notação LaTeX → os mesmos símbolos que o resto do documento usa.
 *
 * Só entram símbolos que existem no subconjunto de Carlito embutido
 * (`scripts/fontes/subset-carlito.mjs`): um símbolo fora dele reintroduz
 * exatamente o truncamento que este módulo existe para consertar.
 */
export function simbolosDoLatex(texto: string): string {
  return texto
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, (m) => (m === '\\times' ? '×' : '·'))
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\alpha/g, 'α')
    .replace(/\\degree|\\circ/g, '°')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^{}]*)\}/g, '$1')
    .replace(/\\,|\\;|\\!|\\ /g, ' ')
    .replace(/\^\{2\}|\^2/g, '²')
    .replace(/\^\{3\}|\^3/g, '³')
    // As chaves do LaTeX são só agrupamento e não vão para o papel — MENOS as
    // do subscrito, que o desenho ainda precisa reconhecer para pôr o índice
    // menor. Elas são protegidas antes da limpeza e devolvidas depois; apagar
    // só a de abertura deixava `T_{util` no documento.
    .replace(/_\{([^{}]*)\}/g, '$1')
    .replace(/[{}]/g, '')
    .replace(//g, '_{')
    .replace(//g, '}')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * O conteúdo de `\frac{...}{...}`, respeitando chaves aninhadas.
 *
 * Um regex com `[^{}]*` bastaria para as fórmulas de hoje e quebraria calado na
 * primeira fração que tivesse `\text{}` dentro — que é o caso das linhas com
 * unidade.
 */
export function partirFrac(texto: string): { numerador: string; denominador: string; resto: string } | null {
  const i = texto.indexOf('\\frac');
  if (i < 0) return null;
  let j = i + '\\frac'.length;
  const grupo = (): string | null => {
    while (texto[j] === ' ') j++;
    if (texto[j] !== '{') return null;
    let nivel = 0;
    const inicio = ++j;
    for (; j < texto.length; j++) {
      if (texto[j] === '{') nivel++;
      else if (texto[j] === '}') {
        if (nivel === 0) return texto.slice(inicio, j++);
        nivel--;
      }
    }
    return null;
  };
  const num = grupo();
  const den = grupo();
  if (num === null || den === null) return null;
  return { numerador: num, denominador: den, resto: texto.slice(j) };
}

/**
 * Uma linha `$$ ... $$` do memorial vira uma fórmula desenhável.
 *
 * Devolve `null` quando a linha não é fórmula — o chamador imprime o texto
 * normal, que é o certo para "Norma Base:", "STATUS: APROVADO" e afins.
 */
export function formulaDoLatex(linha: string): FormulaDesenhavel | null {
  const bruto = linha.trim();
  if (!bruto.startsWith('$$')) return null;
  const corpo = bruto.replace(/^\$\$/, '').replace(/\$\$$/, '').trim();
  if (corpo === '') return null;

  // `lhs = resto`, quebrando no PRIMEIRO `=` de nível zero — um `=` dentro de
  // chave pertence a outra coisa.
  let lhs = '';
  let resto = corpo;
  let nivel = 0;
  for (let i = 0; i < corpo.length; i++) {
    if (corpo[i] === '{') nivel++;
    else if (corpo[i] === '}') nivel--;
    else if (corpo[i] === '=' && nivel === 0) {
      lhs = corpo.slice(0, i).trim();
      resto = corpo.slice(i + 1).trim();
      break;
    }
  }

  const frac = partirFrac(resto);
  if (frac) {
    // O que vem depois da fração (uma unidade, por exemplo) acompanha o
    // denominador seria errado — ele vale para a expressão inteira, então entra
    // colado no numerador seria pior ainda. Vai para o fim do lhs? Não: some.
    // A escolha é imprimir a fração e, havendo resto com conteúdo, mandá-lo
    // para a expressão em linha logo depois — nunca descartar.
    const sobra = simbolosDoLatex(frac.resto);
    return {
      lhs: simbolosDoLatex(lhs),
      numerador: simbolosDoLatex(frac.numerador),
      denominador: simbolosDoLatex(frac.denominador) + (sobra ? ` ${sobra}` : ''),
    };
  }

  return { lhs: simbolosDoLatex(lhs), expressao: simbolosDoLatex(resto) };
}

/**
 * O texto partido em pedaços NORMAIS e SUBSCRITOS.
 *
 * `T_{util}` é uma variável só, e escrevê-la como "T_util" no papel é notação
 * de código, não de engenharia. O desenho põe o índice menor e mais baixo —
 * quem faz isso é o `Documento`, que tem o PDF; aqui só se decide o que é o quê.
 */
export interface PedacoTexto {
  texto: string;
  subscrito: boolean;
}

export function pedacosComSubscrito(texto: string): PedacoTexto[] {
  const saida: PedacoTexto[] = [];
  const re = /_\{([^{}]*)\}|_([A-Za-z0-9])/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) saida.push({ texto: texto.slice(ultimo, m.index), subscrito: false });
    saida.push({ texto: m[1] ?? m[2] ?? '', subscrito: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) saida.push({ texto: texto.slice(ultimo), subscrito: false });
  return saida.filter((p) => p.texto !== '');
}
