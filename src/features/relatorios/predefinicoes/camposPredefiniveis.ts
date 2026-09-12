/**
 * A ALLOWLIST dos campos que uma predefinição pode controlar (12/09/2026).
 *
 * ## Por que uma lista fechada, e não "todo campo editável"
 *
 * O gerador vetorial registra ~180 campos editáveis por documento. A esmagadora
 * maioria deles NÃO é escrita por ninguém: sai da ficha do equipamento, do
 * memorial, da categorização, do container de inspeção, da grade de medições ou
 * do painel de laudo. Um conjunto salvo que carimbasse `capa.tag`,
 * `categoria.pmta` ou `ultrassom.espessura-nominal` faria um documento assinado
 * afirmar, por automação, um dado técnico que ninguém mediu naquele
 * equipamento — e o pior é que ele sairia plausível.
 *
 * Predefinição serve para o oposto: o TEXTO que o engenheiro redigita igual em
 * toda inspeção. "Solicitar a documentação faltante", "manter os instrumentos
 * calibrados", o objetivo do relatório, o escopo, o procedimento do teste
 * hidrostático. Esses não têm fonte no sistema — nascem vazios de propósito
 * (ver os comentários de `folhaParecer` e da seção 2.1 em `folhas.ts`).
 *
 * Então a regra é a inversa da intuição: **a lista é de inclusão explícita**.
 * Campo que não estiver aqui não pode ser predefinido, e um id novo no gerador
 * nasce FORA — que é o padrão seguro.
 *
 * ## Como esta lista foi montada
 *
 * Inventário dos `id:` de `pdfVetorial/folhas.ts` em 12/09/2026, filtrado por:
 *
 * | sai | por quê |
 * |---|---|
 * | `capa.*`, `identificacao.*`, `placa.*` | ficha do equipamento |
 * | `categoria.*`/`categorizacao.*` de valor | cálculo de categoria de risco |
 * | `componente.*`, `memoria.*`, `resumo.*` | memorial |
 * | `checklist*`, `exameExterno.*`, `exameInterno.*`, `documentacao.*` | container de inspeção |
 * | `ultrassom.*`, `vida.*` | grade de medições (`nr13_med_esp_`) |
 * | `parecer.laudo`, `inspecao.resultado-ensaios` | painel Laudo (`nr13_laudo_`) |
 * | `proximas.externa/interna/th`, `datas.*`, `*.art`, `*.numero-relatorio` | Configurações do Relatório |
 * | `*.foto`, `instrumentos.*` | imagens e certificados |
 *
 * O que sobrou são os 23 campos abaixo — todos sem fonte automática, todos
 * texto redigido à mão.
 *
 * `camposPredefiniveis.test.ts` confere, contra o próprio `folhas.ts`, que todo
 * id daqui EXISTE no gerador: um id escrito errado aqui seria um campo que a
 * predefinição promete preencher e nunca preenche — falha silenciosa, o defeito
 * mais caro deste sistema (§2-ter do CLAUDE.md).
 */

/** Como o editor do valor se apresenta. */
export type TipoCampoPredef = 'texto' | 'textoLongo' | 'opcao';

export interface CampoPredefinivel {
  /** O id semântico, idêntico ao que `folhas.ts` registra. */
  id: string;
  /** O que a tela do gerenciador escreve ao lado da caixa de seleção. */
  rotulo: string;
  /** A seção do documento — é por ela que a lista de campos se agrupa. */
  grupo: string;
  tipo: TipoCampoPredef;
  /** Só para `opcao`: os valores que o documento aceita naquela célula. */
  opcoes?: string[];
  /** Texto de apoio, quando o rótulo sozinho não diz onde aquilo sai. */
  ajuda?: string;
}

/**
 * Quantas linhas a tabela de recomendações tem no documento.
 *
 * Espelha `[1, 2, 3, 4].map(...)` de `folhas.ts`. Um conjunto com mais linhas
 * do que isso teria campos que nunca chegariam ao papel.
 */
export const LINHAS_RECOMENDACAO = 4;

/** O id do campo daquela linha, exatamente como o gerador o registra. */
export function idRecomendacao(n: number, parte: 'texto' | 'prazo'): string {
  return `recomendacoes.${n}.${parte}`;
}

/**
 * As quatro linhas da tabela de recomendações.
 *
 * Geradas em laço porque é assim que `folhas.ts` as desenha (`[1,2,3,4].map`);
 * escrevê-las à mão aqui abriria a porta para as duas listas divergirem no dia
 * em que a tabela ganhar uma quinta linha.
 */
function recomendacoes(): CampoPredefinivel[] {
  const saida: CampoPredefinivel[] = [];
  for (let n = 1; n <= LINHAS_RECOMENDACAO; n++) {
    saida.push({
      id: idRecomendacao(n, 'texto'),
      rotulo: `Recomendação ${n}`,
      grupo: 'Recomendações de segurança',
      tipo: 'textoLongo',
    });
    saida.push({
      id: idRecomendacao(n, 'prazo'),
      rotulo: `Prazo da recomendação ${n}`,
      grupo: 'Recomendações de segurança',
      tipo: 'texto',
    });
  }
  return saida;
}

/**
 * A ordem é a ORDEM DAS FOLHAS, não alfabética.
 *
 * Quem monta um conjunto tem o documento na cabeça, e procurar "Escopo" numa
 * lista alfabética entre "Categorização" e "Objetivo" é procurar onde ele não
 * está.
 */
export const CAMPOS_PREDEFINIVEIS: CampoPredefinivel[] = [
  {
    id: 'objetivo.texto',
    rotulo: 'Objetivo do relatório',
    grupo: 'Objetivo',
    tipo: 'textoLongo',
    ajuda: 'Folha 2, seção 1. Tem uma redação padrão do sistema; o conjunto a substitui.',
  },
  {
    id: 'referencias.extra-doc',
    rotulo: 'Documento de referência adicional',
    grupo: 'Documentos de referência',
    tipo: 'texto',
    ajuda: 'A 5ª linha da tabela, em branco por padrão.',
  },
  {
    id: 'referencias.extra-titulo',
    rotulo: 'Título do documento adicional',
    grupo: 'Documentos de referência',
    tipo: 'texto',
  },
  {
    id: 'escopo.texto',
    rotulo: 'Escopo e observações da inspeção',
    grupo: 'Escopo',
    tipo: 'textoLongo',
    ajuda: 'Seção 2.1. Nasce vazia — não há fonte automática no sistema.',
  },
  {
    id: 'categoria.nota',
    rotulo: 'Nota da categorização',
    grupo: 'Categorização de risco',
    tipo: 'textoLongo',
    ajuda: 'O rodapé da folha de categorização. Não altera a categoria calculada.',
  },
  {
    id: 'inspecao.observacoes',
    rotulo: 'Observações da inspeção',
    grupo: 'Exames realizados',
    tipo: 'textoLongo',
  },
  {
    id: 'th.procedimento',
    rotulo: 'Procedimento do teste hidrostático',
    grupo: 'Teste hidrostático',
    tipo: 'textoLongo',
  },
  {
    id: 'th.normas',
    rotulo: 'Normas de referência (TH)',
    grupo: 'Teste hidrostático',
    tipo: 'texto',
  },
  {
    id: 'th.parecer',
    rotulo: 'Parecer técnico do teste hidrostático',
    grupo: 'Teste hidrostático',
    tipo: 'textoLongo',
  },
  ...recomendacoes(),
  {
    id: 'parecer.pmta-mantida',
    rotulo: 'A PMTA pode ser mantida?',
    grupo: 'Parecer técnico',
    tipo: 'opcao',
    opcoes: ['SIM', 'NÃO', 'N/A'],
    ajuda: 'Decisão de engenharia sobre manter a PMTA — separada do APTO/INAPTO.',
  },
  {
    id: 'parecer.justificativa',
    rotulo: 'Justificativa da PMTA',
    grupo: 'Parecer técnico',
    tipo: 'textoLongo',
  },
  {
    id: 'proximas.prazo-externa',
    rotulo: 'Prazo — exame visual externo',
    grupo: 'Próximas inspeções',
    tipo: 'texto',
    ajuda: 'O intervalo normativo (ex.: 12 meses). A DATA limite vem das Configurações.',
  },
  {
    id: 'proximas.prazo-interna',
    rotulo: 'Prazo — exame visual interno',
    grupo: 'Próximas inspeções',
    tipo: 'texto',
  },
  {
    id: 'proximas.prazo-th',
    rotulo: 'Prazo — teste hidrostático',
    grupo: 'Próximas inspeções',
    tipo: 'texto',
  },
  {
    id: 'proximas.nota',
    rotulo: 'Nota das próximas inspeções',
    grupo: 'Próximas inspeções',
    tipo: 'textoLongo',
  },
];

const POR_ID = new Map(CAMPOS_PREDEFINIVEIS.map((c) => [c.id, c]));

/** O campo, ou `undefined` se o id não está na allowlist. */
export function campoPredefinivel(id: string): CampoPredefinivel | undefined {
  return POR_ID.get(id);
}

/**
 * Um id só entra num conjunto se estiver na allowlist.
 *
 * Este é o gate que impede um registro vindo de outro aparelho (ou de uma
 * versão futura, ou editado à mão no storage) de escrever em `capa.tag` ou
 * `categoria.pmta` ao ser aplicado. Ele roda no SANEAMENTO, ou seja, na
 * LEITURA — filtrar só na tela de criação deixaria a porta aberta.
 */
export function idPermitido(id: string): boolean {
  return POR_ID.has(id);
}

export interface GrupoCampos {
  nome: string;
  campos: CampoPredefinivel[];
}

/** A allowlist agrupada por seção, na ordem das folhas. */
export function gruposDeCampos(): GrupoCampos[] {
  const grupos: GrupoCampos[] = [];
  for (const c of CAMPOS_PREDEFINIVEIS) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nome === c.grupo) ultimo.campos.push(c);
    else grupos.push({ nome: c.grupo, campos: [c] });
  }
  return grupos;
}

/** O rótulo humano do campo. Id fora da allowlist devolve o próprio id. */
export function rotuloDoCampo(id: string): string {
  return POR_ID.get(id)?.rotulo ?? id;
}

/**
 * Os campos de um conjunto, na ORDEM DAS FOLHAS.
 *
 * `Object.keys` de um mapa devolve a ordem de inserção — que é a ordem em que o
 * usuário marcou as caixas, não a ordem do documento. A tela de revisão lê como
 * um índice do que vai mudar, e um índice fora de ordem obriga a procurar.
 */
export function ordenarPorFolha(ids: string[]): string[] {
  const posicao = new Map(CAMPOS_PREDEFINIVEIS.map((c, i) => [c.id, i]));
  return [...ids].sort((a, b) => (posicao.get(a) ?? 1e9) - (posicao.get(b) ?? 1e9));
}
