import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { camposDeFotoDaChave, grupoVaiNaChave, CHAVES_DE_CAMPO } from './palco';

/**
 * A regra que este arquivo protege: a hidratação do palco grava a imagem em UM
 * campo por chave (`CAMPO_DA_FOTO`), não nos dois. Isso vale metade do peso das
 * fotos dentro de um orçamento de 3.368 KB — e só é seguro enquanto os
 * conjuntos de folhas continuarem disjuntos.
 *
 * Por isso a conferência é por VARREDURA e não por lista escrita à mão: quem
 * acrescentar uma folha que leia `foto.src` de dado de campo, ou `foto.base64`
 * da galeria, quebra este teste em vez de descobrir em produção que a folha
 * imprime o quadro vazio.
 */
const RAIZ = join(process.cwd(), 'public');
const PASTAS = ['arquivos-inspecao', 'arquivos-prontuario'];

function templates(): { nome: string; texto: string }[] {
  const out: { nome: string; texto: string }[] = [];
  for (const pasta of PASTAS) {
    for (const arq of readdirSync(join(RAIZ, pasta))) {
      if (arq.endsWith('.html')) out.push({ nome: arq, texto: readFileSync(join(RAIZ, pasta, arq), 'utf8') });
    }
  }
  return out;
}

/**
 * Leituras do CAMPO de um objeto de foto, ignorando as atribuições ao DOM.
 *
 * `img.src = ...` aparece em toda folha (logo, assinatura, preview do upload) e
 * não diz nada sobre o formato do dado. O que interessa é a LEITURA:
 * `foto.base64`, `f.src`, `fotoCapa.src`. O `=` que segue, quando existe, é o
 * que separa uma da outra.
 */
function lePropriedade(texto: string, campo: 'src' | 'base64'): string[] {
  const re = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\.${campo}\\b(?!\\s*=[^=])`, 'g');
  const achados = new Set<string>();
  for (const m of texto.matchAll(re)) {
    const variavel = m[1];
    // Elementos do DOM: nunca são o objeto de foto.
    if (/^(img|imagem|imgElement|imgElemento|el|elem|elemento|document|window|script|link|a|node)$/i.test(variavel)) continue;
    achados.add(m[0]);
  }
  return [...achados];
}

describe('campo da foto por chave — varredura de public/', () => {
  it('a tabela responde o que se espera dela', () => {
    expect(camposDeFotoDaChave('nr13_fotos_VP01')).toEqual(['src']);
    expect(camposDeFotoDaChave('nr13_inspecao_atual')).toEqual(['base64']);
    expect(camposDeFotoDaChave('nr13_injecao_atual')).toEqual(['base64']);
  });

  it('chave FORA da tabela recebe os dois campos — a falta é o defeito caro', () => {
    // Gastar orçamento produz uma recusa com mensagem; faltar produz uma folha
    // com o quadro vazio num relatório assinado, sem erro nenhum.
    expect(camposDeFotoDaChave('nr13_chave_nova_qualquer')).toEqual(['src', 'base64']);
  });

  it('quem lê `nr13_fotos_` lê `.src`, e é só a CAPA', () => {
    const leitores = templates().filter((t) => t.texto.includes('nr13_fotos_'));
    expect(leitores.map((t) => t.nome)).toEqual(['CAPA.html']);
    expect(lePropriedade(leitores[0].texto, 'src').length).toBeGreaterThan(0);
  });

  it('nenhuma folha lê `.base64` de `nr13_fotos_`', () => {
    const capa = templates().find((t) => t.nome === 'CAPA.html')!;
    expect(lePropriedade(capa.texto, 'base64')).toEqual([]);
  });

  it('as folhas das chaves de campo leem `.base64`, nunca `.src` do dado', () => {
    const deCampo = templates().filter(
      (t) => t.texto.includes('nr13_inspecao_atual') || t.texto.includes('nr13_injecao_atual'),
    );
    expect(deCampo.length).toBeGreaterThan(5); // a varredura achou alguma coisa

    const problemas: string[] = [];
    for (const t of deCampo) {
      // A folha pode não desenhar foto nenhuma (VISUAL-EXTERNO só imprime as
      // respostas); nesse caso não lê campo nenhum e está tudo certo.
      for (const leitura of lePropriedade(t.texto, 'src')) {
        problemas.push(`${t.nome}: lê ${leitura} — a hidratação não preenche \`src\` nas chaves de campo`);
      }
    }
    expect(problemas).toEqual([]);
  });
});

/**
 * A segunda metade: cada foto entra em UMA das duas chaves de campo, não nas
 * duas. É a mudança de maior risco do palco — a foto que ficar na chave errada
 * não aparece, e não aparece em silêncio.
 *
 * Por isso a conferência é dupla: contra `FOLHA_FOTO_FONTE` (a tabela que já
 * decide quantas folhas de foto o relatório terá, em `relatoriosService.ts`) e
 * contra a varredura de `public/`, que diz de qual chave cada folha lê.
 */
describe('partição das fotos entre as duas chaves de campo', () => {
  /** Grupo do container → folha que imprime as fotos dele. */
  const FOLHA_DO_GRUPO: Record<string, string[]> = {
    checklist: ['CHECKLIST-FOTOS.html', 'FOTOS-DOCUMENTACAO.html'],
    visual_externo: ['VISUAL-EXTERNO-FOTOS.html'],
    visual_interno: ['VISUAL-INTERNO-FOTOS.html'],
    th: ['TESTE-HIDROSTATICO-FOTOS.html', 'TESTE-HIDROSTATICO.html'],
  };

  it('a tabela do palco bate com a chave que a folha do grupo realmente lê', () => {
    const arquivos = templates();
    const problemas: string[] = [];

    for (const [grupo, folhas] of Object.entries(FOLHA_DO_GRUPO)) {
      for (const nome of folhas) {
        const t = arquivos.find((x) => x.nome === nome);
        expect(t, `${nome} sumiu de public/`).toBeDefined();

        const leInspecao = t!.texto.includes('nr13_inspecao_atual');
        const leInjecao = t!.texto.includes('nr13_injecao_atual');
        // A folha que desenha foto tem que ler exatamente UMA das duas, senão a
        // partição não tem como estar certa para ela.
        if (leInspecao === leInjecao) {
          problemas.push(`${nome} lê ${leInspecao ? 'as DUAS' : 'NENHUMA'} chave de campo`);
          continue;
        }
        const chaveQueLe = leInspecao ? 'nr13_inspecao_atual' : 'nr13_injecao_atual';
        if (!grupoVaiNaChave(chaveQueLe, grupo)) {
          problemas.push(`${nome} imprime "${grupo}" e lê ${chaveQueLe}, mas o palco manda esse grupo para a outra chave`);
        }
      }
    }
    expect(problemas).toEqual([]);
  });

  it('cada grupo conhecido vai para UMA chave só', () => {
    for (const grupo of Object.keys(FOLHA_DO_GRUPO)) {
      const donos = CHAVES_DE_CAMPO.filter((c) => grupoVaiNaChave(c, grupo));
      expect(donos, `grupo ${grupo}`).toHaveLength(1);
    }
  });

  it('grupo DESCONHECIDO vai para as duas — faltar é o defeito silencioso', () => {
    expect(CHAVES_DE_CAMPO.filter((c) => grupoVaiNaChave(c, 'grupo_novo'))).toEqual(CHAVES_DE_CAMPO);
  });

  it('chave que não é de campo não é particionada', () => {
    expect(grupoVaiNaChave('nr13_fotos_VP01', 'visual_externo')).toBe(true);
  });
});

describe('CAPA sem foto — nada de imagem quebrada', () => {
  it('o <img> do equipamento não nasce com src apontando para arquivo inexistente', () => {
    const capa = templates().find((t) => t.nome === 'CAPA.html')!;
    // `src="foto.webp"` era um arquivo que não existe no servidor: sem foto de
    // capa, a folha imprimia o ícone de imagem quebrada e o texto do alt.
    expect(capa.texto).not.toContain('src="foto.webp"');
    expect(/<img id="imgVessel"[^>]*>/.exec(capa.texto)?.[0] ?? '').not.toContain('src=');
  });

  it('a injeção esconde a imagem quando não há foto', () => {
    const capa = templates().find((t) => t.nome === 'CAPA.html')!;
    expect(capa.texto).toContain("imgVessel.removeAttribute('src')");
    expect(capa.texto).toContain("imgVessel.style.display = 'none'");
  });
});

describe('exclusão de equipamento — sem confirm nativo', () => {
  it('Equipamento.tsx não usa window.confirm', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/pages/Equipamento.tsx'), 'utf8');
    // O confirm nativo congela a página inteira e é o único fora do padrão
    // `fj-modal-*` do sistema.
    expect(fonte).not.toContain('window.confirm');
    expect(fonte).toContain('fj-modal-overlay');
  });
});
