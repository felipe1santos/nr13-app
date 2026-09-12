import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CampoEditavel } from '../pdfVetorial/documento';
import {
  camposDoDocumento,
  itensQueSeraoEscritos,
  overridesDaAplicacao,
  planoAplicacao,
} from './aplicacao';
import { CAMPOS_PREDEFINIVEIS, idPermitido } from './camposPredefiniveis';
import type { Predefinicao } from './modelo';
import type { MapaOverrides } from '../overridesRelatorio';

const P = (campos: Record<string, string>): Predefinicao => ({
  id: 'p1',
  nome: 'ZZ conjunto',
  descricao: '',
  campos,
  criadoEm: '2026-09-12T00:00:00.000Z',
  atualizadoEm: '2026-09-12T00:00:00.000Z',
  versao: 1,
});

/** Um campo como o gerador o registra ao desenhar. */
const campo = (id: string, valor: string, auto = ''): CampoEditavel => ({
  id,
  rotulo: id,
  pendencia: valor.trim() === '' ? 'critica' : 'nenhuma',
  tipo: 'texto',
  auto,
  valor,
  origem: 'auto',
  multilinha: false,
  pagina: 1,
  x: 0,
  y: 0,
  larg: 10,
  alt: 5,
});

describe('o plano classifica cada campo antes de qualquer escrita', () => {
  it('campo vazio → preenche; campo com o mesmo texto → igual; diferente → conflito', () => {
    const plano = planoAplicacao(
      P({
        'objetivo.texto': 'NOVO',
        'escopo.texto': 'IGUAL',
        'categoria.nota': 'NOVO',
      }),
      [
        campo('objetivo.texto', ''),
        campo('escopo.texto', 'IGUAL'),
        campo('categoria.nota', 'JÁ ESCRITO À MÃO'),
      ],
    );
    expect(plano.itens.map((i) => [i.id, i.estado])).toEqual([
      ['objetivo.texto', 'preenche'],
      ['escopo.texto', 'igual'],
      ['categoria.nota', 'conflito'],
    ]);
    expect(plano.totalVazios).toBe(1);
    expect(plano.totalIguais).toBe(1);
    expect(plano.totalConflitos).toBe(1);
  });

  it('campo que este relatório NÃO desenha entra como ausente', () => {
    // Um conjunto com campos do teste hidrostático aplicado num relatório sem a
    // folha de TH: sem este estado o contador diria "3 preenchidos" e o papel
    // mostraria um. É a falha silenciosa que este sistema já pagou caro.
    const plano = planoAplicacao(
      P({ 'objetivo.texto': 'a', 'th.procedimento': 'b', 'th.normas': 'c' }),
      [campo('objetivo.texto', '')],
    );
    expect(plano.totalAusentes).toBe(2);
    expect(itensQueSeraoEscritos(plano, 'substituir').map((i) => i.id)).toEqual(['objetivo.texto']);
  });

  it('espaço em branco conta como vazio, dos dois lados', () => {
    const plano = planoAplicacao(P({ 'objetivo.texto': 'texto' }), [campo('objetivo.texto', '   ')]);
    expect(plano.itens[0].estado).toBe('preenche');
  });

  it('os itens saem na ordem das FOLHAS, não na ordem em que foram marcados', () => {
    const plano = planoAplicacao(
      P({ 'proximas.nota': 'z', 'objetivo.texto': 'a' }),
      [campo('objetivo.texto', ''), campo('proximas.nota', '')],
    );
    expect(plano.itens.map((i) => i.id)).toEqual(['objetivo.texto', 'proximas.nota']);
  });

  it('o rótulo vem do DOCUMENTO quando o campo existe nele', () => {
    const c = { ...campo('objetivo.texto', ''), rotulo: 'Objetivo do relatório' };
    expect(planoAplicacao(P({ 'objetivo.texto': 'a' }), [c]).itens[0].rotulo).toBe(
      'Objetivo do relatório',
    );
  });
});

describe('PROTEÇÃO CONTRA SOBRESCRITA', () => {
  const plano = () =>
    planoAplicacao(
      P({ 'objetivo.texto': 'NOVO', 'categoria.nota': 'NOVO' }),
      [campo('objetivo.texto', ''), campo('categoria.nota', 'ESCRITO À MÃO')],
    );

  it('o modo padrão NÃO toca no que já tem conteúdo', () => {
    const escritos = itensQueSeraoEscritos(plano(), 'vazios');
    expect(escritos.map((i) => i.id)).toEqual(['objetivo.texto']);
  });

  it('substituir só alcança o conflito quando é escolhido EXPLICITAMENTE', () => {
    const escritos = itensQueSeraoEscritos(plano(), 'substituir');
    expect(escritos.map((i) => i.id)).toEqual(['objetivo.texto', 'categoria.nota']);
  });

  it('o override do modo padrão não menciona o campo em conflito', () => {
    const mapa = overridesDaAplicacao({}, plano(), 'vazios');
    expect(Object.keys(mapa)).toEqual(['objetivo.texto']);
    expect(mapa['categoria.nota']).toBeUndefined();
  });

  it('campo já IGUAL não é reescrito — não vira override à toa', () => {
    const p = planoAplicacao(P({ 'objetivo.texto': 'MESMO' }), [campo('objetivo.texto', 'MESMO')]);
    expect(overridesDaAplicacao({}, p, 'substituir')).toEqual({});
  });

  it('campo AUSENTE nunca vira override, nem no modo substituir', () => {
    const p = planoAplicacao(P({ 'th.normas': 'ASME' }), []);
    expect(overridesDaAplicacao({}, p, 'substituir')).toEqual({});
  });
});

/**
 * A REGRA DO DONO (12/09/2026): predefinição preenche o que está VAZIO; o que o
 * sistema puxa de outra seção — ficha do equipamento, inspeção de campo —
 * prevalece.
 *
 * A allowlist já cuida da maior parte (ficha, memorial, categorização, medições
 * e laudo nem são predefiníveis). Estes testes cobrem os três campos que a
 * allowlist admite e que MESMO ASSIM têm fonte: os do teste hidrostático, que
 * vêm do container de inspeção.
 */
describe('o dado que vem da inspeção PREVALECE', () => {
  const comTh = (valor: string, origem: 'auto' | 'manual') => ({
    ...campo('th.procedimento', valor),
    origem,
  });

  it('preenchido pela inspeção → protegido, e nem `substituir` escreve', () => {
    const p = planoAplicacao(P({ 'th.procedimento': 'texto do escritório' }), [
      comTh('Pressurização em degraus de 25%, conforme respondido em campo.', 'auto'),
    ]);
    expect(p.itens[0].estado).toBe('protegido');
    expect(p.totalProtegidos).toBe(1);
    expect(p.totalConflitos).toBe(0);
    expect(itensQueSeraoEscritos(p, 'vazios')).toEqual([]);
    expect(itensQueSeraoEscritos(p, 'substituir')).toEqual([]);
    expect(overridesDaAplicacao({}, p, 'substituir')).toEqual({});
  });

  it('a tela diz DE ONDE veio o valor que prevaleceu', () => {
    const p = planoAplicacao(P({ 'th.normas': 'x' }), [
      { ...campo('th.normas', 'ASME PCC-2'), origem: 'auto' },
    ]);
    expect(p.itens[0].fonte).toBe('container de inspeção');
  });

  it('a inspeção NÃO respondeu aquilo → a predefinição preenche normalmente', () => {
    // Aqui ela não substitui dado nenhum: preenche um buraco. É o caso comum de
    // quem gera o relatório sem container.
    const p = planoAplicacao(P({ 'th.procedimento': 'procedimento padrão da empresa' }), [
      comTh('', 'auto'),
    ]);
    expect(p.itens[0].estado).toBe('preenche');
    expect(itensQueSeraoEscritos(p, 'vazios')).toHaveLength(1);
  });

  it('texto que o PRÓPRIO usuário digitou no campo não fica trancado para ele', () => {
    // `origem: 'manual'` = já existe override daquele campo neste relatório. Sem
    // esta parte da condição, o usuário perderia o direito de trocar o que ele
    // mesmo escreveu ali.
    const p = planoAplicacao(P({ 'th.procedimento': 'novo texto' }), [
      comTh('escrito à mão neste relatório', 'manual'),
    ]);
    expect(p.itens[0].estado).toBe('conflito');
    expect(itensQueSeraoEscritos(p, 'vazios')).toEqual([]);
    expect(itensQueSeraoEscritos(p, 'substituir')).toHaveLength(1);
  });

  it('campo SEM fonte externa com valor automático segue substituível por escolha', () => {
    // `objetivo.texto` tem uma redação PADRÃO escrita pelo próprio gerador —
    // não é dado puxado de outra seção. Trocá-la pela redação da empresa é o
    // uso mais óbvio de uma predefinição, e continua possível.
    const p = planoAplicacao(P({ 'objetivo.texto': 'a redação da empresa' }), [
      { ...campo('objetivo.texto', 'redação padrão do sistema'), origem: 'auto' },
    ]);
    expect(p.itens[0].estado).toBe('conflito');
    expect(itensQueSeraoEscritos(p, 'substituir')).toHaveLength(1);
  });

  it('a allowlist marca os TRÊS campos de fonte externa, e só eles', () => {
    const comFonte = CAMPOS_PREDEFINIVEIS.filter((c) => c.fonteExterna).map((c) => c.id);
    expect(comFonte).toEqual(['th.procedimento', 'th.normas', 'th.parecer']);
  });
});

describe('aplicar produz overrides do relatório aberto', () => {
  it('valor com texto vira override manual e guarda o automático que substituiu', () => {
    const p = planoAplicacao(P({ 'objetivo.texto': 'MEU TEXTO' }), [
      campo('objetivo.texto', 'padrão do sistema', 'padrão do sistema'),
    ]);
    const mapa = overridesDaAplicacao({}, p, 'substituir');
    const ovr = mapa['objetivo.texto'];
    expect(ovr.modo).toBe('manual');
    expect(ovr.modo === 'manual' && ovr.valor).toBe('MEU TEXTO');
    expect(ovr.auto).toBe('padrão do sistema');
  });

  it('valor VAZIO vira `branco` — o automático não volta sozinho na próxima geração', () => {
    // É o conjunto "sem recomendações": limpar de propósito. `branco` é o
    // terceiro estado do override, e é o que impede o texto automático de
    // reaparecer depois de o usuário o ter apagado.
    const p = planoAplicacao(P({ 'objetivo.texto': '' }), [
      campo('objetivo.texto', 'padrão', 'padrão'),
    ]);
    expect(overridesDaAplicacao({}, p, 'substituir')['objetivo.texto'].modo).toBe('branco');
  });

  it('o mapa anterior é preservado — aplicar não apaga edição de outro campo', () => {
    // O modelo antigo limpava as linhas de recomendação que o conjunto não
    // usava: quem tinha escrito a quarta à mão a perdia sem ver aviso nenhum.
    const antes: MapaOverrides = {
      'escopo.texto': { modo: 'manual', valor: 'escrito antes', auto: '', em: '' },
    };
    const p = planoAplicacao(P({ 'objetivo.texto': 'novo' }), [campo('objetivo.texto', '')]);
    const depois = overridesDaAplicacao(antes, p, 'vazios');
    expect(depois['escopo.texto']).toEqual(antes['escopo.texto']);
    expect(depois['objetivo.texto']).toBeDefined();
  });

  it('UMA gravação e UMA geração: a prévia chama `aplicar` uma vez só', () => {
    const previa = readFileSync('src/features/relatorios/PreviaVetorial.tsx', 'utf8');
    const fn = previa.slice(previa.indexOf('const aplicarPlanoPredefinicao = useCallback('));
    const corpo = fn.slice(0, fn.indexOf('const camposPorPagina'));
    expect(corpo).toContain('overridesDaAplicacao(overrides, plano, modo)');
    expect((corpo.match(/await aplicar\(/g) ?? []).length).toBe(1);
  });
});

describe('criar um conjunto a partir do relatório aberto', () => {
  it('pega só os campos da allowlist que TÊM conteúdo', () => {
    const campos = camposDoDocumento(
      [
        campo('objetivo.texto', 'tem texto'),
        campo('escopo.texto', '   '),
        campo('capa.tag', 'ZZ-001'), // fora da allowlist
        campo('categoria.pmta', '10,5'), // idem
      ],
      idPermitido,
    );
    expect(campos).toEqual({ 'objetivo.texto': 'tem texto' });
  });

  it('campo vazio não entra — senão o conjunto APAGARIA o próximo relatório', () => {
    expect(camposDoDocumento([campo('objetivo.texto', '')], idPermitido)).toEqual({});
  });
});

/**
 * RELATÓRIO FINALIZADO.
 *
 * A trava não vive no modal: ela vive um nível acima, onde a prévia inteira só é
 * montada enquanto o documento é rascunho. É a mesma regra do §7-ter — relatório
 * salvo é registro técnico assinado, e nenhum caminho da UI o altera.
 */
describe('gate · documento finalizado não recebe predefinição', () => {
  it('a prévia (e com ela o botão Predefinições) só existe fora do somenteLeitura', () => {
    const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');
    expect(tela).toContain("{fluxo === 'vetorial' && !somenteLeitura && (");
    expect(tela).toContain('<PreviaVetorial');
    const trecho = tela.slice(tela.indexOf("{fluxo === 'vetorial' && !somenteLeitura && ("));
    // O componente é o PRIMEIRO filho da condição: nada de um segundo ramo que
    // o monte em relatório salvo.
    expect(trecho.slice(0, 200)).toContain('<PreviaVetorial');
  });

  it('o modal ainda assim honra `somenteLeitura`: sem Usar, sem criar, sem excluir', () => {
    const modal = readFileSync(
      'src/features/relatorios/predefinicoes/ModalPredefinicoes.tsx',
      'utf8',
    );
    expect(modal).toContain('somenteLeitura?: boolean');

    /**
     * Entre o contêiner e a ação tem de existir a guarda.
     *
     * A conferência é por ESTRUTURA e não por distância em caracteres: um
     * limite de N caracteres passa a mentir assim que alguém reformata o JSX.
     */
    const guardado = (contêiner: string, acao: string) => {
      const ini = modal.indexOf(contêiner);
      const fim = modal.indexOf(acao, ini);
      expect(ini, `contêiner ausente: ${contêiner}`).toBeGreaterThan(0);
      expect(fim, `ação ausente: ${acao}`).toBeGreaterThan(ini);
      return modal.slice(ini, fim);
    };

    // Criar — os dois caminhos ficam sob a mesma guarda na barra da lista.
    expect(guardado('className="predef-barra"', 'abrirNova(camposDoDocumento')).toContain(
      '!somenteLeitura',
    );
    expect(guardado('className="predef-barra"', 'abrirNova()')).toContain('!somenteLeitura');
    // Aplicar — pela linha da lista e pelo rodapé do detalhe.
    expect(guardado('className="predef-linha-acoes"', 'predef-usar')).toContain('!somenteLeitura');
    expect(guardado('predef-corpo predef-detalhe', "setVista('revisao')")).toContain(
      '!somenteLeitura',
    );

    // Editar e Excluir do menu pedem AS DUAS guardas: nem em somente leitura,
    // nem sobre o conjunto do sistema.
    expect((modal.match(/!somenteLeitura && !sistema && \(/g) ?? []).length).toBe(2);
  });
});
