import {
  ENSAIOS_DISPONIVEIS,
  FORM_POR_ENSAIO,
  ROTULO_FORMULARIO,
  type ContainerInspecao,
  type FormularioEnsaio,
  type TipoEnsaio,
} from './tipos';

/**
 * O QUE UM CONTAINER DE INSPEÇÃO REALMENTE TEM DENTRO — 09/09/2026.
 *
 * ## Atribuído × salvo
 *
 * `container.ensaios[]` é o que foi ATRIBUÍDO quando o container nasceu: o
 * técnico marcou "vou fazer ultrassom e teste hidrostático". Nada garante que
 * ele tenha aberto o formulário depois.
 *
 * `container.dados[formulario]` é o que foi SALVO em campo.
 *
 * A tela que escolhe a inspeção precisa dizer a segunda coisa. Contar
 * `ensaios.length` e escrever "4 ensaios preenchidos" é afirmar trabalho que
 * pode não existir — e o usuário só descobre depois, no documento em branco.
 *
 * ## E por que não basta `dados[form] !== undefined`
 *
 * Esse é o teste que `origemDeCampo` usava, e ele erra para mais: o autosave
 * (`useAutosaveFormulario`) grava ~1 s depois de a tela mexer no estado, e o
 * pré-preenchimento (`mesclarPreenchimento`) mexe no estado só de abrir. Um
 * formulário aberto e fechado sem ninguém responder nada deixa a chave lá.
 *
 * Aqui o teste é de CONTEÚDO: existe resposta, medição, foto, parecer ou
 * resultado? Cada família tem a sua pergunta, porque cada formulário guarda
 * coisa diferente — e é por isso que isto é uma tabela e não um `Object.keys`.
 *
 * ## O que este módulo NÃO faz
 *
 * Não decide composição de PDF. `relatoriosService.montarListaComTermoAbertura`
 * (folha de fotos só com foto) e `pdfVetorial/modelo.ts` (quais ensaios a folha
 * 7 marca com X) continuam com as leituras deles, sobre as chaves globais
 * `nr13_inspecao_atual`/`nr13_injecao_atual` e não sobre o container. Unificar
 * ali mudaria o que sai no documento, e documento emitido é o que este projeto
 * mais protege. Aqui a fonte é o container, e o consumidor é a TELA.
 *
 * Nenhuma leitura nova: tudo já vem dentro do objeto que `listarContainers`
 * devolve do cache.
 */

/** Uma linha do resumo: um ensaio do container. */
export interface EnsaioResumido {
  ensaio: TipoEnsaio;
  formulario: FormularioEnsaio;
  rotulo: string;
  /** Estava na lista de ensaios quando o container foi criado. */
  atribuido: boolean;
  /** Tem conteúdo de verdade — ver o cabeçalho deste arquivo. */
  salvo: boolean;
  /** `DD/MM/AAAA` do próprio formulário; `null` quando ele não tem data. */
  data: string | null;
  /** Quantas perguntas foram respondidas (checklist e exames visuais). */
  respostas: number;
  /** Quantas medições de espessura têm valor. */
  medicoes: number;
  /** Fotos anexadas neste formulário. */
  fotos: number;
  /** APROVADO / REPROVADO / … quando o formulário tem o campo. */
  resultado: string | null;
  /** Conclusão, parecer ou observação do ensaio, quando existe. */
  conclusao: string | null;
}

export interface ResumoContainer {
  id: string;
  nome: string;
  criadoEm: string;
  /** Todos os ensaios conhecidos que o container atribuiu OU tem dado salvo. */
  ensaios: EnsaioResumido[];
  /** Só os que têm conteúdo — é o que a tela deve anunciar. */
  salvos: EnsaioResumido[];
  /** Atribuídos e ainda em branco. */
  pendentes: EnsaioResumido[];
  /** Quem assinou o checklist em campo. `null` quando ninguém preencheu. */
  responsavel: string | null;
  /** A data mais antiga preenchida entre os ensaios salvos, ou a de criação. */
  data: string;
  totalFotos: number;
  totalMedicoes: number;
}

/** `AAAA-MM-DD` (input date) → `DD/MM/AAAA`. Qualquer outra coisa passa direto. */
export function dataBrDoCampo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : t;
}

type Blob = Record<string, unknown>;

const obj = (v: unknown): Blob => (v && typeof v === 'object' ? (v as Blob) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
};

/** Respostas com valor num `Record<id, resposta>` — o formato dos três checklists. */
function contarRespostas(mapa: unknown): number {
  return Object.values(obj(mapa)).filter((v) => txt(v) !== null).length;
}

/** Medições com valor numa grade `Record<linha, Record<coluna, valor>>`. */
function contarMedicoes(medidas: unknown): number {
  let n = 0;
  for (const linha of Object.values(obj(medidas))) {
    for (const v of Object.values(obj(linha))) if (txt(v) !== null) n += 1;
  }
  return n;
}

/**
 * A leitura de UM formulário. Uma entrada por família, porque cada formulário
 * guarda coisa diferente — e um genérico por `Object.keys` daria "salvo" para
 * o blob que só tem o pré-preenchimento do cadastro dentro.
 */
const LEITOR: Record<FormularioEnsaio, (d: Blob) => Omit<EnsaioResumido, 'ensaio' | 'formulario' | 'rotulo' | 'atribuido'>> = {
  checklist: (d) => {
    const respostas = contarRespostas(d.respostas);
    const fotos = arr(d.fotos).length + arr(d.fotosDocumentacao).length;
    const conclusao = txt(d.comentariosDocumentacao);
    return {
      salvo: respostas > 0 || fotos > 0 || conclusao !== null,
      data: dataBrDoCampo(d.dataInspecao),
      respostas,
      medicoes: 0,
      fotos,
      resultado: null,
      conclusao,
    };
  },
  visual_externo: (d) => lerVisual(d),
  visual_interno: (d) => lerVisual(d),
  ultrassom: (d) => {
    const medicoes = contarMedicoes(d.medidas);
    const resultado = txt(d.resultado);
    const conclusao = txt(d.observacoes);
    return {
      salvo: medicoes > 0 || resultado !== null || conclusao !== null,
      data: dataBrDoCampo(d.dataUltrassom),
      respostas: 0,
      medicoes,
      fotos: 0,
      resultado,
      conclusao,
    };
  },
  th: (d) => {
    const fotos = arr(d.fotos).length;
    const pontosCurva = arr(d.curva).length;
    const resultado = txt(d.resultado);
    const conclusao = txt(d.parecer);
    return {
      salvo: pontosCurva > 0 || fotos > 0 || resultado !== null || conclusao !== null || txt(d.pressaoTeste) !== null,
      data: dataBrDoCampo(d.dataTeste),
      respostas: 0,
      medicoes: 0,
      fotos,
      resultado,
      conclusao,
    };
  },
  // Calibração NÃO vem de container (não existe em `TipoEnsaio`): ela sai de
  // `listarCalibracoes`/`listarLotes`. As entradas existem só para o tipo do
  // mapa ficar completo — se um dia um container guardar isto, a leitura já é
  // honesta em vez de estourar.
  manometro: (d) => lerAvulso(d),
  psv: (d) => lerAvulso(d),
};

function lerVisual(d: Blob): Omit<EnsaioResumido, 'ensaio' | 'formulario' | 'rotulo' | 'atribuido'> {
  const respostas = contarRespostas(d.itens);
  const fotos = arr(d.fotos).length;
  const resultado = txt(d.resultado);
  const conclusao = txt(d.conclusao) ?? txt(d.observacoes);
  return {
    salvo: respostas > 0 || fotos > 0 || resultado !== null || conclusao !== null,
    data: dataBrDoCampo(d.dataInspecao),
    respostas,
    medicoes: 0,
    fotos,
    resultado,
    conclusao,
  };
}

function lerAvulso(d: Blob): Omit<EnsaioResumido, 'ensaio' | 'formulario' | 'rotulo' | 'atribuido'> {
  const resultado = txt(d.resultado);
  return {
    salvo: Object.keys(d).length > 0,
    data: dataBrDoCampo(d.dataCalibracao) ?? dataBrDoCampo(d.data),
    respostas: 0,
    medicoes: 0,
    fotos: 0,
    resultado,
    conclusao: null,
  };
}

const VAZIO: Omit<EnsaioResumido, 'ensaio' | 'formulario' | 'rotulo' | 'atribuido'> = {
  salvo: false,
  data: null,
  respostas: 0,
  medicoes: 0,
  fotos: 0,
  resultado: null,
  conclusao: null,
};

/** O ensaio, lido do container. Fonte única da tela de criação. */
export function resumirEnsaio(c: ContainerInspecao, ensaio: TipoEnsaio): EnsaioResumido {
  const formulario = FORM_POR_ENSAIO[ensaio];
  const rotulo = ENSAIOS_DISPONIVEIS.find((e) => e.value === ensaio)?.label ?? ROTULO_FORMULARIO[formulario] ?? ensaio;
  const bruto = c.dados?.[formulario];
  // `undefined` é o caso comum de "nunca abriu"; sem isto o leitor rodaria
  // sobre `{}` e devolveria a mesma coisa, só que mais devagar.
  const lido = bruto === undefined ? VAZIO : LEITOR[formulario](obj(bruto));
  return { ensaio, formulario, rotulo, atribuido: c.ensaios.includes(ensaio), ...lido };
}

/**
 * O resumo completo. Inclui ensaio NÃO atribuído que tenha dado salvo — é caso
 * real: o técnico acrescenta o formulário depois, e esconder o dado seria pior
 * do que mostrar um ensaio fora da lista original.
 */
export function resumirContainer(c: ContainerInspecao): ResumoContainer {
  const ensaios = ENSAIOS_DISPONIVEIS.map((e) => resumirEnsaio(c, e.value)).filter(
    (r) => r.atribuido || r.salvo,
  );
  const salvos = ensaios.filter((r) => r.salvo);
  const chk = c.dados?.checklist;
  return {
    id: c.id,
    nome: c.nome,
    criadoEm: c.criadoEm,
    ensaios,
    salvos,
    pendentes: ensaios.filter((r) => !r.salvo),
    responsavel: chk === undefined ? null : txt(obj(chk).inspetor),
    data: salvos.map((r) => r.data).find((d): d is string => d !== null) ?? c.criadoEm,
    totalFotos: ensaios.reduce((s, r) => s + r.fotos, 0),
    totalMedicoes: ensaios.reduce((s, r) => s + r.medicoes, 0),
  };
}

/** "3 ensaios com dados salvos" — o texto do item na lista. */
export function rotuloConteudo(r: ResumoContainer): string {
  if (r.salvos.length === 0) return 'Nenhum ensaio preenchido ainda';
  const n = r.salvos.length;
  return `${n} ensaio${n > 1 ? 's' : ''} com dados salvos`;
}

/** O documento do relatório que cada ensaio alimenta — usado na revisão. */
export const DOC_DO_ENSAIO: Record<TipoEnsaio, string | null> = {
  checklist: null, // alimenta VERIFICACAO-DOCUMENTACAO + checklist2/3, não uma folha só
  visual_externo: 'VISUAL-EXTERNO.html',
  visual_interno: 'VISUAL-INTERNO.html',
  ultrassom: 'ULTRASSOM.html',
  teste_hidrostatico: 'TESTE-HIDROSTATICO.html',
};
