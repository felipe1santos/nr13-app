import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FOLHAS_ENSAIO,
  PASSOS,
  alternarDocumento,
  documentosFinais,
  documentosPadraoParaContainer,
  ensaiosRevisaveis,
  estadoDoPasso,
  folhasComDados,
  folhasEnsaioSemDados,
  passoAnterior,
  passoSeguinte,
  podeAvancar,
  podeGerar,
  progressoDoPasso,
  rotuloDaFolha,
  containerPadrao,
  FOLHA_FOTOS_CHECKLIST_CALDEIRA,
} from './wizardCriacao';
import { DOCUMENTOS_CALDEIRA } from '../equipamento/perfilEquipamento';
import { DOC_DO_ENSAIO } from '../inspecoes/resumoContainer';
import { escolhaProntaDoState, telaInicialDoEditor } from './rotaRelatorios';
import { resumirContainer } from '../inspecoes/resumoContainer';
import { DOCUMENTOS_DISPONIVEIS } from './tipos';
import type { ContainerInspecao } from '../inspecoes/tipos';

/**
 * O assistente de criação de relatório (09/09/2026) e a guarda que impede a
 * volta da tela duplicada.
 */

describe('as três etapas', () => {
  // 23/11/2026 · nova ordem a pedido do dono: Inspeção → Certificados → Resumo.
  // A composição das folhas saiu das etapas e foi para a engrenagem do
  // cabeçalho; por isso a trava de "pelo menos uma folha" é a do GERAR.
  it('a ordem é Inspeção, Certificados, Resumo', () => {
    expect(PASSOS.map((p) => p.rotulo)).toEqual(['Inspeção', 'Certificados', 'Resumo']);
  });

  it('as etapas 1 e 2 avançam sempre — "sem container" e "sem certificado" são respostas legítimas', () => {
    expect(podeAvancar(1, [])).toBe(true);
    expect(podeAvancar(1, ['CAPA.html'])).toBe(true);
    expect(podeAvancar(2, [])).toBe(true);
  });

  it('gerar exige ao menos uma folha marcada', () => {
    expect(podeGerar([])).toBe(false);
    expect(podeGerar(['CAPA.html'])).toBe(true);
    expect(podeAvancar(3, [])).toBe(false);
  });

  it('a barra vermelha anda um terço por etapa', () => {
    expect(progressoDoPasso(1)).toBeCloseTo(1 / 3);
    expect(progressoDoPasso(2)).toBeCloseTo(2 / 3);
    expect(progressoDoPasso(3)).toBe(1);
  });

  it('a barra não passa dos limites', () => {
    expect(passoSeguinte(3)).toBe(3);
    expect(passoAnterior(1)).toBe(1);
    expect(passoSeguinte(passoAnterior(2))).toBe(2);
  });

  it('feito / atual / futuro', () => {
    expect(estadoDoPasso(1, 2)).toBe('feito');
    expect(estadoDoPasso(2, 2)).toBe('atual');
    expect(estadoDoPasso(3, 2)).toBe('futuro');
  });
});

describe('a lista final entregue ao editor', () => {
  it('sai na ordem canônica do documento, não na ordem dos cliques', () => {
    const docs = documentosFinais(['CONCLUSAO.html', 'CAPA.html', 'PLACA.html'], []);
    expect(docs).toEqual(['CAPA.html', 'PLACA.html', 'CONCLUSAO.html']);
  });

  it('os certificados de calibração vão para o FIM', () => {
    const docs = documentosFinais(['CAPA.html'], ['CERTIFICADO-CAL-MANOMETRO.html?calibId=7']);
    expect(docs).toEqual(['CAPA.html', 'CERTIFICADO-CAL-MANOMETRO.html?calibId=7']);
  });

  it('folha desmarcada não entra', () => {
    expect(documentosFinais([], [])).toEqual([]);
    const semPlaca = alternarDocumento([...DOCUMENTOS_DISPONIVEIS], 'PLACA.html');
    expect(documentosFinais(semPlaca, [])).not.toContain('PLACA.html');
  });

  it('alternar preserva o resto da seleção', () => {
    const a = alternarDocumento(['CAPA.html'], 'PLACA.html');
    expect(a).toEqual(['CAPA.html', 'PLACA.html']);
    expect(alternarDocumento(a, 'CAPA.html')).toEqual(['PLACA.html']);
  });
});

describe('a revisão só lista ensaio REALMENTE salvo', () => {
  const container = (dados: ContainerInspecao['dados'], ensaios: ContainerInspecao['ensaios']): ContainerInspecao => ({
    id: 'c1',
    nome: 'Inspeção',
    criadoEm: '05/09/2026',
    ensaios,
    dados,
  });

  it('ensaio atribuído e vazio NÃO aparece para desmarcar', () => {
    const r = resumirContainer(
      container({ ultrassom: { medidas: { p: { c: '7,8' } } } }, ['ultrassom', 'teste_hidrostatico']),
    );
    expect(ensaiosRevisaveis(r).map((e) => e.ensaio)).toEqual(['ultrassom']);
    expect(ensaiosRevisaveis(r)[0].doc).toBe('ULTRASSOM.html');
  });

  it('o checklist fica FORA — ele alimenta três folhas, não uma', () => {
    const r = resumirContainer(container({ checklist: { respostas: { q1: 'Sim' } } }, ['checklist']));
    expect(r.salvos).toHaveLength(1);
    expect(ensaiosRevisaveis(r)).toEqual([]);
  });

  it('sem container, nada a revisar', () => {
    expect(ensaiosRevisaveis(null)).toEqual([]);
  });
});

describe('o padrão inteligente das folhas de ensaio (23/11/2026)', () => {
  const container = (dados: ContainerInspecao['dados'], ensaios: ContainerInspecao['ensaios']): ContainerInspecao => ({
    id: 'c1',
    nome: 'Inspeção',
    criadoEm: '05/09/2026',
    ensaios,
    dados,
  });
  const estrutura = DOCUMENTOS_DISPONIVEIS.filter((d) => !FOLHAS_ENSAIO.has(d));

  it('sem container: estrutura toda marcada, nenhuma folha de ensaio — o default antigo', () => {
    expect(documentosPadraoParaContainer(DOCUMENTOS_DISPONIVEIS, null)).toEqual(estrutura);
  });

  it('com container: marca só a folha de ensaio que tem dado SALVO', () => {
    const r = resumirContainer(
      container({ ultrassom: { medidas: { p: { c: '7,8' } } } }, ['ultrassom', 'teste_hidrostatico']),
    );
    const padrao = documentosPadraoParaContainer(DOCUMENTOS_DISPONIVEIS, r);
    expect(padrao).toContain('ULTRASSOM.html');
    // Atribuído e vazio não nasce marcado: sairia uma seção em branco.
    expect(padrao).not.toContain('TESTE-HIDROSTATICO.html');
    for (const d of estrutura) expect(padrao).toContain(d);
    // Na ordem do documento.
    expect(padrao).toEqual(DOCUMENTOS_DISPONIVEIS.filter((d) => padrao.includes(d)));
  });

  it('folha de ensaio marcada sem dado é a que recebe o aviso "sai em branco"', () => {
    const r = resumirContainer(container({ ultrassom: { medidas: { p: { c: '7,8' } } } }, ['ultrassom']));
    expect(folhasEnsaioSemDados(['CAPA.html', 'ULTRASSOM.html', 'TESTE-HIDROSTATICO.html'], r)).toEqual([
      'TESTE-HIDROSTATICO.html',
    ]);
    // Sem container, toda folha de ensaio marcada sai em branco; estrutura nunca.
    expect(folhasEnsaioSemDados(['CAPA.html', 'ULTRASSOM.html'], null)).toEqual(['ULTRASSOM.html']);
  });

  it('folhasComDados lê a mesma tabela da revisão', () => {
    const r = resumirContainer(container({ ultrassom: { medidas: { p: { c: '7,8' } } } }, ['ultrassom']));
    expect([...folhasComDados(r)]).toEqual(['ULTRASSOM.html']);
    expect(folhasComDados(null).size).toBe(0);
  });
});

describe('caldeira · toda folha e todo ensaio representados (23/11/2026)', () => {
  it('CALD-ALIMENTACAO-AGUA é folha de ENSAIO e tem nome na tela', () => {
    expect(FOLHAS_ENSAIO.has('CALD-ALIMENTACAO-AGUA.html')).toBe(true);
    expect(rotuloDaFolha('CALD-ALIMENTACAO-AGUA.html')).toBe('Alimentação de água e controle de nível (2.3)');
  });

  it('nenhuma folha da caldeira aparece com o nome do arquivo', () => {
    for (const d of DOCUMENTOS_CALDEIRA) expect(rotuloDaFolha(d), d).not.toBe(d);
  });

  it('toda folha alimentada por um ensaio de folha própria é folha de ensaio', () => {
    // A Verificação NR-13 alimenta o Relatório de inspeção, que é ESTRUTURA —
    // ela não tem folha própria e por isso fica de fora deste conjunto.
    for (const [ensaio, doc] of Object.entries(DOC_DO_ENSAIO)) {
      if (!doc || ensaio === 'verificacao_caldeira') continue;
      expect(FOLHAS_ENSAIO.has(doc), `${ensaio} → ${doc}`).toBe(true);
    }
    expect(DOC_DO_ENSAIO.verificacao_caldeira).toBe('CALD-RELATORIO-INSPECAO.html');
    expect(FOLHAS_ENSAIO.has('CALD-RELATORIO-INSPECAO.html')).toBe(false);
  });

  it('toda folha de ensaio da caldeira está no catálogo dela', () => {
    for (const doc of Object.values(DOC_DO_ENSAIO)) {
      if (doc && doc !== 'RELATORIO-IMAGENS.html' && doc.startsWith('CALD-')) {
        expect(DOCUMENTOS_CALDEIRA, doc).toContain(doc);
      }
    }
  });

  it('alimentação de água salva marca a folha 2.3; sem dado ela nasce desmarcada', () => {
    const vazio = resumirContainer({ id: 'c', nome: 'C', criadoEm: '', ensaios: ['alimentacao_agua'], dados: {} });
    expect(documentosPadraoParaContainer(DOCUMENTOS_CALDEIRA, vazio)).not.toContain('CALD-ALIMENTACAO-AGUA.html');
    expect(documentosPadraoParaContainer(DOCUMENTOS_CALDEIRA, vazio)).toContain('CALD-RELATORIO-INSPECAO.html');
    const feito = resumirContainer({
      id: 'c',
      nome: 'C',
      criadoEm: '',
      ensaios: ['alimentacao_agua'],
      dados: { alimentacao: { respostas: { a1: 'sim' }, resultado: 'aprovado' } },
    });
    expect(documentosPadraoParaContainer(DOCUMENTOS_CALDEIRA, feito)).toContain('CALD-ALIMENTACAO-AGUA.html');
  });
});

describe('gate · "Para qual equipamento?" não volta ao fluxo moderno', () => {
  const CRIAR = '?editor=1&tag=ZZ-1';

  it('escolha COM container abre montando — nem seletor, nem modal', () => {
    expect(
      telaInicialDoEditor(
        { tag: 'ZZ-1', tipo: 'Inspeção Periódica', documentos: ['CAPA.html'], containerId: 'c1' },
        CRIAR,
      ),
    ).toBe('montando');
    // `null` é decisão tomada ("sem container"), não ausência de decisão.
    expect(
      telaInicialDoEditor(
        { tag: 'ZZ-1', tipo: 'Inspeção Periódica', documentos: ['CAPA.html'], containerId: null },
        CRIAR,
      ),
    ).toBe('montando');
  });

  it('state ANTIGO (sem containerId) cai em criacao, nunca no seletor', () => {
    expect(telaInicialDoEditor({ tag: 'ZZ-1', tipo: 'Inspeção Periódica', documentos: ['CAPA.html'] }, CRIAR)).toBe(
      'criacao',
    );
  });

  it('CONTINUAR EDITANDO um rascunho não passa pelo seletor', () => {
    // Medido em 09/09/2026: "continuar editando" gera esta URL SEM state, e o
    // seletor de equipamento aparecia por quatro quadros antes de o rascunho
    // abrir. O `rel=` já diz que o destino é um documento.
    expect(telaInicialDoEditor(null, '?editor=1&tag=ZZ-1&rel=REL-9')).toBe('montando');
    // O mesmo vale para o documento legado.
    expect(telaInicialDoEditor(null, '?legado=1&tag=ZZ-1&rel=REL-9')).toBe('montando');
  });

  it('`?legado=1` sem documento começa no histórico daquela TAG', () => {
    expect(telaInicialDoEditor(null, '?legado=1&tag=ZZ-1')).toBe('historico');
  });

  it('sem escolha e sem TAG o seletor CONTINUA sendo o destino certo', () => {
    // `?editor=1` puro — o caminho que ainda precisa perguntar. A tela não foi
    // removida; ela saiu do fluxo moderno.
    for (const s of [null, undefined, {}, { tag: '' }, { tag: 'ZZ-1' }, 'lixo', { documentos: [] }]) {
      expect(telaInicialDoEditor(s, '?editor=1'), JSON.stringify(s)).toBe('equipamentos');
    }
  });

  it('o state é validado, não confiado', () => {
    expect(escolhaProntaDoState({ tag: 'ZZ-1', documentos: ['a', 7, 'b'] })?.documentos).toEqual(['a', 'b']);
    expect(escolhaProntaDoState({ tag: '   ', documentos: [] })).toBeNull();
    expect(escolhaProntaDoState({ tag: 'ZZ-1', documentos: 'CAPA.html' })).toBeNull();
  });
});

describe('gate · o fluxo moderno não monta a tela intermediária', () => {
  const v9 = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');

  it('a lista usa o ASSISTENTE, não o modal antigo', () => {
    expect(v9).toContain('ModalCriarRelatorio');
    // O modal antigo continua existindo para o editor legado; o que não pode é
    // a lista canônica voltar a usá-lo, porque era ele que entregava a escolha
    // sem container e obrigava o editor a perguntar do outro lado da rota.
    expect(v9).not.toContain('ModalNovaInspecao');
  });

  it('a escolha entregue ao editor CARREGA o container', () => {
    expect(v9).toContain('containerId: string | null');
    expect(v9).toContain('{ tag: criacao.tag, ...escolha }');
  });

  it('o seletor de equipamento tem guarda estrutural', () => {
    expect(tela).toContain("{tela === 'equipamentos' && !escolhaPronta.current && (");
  });

  it('a tela de fundo nasce decidida, e não em efeito', () => {
    expect(tela).toContain('telaInicialDoEditor(window.history.state?.usr, window.location.search)');
  });

  it('pedir o seletor DE PROPÓSITO ainda funciona', () => {
    // A guarda olha `escolhaPronta.current`; sem limpá-la, o "← Voltar" da
    // tela de criação não renderizaria nada.
    const voltar = tela.slice(tela.indexOf('function voltarParaEquipamentos()'));
    expect(voltar.slice(0, 400)).toContain('escolhaPronta.current = null;');
  });

  it('com container decidido, o editor gera direto — sem o modal do container', () => {
    const efeito = tela.slice(tela.indexOf('const pronta = escolhaPronta.current;'));
    const corpo = efeito.slice(0, efeito.indexOf('const alvo = alvoUrl.current;'));
    expect(corpo).toContain('if (pronta.containerId !== undefined)');
    expect(corpo).toContain('await finalizarGeracao(pronta.containerId, pendenteDaEscolha)');
    // E o caminho antigo, quando sobrevive, troca a tela ANTES de abrir o modal.
    expect(corpo.indexOf("setTela('criacao')")).toBeLessThan(corpo.indexOf('avancarParaEtapaContainer('));
  });
});

describe('legado · os caminhos que continuam existindo', () => {
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');

  it('o histórico por TAG segue guardado pelo papel legado', () => {
    expect(tela).toContain("{tela === 'historico' && papel.current === 'legado' && (");
  });

  it('o modal do container continua no editor, para `?legado=1`', () => {
    expect(tela).toContain("{etapaModal === 'container' && (");
    expect(tela).toContain('ModalSelecionarContainer');
  });

  it('o modal antigo de folhas não foi apagado', () => {
    expect(tela).toContain('ModalNovaInspecao');
  });
});

describe('gate · a TAG não pode vir do estado do React na geração', () => {
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');
  const corpo = tela.slice(
    tela.indexOf('async function finalizarGeracao('),
    tela.indexOf('// Re-hidrata as chaves "atuais"'),
  );

  it('`finalizarGeracao` recebe a TAG por parâmetro', () => {
    // 10/09/2026 · medido em produção com o container "Inspeção da IA"
    // completo: `meta.containerOrigemId` gravado certo e
    // `nr13_injecao_atual`/`nr13_inspecao_atual` VAZIAS. A causa é que
    // `finalizarGeracao` roda no MESMO tick de `abrirEquipamento`, que acabou
    // de chamar `setTag` — e `tag` ainda vale ''. `carregarContainer('', id)`
    // lê a chave `nr13_docs_` e não acha nada, e o documento sai com todos os
    // ensaios em branco.
    expect(corpo).toContain('escolhaDireta?: { tipo: TipoInspecao; docs: string[]; tag?: string }');
    expect(corpo).toContain("const tagAtual = escolhaDireta?.tag?.trim() || tag;");
  });

  it('nenhuma leitura por TAG dentro da geração usa o ESTADO', () => {
    // Todas são leituras por chave `<algo>_<TAG>`: container, memorial,
    // pontos de ultrassom, livro e assinantes. Uma delas com a TAG vazia
    // basta para o documento sair sem aquela parte.
    for (const chamada of [
      'carregarContainer(tagAtual, containerId)',
      'expandirFolhasUltrassom(\n      tagAtual,',
      'expandirMemorial(tagAtual, montarListaComTermoAbertura(tagAtual, validos, dadosContainer))',
      'carregarAssinantesRel(tagAtual, funcs)',
    ]) {
      expect(corpo, chamada).toContain(chamada);
    }
    // E nenhuma sobrou com a variável de estado.
    for (const proibido of [
      'carregarContainer(tag,',
      'expandirMemorial(tag,',
      'montarListaComTermoAbertura(tag,',
      'carregarAssinantesRel(tag,',
    ]) {
      expect(corpo.includes(proibido), proibido).toBe(false);
    }
  });

  it('quem chama do assistente ENTREGA a TAG', () => {
    expect(tela).toContain('docs: pronta.documentos, tag: pronta.tag }');
  });
});

describe('Livro de Registro fora da criação (23/11/2026)', () => {
  it('o assistente não oferece o Livro — ele é preenchido à mão em Registros de Segurança', async () => {
    const { folhasOferecidas } = await import('./wizardCriacao');
    const { DOCUMENTOS_CALDEIRA } = await import('../equipamento/perfilEquipamento');
    const { DOCUMENTOS_DISPONIVEIS } = await import('./tipos');
    expect(folhasOferecidas(DOCUMENTOS_CALDEIRA)).not.toContain('LIVRO-REGISTRO.html');
    expect(folhasOferecidas(DOCUMENTOS_DISPONIVEIS)).not.toContain('LIVRO-REGISTRO.html');
    expect(folhasOferecidas(['CAPA.html', 'LIVRO-REGISTRO.html'])).toEqual(['CAPA.html']);
  });
});

describe('containerPadrao — a inspeção já vem escolhida (23/11/2026)', () => {
  const r = (id: string, n: number) => ({ id, salvos: Array.from({ length: n }, () => ({}) as never) });
  it('escolhe a mais recente COM dado salvo, pelo carimbo do id', () => {
    expect(containerPadrao([r('cont1000_a', 2), r('cont3000_c', 1), r('cont2000_b', 4)])).toBe('cont3000_c');
  });
  it('ignora container vazio', () => {
    expect(containerPadrao([r('cont1000_a', 2), r('cont9000_z', 0)])).toBe('cont1000_a');
  });
  it('sem nenhum container com dado: nenhum (= "Não usar container")', () => {
    expect(containerPadrao([])).toBeNull();
    expect(containerPadrao([r('cont1000_a', 0)])).toBeNull();
  });
  it('id sem carimbo: vale a última da lista', () => {
    expect(containerPadrao([r('x', 1), r('y', 1)])).toBe('y');
  });
});

describe('fotos do checklist da caldeira (8.1/8.2) — 23/11/2026', () => {
  const resumo = (fotos: number) =>
    ({ salvos: [{ ensaio: 'checklist', fotos }] }) as unknown as Parameters<typeof folhasComDados>[0];
  it('checklist COM foto acende a folha de fotos da caldeira', () => {
    expect(folhasComDados(resumo(3)).has(FOLHA_FOTOS_CHECKLIST_CALDEIRA)).toBe(true);
  });
  it('checklist sem foto não acende (a seção não sairia)', () => {
    expect(folhasComDados(resumo(0)).has(FOLHA_FOTOS_CHECKLIST_CALDEIRA)).toBe(false);
  });
  it('a caldeira oferece a folha; o vaso não a recebe', () => {
    expect(DOCUMENTOS_CALDEIRA).toContain(FOLHA_FOTOS_CHECKLIST_CALDEIRA);
    expect(documentosPadraoParaContainer(['CAPA.html'], resumo(3))).not.toContain(FOLHA_FOTOS_CHECKLIST_CALDEIRA);
  });
});
