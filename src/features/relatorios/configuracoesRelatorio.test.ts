/**
 * CONFIGURAÇÕES DO RELATÓRIO → ONDE CADA CAMPO SAI NO DOCUMENTO (15/09/2026).
 *
 * ## O que este arquivo trava
 *
 * O modal "Configurações do Relatório" tem 11 controles. Cada um grava um campo
 * de `RelatorioMeta`, e o modelo do documento (`pdfVetorial/modelo.ts`) lê de
 * lá. O elo entre os dois é uma STRING de chave, e quebrá-lo não produz erro
 * nenhum: o campo cai no `textoOu(...)`, a folha imprime "—" e o documento sai
 * assinado com a linha vazia. É a mesma classe de defeito que o §2-ter descreve
 * para as chaves do palco — falta SILENCIOSA — e o que a auditoria de
 * 15/09/2026 foi verificar.
 *
 * Por isso os testes abaixo não conferem "o modal salvou": conferem que o nome
 * do campo continua sendo lido pelo modelo, e em QUANTOS lugares. Um binding
 * que some leva o teste junto.
 *
 * ## Como a auditoria mediu
 *
 * Relatório ZZ-FASE3 no laboratório, um valor único por campo, "Aplicar ao
 * documento" e o texto REAL extraído do PDF gerado (pdfjs, 12 páginas):
 *
 *   Validade `02/03/2032`        → páginas 1 e 3
 *   Execução `03/04/2030`        → páginas 1, 3 e 8
 *   Próx. interna `04/05/2033`   → página 12
 *   Próx. externa `05/06/2034`   → página 12
 *   A.R.T. `CFG-E2E-ART-08`      → páginas 1 e 8
 *   Código `REL-…`               → todas as 12 (cabeçalho) + capa + exames
 *   Engenheiro                   → páginas 1 e 12
 *   Técnico (assinante)          → página 12
 *   Técnico (texto livre)        → página 12, SÓ sem assinante escolhido
 *   Emissão `01/02/2031`         → NENHUMA, enquanto houver execução
 *
 * As duas últimas linhas são achados, não falhas de teste — estão descritas nos
 * blocos que as travam, e em PENDENCIAS.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../../..');
const fonte = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

const modal = fonte('src/pages/Relatorios.tsx');
const modelo = fonte('src/features/relatorios/pdfVetorial/modelo.ts');
const folhas = fonte('src/features/relatorios/pdfVetorial/folhas.ts');

/**
 * O CONTROLE no modal → a CHAVE da meta → quantas leituras no modelo.
 *
 * `leituras` é a contagem de `meta?.<chave>` em `modelo.ts`. Ela existe para
 * pegar a perda PARCIAL: a A.R.T. alimenta a capa E a folha de exames, e um
 * binding que sumisse de um dos dois deixaria o documento coerente à primeira
 * vista e errado na página 8.
 */
const CAMPOS: Array<{ controle: string; chave: string; leituras: number; onde: string }> = [
  { controle: 'codigo', chave: 'codigo', leituras: 2, onde: 'capa + folha de exames' },
  { controle: 'emissao', chave: 'emissao', leituras: 1, onde: 'capa (só como reserva da execução)' },
  { controle: 'validade', chave: 'validade', leituras: 1, onde: 'capa + folha de datas' },
  { controle: 'execucaoInspecao', chave: 'execucaoInspecao', leituras: 4, onde: 'capa + datas + exames (início e término) + validade das calibrações do quadro 7.1.1' },
  { controle: 'proximaInterna', chave: 'proximaInspecaoInterna', leituras: 1, onde: 'próxima inspeção (exame interno)' },
  { controle: 'proximaExterna', chave: 'proximaInspecaoExterna', leituras: 1, onde: 'próxima inspeção (exame externo)' },
  { controle: 'tecnicoNome', chave: 'tecnicoNome', leituras: 1, onde: 'assinaturas, atrás do assinante escolhido' },
  { controle: 'art', chave: 'art', leituras: 1, onde: 'capa + folha de exames' },
];

describe('cada campo do modal continua sendo lido pelo documento', () => {
  for (const { controle, chave, leituras, onde } of CAMPOS) {
    it(`${controle} → meta.${chave} → ${onde}`, () => {
      // O controle existe no modal, com o `name` que o foco da barra de
      // pendências usa como endereço (`DESTINO_POR_CAMPO`).
      expect(modal, `o campo "${controle}" sumiu do modal`).toContain(`name="${controle}"`);
      // E o modelo do documento continua lendo a chave que ele grava.
      const lidas = (modelo.match(new RegExp(`meta\\?\\.${chave}\\b`, 'g')) ?? []).length;
      expect(lidas, `meta.${chave} deixou de ser lido pelo documento`).toBeGreaterThan(0);
      expect(lidas, `meta.${chave} mudou de ${leituras} para ${lidas} leituras — confira ${onde}`).toBe(
        leituras,
      );
    });
  }

  it('os três selects de assinatura continuam no modal', () => {
    for (const id of ['rel-sel-engenheiro', 'rel-sel-tecnico', 'rel-sel-termo-livro']) {
      expect(modal, `o select ${id} sumiu`).toContain(`id="${id}"`);
    }
  });
});

describe('a precedência das fontes não se inverte', () => {
  it('o assinante ESCOLHIDO vence o nome digitado, e não o contrário', () => {
    // §7-bis: o snapshot congelado na meta é a fonte do assinante. O campo
    // "Técnico" do modal é o texto livre que sobra para quem não tem
    // funcionário cadastrado. Inverter a ordem faria o texto livre apagar o
    // assinante escolhido num documento assinado.
    expect(modelo).toContain("meta?.assinantes?.tecnico?.nome ?? meta?.tecnicoNome");
    expect(modelo).toContain("meta?.assinantes?.engenheiro?.nome ?? meta?.phNome");
    expect(modelo).toContain("meta?.assinantes?.engenheiro?.crea ?? meta?.phCrea");
  });

  it('a data do modal vence a data do checklist — e o checklist é a reserva', () => {
    // A configuração é a escolha EXPLÍCITA do engenheiro para o documento; a
    // data do container é o que o campo registrou. Sem a reserva, relatório
    // sem data no modal perderia a data que a inspeção tinha.
    expect(modelo).toContain("dataBr(meta?.execucaoInspecao) ?? dataBr(chk.dataInspecao)");
  });

  it('a empresa congelada vence a viva — trocar a logo não altera documento salvo', () => {
    expect(modelo).toContain("meta?.empresa ?? ler<Record<string, unknown>>('nr13_minha_empresa')");
  });

  it('nenhum campo do modal alcança medição, cálculo ou categoria', () => {
    // O modal só escreve `RelatorioMeta`. Se um dia ele passar a gravar por
    // TAG, estará escrevendo sobre a fonte oficial de outra coisa — o memorial,
    // a medição de espessura ou a categorização — e isso não pode nascer de um
    // campo de data. `setCampoMeta` é a ÚNICA porta, e ela só mexe no estado da
    // meta.
    expect(modal).toContain('function setCampoMeta(chave: keyof RelatorioMeta, valor: string)');
    expect(modal).toContain("setMeta((m) => (m ? { ...m, [chave]: valor } : m));");
  });
});

describe('os achados da auditoria, travados como estão hoje', () => {
  it('EMISSÃO só chega ao papel quando a EXECUÇÃO está vazia', () => {
    // Medido: com execução preenchida, `01/02/2031` não aparece em nenhuma das
    // 12 páginas; apagando a execução, ele assume a "DATA DA INSPEÇÃO" da capa.
    // O Modelo Novo não tem linha própria de emissão, e criar uma é mudança de
    // documento — está em PENDENCIAS.md, não aqui.
    expect(folhas).toContain('textoOu(m.execucao ?? m.emissao)');
    // E a folha de datas NÃO tem a mesma reserva: ali a execução vazia imprime
    // "—" mesmo com emissão preenchida. É a parte incoerente do achado.
    expect(folhas).toContain("{ texto: textoOu(m.execucao), valor: true, id: 'datas.execucao'");
  });

  it('a linha do TESTE HIDROSTÁTICO da próxima inspeção não tem campo que a preencha', () => {
    // `proximas.th` vem de `meta.validadeValvula`, e nenhum controle do sistema
    // escreve essa chave — ela nasce '' em `metaPadrao` e fica. A linha sai
    // sempre "—". Registrado em PENDENCIAS.md.
    expect(modelo).toContain('th: txt(meta?.validadeValvula)');
    expect(modal).not.toContain('name="validadeValvula"');
    expect(fonte('src/pages/Relatorios.tsx')).toContain("validadeValvula: ''");
  });

  it('QUEM ASSINA O TERMO DO LIVRO tem destino, e ele é a folha do livro', () => {
    // No Modelo Novo o Livro não é emitido (limitação declarada da Fase 11:
    // "o Livro, os certificados e o termo de abertura não são tocados"), então
    // a escolha não aparece no PDF vetorial. Ela não é inútil: fica congelada
    // na meta e é a folha LIVRO-REGISTRO.html quem a lê.
    expect(fonte('src/features/relatorios/relatoriosService.ts')).toContain(
      "assinanteTermoLivro: a.assinanteTermoLivro === 'tecnico' ? 'tecnico' : 'engenheiro',",
    );
    expect(fonte('public/arquivos-inspecao/LIVRO-REGISTRO.html')).toContain(
      'snap.assinanteTermoLivro',
    );
    expect(fonte('src/features/relatorios/pdfVetorial/composicao.ts')).not.toContain(
      'LIVRO-REGISTRO.HTML',
    );
  });
});

describe('"Aplicar ao documento" aplica de verdade', () => {
  it('grava a meta E refaz o documento, nessa ordem', () => {
    // Gravar sem refazer deixava o usuário olhando a folha antiga e concluindo
    // que o campo não tinha sido aceito — foi o que deu nome ao botão.
    const bloco = /async function atualizarMetadados\(\)[\s\S]*?\n {2}\}/.exec(modal)?.[0] ?? '';
    expect(bloco).toContain('await gravarMetaAtual(meta)');
    expect(bloco).toContain('setVersao((v) => v + 1)');
    expect(bloco).toContain('setAplicadoEm(Date.now())');
    // E não aplica em relatório finalizado (§7-ter): o gate do botão não basta.
    expect(bloco).toContain('if (!meta || somenteLeitura) return;');
  });
});
