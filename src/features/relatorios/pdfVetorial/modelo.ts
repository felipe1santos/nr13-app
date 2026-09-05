import { ler } from '../../../services/storage';
import { REGIOES, carregarMedicoes, type Regiao } from '../medicoesEspessura';
import { linhasMemorial } from '../relatoriosService';
import { SECOES_CHECKLIST } from '../../inspecoes/formularios/FormularioChecklist';
import type { RelatorioMeta } from '../tipos';
import { rotuloClasseFluido, rotuloEnquadramento, rotuloResposta, rotuloResultado, rotuloTipoEquipamento } from './rotulos';

/**
 * Fase 11 · o MODELO do relatório completo — a ponte de dados da 10C §11.3,
 * agora para as 21 folhas.
 *
 * ## As duas regras deste arquivo
 *
 * 1. **Ele LÊ; não calcula.** Categoria, PMTA, PTH, memorial, laudo e próximas
 *    inspeções têm dono no sistema. Recalcular qualquer um aqui criaria uma
 *    segunda verdade — e a segunda verdade de um número que vai para documento
 *    assinado é o pior defeito possível. As linhas do memorial vêm de
 *    `linhasMemorial()`, a MESMA função que a paginação do template usa.
 * 2. **Campo ausente é `null`, e `null` chega à folha como travessão.** As 27
 *    folhas de hoje fazem `|| '{}'` e imprimem "-" sem que ninguém saiba que
 *    faltou dado. Aqui a ausência é um valor no modelo, visível a quem lê o
 *    código e a quem lê o teste.
 */

export interface ItemChecklist {
  titulo: string;
  resposta: string;
  observacao: string | null;
}

export interface SecaoChecklistModelo {
  titulo: string;
  itens: ItemChecklist[];
}

export interface FotoModelo {
  dataUrl: string;
  descricao: string;
  /** largura/altura reais — medidas, nunca assumidas. */
  proporcao?: number;
}

export interface ExameVisual {
  itens: ItemChecklist[];
  observacoes: string | null;
  conclusao: string | null;
  resultado: string | null;
  fotos: FotoModelo[];
}

export interface ModeloRelatorio {
  tag: string;
  empresa: { razao: string; endereco: string; contato: string; logo: string | null };
  numeroRelatorio: string;
  cliente: string | null;
  clienteEndereco: string | null;
  tipoInspecao: string | null;
  emissao: string | null;
  validade: string | null;
  execucao: string | null;
  fotoCapa: string | null;
  /**
   * Fase 12B · a FOTO REAL da placa, quando o usuário enviou uma.
   *
   * `null` = desenhar a placa RECONSTRUÍDA a partir dos dados da ficha. Entra
   * no modelo já resolvida (dataURL + proporção) porque `montarModeloRelatorio`
   * é síncrono e o arquivo vem do cofre/bucket — quem resolve é o gerador.
   */
  placaReal: { dataUrl: string; proporcao: number } | null;

  equipamento: Record<string, string | null>;
  pressoes: { rotulo: string; mpa: string | null; kgf: string | null; bar: string | null }[];
  categoria: { catFinal: string | null; grupo: string | null; volume: string | null; enquadramento: string | null };
  /**
   * Bloco 1 · os parâmetros de cada componente, como a referência os imprime.
   *
   * Tudo já vinha calculado em `nr13_calc_<TAG>.componentes[]` — E, S, D, raio,
   * margem de corrosão, espessura comercial e as fórmulas. O relatório só
   * APRESENTA: nenhuma fórmula é reimplementada aqui, e o motor do memorial
   * continua sendo a única fonte de verdade do cálculo.
   */
  componentes: {
    nome: string;
    pmta: string | null;
    espReq: string | null;
    espNom: string | null;
    material: string | null;
    e: string | null;
    s: string | null;
    raio: string | null;
    ca: string | null;
    /** A fórmula da ESPESSURA mínima, exatamente como o motor a gravou. */
    formulaT: string | null;
    /** A fórmula da PMTA daquele componente, idem. */
    formulaP: string | null;
  }[];
  memorial: string[];

  /**
   * Bloco 1 · a folha 5 da referência (DADOS TÉCNICOS / PRONTUÁRIO).
   *
   * Todos os campos saem de fonte que já existe: `nr13_emp_` (cliente),
   * `nr13_info_` (construção/descrição) e `nr13_vaso_` (material, margem de
   * corrosão, temperatura de projeto e pressão de projeto do memorial).
   */
  prontuario: {
    contratante: string | null;
    endereco: string | null;
    materialCorpo: string | null;
    tipoConstrucao: string | null;
    materialTampo1: string | null;
    materialTampo2: string | null;
    volume: string | null;
    pressaoProjeto: string | null;
    margemCorrosao: string | null;
    temperaturaProjeto: string | null;
    descricaoResumida: string | null;
  };
  /** PMO / PMTA / PTH em MPa, psi e kgf/cm² — as unidades da referência. */
  operacionais: { rotulo: string; mpa: string | null; psi: string | null; kgf: string | null }[];
  /** A conta do enquadramento e a do grupo de risco, como a referência as mostra. */
  categorizacaoDetalhe: {
    pvKpa: string | null;
    resultadoEnquadramento: string | null;
    pvMpa: string | null;
    resultadoGrupo: string | null;
  };
  /** Quem assina — a capa da referência traz nome e CREA. */
  responsavel: { nome: string | null; registro: string | null };

  checklist: SecaoChecklistModelo[];
  comentariosDocumentacao: string | null;
  fotosDocumentacao: FotoModelo[];
  fotosChecklist: FotoModelo[];

  visualExterno: ExameVisual;
  visualInterno: ExameVisual;

  ultrassom: {
    aparelho: string | null;
    acoplante: string | null;
    tempSup: string | null;
    estadoSup: string | null;
    cabecote: string | null;
    velSonica: string | null;
    resultado: string | null;
    /**
     * 13D · uma linha por PONTO medido, com os ângulos da própria região.
     *
     * A verdade é `nr13_med_grid_<TAG>` — a mesma chave que o editor React
     * grava. Antes o modelo lia `medEsp.pontos`/`us.medidas`, que é a
     * estrutura do CONTAINER de campo: o que o inspetor digitava na grade não
     * chegava à tabela do documento.
     */
    pontos: {
      regiao: string;
      ponto: string;
      angulos: string[];
      medidas: string[];
      menor: string | null;
      requerida: string | null;
    }[];
    instrumento: { padrao: string | null; serie: string | null; certificado: string | null; validade: string | null };
  };

  th: {
    fluido: string | null;
    pressaoProjeto: string | null;
    pressaoTeste: string | null;
    dataTeste: string | null;
    resultado: string | null;
    curva: { tempo: string; pressao: string }[];
    fotos: FotoModelo[];
  };

  laudo: { apto: boolean | null };
  proximas: { interna: string | null; externa: string | null; th: string | null };
  assinantes: { nome: string; funcao: string; registro: string; rubrica: string | null }[];
}

function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function textoOu(v: string | null | undefined, vazio = '—'): string {
  return v && String(v).trim() !== '' ? String(v).trim() : vazio;
}

/**
 * Um número a partir do que ESTÁ no storage — que nem sempre é número.
 *
 * `nr13_calc_<TAG>.pmta` é gravado como STRING pelo memorial de vaso
 * (`pmtaFinal.toFixed(2)`) e pelo de caldeira (`P.toFixed(2)`); só o de
 * autoclave grava número. O modelo aceitava exclusivamente `number`, então
 * PMTA e PTH saíam com travessão em vaso e caldeira — a maioria do parque.
 * Medido e provado em documento emitido (13A, 04/09/2026).
 *
 * Aceita `12.5`, `"12.50"` e `"12,50"` (o separador decimal brasileiro
 * aparece em dado digitado à mão). Recusa o resto: `"--"`, `"N/A"`, `""` e
 * qualquer texto viram `null`, e travessão continua sendo a resposta honesta
 * para dado que não existe.
 */
export function numeroDoStorage(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const limpo = v.trim().replace(',', '.');
  if (limpo === '' || !/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Número no formato do documento (pt-BR), sem inventar casas decimais. */
export function numeroBr(v: unknown, maxDecimais = 3): string | null {
  const n = numeroDoStorage(v);
  if (n === null) return null;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: maxDecimais });
}

/**
 * O fluido sem o prefixo da classe.
 *
 * `nr13_cat_<TAG>.fluidoInput` guarda a opção inteira — `"A - Fluido
 * inflamável, combustível (T ≥ 200 °C)"`. A classe tem coluna própria no
 * documento; repetir a letra dentro do nome do fluido é ruído. É o mesmo
 * tratamento que `CLASSIFICACAO-RISCO.html` e `PLACA.html` já faziam.
 */
export function fluidoSemClasse(v: unknown): string | null {
  const s = txt(v);
  return s === null ? null : txt(s.replace(/^[A-D]\s*-\s*/, ''));
}

export function converterPressao(mpa: number | null): {
  mpa: string | null;
  kgf: string | null;
  bar: string | null;
  psi: string | null;
} {
  if (mpa === null || !Number.isFinite(mpa)) return { mpa: null, kgf: null, bar: null, psi: null };
  return {
    mpa: mpa.toFixed(3),
    // 1 MPa = 10,19716 kgf/cm² = 10 bar = 145,0377 psi. A referência imprime
    // psi na folha do prontuário e kgf/cm² nas duas tabelas de pressão —
    // renomear a coluna sem converter era o erro a evitar.
    kgf: (mpa * 10.19716).toFixed(2),
    bar: (mpa * 10).toFixed(2),
    psi: (mpa * 145.0377).toFixed(1),
  };
}

type FotoBruta = { base64?: string; descricao?: string };

function fotos(lista: FotoBruta[] | undefined): FotoModelo[] {
  return (lista ?? [])
    .map((f) => ({ dataUrl: String(f.base64 ?? ''), descricao: String(f.descricao ?? '') }))
    .filter((f) => f.dataUrl.startsWith('data:image'));
}

/** Itens do checklist com resposta — os sem resposta ficam de fora da folha. */
function secoesChecklist(
  respostas: Record<string, string>,
  observacoes: Record<string, string>,
): SecaoChecklistModelo[] {
  return SECOES_CHECKLIST.map((s) => ({
    titulo: s.titulo,
    itens: s.perguntas
      .filter((p) => txt(respostas?.[p.id]))
      .map((p) => ({
        titulo: p.texto,
        resposta: textoOu(rotuloResposta(respostas[p.id]), '—'),
        observacao: txt(observacoes?.[p.id]),
      })),
  })).filter((s) => s.itens.length > 0);
}

function exameVisual(bloco: Record<string, unknown> | undefined): ExameVisual {
  const b = (bloco ?? {}) as {
    itens?: Record<string, string>;
    itemObs?: Record<string, string>;
    observacoes?: string;
    conclusao?: string;
    resultado?: string;
    fotos?: FotoBruta[];
  };
  return {
    itens: Object.entries(b.itens ?? {})
      .filter(([, v]) => txt(v))
      .map(([titulo, v]) => ({
        titulo,
        resposta: textoOu(rotuloResposta(v), '—'),
        observacao: txt(b.itemObs?.[titulo]),
      })),
    observacoes: txt(b.observacoes),
    conclusao: txt(b.conclusao),
    resultado: rotuloResultado(b.resultado),
    fotos: fotos(b.fotos),
  };
}

export function montarModeloRelatorio(tag: string): ModeloRelatorio {
  const meta = ler<RelatorioMeta>('nr13_relatorio_meta_atual');
  const info = ler<Record<string, unknown>>(`nr13_info_${tag}`) ?? {};
  const cat = ler<Record<string, unknown>>(`nr13_cat_${tag}`) ?? {};
  const calc = ler<{ pmta?: number; pth?: number; componentes?: Record<string, unknown>[] }>(`nr13_calc_${tag}`) ?? {};
  const laudo = ler<{ apto?: boolean | null }>(`nr13_laudo_${tag}`);
  const emps = ler<Record<string, unknown>>(`nr13_emp_${tag}`) ?? {};
  const fotosFicha = ler<{ capa?: string; fotos?: FotoBruta[] }>(`nr13_fotos_${tag}`) ?? {};
  const medEsp = ler<Record<string, unknown>>(`nr13_med_esp_${tag}`) ?? {};

  // Os dados de campo vivem em DUAS chaves, e a duplicação é obrigatória (§2):
  // checklist grava em `inspecao`, os ensaios em `injecao`.
  const insp = ler<Record<string, unknown>>('nr13_inspecao_atual') ?? {};
  const inj = ler<Record<string, unknown>>('nr13_injecao_atual') ?? {};

  const emp = (meta?.empresa ?? ler<Record<string, unknown>>('nr13_minha_empresa') ?? {}) as Record<string, unknown>;
  const chk = (insp.checklist ?? {}) as {
    respostas?: Record<string, string>;
    observacoes?: Record<string, string>;
    fotos?: FotoBruta[];
    fotosDocumentacao?: FotoBruta[];
    comentariosDocumentacao?: string;
  };
  const us = (inj.ultrassom ?? {}) as Record<string, unknown>;
  const th = (inj.th ?? {}) as Record<string, unknown>;

  // O storage guarda PMTA/PTH como string em vaso e caldeira e como número em
  // autoclave. `numeroDoStorage` aceita as duas formas e recusa texto — a
  // fórmula e o cálculo não são tocados, só a leitura.
  const pmta = converterPressao(numeroDoStorage(calc.pmta));
  const pth = converterPressao(numeroDoStorage(calc.pth));
  // PMO é DECLARADA na ficha (pressão máxima de OPERAÇÃO), não calculada: o
  // memorial calcula PMTA e PTH. Sem valor declarado, a linha sai vazia — e
  // vazia é a resposta honesta, não a PMTA repetida.
  const pmo = converterPressao(numeroDoStorage(info.pmoAdotadaMpa));

  // O memorial do vaso guarda os dados construtivos por componente. Ler daqui
  // é ler a MESMA verdade que gerou o cálculo — nada é recalculado.
  const vaso = ler<{ P?: number | string; D?: number | string; componentes?: { id?: string; nome?: string; tipo?: string; dados?: Record<string, unknown> }[] }>(
    `nr13_vaso_${tag}`,
  ) ?? {};
  const compsVaso = vaso.componentes ?? [];
  const achaComp = (...tipos: string[]) =>
    compsVaso.find((c) => tipos.includes(String(c.tipo ?? ""))) ?? null;
  const casco = achaComp("casco", "cascoCilindrico", "costado");
  const tampos = compsVaso.filter((c) => String(c.tipo ?? "").toLowerCase().includes("tampo"));
  const dadoDe = (c: { dados?: Record<string, unknown> } | null, campo: string) =>
    c ? txt((c.dados ?? {})[campo]) : null;

  return {
    tag,
    empresa: {
      razao: textoOu(txt(emp.razaoSocial ?? emp.razao ?? emp.nome), ''),
      endereco: [emp.endereco, emp.cidade, emp.cnpj ? `CNPJ: ${emp.cnpj}` : '']
        .filter((p) => p && String(p).trim() !== '')
        .join(' • '),
      contato: [emp.telefone, emp.site, emp.email]
        .filter((p) => p && String(p).trim() !== '')
        .join(' – '),
      logo: txt(emp.logo ?? emp.logoUrl),
    },
    numeroRelatorio: textoOu(txt(meta?.codigo), ''),
    cliente: txt(emps.razaoSocial ?? emps.nomeFantasia),
    clienteEndereco: txt([emps.endereco, emps.cidade, emps.estado].filter(Boolean).join(', ')),
    tipoInspecao: txt(meta?.tipoInspecao),
    emissao: txt(meta?.emissao),
    validade: txt(meta?.validade),
    execucao: txt(meta?.execucaoInspecao),
    fotoCapa: txt(fotosFicha.capa) ?? txt(fotosFicha.fotos?.[0]?.base64),
    placaReal: null,

    equipamento: {
      'IDENTIFICAÇÃO / T.A.G.': tag,
      'TIPO DE EQUIPAMENTO': rotuloTipoEquipamento(txt(info.tipo) ?? txt(info.descricao)),
      FABRICANTE: txt(info.fabricante),
      'NÚMERO DE SÉRIE': txt(info.numeroSerie),
      'ANO DE FABRICAÇÃO': txt(info.ano),
      'CÓDIGO DE PROJETO': txt(info.codigoProjeto),
      // Os três campos abaixo saíam SEMPRE com travessão: o modelo lia
      // `cat.fluido`, `cat.classeFluido` e `cat.volume`, e `CategoriaSalva`
      // não tem nenhum dos três — os nomes reais são `fluidoInput`, `classe`
      // e `volInput` (13A, provado em documento emitido).
      'FLUIDO DE OPERAÇÃO': fluidoSemClasse(cat.fluidoInput) ?? fluidoSemClasse(info.fluido),
      'CLASSE DO FLUIDO': rotuloClasseFluido(txt(cat.classe)),
      'VOLUME (m³)': numeroBr(info.volume) ?? numeroBr(cat.volInput),
      'GRUPO DE RISCO': txt(cat.grupo),
      'CATEGORIA DO VASO': txt(cat.catFinal),
      'LOCAL DA INSTALAÇÃO': txt(info.localizacao),
    },
    pressoes: [
      { rotulo: 'PMTA — Pressão Máxima de Trabalho Admissível', ...pmta },
      { rotulo: 'PTH — Pressão de Teste Hidrostático', ...pth },
    ],
    categoria: {
      catFinal: txt(cat.catFinal),
      grupo: txt(cat.grupo),
      volume: numeroBr(info.volume) ?? numeroBr(cat.volInput),
      // O ENQUADRAMENTO é lido, não recalculado: a base é kPa × m³ > 8 (§4) e
      // quem decide é `calc/categoria.ts`, que grava `isEnquadrado`. O modelo
      // procurava `enquadramento`/`enquadra` — nomes que não existem.
      enquadramento: rotuloEnquadramento(cat.isEnquadrado),
    },
    componentes: (calc.componentes ?? []).map((c) => ({
      nome: textoOu(txt(c.nome), 'Componente'),
      pmta: txt(c.pmtaMpa),
      espReq: txt(c.tReqMm),
      espNom: txt(c.tNom),
      material: txt(c.material),
      e: txt(c.E),
      s: txt(c.S),
      raio: txt(c.raio),
      ca: txt(c.ca),
      // As fórmulas vêm do MOTOR do memorial (as tabelas `FORMULAS_*` de
      // `vasoMemorialService` / `autoclaveMemorialService` / caldeira), nunca do
      // gerador: o documento imprime a equação que realmente calculou aquele
      // componente, e não uma que se pareça com ela.
      formulaT: txt(c.formulaT),
      formulaP: txt(c.formulaP),
    })),

    prontuario: {
      contratante: txt(emps.razaoSocial ?? emps.nomeFantasia),
      endereco: txt([emps.endereco, emps.bairro, emps.cidade, emps.estado].filter(Boolean).join(", ")),
      materialCorpo: dadoDe(casco, "mat") ?? txt(info.materialCorpo),
      tipoConstrucao: txt(info.tipoConstrucao),
      materialTampo1: dadoDe(tampos[0] ?? null, "mat"),
      materialTampo2: dadoDe(tampos[1] ?? null, "mat"),
      volume: numeroBr(info.volume) ?? numeroBr(cat.volInput),
      // A pressão de PROJETO é a que o memorial usou (`nr13_vaso_.P`, em MPa).
      pressaoProjeto: numeroDoStorage(vaso.P) !== null ? `${numeroDoStorage(vaso.P)!.toFixed(3)} MPa` : null,
      margemCorrosao: dadoDe(casco, "ca"),
      temperaturaProjeto: dadoDe(casco, "temp"),
      descricaoResumida: txt(info.descricaoResumida) ?? txt(info.descricao),
    },
    operacionais: [
      { rotulo: "PMO", mpa: pmo.mpa, psi: pmo.psi, kgf: pmo.kgf },
      { rotulo: "PMTA", mpa: pmta.mpa, psi: pmta.psi, kgf: pmta.kgf },
      { rotulo: "PTH", mpa: pth.mpa, psi: pth.psi, kgf: pth.kgf },
    ],
    categorizacaoDetalhe: {
      // `PV_enq` e `PV_cat` são gravados por `calcularESalvarCategoria`; ler
      // daqui é ler a conta que a calculadora já fez (§4 do CLAUDE.md: o
      // enquadramento é kPa × m³, o grupo é MPa × m³).
      pvKpa: numeroBr(cat.PV_enq),
      resultadoEnquadramento: rotuloEnquadramento(cat.isEnquadrado),
      pvMpa: numeroBr(cat.PV_cat),
      resultadoGrupo: txt(cat.grupo) ? `Grupo de risco ${txt(cat.grupo)}` : null,
    },
    responsavel: {
      nome: txt(meta?.assinantes?.engenheiro?.nome ?? meta?.phNome),
      registro: txt(meta?.assinantes?.engenheiro?.crea ?? meta?.phCrea),
    },
    // O MESMO extrator que a paginação do template usa — sem reimplementar
    // fórmula nenhuma.
    memorial: linhasMemorial(tag),

    checklist: secoesChecklist(chk.respostas ?? {}, chk.observacoes ?? {}),
    comentariosDocumentacao: txt(chk.comentariosDocumentacao),
    fotosDocumentacao: fotos(chk.fotosDocumentacao),
    fotosChecklist: fotos(chk.fotos),

    visualExterno: exameVisual(inj.visual_externo as Record<string, unknown>),
    visualInterno: exameVisual(inj.visual_interno as Record<string, unknown>),

    ultrassom: {
      aparelho: txt(us.aparelho),
      acoplante: txt(us.acoplante),
      tempSup: txt(us.tempSup),
      estadoSup: txt(us.estadoSup),
      cabecote: txt(us.cabecote),
      velSonica: txt(us.velSonica),
      resultado: rotuloResultado(us.resultado as string),
      pontos: pontosUltrassom(tag, us, medEsp),
      instrumento: {
        padrao: txt((us.instrumento as Record<string, unknown>)?.padrao),
        serie: txt((us.instrumento as Record<string, unknown>)?.serie),
        certificado: txt((us.instrumento as Record<string, unknown>)?.certificado),
        validade: txt((us.instrumento as Record<string, unknown>)?.validade),
      },
    },

    th: {
      fluido: txt(th.fluido),
      pressaoProjeto: txt(th.pressaoProj),
      pressaoTeste: txt(th.pressaoTeste),
      dataTeste: txt(th.dataTeste),
      resultado: rotuloResultado(th.resultado as string),
      curva: ((th.curva ?? []) as { tempo?: string; pressao?: string }[])
        .filter((l) => txt(l.tempo) || txt(l.pressao))
        .map((l) => ({ tempo: textoOu(txt(l.tempo)), pressao: textoOu(txt(l.pressao)) })),
      fotos: fotos(th.fotos as FotoBruta[]),
    },

    laudo: { apto: typeof laudo?.apto === 'boolean' ? laudo.apto : null },
    // Da META — a MESMA fonte do vencimento oficial. Ver a decisão (B) do dono.
    proximas: {
      interna: txt(meta?.proximaInspecaoInterna),
      externa: txt(meta?.proximaInspecaoExterna),
      th: txt(meta?.validadeValvula),
    },
    assinantes: [
      {
        nome: textoOu(meta?.assinantes?.engenheiro?.nome ?? meta?.phNome, ''),
        funcao: textoOu(meta?.assinantes?.engenheiro?.funcao, 'Engenheiro'),
        registro: textoOu(meta?.assinantes?.engenheiro?.crea ?? meta?.phCrea, ''),
        rubrica: txt(meta?.assinantes?.engenheiro?.assinatura),
      },
      {
        nome: textoOu(meta?.assinantes?.tecnico?.nome ?? meta?.tecnicoNome, ''),
        funcao: textoOu(meta?.assinantes?.tecnico?.funcao, 'Inspetor'),
        registro: textoOu(meta?.assinantes?.tecnico?.crea, ''),
        rubrica: txt(meta?.assinantes?.tecnico?.assinatura),
      },
    ].filter((a) => a.nome !== ''),
  };
}

/**
 * Os pontos de medição de espessura.
 *
 * Origem preferida: `nr13_med_esp_<TAG>`, que é onde a folha ULTRASSOM grava o
 * que foi digitado. O formulário de campo (`nr13_injecao_atual.ultrassom`) é o
 * recuo — é ele que existe quando a inspeção veio do celular e o documento
 * ainda não foi aberto.
 */
const TITULO_REGIAO: Record<Regiao, string> = {
  ts: 'Tampo superior',
  casco: 'Casco',
  ti: 'Tampo inferior',
};

/**
 * A tabela de ultrassom, a partir da GRADE que o inspetor edita.
 *
 * ## Por que mudou (13D)
 *
 * O modelo lia `medEsp.pontos` e `us.medidas` — a estrutura do container de
 * campo. A grade que o editor React grava (`nr13_med_grid_`) não era lida por
 * folha nenhuma do relatório: o inspetor digitava e o documento imprimia outra
 * coisa. Uma verdade documental só existe se o documento ler o que foi
 * escrito.
 *
 * Nenhuma chave nova: a grade já existia e já era gravada pela folha antiga.
 * O que se acrescenta é a LEITURA, e os ângulos vêm com ela — a tabela deixa de
 * rotular as colunas como P1, P2… e passa a dizer 0°, 90°, 180°.
 *
 * `requerida` continua saindo do container (é a espessura mínima calculada, não
 * uma medição), e o container segue sendo a fonte quando não há grade — é o que
 * mantém relatório antigo abrindo igual.
 */
function pontosUltrassom(
  tag: string,
  us: Record<string, unknown>,
  medEsp: Record<string, unknown>,
): ModeloRelatorio['ultrassom']['pontos'] {
  const requeridaDe = (id: string): string | null => {
    const lista = (medEsp.pontos ?? us.pontos ?? []) as Record<string, unknown>[];
    const achado = lista.find((p) => String(p.id ?? p.nome ?? '') === id);
    return achado ? txt(achado.espMinRequerida ?? achado.requerida) : null;
  };

  const { pontos, grade } = carregarMedicoes(tag);
  const linhas: ModeloRelatorio['ultrassom']['pontos'] = [];
  for (const regiao of REGIOES) {
    const daRegiao = pontos.filter((p) => p.regiao === regiao);
    const g = grade[regiao];
    daRegiao.forEach((ponto, i) => {
      const medidas = (g.linhas[i] ?? []).map((v) => textoOu(txt(v)));
      const numeros = medidas.map((v) => Number(String(v).replace(',', '.'))).filter((n) => Number.isFinite(n));
      linhas.push({
        regiao: TITULO_REGIAO[regiao],
        ponto: ponto.rotulo,
        angulos: g.angulos,
        medidas,
        menor: numeros.length ? String(Math.min(...numeros)).replace('.', ',') : null,
        requerida: requeridaDe(ponto.id),
      });
    });
  }
  // Linha sem medida NENHUMA e sem espessura requerida não é informação — é uma
  // fileira de travessões ocupando papel.
  return linhas.filter((l) => l.medidas.some((v) => v !== '—') || l.requerida);
}

/** 4 fotos por folha (§5) — a mesma constante do sistema. */
export const FOTOS_POR_FOLHA = 4;

/**
 * Quantas folhas de registro fotográfico aquela etapa produz.
 *
 * **Zero fotos produzem zero folhas.** O piloto devolvia 1 aqui, para manter a
 * estrutura de seções fixa; o resultado era página em branco dentro de
 * documento assinado. Estrutura fixa não é motivo para imprimir papel vazio.
 */
export function folhasDeFotos(n: number): number {
  return n <= 0 ? 0 : Math.ceil(n / FOTOS_POR_FOLHA);
}

/**
 * Mede a proporção REAL de cada foto.
 *
 * O piloto assumia 4:3 e centralizava — foto em retrato ficava com sobra
 * lateral. Aqui a imagem é decodificada uma vez e a razão vai junto no modelo.
 * É assíncrono, e é por isso que a geração passou a ser assíncrona também.
 */
export async function medirFotos(lista: FotoModelo[]): Promise<FotoModelo[]> {
  return Promise.all(
    lista.map(
      (f) =>
        new Promise<FotoModelo>((resolver) => {
          const img = new Image();
          img.onload = () =>
            resolver({ ...f, proporcao: img.naturalHeight ? img.naturalWidth / img.naturalHeight : undefined });
          // Imagem ilegível não derruba o relatório: ela some da folha, e o
          // desenho não tenta rasterizar um dado que o navegador recusou.
          img.onerror = () => resolver({ ...f, dataUrl: '' });
          img.src = f.dataUrl;
        }),
    ),
  ).then((r) => r.filter((f) => f.dataUrl !== ''));
}
