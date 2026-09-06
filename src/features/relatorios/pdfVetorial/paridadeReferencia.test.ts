import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { INSTRUMENTOS_CHECKLIST, SECOES_CHECKLIST } from '../../inspecoes/formularios/FormularioChecklist';
import { ITENS_VISUAL_EXTERNO } from '../../inspecoes/formularios/FormularioVisualExterno';
import { ITENS_VISUAL_INTERNO } from '../../inspecoes/formularios/FormularioVisualInterno';
import { marcasDocumentacao, marcasSimNaoNa } from './folhas';

/**
 * O GATE DE PARIDADE com o relatório-base.
 *
 * A referência é `docs/referencias/relatorio-nr13.html` — o documento que o
 * Modelo Novo clona. Este teste lê o HTML dela, extrai TODO rótulo de campo,
 * TODO cabeçalho de coluna, TODA faixa e TODA seção, e exige que cada um
 * exista no gerador. Uma coluna que o gerador deixar de desenhar quebra aqui,
 * com o nome dela na mensagem.
 *
 * ## Por que ler o HTML, e não uma lista escrita à mão
 *
 * Lista escrita à mão envelhece em silêncio. O documento-base é a fonte, e
 * comparar contra ele é a única forma de a checagem continuar verdadeira quando
 * a referência mudar — aí o teste quebra e alguém decide, em vez de o
 * documento emitido divergir sem ninguém ver.
 *
 * ## O que fica de fora, e por quê
 *
 * - **Folha 21 (Registro de Segurança / Livro)**: exclusão intencional de
 *   escopo, decidida pelo dono do projeto. O Livro tem motor próprio, lacre e
 *   trava no banco (§7-quinquies); recriá-lo dentro do relatório produziria
 *   duas verdades para a mesma folha.
 * - **Folha 22 (registro fotográfico genérico)**: a referência a usa como
 *   sobra de página; no sistema cada etapa tem a sua folha de fotos, emitida
 *   pela contagem real (0 fotos → 0 folhas).
 */

const REFERENCIA = 'docs/referencias/relatorio-nr13.html';
const FONTES = [
  'src/features/relatorios/pdfVetorial/folhas.ts',
  'src/features/relatorios/pdfVetorial/modelo.ts',
  'src/features/inspecoes/formularios/FormularioChecklist.tsx',
  'src/features/inspecoes/formularios/FormularioVisualExterno.tsx',
  'src/features/inspecoes/formularios/FormularioVisualInterno.tsx',
];

/** Exclusões intencionais — ver o cabeçalho. */
const FOLHAS_FORA = new Set([21, 22]);

/**
 * Os rótulos que o gerador MONTA em tempo de execução, e por isso não existem
 * como texto literal no código. Cada um é conferido logo abaixo, à parte.
 */
const COMPOSTOS = [
  'PARÂMETROS E RESULTADOS: CASCO PRINCIPAL',
  'PARÂMETROS E RESULTADOS: TAMPO SUPERIOR',
  'PARÂMETROS E RESULTADOS: TAMPO INFERIOR',
  'Conclusão técnica — exame externo',
  'Conclusão técnica — exame interno',
  '0°',
  '90°',
  '180°',
  '270°',
];

function limpo(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface Exigencia {
  folha: number;
  texto: string;
}

function exigenciasDaReferencia(): Exigencia[] {
  const html = readFileSync(REFERENCIA, 'utf8');
  const partes = html.split(/<section class="folha"/).slice(1);
  const saida: Exigencia[] = [];
  partes.forEach((p, i) => {
    const folha = i + 1;
    if (FOLHAS_FORA.has(folha)) return;
    const pega = (re: RegExp) => [...p.matchAll(re)].map((m) => limpo(m[1]));
    const textos = [
      ...pega(/class="rotulo"[^>]*>([\s\S]*?)<\/t[dh]>/g),
      ...pega(/<th[^>]*>([\s\S]*?)<\/th>/g),
      ...pega(/class="banner"[^>]*>([\s\S]*?)<\/div>/g),
      ...pega(/class="faixa"[^>]*>([\s\S]*?)<\/div>/g),
      ...pega(/<h3 class="secao"[^>]*>([\s\S]*?)<\/h3>/g),
    ];
    for (const t of textos) if (t.length >= 3) saida.push({ folha, texto: t });
  });
  return saida;
}

// O `\n` de uma string do código é uma QUEBRA no papel — no cabeçalho da
// matriz da NR-13, por exemplo. Trocá-lo por espaço antes de normalizar impede
// que a busca procure um "n" que só existe no código-fonte.
const fonte = normalizar(FONTES.map((f) => readFileSync(f, 'utf8').replace(/\\n/g, ' ')).join(' '));
const exigencias = exigenciasDaReferencia();
const compostos = new Set(COMPOSTOS.map(normalizar));

describe('paridade com o relatório-base: nenhum rótulo, coluna ou faixa fica para trás', () => {
  it('a referência foi lida de verdade — 20 folhas no escopo', () => {
    const folhas = new Set(exigencias.map((e) => e.folha));
    expect(folhas.size).toBe(20);
    expect(exigencias.length).toBeGreaterThan(250);
  });

  it('todo rótulo, cabeçalho, faixa e seção da referência existe no gerador', () => {
    const faltando = exigencias
      .filter((e) => {
        const k = normalizar(e.texto);
        return k !== '' && !compostos.has(k) && !fonte.includes(k);
      })
      .map((e) => `folha ${e.folha}: ${e.texto}`);
    expect(faltando, `campos da referência ausentes no documento:\n${faltando.join('\n')}`).toEqual([]);
  });

  it('os rótulos compostos existem — montados em tempo de execução', () => {
    const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    // "PARÂMETROS E RESULTADOS: <componente>" — o nome vem do memorial.
    expect(folhas).toContain('Parâmetros e resultados: ${c.nome.toUpperCase()}');
    // "Conclusão técnica — exame externo/interno".
    expect(folhas).toContain('Conclusão técnica — ${nomeDoExame}');
    expect(folhas).toContain("'exame externo'");
    expect(folhas).toContain("'exame interno'");
    // Os ângulos são calculados a partir do número de colunas da região
    // (`angulosDaRegiao`), e não escritos: uma região com 6 colunas imprime 6.
    expect(folhas).toContain('angulos.map((a) => `${a}°`)');
  });
});

describe('as listas do documento têm o tamanho da referência', () => {
  it('a verificação da documentação tem os 15 itens', () => {
    expect(SECOES_CHECKLIST[0].perguntas).toHaveLength(15);
  });

  it('os exames visuais têm 15 itens cada, e o texto de cada um é o da referência', () => {
    expect(ITENS_VISUAL_EXTERNO).toHaveLength(15);
    expect(ITENS_VISUAL_INTERNO).toHaveLength(15);
    const html = readFileSync(REFERENCIA, 'utf8');
    for (const item of [...ITENS_VISUAL_EXTERNO, ...ITENS_VISUAL_INTERNO]) {
      expect(normalizar(html), `item ausente na referência: ${item}`).toContain(normalizar(item));
    }
  });

  it('o quadro de instrumentos tem os 6 da referência, com a PSV', () => {
    expect(INSTRUMENTOS_CHECKLIST).toHaveLength(6);
    expect(INSTRUMENTOS_CHECKLIST.map((i) => i.nome)).toContain('Válvula de segurança (PSV)');
  });

  it('o checklist inteiro tem as 7 seções, e nenhuma pergunta se perdeu', () => {
    expect(SECOES_CHECKLIST).toHaveLength(7);
    const total = SECOES_CHECKLIST.reduce((n, s) => n + s.perguntas.length, 0);
    expect(total).toBe(36);
  });
});

describe('a marcação: a coluna certa recebe o X', () => {
  it('SIM, NÃO e N.A. são exclusivos entre si', () => {
    expect(marcasSimNaoNa('sim')).toMatchObject({ sim: true, nao: false, na: false });
    expect(marcasSimNaoNa('NÃO')).toMatchObject({ sim: false, nao: true, na: false });
    expect(marcasSimNaoNa('N/A')).toMatchObject({ sim: false, nao: false, na: true });
    expect(marcasSimNaoNa('Não aplica')).toMatchObject({ nao: false, na: true });
  });

  it('resposta sem resposta não marca nada', () => {
    expect(marcasSimNaoNa('')).toMatchObject({ sim: false, nao: false, na: false, extra: null });
    expect(marcasSimNaoNa(null)).toMatchObject({ sim: false, nao: false, na: false });
  });

  it('resposta fora das três colunas vai para a observação, e não some', () => {
    // "Ambiente aberto" e "Sim (RGI)" são opções reais do formulário. A
    // primeira não é SIM/NÃO/N.A.; some do documento se ninguém a carregar.
    expect(marcasSimNaoNa('Ambiente aberto').extra).toBe('Ambiente aberto');
    expect(marcasSimNaoNa('Sim (RGI)')).toMatchObject({ sim: true, extra: null });
  });

  it('a folha da documentação usa as SUAS três colunas', () => {
    expect(marcasDocumentacao('Existe')).toMatchObject({ existe: true, naoIdent: false, naoAplica: false });
    expect(marcasDocumentacao('Não identificado')).toMatchObject({ naoIdent: true, naoAplica: false });
    expect(marcasDocumentacao('Não aplica')).toMatchObject({ naoIdent: false, naoAplica: true });
    expect(marcasDocumentacao('')).toMatchObject({ existe: false, naoIdent: false, naoAplica: false });
  });
});
