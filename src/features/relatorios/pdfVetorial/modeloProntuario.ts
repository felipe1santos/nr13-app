import { ler } from '../../../services/storage';
import { linhasMemorial } from '../relatoriosService';
import { obterAssinantes } from '../../prontuarios/prontuarioService';
import type { ProntuarioDados } from '../../prontuarios/tipos';
import { converterPressao, numeroDoStorage, pontosUltrassom, textoOu, type FotoModelo } from './modelo';
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
  folhaDados: Record<string, string | null>;

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
    dimensoes: (dados.dimensoes ?? []).map((d) => ({
      modelo: textoOu(txt(d.modelo), ''),
      diametro: textoOu(txt(d.diametro)),
      altura: textoOu(txt(d.altura)),
      comprimento: textoOu(txt(d.comprimento)),
      espCorpo: textoOu(txt(d.espCorpo)),
      espFundo: textoOu(txt(d.espFundo)),
      espTampa: textoOu(txt(d.espTampa)),
      volume: textoOu(txt(d.volume)),
    })),
    folhaDados: Object.fromEntries(
      Object.entries(folhaDados).map(([k, v]) => [k, txt(typeof v === 'object' ? JSON.stringify(v) : v)]),
    ),

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
