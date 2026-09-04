import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SelecaoAmbigua,
  acharBotaoNoCard,
  acharCardPorId,
  prepararExclusao,
  __padraoInseguroSobeAncestrais,
} from './selecaoSegura.mjs';

/**
 * Roda no runner do Node: `node --test scripts/automacao/selecaoSegura.test.mjs`
 *
 * (o modo DIRETÓRIO do `--test` está quebrado no Node 24 neste repositório —
 * vale também para `scripts/massa-escala/`; use sempre o caminho do arquivo.)
 *
 * Estes testes reproduzem o acidente de 04/09/2026 — uma automação apagou o
 * cliente "TERCAL" ao tentar apagar "ZZ TESTE CRIACAO CLIENTE LTDA" — e provam
 * que a regra nova o impede. O padrão antigo está preservado no módulo só para
 * que a demonstração seja MEDIDA, não afirmada.
 */

/** A lista real daquele dia, na ordem em que estava na tela. */
const CARDS = [
  {
    id: 'a1-tercal',
    nome: 'TERCAL - INSPEÇÕES NR13 NR12 | CALDEIRAS | EMISSÃO ACÚSTICA| TUBULAÇÃO ART | PRONTUÁRIO | MANUTENÇÃO E MONTAGEM INDUSTRIAL',
    botoes: [{ rotulo: 'Editar' }, { rotulo: 'Excluir' }],
  },
  { id: 'b2-shell', nome: 'Posto Shell Prime', botoes: [{ rotulo: 'Editar' }, { rotulo: 'Excluir' }] },
  { id: 'c3-ipiranga', nome: 'Posto Ipiranga', botoes: [{ rotulo: 'Editar' }, { rotulo: 'Excluir' }] },
  { id: 'd4-zz', nome: 'ZZ TESTE CRIACAO CLIENTE LTDA', botoes: [{ rotulo: 'Editar' }, { rotulo: 'Excluir' }] },
];

test('REGRESSÃO: o padrão antigo escolhe o card ERRADO', () => {
  // A árvore como estava: cada botão dentro do seu card, e todos os cards
  // dentro da lista — cujo texto contém o nome de TODOS.
  const textoDaLista = CARDS.map((c) => c.nome).join(' ');
  const lista = { texto: textoDaLista, pai: null };
  const botoes = CARDS.map((c) => {
    const card = { texto: c.nome, pai: lista };
    return { id: c.id, texto: 'Excluir', pai: card };
  });

  const escolhido = __padraoInseguroSobeAncestrais(botoes, 'ZZ TESTE CRIACAO CLIENTE', 6);

  // Procurando a empresa ZZ, o padrão devolve o botão do TERCAL: subiu até a
  // lista, e a lista contém o nome procurado.
  assert.equal(escolhido.id, 'a1-tercal');
  assert.notEqual(escolhido.id, 'd4-zz');
});

test('a regra nova acha o card certo pelo id', () => {
  const card = acharCardPorId(CARDS, { id: 'd4-zz', nomeEsperado: 'ZZ TESTE CRIACAO CLIENTE LTDA' });
  assert.equal(card.id, 'd4-zz');
});

test('id certo com nome divergente PARA — não exclui', () => {
  assert.throws(
    () => acharCardPorId(CARDS, { id: 'a1-tercal', nomeEsperado: 'ZZ TESTE CRIACAO CLIENTE LTDA' }),
    SelecaoAmbigua,
  );
});

test('sem id estável, PARA — texto não identifica registro', () => {
  assert.throws(() => acharCardPorId(CARDS, { id: '', nomeEsperado: 'Posto Ipiranga' }), SelecaoAmbigua);
  assert.throws(() => acharCardPorId(CARDS, { id: 'b2-shell', nomeEsperado: '' }), SelecaoAmbigua);
});

test('id inexistente e id duplicado PARAM', () => {
  assert.throws(() => acharCardPorId(CARDS, { id: 'nao-existe', nomeEsperado: 'x' }), SelecaoAmbigua);
  const duplicados = [...CARDS, { id: 'd4-zz', nome: 'Outro qualquer', botoes: [] }];
  assert.throws(
    () => acharCardPorId(duplicados, { id: 'd4-zz', nomeEsperado: 'ZZ TESTE CRIACAO CLIENTE LTDA' }),
    SelecaoAmbigua,
  );
});

test('o botão é procurado DENTRO do card, e some se não existir', () => {
  const card = acharCardPorId(CARDS, { id: 'c3-ipiranga', nomeEsperado: 'Posto Ipiranga' });
  assert.equal(acharBotaoNoCard(card, 'Excluir').rotulo, 'Excluir');
  assert.throws(() => acharBotaoNoCard(card, 'Arquivar'), SelecaoAmbigua);
  assert.throws(
    () => acharBotaoNoCard({ id: 'x', botoes: [{ rotulo: 'Excluir' }, { rotulo: 'Excluir' }] }, 'Excluir'),
    SelecaoAmbigua,
  );
});

test('o caminho completo devolve card E botão do MESMO registro', () => {
  const { card, botao } = prepararExclusao(CARDS, {
    id: 'd4-zz',
    nomeEsperado: 'ZZ TESTE CRIACAO CLIENTE LTDA',
  });
  assert.equal(card.id, 'd4-zz');
  assert.equal(botao.rotulo, 'Excluir');
  // E o botão veio da lista DAQUELE card.
  assert.ok(card.botoes.includes(botao));
});

test('nome com espaçamento diferente ainda confere; nome diferente não', () => {
  const card = acharCardPorId(CARDS, { id: 'b2-shell', nomeEsperado: '  Posto   Shell Prime  ' });
  assert.equal(card.id, 'b2-shell');
  assert.throws(() => acharCardPorId(CARDS, { id: 'b2-shell', nomeEsperado: 'Posto Shell' }), SelecaoAmbigua);
});
