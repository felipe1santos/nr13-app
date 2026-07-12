// Persistência do editor de Croqui 2D do vaso: pré-carga a partir do memorial já salvo
// (`nr13_vaso_<TAG>` / `nr13_vaso_ac_corpo_<TAG>`), gravação do modelo (`nr13_modelo3d_<TAG>`,
// chave mantida por compatibilidade com modelos já salvos), da folha de dados derivada
// (`nr13_folha_dados_<TAG>`) e dos croquis 2D (`nr13_croqui2d_<TAG>`).
import { excluirChave, ler, salvar } from '../../services/storage';
import type { VasoSalvo } from '../memorial/vasoMemorialService';
import { circunferenciaMm, comprimentoTotalMm, dimensoesTampo, num, pesosKg } from './geometriaVaso';
import type { BocalModelo, ModeloVaso, TampoModelo, TipoTampoModelo } from './tiposModelador';

export interface FolhaDadosDerivada {
  geradoEm: string;
  orientacao: 'vertical' | 'horizontal';
  bocais: { id: string; servico: string; dn: string; flange: string; obs: string; anguloGraus: number | null }[];
  pesos: {
    vazioKg: number | null;
    cheioDaguaKg: number | null;
    operacaoKg: number | null;
    densidade: number;
    notaSuporte: boolean;
  };
  dimensoes: { componente: string; texto: string }[];
  comprimentoTotalMm: number | null;
  circunferenciaMm: number | null;
}

function chaveModelo3d(tag: string): string {
  return `nr13_modelo3d_${tag}`;
}
function chaveFolhaDados(tag: string): string {
  return `nr13_folha_dados_${tag}`;
}
function chaveCroqui2d(tag: string): string {
  return `nr13_croqui2d_${tag}`;
}

/** Converte um valor NumLike (number | string, podendo ter vírgula decimal) em number | ''. */
function toNum(v: unknown): number | '' {
  if (v === undefined || v === null || v === '') return '';
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : '';
}

export function modeloVazio(tag: string): ModeloVaso {
  return {
    tag,
    orientacao: 'horizontal',
    diametroInterno: '',
    comprimentoCilindro: '',
    espessuraCasco: '',
    virolas: 1,
    tampo1: { tipo: 'eliptico', espessura: '' },
    tampo2: { tipo: 'eliptico', espessura: '' },
    bocais: [],
    suporte: { tipo: 'nenhum', altura: '', quantidade: '' },
    densidadeAco: 7850,
    pesoOperacao: '',
    material: '',
  };
}

/** Mapeia o tipo de tampo do memorial (calc/vaso) para o tipo do modelador 3D. */
function tipoTampoDoMemorial(tipo: string): TipoTampoModelo | null {
  switch (tipo) {
    case 'eliptico':
      return 'eliptico';
    case 'toroesferico':
      return 'toriesferico';
    case 'esferico':
      return 'hemisferico';
    case 'plano':
    case 'planoAparafusado':
      return 'plano';
    default:
      return null;
  }
}

/**
 * Comprimento do cilindro estimado a partir do volume salvo na calculadora de categoria
 * (`nr13_cat_<TAG>.volInput`, m³): desconta o volume dos 2 tampos (meia elipsoide 2/3·π·R²·h)
 * e divide pela seção do cilindro. É só sugestão de pré-preenchimento — o usuário confere.
 */
function sugerirComprimentoPorVolume(tag: string, modelo: ModeloVaso): number | '' {
  const cat = ler<{ volInput?: number | string }>(`nr13_cat_${tag}`);
  const vol = toNum(cat?.volInput);
  const D = toNum(modelo.diametroInterno);
  if (vol === '' || D === '' || vol <= 0 || D <= 0) return '';
  const R = D / 2;
  const volTampo = (tampo: TampoModelo): number => {
    const t = num(tampo.espessura);
    const dims = dimensoesTampo(tampo.tipo, D, t ?? 0);
    return (2 / 3) * Math.PI * R * R * dims.profundidade; // mm³
  };
  const volMm3 = vol * 1e9;
  const lMm = (volMm3 - volTampo(modelo.tampo1) - volTampo(modelo.tampo2)) / (Math.PI * R * R);
  if (!Number.isFinite(lMm) || lMm <= 0) return '';
  return Math.round(lMm);
}

/** Monta um ModeloVaso a partir do memorial salvo (pré-carga dos campos calculados). */
function modeloDoMemorial(tag: string, vaso: VasoSalvo): ModeloVaso {
  const modelo = modeloVazio(tag);
  modelo.diametroInterno = toNum(vaso.D);
  modelo.orientacao = vaso.orientacao ?? 'horizontal';

  const tampos: TampoModelo[] = [];
  const bocais: BocalModelo[] = [];

  for (const c of vaso.componentes ?? []) {
    if (c.tipo === 'cilindrico') {
      modelo.espessuraCasco = toNum(c.dados.t_comercial);
      modelo.material = c.dados.mat ?? '';
      continue;
    }

    const tipoTampo = tipoTampoDoMemorial(c.tipo);
    if (tipoTampo && tampos.length < 2) {
      tampos.push({ tipo: tipoTampo, espessura: toNum(c.dados.t_comercial) });
      continue;
    }

    if (c.tipo === 'bocal') {
      bocais.push({
        id: `N${bocais.length + 1}`,
        doMemorial: true,
        diametro: toNum(c.dados.d),
        espessura: toNum(c.dados.t_comercial),
        projecao: toNum(c.dados.proj_int) || 150,
        local: 'casco',
        angulo: 0,
        posicaoAxial: '',
        servico: '',
        dn: '',
        flange: '',
      });
    }
  }

  if (tampos[0]) modelo.tampo1 = tampos[0];
  if (tampos[1]) modelo.tampo2 = tampos[1];
  modelo.bocais = bocais;
  modelo.comprimentoCilindro = sugerirComprimentoPorVolume(tag, modelo);

  return modelo;
}

export function carregarOuPreCarregar(tag: string): ModeloVaso {
  const vaso = ler<VasoSalvo>(`nr13_vaso_${tag}`) ?? ler<VasoSalvo>(`nr13_vaso_ac_corpo_${tag}`);
  const existente = ler<ModeloVaso>(chaveModelo3d(tag));
  if (!existente) return vaso ? modeloDoMemorial(tag, vaso) : modeloVazio(tag);

  // Migração: modelos salvos antes do campo `virolas` (fase 2) não o têm — tratar como 1 virola.
  const migrado: ModeloVaso = { ...existente, virolas: existente.virolas === undefined ? 1 : existente.virolas };
  if (!vaso) return migrado;

  // Memorial editado depois do croqui salvo: os campos calculados re-sincronizam (memorial é a
  // fonte de verdade de Ø, espessuras, tampos e material); o que só o croqui conhece
  // (comprimento, virolas, suporte, posição/ângulo dos bocais) é preservado.
  const preCarga = modeloDoMemorial(tag, vaso);
  return {
    ...migrado,
    orientacao: vaso.orientacao ?? migrado.orientacao,
    diametroInterno: preCarga.diametroInterno === '' ? migrado.diametroInterno : preCarga.diametroInterno,
    espessuraCasco: preCarga.espessuraCasco === '' ? migrado.espessuraCasco : preCarga.espessuraCasco,
    material: preCarga.material || migrado.material,
    tampo1: preCarga.tampo1.espessura === '' ? migrado.tampo1 : preCarga.tampo1,
    tampo2: preCarga.tampo2.espessura === '' ? migrado.tampo2 : preCarga.tampo2,
    bocais: migrado.bocais.length > 0 ? migrado.bocais : preCarga.bocais,
    comprimentoCilindro: migrado.comprimentoCilindro === '' ? preCarga.comprimentoCilindro : migrado.comprimentoCilindro,
  };
}

function fmtNum(v: number | null, casas = 2): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function tipoTampoPorExtenso(tipo: TipoTampoModelo): string {
  switch (tipo) {
    case 'eliptico':
      return 'Elíptico 2:1';
    case 'toriesferico':
      return 'Toriesférico';
    case 'hemisferico':
      return 'Hemisférico';
    case 'plano':
      return 'Plano';
  }
}

function nomeSuporte(tipo: ModeloVaso['suporte']['tipo']): string {
  switch (tipo) {
    case 'saia':
      return 'Saia';
    case 'pes':
      return 'Pés';
    case 'selas':
      return 'Selas';
    case 'nenhum':
      return '';
  }
}

function linhaTampo(nome: string, tampo: TampoModelo, D: number | null): { componente: string; texto: string } {
  const t = num(tampo.espessura);
  const dims = D !== null && t !== null ? dimensoesTampo(tampo.tipo, D, t) : null;
  const extenso = tipoTampoPorExtenso(tampo.tipo);
  const componente = `${nome} (${extenso})`;
  let texto = `${componente} — Ø${fmtNum(D)} t=${fmtNum(t)} h=${fmtNum(dims ? dims.profundidade : null)}`;
  if (tampo.tipo === 'toriesferico') {
    texto += ` Rc=${fmtNum(dims ? dims.raioCoroa : null)} rc=${fmtNum(dims ? dims.raioCanto : null)}`;
  }
  return { componente, texto };
}

export function montarFolhaDados(m: ModeloVaso): FolhaDadosDerivada {
  const D = num(m.diametroInterno);
  const L = num(m.comprimentoCilindro);
  const tCasco = num(m.espessuraCasco);

  const bocais = m.bocais.map((b) => {
    const angulo = num(b.angulo);
    const posAxial = num(b.posicaoAxial);
    let obs = '';
    if (b.local === 'tampo1' || b.local === 'tampo2') {
      // Bocal de tampo não tem posicaoAxial (não se aplica) — a posição/ângulo dele vai na OBS.
      const nomeTampo = b.local === 'tampo1' ? 'tampo 1' : 'tampo 2';
      obs = angulo !== null ? `${nomeTampo} @ ${fmtNum(angulo, 1)}°` : nomeTampo;
    } else if (posAxial !== null) {
      obs = `${b.local} @ ${fmtNum(posAxial, 1)}mm`; // fmtNum formata pt-BR (vírgula decimal)
    }
    return {
      id: b.id,
      servico: b.servico,
      dn: b.dn,
      flange: b.flange,
      obs,
      anguloGraus: angulo,
    };
  });

  const pesos = pesosKg(m);

  const dimensoes: { componente: string; texto: string }[] = [
    {
      componente: 'Casco cilíndrico',
      texto: `Casco cilíndrico — Ø${fmtNum(D)} mm × ${fmtNum(L)} mm, t=${fmtNum(tCasco)} mm`,
    },
    linhaTampo('Tampo 1', m.tampo1, D),
    linhaTampo('Tampo 2', m.tampo2, D),
  ];

  if (m.suporte.tipo !== 'nenhum') {
    const nome = nomeSuporte(m.suporte.tipo);
    const altura = num(m.suporte.altura);
    const qtd = num(m.suporte.quantidade);
    dimensoes.push({
      componente: `Suporte (${nome})`,
      texto: `Suporte (${nome}) — altura=${fmtNum(altura)} mm, qtd=${qtd === null ? '—' : qtd}`,
    });
  }

  return {
    geradoEm: new Date().toLocaleDateString('pt-BR'),
    orientacao: m.orientacao,
    bocais,
    pesos: {
      ...pesos,
      densidade: m.densidadeAco,
      notaSuporte: m.suporte.tipo === 'pes' || m.suporte.tipo === 'selas',
    },
    dimensoes,
    comprimentoTotalMm: comprimentoTotalMm(m),
    circunferenciaMm: circunferenciaMm(m),
  };
}

export async function salvarModelo(
  tag: string,
  m: ModeloVaso,
  croquis2d: { longitudinal: string; transversal: string; detalheTampo: string } | null,
): Promise<void> {
  await salvar(chaveModelo3d(tag), m);
  await salvar(chaveFolhaDados(tag), montarFolhaDados(m));
  if (croquis2d) {
    await salvar(chaveCroqui2d(tag), croquis2d);
  } else {
    // null explícito (usuário limpou os dados mínimos do croqui): remove a chave em vez de deixar
    // o SVG antigo obsoleto — o croqui2d precisa ficar consistente com a folha_dados atual.
    await excluirChave(chaveCroqui2d(tag));
  }
}
