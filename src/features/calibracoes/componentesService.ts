import { ler, salvar } from '../../services/storage';
import { salvarArquivo, type RefFoto, type FotoArmazenada } from '../../services/fotos';

/**
 * Componentes de calibração do equipamento (válvulas de segurança e manômetros).
 * Como os instrumentos são sempre os mesmos no equipamento, o usuário cadastra
 * UMA vez (com foto opcional) e depois calibra os mesmos componentes a cada
 * inspeção — cada rodada vira um LOTE de calibração, agrupando os certificados.
 *
 * Chaves: nr13_componentes_cal_<TAG> e nr13_lotes_cal_<TAG>.
 */
export interface ComponenteCal {
  id: string;
  tipo: 'manometro' | 'psv';
  nome: string;          // ex.: "Manômetro principal", "PSV-01"
  fabricante?: string;
  modelo?: string;
  serie?: string;
  /** LEGADO: base64 das fotos gravadas antes de 11/08/2026. Novas nascem ''. */
  foto?: string;
  /**
   * A foto no bucket `inspecao`, em `<org>/componentes/<uuid>.jpg`. É assim que
   * uma foto nova é guardada: o registro leva só esta referência leve.
   *
   * Antes, os 8 componentes de um único equipamento da conta gabriel.dadona
   * somavam 2.518 KB de base64 numa chave só — baixados a cada hidratação para
   * desenhar oito miniaturas de 40px.
   */
  fotoRef?: RefFoto;
  criadoEm: string;
}

/**
 * O que entregar ao `<FotoImg>`: a referência quando existe, o base64 legado
 * quando não, `null` quando o componente não tem foto (a UI mostra o ícone do
 * tipo). Quem exibe não precisa saber onde o arquivo mora.
 */
export function fotoDoComponente(c: ComponenteCal): FotoArmazenada | string | null {
  if (c.fotoRef?.path) return { ref: c.fotoRef };
  return c.foto ? c.foto : null;
}

/** dataURL → bytes, sem passar por string intermediária gigante. */
function dataUrlParaBlob(dataUrl: string): Blob {
  const virgula = dataUrl.indexOf(',');
  const mime = /^data:([^;]+)/.exec(dataUrl)?.[1] ?? 'image/jpeg';
  const bin = atob(dataUrl.slice(virgula + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes as unknown as BlobPart], { type: mime });
}

export interface LoteCal {
  id: string;
  criadoEm: string;      // dd/mm/aaaa
  descricao: string;     // ex.: "Calibração inspeção 07/2026"
  /** Relatório (meta.codigo) a que o lote inteiro está vinculado. */
  relatorioId?: string;
  /** Fila: o próximo relatório salvo deste equipamento captura o lote. */
  vincularProximoRelatorio?: boolean;
}

const chaveComp = (tag: string) => `nr13_componentes_cal_${tag}`;
const chaveLotes = (tag: string) => `nr13_lotes_cal_${tag}`;

export function listarComponentes(tag: string): ComponenteCal[] {
  return ler<ComponenteCal[]>(chaveComp(tag)) ?? [];
}

export async function salvarComponente(tag: string, comp: ComponenteCal): Promise<void> {
  let final = comp;

  if (comp.fotoRef?.path) {
    // Já está no bucket. O `foto` que a tela porventura carregue é só o que ela
    // resolveu para exibir — zerado aqui para o peso não voltar ao app_storage.
    final = { ...comp, foto: '' };
  } else if (comp.foto?.startsWith('data:')) {
    try {
      const ref = await salvarArquivo(dataUrlParaBlob(comp.foto), 'componentes', 'jpg', 'image/jpeg');
      final = { ...comp, foto: '', fotoRef: ref };
    } catch {
      // Sem organização ativa ou cofre indisponível: grava o base64 como antes.
      // Pesado, porém salvo — perder a foto que o usuário acabou de tirar é o
      // único desfecho inaceitável aqui.
      final = comp;
    }
  }

  const lista = listarComponentes(tag);
  const i = lista.findIndex((c) => c.id === final.id);
  if (i >= 0) lista[i] = final;
  else lista.push(final);
  await salvar(chaveComp(tag), lista);
}

export async function excluirComponente(tag: string, id: string): Promise<void> {
  await salvar(chaveComp(tag), listarComponentes(tag).filter((c) => c.id !== id));
}

export function listarLotes(tag: string): LoteCal[] {
  return ler<LoteCal[]>(chaveLotes(tag)) ?? [];
}

export async function criarLote(tag: string, descricao?: string): Promise<LoteCal> {
  const lotes = listarLotes(tag);
  const agora = new Date();
  const lote: LoteCal = {
    id: `lote-${Date.now()}`,
    criadoEm: agora.toLocaleDateString('pt-BR'),
    descricao: descricao?.trim() || `Lote de calibração — ${agora.toLocaleDateString('pt-BR')}`,
  };
  lotes.unshift(lote);
  await salvar(chaveLotes(tag), lotes);
  return lote;
}

export async function excluirLote(tag: string, id: string): Promise<void> {
  await salvar(chaveLotes(tag), listarLotes(tag).filter((l) => l.id !== id));
}

export async function salvarLote(tag: string, lote: LoteCal): Promise<void> {
  const lotes = listarLotes(tag);
  const i = lotes.findIndex((l) => l.id === lote.id);
  if (i >= 0) lotes[i] = lote;
  else lotes.unshift(lote);
  await salvar(chaveLotes(tag), lotes);
}

/**
 * Captura os lotes marcados "vincular ao próximo relatório": recebem o id do
 * relatório recém-salvo e saem da fila. Chamado por salvarHistorico() em Relatórios.
 */
export async function vincularLotesPendentes(tag: string, relatorioId: string): Promise<void> {
  const lotes = listarLotes(tag);
  let mudou = false;
  for (const l of lotes) {
    if (l.vincularProximoRelatorio) {
      l.relatorioId = relatorioId;
      l.vincularProximoRelatorio = false;
      mudou = true;
    }
  }
  if (mudou) await salvar(chaveLotes(tag), lotes);
}

/**
 * Validades derivadas dos lotes vinculados, por relatório: menor dataProxCalibracao
 * por tipo de componente (psv → válvula, manômetro → manômetro). Vários lotes no
 * mesmo relatório: vale a menor data entre todos (o que vence primeiro).
 */
export function validadesPorRelatorio(tag: string): Map<string, { valvula?: string; manometro?: string }> {
  const mapa = new Map<string, { valvula?: string; manometro?: string }>();
  const lotes = listarLotes(tag).filter((l) => l.relatorioId);
  if (lotes.length === 0) return mapa;
  const cals = ler<Array<{ loteId?: string; tipo: 'manometro' | 'psv'; dataProxCalibracao?: string }>>(
    `nr13_calibracoes_${tag}`,
  ) ?? [];
  const ts = (d: string) => {
    const p = d.split('/');
    return p.length === 3 ? new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime() : NaN;
  };
  for (const lote of lotes) {
    const relId = lote.relatorioId!;
    const atual = mapa.get(relId) ?? {};
    for (const cal of cals) {
      if (cal.loteId !== lote.id || !cal.dataProxCalibracao) continue;
      const campo = cal.tipo === 'psv' ? 'valvula' : 'manometro';
      const antiga = atual[campo];
      if (!antiga || (!isNaN(ts(cal.dataProxCalibracao)) && ts(cal.dataProxCalibracao) < ts(antiga))) {
        atual[campo] = cal.dataProxCalibracao;
      }
    }
    mapa.set(relId, atual);
  }
  return mapa;
}
