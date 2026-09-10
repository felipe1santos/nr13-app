import { ler } from '../../../services/storage';
import { linhasMemorial } from '../relatoriosService';
import { obterAssinantes } from '../../prontuarios/prontuarioService';
import type { ProntuarioDados } from '../../prontuarios/tipos';
import { converterPressao, numeroBr, numeroDoStorage, pontosUltrassom, textoOu, type FotoModelo } from './modelo';
import type { RelatorioMeta } from '../tipos';
import { rotuloClasseFluido, rotuloTipoEquipamento } from './rotulos';

/**
 * Fase 12 · o MODELO do PRONTUÁRIO — a ponte de dados das 6 folhas.
 *
 * ## As mesmas duas regras da Fase 11
 *
 * 1. **Ele LÊ; não calcula.** PMTA, espessura requerida, categoria e memorial
 *    têm dono no sistema. Recalcular aqui criaria uma segunda verdade num
 *    documento assinado por engenheiro. As linhas do memorial vêm de
 *    `linhasMemorial()`, a MESMA função que o template e o relatório usam.
 * 2. **Campo ausente é `null`**, e chega à folha como travessão — visível a
 *    quem lê o código, em vez do `|| '{}'` silencioso dos templates.
 *
 * ## De onde vem cada coisa
 *
 * As chaves são exatamente as que os seis `PRONT-*.html` leem, conferidas por
 * varredura do `public/`:
 *
 * | folha | lê |
 * |---|---|
 * | ULTRASSOM | `nr13_med_esp_`, `nr13_med_grid_`, `nr13_croqui2d_`, `nr13_rastreab_`, `nr13_calc_` |
 * | CROQUI2D | `nr13_croqui2d_`, `nr13_modelo3d_`, `nr13_cat_` |
 * | FOLHA-DADOS | `nr13_folha_dados_`, `nr13_vaso_`, `nr13_calc_gv_` |
 * | PRONTUÁRIO | `nr13_info_`, `nr13_cat_`, `nr13_emp_`, `nr13_vaso_`, dados de caldeira |
 * | CONTINUAÇÃO | `nr13_calc_` (procedimentos, dispositivos, atenção) |
 * | MEMORIAL | `nr13_calc_`, `nr13_calc_gv_`, `nr13_vaso_ac_corpo_` |
 *
 * Comum a todas: `nr13_prontuario_<TAG>` (o formulário salvo),
 * `nr13_prontuario_atual` (a cópia materializada para os templates),
 * `nr13_prontuario_meta_<TAG>` (número + emissão) e `nr13_minha_empresa`.
 */

export interface PontoEspessura {
  regiao: string;
  /** O ponto dentro da região ("Casco 3"). */
  ponto: string;
  /** Os ângulos daquela região — 0°, 90°, 180°, 270°, ou os que ela tiver. */
  angulos: string[];
  medidas: string[];
  menor: string | null;
  requerida: string | null;
}

export interface ComponenteProntuario {
  nome: string;
  pmta: string | null;
  espReq: string | null;
  espNom: string | null;
  material: string | null;
  /** As equações que o MOTOR usou naquele componente — o prontuário as mostra
   * no lugar da memória de cálculo linha a linha, que é do relatório. */
  formulaT: string | null;
  formulaP: string | null;
}

/**
 * Um bocal do modelo do croqui, já pronto para a folha.
 *
 * As colunas são as mesmas da "Lista de Bocais" do `PRONT-FOLHA-DADOS.html`
 * — o documento vetorial não inventa apresentação nova para um dado que já
 * tinha a sua.
 */
export interface BocalProntuario {
  tag: string;
  servico: string;
  dn: string;
  diametroEspessura: string;
  flange: string;
  local: string;
  posicao: string;
  angulo: string;
}

/**
 * As medidas DERIVADAS do modelo do croqui 2D — comprimento, circunferência,
 * pesos, bocais e a descrição de cada componente.
 *
 * Isto era `Record<string, string | null>`, preenchido com
 * `JSON.stringify` de tudo que não fosse texto. O resultado no papel:
 *
 * ```
 * pesos   {"vazioKg":417.62295507194204,"cheioDaguaKg":1417.5657167707932,…}
 * circunferenciaMm   1610.694553495487
 * ```
 *
 * JSON cru, chave em camelCase, float com doze casas — dentro de um prontuário
 * assinado. O tipo genérico foi a causa: com um saco de strings, a folha não
 * tinha o que renderizar além de chave e valor. Estruturar o modelo é o que
 * devolve a apresentação, e as unidades, que o template legado já tinha.
 */
export interface FolhaDadosProntuario {
  orientacao: string | null;
  comprimentoTotal: string | null;
  circunferencia: string | null;
  pesoVazio: string | null;
  pesoCheio: string | null;
  pesoOperacao: string | null;
  /** Suporte tipo pés/selas: o modelador não soma o peso dele. */
  notaSuporte: boolean;
  /** Uma linha por componente ("Casco cilíndrico — Ø500 mm × 4.926 mm, t=6,35 mm"). */
  dimensoes: string[];
  bocais: BocalProntuario[];
}

export interface DimensaoLinha {
  modelo: string;
  diametro: string;
  altura: string;
  comprimento: string;
  espCorpo: string;
  espFundo: string;
  espTampa: string;
  volume: string;
}

export interface AssinanteProntuario {
  nome: string;
  funcao: string;
  registro: string;
  rubrica: string | null;
  /** Folhas que este assinante carimba; vazio = nenhuma. */
  folhas: string[];
}

export interface ModeloProntuario {
  tag: string;
  tipoEquipamento: string;
  /** Necessário para rotular as colunas de dimensão — ver `rotulosDimensoes`. */
  subtipo: string;
  numero: string | null;
  emissao: string | null;
  revisao: string | null;
  dataRevisao: string | null;

  empresa: { razao: string; endereco: string; contato: string; logo: string | null };
  cliente: { razao: string | null; cnpj: string | null; endereco: string | null };

  identificacao: Record<string, string | null>;
  construtivos: Record<string, string | null>;
  operacionais: Record<string, string | null>;
  categoria: {
    kpaVolume: string | null;
    resultadoKpa: string | null;
    mpaVolume: string | null;
    resultadoMpa: string | null;
    classeFluido: string | null;
    grupo: string | null;
    categoria: string | null;
  };

  /** PMO, PMTA e PTH nas quatro unidades — as mesmas colunas do relatório. */
  pressoes: { rotulo: string; mpa: string | null; psi: string | null; kgf: string | null; bar: string | null }[];
  /** A capa: quem assina e a foto do equipamento. */
  responsavel: { nome: string | null; registro: string | null };
  fotoCapa: string | null;
  componentes: ComponenteProntuario[];
  memorial: string[];

  ultrassom: {
    componente: string | null;
    aparelho: string | null;
    acoplante: string | null;
    cabecote: string | null;
    velSonica: string | null;
    tempSup: string | null;
    estadoSup: string | null;
    pontos: PontoEspessura[];
    instrumento: { padrao: string | null; serie: string | null; certificado: string | null; validade: string | null };
  };

  /** SVGs do croqui 2D. Desenho, não fotografia — vira imagem só na hora de pintar. */
  croqui: { longitudinal: string | null; transversal: string | null; detalheTampo: string | null };
  dimensoes: DimensaoLinha[];
  folhaDados: FolhaDadosProntuario;

  procedimentos: string | null;
  dispositivos: string | null;
  atencao: string | null;

  assinantes: AssinanteProntuario[];
  fotos: FotoModelo[];
}

function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Funcionário de `nr13_lista_phs`, na forma que o motor de assinatura usa. */
interface Funcionario {
  id: string;
  nome?: string;
  funcao?: string;
  crea?: string;
  registro?: string;
  assinatura?: string;
  folhasProntuario?: string[];
}

/**
 * Os assinantes escolhidos no visualizador, resolvidos de `nr13_lista_phs`.
 *
 * `folhasProntuario` AUSENTE segue a regra do `pront-assinatura.js`: engenheiro
 * assina todas, inspetor nenhuma. Mudar isso aqui faria o PDF divergir da
 * folha impressa — o mesmo dado, dois resultados.
 */
function assinantesDe(tag: string, folhas: readonly string[]): AssinanteProntuario[] {
  const escolha = obterAssinantes(tag);
  const lista = ler<Funcionario[]>('nr13_lista_phs') ?? [];
  const achar = (id: string | null) => (id ? lista.find((f) => f.id === id) : undefined);

  const montar = (f: Funcionario | undefined, padraoTodas: boolean): AssinanteProntuario | null => {
    if (!f) return null;
    const declaradas = Array.isArray(f.folhasProntuario) ? f.folhasProntuario : null;
    return {
      nome: textoOu(txt(f.nome), ''),
      funcao: textoOu(txt(f.funcao), padraoTodas ? 'Engenheiro' : 'Inspetor'),
      registro: textoOu(txt(f.crea ?? f.registro), ''),
      rubrica: txt(f.assinatura),
      folhas: declaradas ?? (padraoTodas ? [...folhas] : []),
    };
  };

  return [montar(achar(escolha.engenheiroId), true), montar(achar(escolha.tecnicoId), false)].filter(
    (a): a is AssinanteProntuario => !!a && a.nome !== '',
  );
}

/**
 * Pontos de medição — a MESMA função do relatório.
 *
 * O prontuário tinha uma leitura própria da grade: colunas genéricas "P1, P2"
 * em vez dos ângulos da região, e o menor valor recalculado aqui. Dois
 * caminhos para o mesmo ensaio, dentro do mesmo sistema, é a receita para dois
 * documentos que se contradizem — e é o relatório que já lê a grade certa
 * (`nr13_med_grid_<TAG>`, a chave que o editor grava).
 */
function pontosEspessura(tag: string, medEsp: Record<string, unknown>): PontoEspessura[] {
  return pontosUltrassom(tag, medEsp, medEsp);
}

/**
 * `nr13_folha_dados_<TAG>` → o bloco de medidas derivadas, já com unidade e
 * número em pt-BR.
 *
 * As casas decimais não são estéticas: o modelador devolve
 * `circunferenciaMm: 1610.694553495487`, e doze casas num documento técnico
 * afirmam uma precisão de 10⁻⁹ mm que a medida não tem. Uma casa é o que o
 * template legado imprimia (`fmtNumPtBRCompacto`), e é o que a trena lê.
 */
function folhaDadosDe(bruto: Record<string, unknown>): FolhaDadosProntuario {
  const pesos = (bruto.pesos ?? {}) as Record<string, unknown>;
  const bocais = Array.isArray(bruto.bocais) ? (bruto.bocais as Record<string, unknown>[]) : [];
  const dimensoes = Array.isArray(bruto.dimensoes) ? (bruto.dimensoes as Record<string, unknown>[]) : [];
  const orientacao = txt(bruto.orientacao);

  const medida = (v: unknown, unidade: string): string | null => {
    const n = numeroBr(v, 1);
    return n === null ? null : `${n} ${unidade}`;
  };

  return {
    orientacao: orientacao === null ? null : orientacao.charAt(0).toLocaleUpperCase('pt-BR') + orientacao.slice(1),
    comprimentoTotal: medida(bruto.comprimentoTotalMm, 'mm'),
    circunferencia: medida(bruto.circunferenciaMm, 'mm'),
    pesoVazio: medida(pesos.vazioKg, 'kg'),
    pesoCheio: medida(pesos.cheioDaguaKg, 'kg'),
    pesoOperacao: medida(pesos.operacaoKg, 'kg'),
    notaSuporte: pesos.notaSuporte === true,
    dimensoes: dimensoes.map((d) => txt(d.texto)).filter((x): x is string => x !== null),
    bocais: bocais.map((b) => {
      // Ø × t numa coluna só: são duas medidas do mesmo furo, e separá-las
      // custaria duas colunas de oito para um número de três dígitos.
      const d = numeroBr(b.diametroMm, 1);
      const e = numeroBr(b.espessuraMm, 1);
      const local = txt(b.local);
      return {
        tag: textoOu(txt(b.id)),
        servico: textoOu(txt(b.servico)),
        dn: textoOu(txt(b.dn)),
        diametroEspessura: d === null && e === null ? '—' : `Ø${d ?? '—'} × ${e ?? '—'}`,
        flange: textoOu(txt(b.flange)),
        local: local === null ? '—' : local === 'casco' ? 'Casco' : local === 'tampo1' ? 'Tampo 1' : local === 'tampo2' ? 'Tampo 2' : local,
        posicao: textoOu(medida(b.posicaoAxialMm, 'mm')),
        angulo: textoOu(numeroBr(b.anguloGraus, 0) === null ? null : `${numeroBr(b.anguloGraus, 0)}°`),
      };
    }),
  };
}

export function montarModeloProntuario(tag: string): ModeloProntuario {
  const dados = ler<ProntuarioDados>(`nr13_prontuario_${tag}`) ?? ({} as ProntuarioDados);
  const meta = ler<{ numero?: string; emissao?: string }>(`nr13_prontuario_meta_${tag}`);
  const info = ler<Record<string, unknown>>(`nr13_info_${tag}`) ?? {};
  const cat = ler<Record<string, unknown>>(`nr13_cat_${tag}`) ?? {};
  const calc =
    ler<{ pmta?: number; pth?: number; componentes?: Record<string, unknown>[]; procedimentos?: string; dispositivos?: string; atencao?: string }>(
      `nr13_calc_${tag}`,
    ) ?? {};
  const emps = ler<Record<string, unknown>>(`nr13_emp_${tag}`) ?? {};
  const empresa = ler<Record<string, unknown>>('nr13_minha_empresa') ?? {};
  const medEsp = ler<Record<string, unknown>>(`nr13_med_esp_${tag}`) ?? {};
  const croqui = ler<{ longitudinal?: string; transversal?: string; detalheTampo?: string }>(`nr13_croqui2d_${tag}`) ?? {};
  const folhaDados = ler<Record<string, unknown>>(`nr13_folha_dados_${tag}`) ?? {};
  const fotos = ler<{ capa?: string; fotos?: { base64?: string; descricao?: string }[] }>(`nr13_fotos_${tag}`) ?? {};
  const metaRel = ler<RelatorioMeta>('nr13_relatorio_meta_atual');

  const tipo = textoOu(txt(info.tipo), 'vaso');
  const pmta = converterPressao(typeof calc.pmta === 'number' ? calc.pmta : null);
  const pth = converterPressao(typeof calc.pth === 'number' ? calc.pth : null);

  // As folhas que este equipamento realmente tem — o mesmo filtro da tela.
  const folhas: readonly string[] = [
    'PRONT-ULTRASSOM.html',
    ...(tipo === 'vaso' ? ['PRONT-CROQUI2D.html', 'PRONT-FOLHA-DADOS.html'] : []),
    'PRONT-PRONTUARIO.html',
    'PRONT-CONTINUACAO.html',
    'PRONT-MEMORIAL.html',
  ];

  return {
    tag,
    tipoEquipamento: tipo,
    subtipo: textoOu(txt(info.subtipo), ''),
    numero: txt(meta?.numero),
    emissao: txt(meta?.emissao),
    revisao: txt(dados.revisao),
    dataRevisao: txt(dados.dataRevisao),

    empresa: {
      razao: textoOu(txt(dados.minhaEmpresaNome ?? empresa.razaoSocial ?? empresa.razao ?? empresa.nome), ''),
      // Mesma composição do rodapé da folha atual: endereço • bairro •
      // cidade/UF • CNPJ • CEP. O bairro e o CEP estavam de fora, e a
      // conferência campo a campo pegou a falta.
      endereco: [
        dados.minhaEmpresaEndereco ?? empresa.endereco,
        empresa.bairro,
        dados.minhaEmpresaCidade ?? empresa.cidade,
        (dados.minhaEmpresaCnpj ?? empresa.cnpj) ? `CNPJ: ${dados.minhaEmpresaCnpj ?? empresa.cnpj}` : '',
        empresa.cep ? `CEP: ${empresa.cep}` : '',
      ]
        .filter((p) => p && String(p).trim() !== '')
        .join(' • '),
      contato: [dados.minhaEmpresaTelefone ?? empresa.telefone, empresa.email]
        .filter((p) => p && String(p).trim() !== '')
        .join(' – '),
      logo: txt(dados.logo ?? empresa.logo),
    },
    cliente: {
      razao: txt(dados.empresaRazaoSocial ?? emps.razaoSocial ?? emps.nomeFantasia),
      cnpj: txt(dados.empresaCnpj ?? emps.cnpj),
      endereco: txt(
        [dados.empresaEndereco ?? emps.endereco, dados.empresaCidade ?? emps.cidade, dados.empresaEstado ?? emps.estado]
          .filter(Boolean)
          .join(', '),
      ),
    },

    identificacao: {
      'IDENTIFICAÇÃO / T.A.G.': tag,
      'Nº DE SÉRIE': txt(dados.nroSerie ?? info.numeroSerie),
      'TIPO DE EQUIPAMENTO': rotuloTipoEquipamento(tipo),
      FABRICANTE: txt(info.fabricante),
      'CÓDIGO DE PROJETO': txt(dados.codigoProjeto ?? info.codigoProjeto),
      'ANO DE FABRICAÇÃO': txt(dados.dataFabricacao ?? info.ano),
      EDIÇÃO: txt(dados.anoEdicao),
      MODELO: txt(dados.modelo),
    },
    construtivos: {
      'MATERIAL DO CORPO': txt(dados.fundoCorpo),
      'MATERIAL DO TAMPO': txt(dados.tampa),
      'TIPO DE TAMPOS': txt(dados.tipoTampos),
      'VOLUME (m³)': txt(dados.dimensoes?.[0]?.volume ?? cat.volume),
      'PRESSÃO DE PROJETO': txt(dados.pressaoProjeto),
      'PRESSÃO MÁX. DE OPERAÇÃO': txt(dados.pressaoMaxOp),
      'PRESSÃO DE TESTE HIDROSTÁTICO': txt(dados.pressaoTH),
      'MARGEM DE CORROSÃO (mm)': txt(dados.sobreespessura),
      'TEMPERATURA DE PROJETO (°C)': txt(dados.tempProjeto),
      'MANÍPULOS': txt(dados.manipulos),
      PRISIONEIROS: txt(dados.prisioneiros),
      ARO: txt(dados.aro),
      'LUVAS / CONEXÕES': txt(dados.luvConexoes),
    },
    operacionais: {
      'FLUIDO DE OPERAÇÃO': txt(cat.fluido ?? info.fluido),
      'DESCRIÇÃO RESUMIDA': txt(dados.descricao),
      'CARACTERÍSTICAS FUNCIONAIS': txt(dados.caracteristicasFuncionais),
    },
    categoria: {
      // LIDOS, nunca recalculados: o enquadramento é kPa × m³ > 8 (§4) e quem
      // decide é `calc/categoria.ts`.
      kpaVolume: txt(cat.pvKpa ?? cat.relacaoKpa),
      resultadoKpa: txt(cat.enquadramento ?? cat.enquadra),
      mpaVolume: txt(cat.pvMpa ?? cat.relacaoMpa),
      resultadoMpa: txt(cat.grupo),
      classeFluido: rotuloClasseFluido(txt(dados.classeFluid ?? cat.classeFluido)),
      grupo: txt(dados.grupoPotencialRisco ?? cat.grupo),
      categoria: txt(dados.categoria ?? cat.catFinal),
    },

    pressoes: [
      { rotulo: 'PMO — Pressão Máxima de Operação', ...converterPressao(numeroDoStorage(info.pmoAdotadaMpa)) },
      { rotulo: 'PMTA — Pressão Máxima de Trabalho Admissível', ...pmta },
      { rotulo: 'PTH — Pressão de Teste Hidrostático', ...pth },
    ],
    // A capa do prontuário traz o responsável e a foto do equipamento, como a
    // do relatório. A fonte é a mesma: o snapshot da meta quando existe, o
    // cadastro vivo quando não.
    responsavel: {
      nome: txt(metaRel?.assinantes?.engenheiro?.nome ?? metaRel?.phNome),
      registro: txt(metaRel?.assinantes?.engenheiro?.crea ?? metaRel?.phCrea),
    },
    fotoCapa: txt(fotos.capa) ?? txt(fotos.fotos?.[0]?.base64),
    componentes: (calc.componentes ?? []).map((c) => ({
      nome: textoOu(txt(c.nome), 'Componente'),
      pmta: txt(c.pmtaMpa),
      espReq: txt(c.tReqMm),
      espNom: txt(c.tNom),
      material: txt(c.material),
      formulaT: txt(c.formulaT),
      formulaP: txt(c.formulaP),
    })),
    // O MESMO extrator do template e do relatório.
    memorial: linhasMemorial(tag),

    ultrassom: {
      componente: txt(medEsp.componente),
      aparelho: txt(medEsp.aparelho),
      acoplante: txt(medEsp.acoplante),
      cabecote: txt(medEsp.cabecote),
      velSonica: txt(medEsp.velSonica),
      tempSup: txt(medEsp.tempSup),
      estadoSup: txt(medEsp.estadoSup),
      pontos: pontosEspessura(tag, medEsp),
      instrumento: {
        padrao: txt((medEsp.instrumento as Record<string, unknown>)?.padrao),
        serie: txt((medEsp.instrumento as Record<string, unknown>)?.serie),
        certificado: txt((medEsp.instrumento as Record<string, unknown>)?.certificado),
        validade: txt((medEsp.instrumento as Record<string, unknown>)?.validade),
      },
    },

    croqui: {
      longitudinal: txt(croqui.longitudinal),
      transversal: txt(croqui.transversal),
      detalheTampo: txt(croqui.detalheTampo),
    },
    // `numeroBr ?? txt`: o campo é livre, e o usuário pode digitar "2 × 500"
    // ou "s/ tampo". Número vira pt-BR; o que não for número passa intacto,
    // em vez de virar travessão.
    dimensoes: (dados.dimensoes ?? []).map((d) => {
      const medida = (v: unknown) => textoOu(numeroBr(v, 2) ?? txt(v));
      return {
        modelo: textoOu(txt(d.modelo), ''),
        diametro: medida(d.diametro),
        altura: medida(d.altura),
        comprimento: medida(d.comprimento),
        espCorpo: medida(d.espCorpo),
        espFundo: medida(d.espFundo),
        espTampa: medida(d.espTampa),
        volume: medida(d.volume),
      };
    }),
    folhaDados: folhaDadosDe(folhaDados),

    procedimentos: txt(calc.procedimentos),
    dispositivos: txt(calc.dispositivos),
    atencao: txt(calc.atencao),

    assinantes: assinantesDe(tag, folhas),
    fotos: (fotos.fotos ?? [])
      .map((f) => ({ dataUrl: String(f.base64 ?? ''), descricao: String(f.descricao ?? '') }))
      .filter((f) => f.dataUrl.startsWith('data:image')),
  };
}

/** As folhas do prontuário para aquele tipo — espelha `paginasProntuario`. */
export function folhasDoProntuario(tipoEquipamento: string): string[] {
  const comCroqui = tipoEquipamento === 'vaso';
  return [
    'PRONT-ULTRASSOM.html',
    ...(comCroqui ? ['PRONT-CROQUI2D.html', 'PRONT-FOLHA-DADOS.html'] : []),
    'PRONT-PRONTUARIO.html',
    'PRONT-CONTINUACAO.html',
    'PRONT-MEMORIAL.html',
  ];
}
