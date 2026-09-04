import { ler } from '../../../services/storage';
import { linhasMemorial } from '../relatoriosService';
import { SECOES_CHECKLIST } from '../../inspecoes/formularios/FormularioChecklist';
import type { RelatorioMeta } from '../tipos';
import { rotuloClasseFluido, rotuloResposta, rotuloResultado, rotuloTipoEquipamento } from './rotulos';

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

  equipamento: Record<string, string | null>;
  pressoes: { rotulo: string; mpa: string | null; kgf: string | null; bar: string | null }[];
  categoria: { catFinal: string | null; grupo: string | null; volume: string | null; enquadramento: string | null };
  componentes: { nome: string; pmta: string | null; espReq: string | null; espNom: string | null; material: string | null }[];
  memorial: string[];

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
    pontos: { regiao: string; medidas: string[]; menor: string | null; requerida: string | null }[];
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

export function converterPressao(mpa: number | null): {
  mpa: string | null;
  kgf: string | null;
  bar: string | null;
} {
  if (mpa === null || !Number.isFinite(mpa)) return { mpa: null, kgf: null, bar: null };
  return { mpa: mpa.toFixed(3), kgf: (mpa * 10.19716).toFixed(2), bar: (mpa * 10).toFixed(2) };
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

  const pmta = converterPressao(typeof calc.pmta === 'number' ? calc.pmta : null);
  const pth = converterPressao(typeof calc.pth === 'number' ? calc.pth : null);

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

    equipamento: {
      'IDENTIFICAÇÃO / T.A.G.': tag,
      'TIPO DE EQUIPAMENTO': rotuloTipoEquipamento(txt(info.tipo) ?? txt(info.descricao)),
      FABRICANTE: txt(info.fabricante),
      'NÚMERO DE SÉRIE': txt(info.numeroSerie),
      'ANO DE FABRICAÇÃO': txt(info.ano),
      'CÓDIGO DE PROJETO': txt(info.codigoProjeto),
      'FLUIDO DE OPERAÇÃO': txt(cat.fluido) ?? txt(info.fluido),
      'CLASSE DO FLUIDO': rotuloClasseFluido(txt(cat.classeFluido)),
      'VOLUME (m³)': txt(cat.volume),
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
      volume: txt(cat.volume),
      // O ENQUADRAMENTO é lido, não recalculado: a base é kPa × m³ > 8 (§4) e
      // quem decide é `calc/categoria.ts`.
      enquadramento: txt(cat.enquadramento ?? cat.enquadra),
    },
    componentes: (calc.componentes ?? []).map((c) => ({
      nome: textoOu(txt(c.nome), 'Componente'),
      pmta: txt(c.pmtaMpa),
      espReq: txt(c.tReqMm),
      espNom: txt(c.tNom),
      material: txt(c.material),
    })),
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
      pontos: pontosUltrassom(us, medEsp),
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
function pontosUltrassom(
  us: Record<string, unknown>,
  medEsp: Record<string, unknown>,
): ModeloRelatorio['ultrassom']['pontos'] {
  const grade = (medEsp.pontos ?? us.pontos ?? []) as Record<string, unknown>[];
  const medidas = (medEsp.medidas ?? us.medidas ?? {}) as Record<string, unknown>;
  return grade
    .map((p) => {
      const nome = textoOu(txt(p.nome ?? p.regiao), 'Região');
      const linha = (medidas[String(p.id ?? nome)] ?? p.valores ?? []) as unknown[];
      const valores = Array.isArray(linha) ? linha.map((v) => textoOu(txt(v))) : [];
      const numeros = valores.map((v) => Number(v)).filter((n) => Number.isFinite(n));
      return {
        regiao: nome,
        medidas: valores,
        menor: numeros.length ? String(Math.min(...numeros)) : null,
        requerida: txt(p.espMinRequerida ?? p.requerida),
      };
    })
    .filter((p) => p.medidas.length > 0 || p.requerida);
}

/** 4 fotos por folha (§5) — a mesma constante do sistema. */
export const FOTOS_POR_FOLHA = 4;
export function folhasDeFotos(n: number): number {
  return Math.max(1, Math.ceil(n / FOTOS_POR_FOLHA));
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
