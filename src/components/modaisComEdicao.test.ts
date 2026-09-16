/**
 * MODAL COM EDIÇÃO DE DADOS NÃO FECHA POR CLIQUE NO FUNDO (15/09/2026).
 *
 * ## A regra
 *
 * Diálogo onde o usuário DIGITA ou MARCA dados fecha só por ação explícita —
 * X, Cancelar, Salvar. O clique no overlay não conta, porque ele acontece
 * sozinho: ao sair de um `select` nativo, ao soltar uma seleção de texto que
 * começou dentro e terminou fora, ao fechar o calendário de um `input[type=
 * date]`, ao errar a mira num celular. Perder um cadastro inteiro por isso é o
 * defeito; nenhum aviso aparece, e o usuário não sabe se salvou.
 *
 * ## Por que um teste de VARREDURA e não um teste de render
 *
 * A suíte roda em `environment: 'node'`, sem jsdom e sem testing-library — não
 * há como montar um modal e clicar nele. E a regra é de OMISSÃO: ela exige que
 * um handler NÃO exista. Defeito de omissão não quebra nada, não aparece em
 * revisão e volta sozinho no próximo modal copiado de um antigo. Mesma escolha
 * de `palco.varreduraTemplates.test.ts`: quando não dá para observar o
 * comportamento, trava-se o texto-fonte que o produz.
 *
 * ## O que NÃO está na lista, e é decisão, não esquecimento
 *
 * Modal informativo (leitura de documento, ajuda, guia), confirmação sem
 * digitação (excluir, trancar) e modal de FILTRO continuam fechando pelo fundo.
 * Filtro é seleção passageira: refazer custa um clique, e fechar pelo fundo é o
 * gesto que as pessoas já esperam de um painel de filtros. O que a regra
 * protege é o que o usuário não consegue reconstruir de cabeça.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Os diálogos com edição de dados, e o que se perderia num clique fora.
 *
 * Caminho relativo à RAIZ do repositório. Modal novo com formulário entra aqui;
 * se ele fechar pelo fundo, este teste quebra antes de chegar no usuário.
 */
const COM_EDICAO: Array<[arquivo: string, oQueSePerde: string]> = [
  ['src/features/calibracoes/ModalCertificado.tsx', 'o cadastro do certificado padrão'],
  ['src/features/calibracoes/ModalComponente.tsx', 'o componente (válvula/manômetro) em cadastro'],
  ['src/features/calibracoes/ModalNovoLote.tsx', 'o lote de calibração em cadastro'],
  ['src/features/calibracoes/ModalResultados.tsx', 'os pontos medidos da calibração'],
  ['src/features/equipamento/ModalCriarEquipamento.tsx', 'o equipamento em cadastro'],
  ['src/features/equipamento/ModalImportarPlanilha.tsx', 'o arquivo escolhido e a conferência'],
  ['src/features/inspecoes/ModalNovaInspecaoContainer.tsx', 'o container de inspeção em cadastro'],
  ['src/features/inspecoes/ModalRenomearContainer.tsx', 'o nome digitado'],
  ['src/features/relatorios/ModalCriarRelatorio.tsx', 'as 3 etapas do assistente'],
  ['src/features/relatorios/ModalNovaInspecao.tsx', 'a seleção de documentos'],
  ['src/features/relatorios/ModalFinalizar.tsx', 'o que foi preenchido para finalizar'],
  ['src/features/relatorios/ModalMedicoes.tsx', 'a grade de espessuras medidas'],
  ['src/features/relatorios/ModalRenomear.tsx', 'o nome digitado'],
  ['src/features/relatorios/predefinicoes/ModalPredefinicoes.tsx', 'o conjunto de recomendações em edição'],
  ['src/components/ModalTrocarSenha.tsx', 'o formulário de senha'],
  ['src/pages/Acesso.tsx', 'as permissões marcadas'],
  ['src/pages/Agenda.tsx', 'o formulário do serviço'],
  ['src/pages/Relatorios.tsx', 'as Configurações do Relatório'],
];

const RAIZ = resolve(__dirname, '../..');
const fonte = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

/**
 * A TAG DE ABERTURA de cada overlay — só ela, e é o detalhe que faz o teste
 * valer alguma coisa.
 *
 * A primeira versão pegava a linha do overlay mais as 4 seguintes, e acusava
 * `Relatorios.tsx` por causa do `onClick={() => setModalConfig(false)}` do
 * botão "✕" que vem três linhas abaixo — o fechamento CERTO, por ação
 * explícita. Um teste que reprova o comportamento correto é pior que nenhum:
 * ensina a ignorá-lo.
 *
 * Então a varredura anda caractere a caractere do `<div` até o `>` que fecha a
 * tag de abertura, contando chaves para não parar num `>` que esteja dentro de
 * uma arrow (`(e) => ...`). O que estiver depois disso é FILHO do overlay, e
 * filho não é assunto desta regra.
 */
function overlays(texto: string): string[] {
  const achados: string[] = [];
  const marca = /className=\{?["'][^"']*overlay/g;
  for (let m = marca.exec(texto); m; m = marca.exec(texto)) {
    const abre = texto.lastIndexOf('<', m.index);
    if (abre < 0) continue;
    // Um ARQUIVO pode ter os dois tipos de diálogo — `Agenda.tsx` tem o
    // formulário do serviço e a lista do dia; `ModalPredefinicoes.tsx` tem o
    // editor e a confirmação de exclusão. O que decide não é o arquivo, é o
    // overlay. `fecha-pelo-fundo:` logo acima da tag é a isenção DECLARADA, e
    // ela obriga quem isenta a escrever ali por quê.
    if (/fecha-pelo-fundo:/.test(texto.slice(Math.max(0, abre - 400), abre))) continue;
    let chaves = 0;
    for (let i = abre; i < texto.length; i++) {
      const c = texto[i];
      if (c === '{') chaves++;
      else if (c === '}') chaves--;
      else if (c === '>' && chaves === 0) {
        achados.push(texto.slice(abre, i + 1));
        break;
      }
    }
  }
  return achados;
}

/** Um `onClick` no overlay que chame qualquer coisa parecida com "fechar". */
const FECHA_PELO_FUNDO =
  /onClick=\{[^}]*(fechar|Fechar|onClose|aoFechar|onCancelar|set[A-Za-z]*\((?:null|false)\))/;

describe('modal com edição de dados não fecha por clique no fundo', () => {
  for (const [arquivo, oQueSePerde] of COM_EDICAO) {
    it(`${arquivo} — um clique fora perderia ${oQueSePerde}`, () => {
      const suspeitos = overlays(fonte(arquivo)).filter((bloco) => FECHA_PELO_FUNDO.test(bloco));
      expect(suspeitos, `${arquivo}: overlay voltou a fechar por clique no fundo`).toEqual([]);
    });
  }

  it('a lista não tem arquivo que sumiu ou mudou de lugar', () => {
    // Um caminho errado faria o `readFileSync` estourar no teste acima com uma
    // mensagem de ENOENT, que não explica nada. Aqui a falha diz o que é.
    for (const [arquivo] of COM_EDICAO) {
      expect(() => fonte(arquivo), `${arquivo} não existe mais — atualize a lista`).not.toThrow();
    }
  });
});

describe('o foco não é devolvido ao topo do diálogo a cada tecla', () => {
  /**
   * `useFocoPreso` MOVE o foco para o primeiro elemento focável do diálogo. Com
   * a função de fechar nas dependências, o efeito reexecutava a cada render —
   * e, como todo chamador passa uma arrow inline, isso era A CADA TECLA. Medido
   * no cadastro de manômetro padrão antes da correção: uma letra digitada,
   * `blur` no campo e `document.activeElement` no botão "×".
   *
   * O teste olha a lista de dependências porque é ela a causa: exigir
   * `useCallback` de cada chamador resolveria só os que lembrassem.
   */
  it('a lista de dependências do efeito de foco não inclui a função de fechar', () => {
    const texto = fonte('src/components/useFocoPreso.ts');
    const deps = [...texto.matchAll(/\}, \[([^\]]*)\]\);/g)].map((m) => m[1].trim());
    expect(deps, 'useFocoPreso mudou de forma — confira o efeito de foco').toContain('ref');
    for (const d of deps) {
      expect(d, 'a função de fechar voltou às dependências: o foco vai pular a cada tecla').not.toMatch(
        /onFechar/,
      );
    }
  });

  it('o ouvinte lê a função de fechar por ref, para não ficar com a versão velha', () => {
    const texto = fonte('src/components/useFocoPreso.ts');
    expect(texto).toContain('aoFechar.current()');
  });
});
