import { idRecomendacao } from './camposPredefiniveis';
import { ordenarLista, type Predefinicao } from './modelo';

/**
 * O CONJUNTO EMBUTIDO — o exemplo que a organização recebe pronta (12/09/2026).
 *
 * ## Para que ele existe
 *
 * Uma tela de gerenciador vazia não ensina nada: quem abre o modal pela
 * primeira vez não sabe o que é um "conjunto", que campos pode escolher nem que
 * cara tem o resultado. Um exemplo real, completo e aplicável responde às três
 * perguntas de uma vez — e é aplicável de verdade, porque as frases abaixo são
 * as que aparecem em quase toda inspeção periódica.
 *
 * ## Por que ele é CÓDIGO, e não um registro gravado
 *
 * Um registro gravado numa organização vira uma cópia congelada: corrigir uma
 * vírgula do exemplo exigiria uma rotina de migração passando por todas as
 * contas, e quem já tivesse editado perderia a edição. Como código, ele é o
 * mesmo em toda organização e o próximo deploy o corrige.
 *
 * Isso é também o que sustenta a regra de que ele **não se edita e não se
 * apaga**: não há nada para apagar. Quem quer a sua versão usa DUPLICAR, que
 * produz um conjunto normal, com id próprio, gravado e totalmente editável.
 *
 * `gravarPredefinicoes` descarta qualquer conjunto marcado `sistema` antes de
 * gravar — se um registro forjado chegasse do storage dizendo-se do sistema, ele
 * seria inapagável pela tela, e ninguém teria como removê-lo.
 */
export const ID_CONJUNTO_SISTEMA = 'sistema-exemplo';

const CAMPOS: Record<string, string> = {
  [idRecomendacao(1, 'texto')]:
    'Providenciar e manter no prontuário a documentação exigida pela NR-13 (projeto de fabricação, ' +
    'relatórios de inspeção anteriores e certificados dos dispositivos de segurança).',
  [idRecomendacao(1, 'prazo')]: '90 dias',
  [idRecomendacao(2, 'texto')]:
    'Manter a válvula de segurança e o manômetro com calibração vigente, com os certificados ' +
    'arquivados junto ao prontuário do equipamento.',
  [idRecomendacao(2, 'prazo')]: 'Contínuo',
  [idRecomendacao(3, 'texto')]:
    'Preservar a integridade da pintura e do isolamento térmico, corrigindo pontos de corrosão ' +
    'superficial assim que identificados.',
  [idRecomendacao(3, 'prazo')]: '180 dias',
  'parecer.pmta-mantida': 'SIM',
  'proximas.prazo-externa': '12 meses',
  'proximas.prazo-interna': '36 meses',
  'proximas.prazo-th': '72 meses',
};

/**
 * O conjunto do sistema, sempre igual.
 *
 * As datas são fixas de propósito: `new Date()` aqui faria a linha da lista
 * dizer "Atualizado em hoje" todo dia, como se alguém tivesse mexido nele.
 */
export function conjuntoSistema(): Predefinicao {
  return {
    id: ID_CONJUNTO_SISTEMA,
    nome: 'Exemplo do sistema — inspeção periódica',
    descricao:
      'Conjunto de demonstração, com as recomendações e os prazos mais comuns de uma inspeção ' +
      'periódica. Use "Duplicar" para criar a sua versão editável.',
    campos: { ...CAMPOS },
    criadoEm: '2026-09-12T00:00:00.000Z',
    atualizadoEm: '2026-09-12T00:00:00.000Z',
    versao: 1,
    sistema: true,
  };
}

/** Um conjunto do sistema não se edita nem se apaga — só se visualiza, usa e duplica. */
export function ehDoSistema(p: Predefinicao | null | undefined): boolean {
  return !!p?.sistema;
}

/**
 * A lista COMPLETA que a tela mostra: o exemplo do sistema + os da organização.
 *
 * O do sistema vem primeiro, fora da ordenação alfabética — ele é referência, e
 * referência fica no alto. Se a organização gravou um conjunto com o mesmo id
 * (só por registro forjado), o do sistema vence e o outro é descartado: dois
 * conjuntos com o mesmo id fariam editar um e ver o outro.
 */
export function listaComSistema(daOrganizacao: Predefinicao[]): Predefinicao[] {
  const sistema = conjuntoSistema();
  const proprios = daOrganizacao.filter((p) => p.id !== sistema.id && !p.sistema);
  return [sistema, ...ordenarLista(proprios)];
}
