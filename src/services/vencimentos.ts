import { ler, listarChavesComPrefixo } from './storage';
import type { InfoEquipamento } from '../features/equipamento/tipos';
import type { DadosCalibracao } from '../features/calibracoes/tipos';

/**
 * Motor de vencimentos: deriva prazos SOMENTE de dados já salvos no sistema.
 *  - Equipamentos: card "Vida Remanescente" (nr13_vida_<TAG> → próxima inspeção)
 *  - Acessórios:   calibrações (nr13_calibracoes_<TAG> → dataProxCalibracao),
 *                  sempre com a TAG do equipamento a que pertencem.
 * Nada é inventado: sem dado salvo, o item aparece como 'semPrazo'.
 */
export interface ItemVencimento {
  tag: string;
  nome: string;
  tipoEquip: string;                 // rótulo humano ('Vaso de Pressão', 'Manômetro'…)
  origem: 'inspecao' | 'calibracao';
  pertenceA?: string;                // TAG pai (acessórios de calibração)
  ultima?: Date;
  vencimento?: Date;
  dias?: number;                     // dias restantes (negativo = vencido)
  status: 'crit' | 'warn' | 'ok' | 'semPrazo';
}

const MS_DIA = 86_400_000;

/** Aceita 'dd/mm/aaaa' e 'aaaa-mm-dd' (formatos usados nos dados salvos). */
export function parseDataFlex(s: string | undefined | null): Date | null {
  if (!s) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function statusPrazo(venc: Date, hoje: Date): { dias: number; status: 'crit' | 'warn' | 'ok' } {
  const dias = Math.floor((venc.getTime() - hoje.getTime()) / MS_DIA);
  if (dias < 0) return { dias, status: 'crit' };
  if (dias <= 30) return { dias, status: 'warn' };
  return { dias, status: 'ok' };
}

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

interface VidaSalva {
  entrada?: { dataAtual?: string };
  proximaInspecaoAnos?: number | null;
  calculadoEm?: string;
}

export function listarVencimentos(hoje: Date = new Date()): ItemVencimento[] {
  const itens: ItemVencimento[] = [];
  const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  // ── Equipamentos (via vida remanescente salva na ficha) ──
  for (const chave of listarChavesComPrefixo('nr13_info_')) {
    try {
      const tag = chave.slice('nr13_info_'.length);
      const info = ler<InfoEquipamento>(chave);
      if (!info) continue;
      const nome = info.descricao?.trim() || ROTULO_TIPO[info.tipo] || 'Equipamento';
      const tipoEquip = ROTULO_TIPO[info.tipo] ?? 'Equipamento';

      const vida = ler<VidaSalva>(`nr13_vida_${tag}`);
      const base = parseDataFlex(vida?.entrada?.dataAtual) ?? parseDataFlex(vida?.calculadoEm);
      const anos = vida?.proximaInspecaoAnos;

      if (vida && base && typeof anos === 'number' && anos >= 0) {
        const venc = new Date(base);
        venc.setMonth(venc.getMonth() + Math.round(anos * 12));
        const { dias, status } = statusPrazo(venc, hojeZero);
        itens.push({ tag, nome, tipoEquip, origem: 'inspecao', ultima: base, vencimento: venc, dias, status });
      } else {
        itens.push({ tag, nome, tipoEquip, origem: 'inspecao', status: 'semPrazo' });
      }

      // ── Acessórios do equipamento (calibrações) ──
      // Com lotes, o mesmo componente acumula certificados a cada inspeção:
      // só a calibração MAIS RECENTE de cada componente conta para o prazo.
      const todas = ler<DadosCalibracao[]>(`nr13_calibracoes_${tag}`) ?? [];
      const porComponente = new Map<string, DadosCalibracao>();
      for (const cal of todas) {
        const chaveComp = (cal as { componenteId?: string }).componenteId ?? `nome:${cal.nome ?? cal.id}`;
        const atual = porComponente.get(chaveComp);
        const dNova = parseDataFlex(cal.dataProxCalibracao)?.getTime() ?? 0;
        const dAtual = atual ? (parseDataFlex(atual.dataProxCalibracao)?.getTime() ?? 0) : -1;
        if (!atual || dNova >= dAtual) porComponente.set(chaveComp, cal);
      }
      const cals = [...porComponente.values()];
      for (const cal of cals) {
        try {
          const venc = parseDataFlex(cal.dataProxCalibracao);
          const ultima = parseDataFlex(cal.dataCalibracao) ?? undefined;
          const nomeAc = cal.nome?.trim() || (cal.tipo === 'psv' ? 'Válvula de Segurança' : 'Manômetro');
          const tipoAc = cal.tipo === 'psv' ? 'Válvula de Segurança' : 'Manômetro';
          if (venc) {
            const { dias, status } = statusPrazo(venc, hojeZero);
            itens.push({
              tag: cal.serie ? `${tipoAc.split(' ')[0].toUpperCase()}-${cal.serie}` : nomeAc,
              nome: nomeAc, tipoEquip: tipoAc, origem: 'calibracao', pertenceA: tag,
              ultima, vencimento: venc, dias, status,
            });
          }
        } catch { /* item malformado: ignora */ }
      }
    } catch { /* chave malformada: ignora */ }
  }

  // Ordena: vencidos primeiro, depois por dias restantes; semPrazo por último.
  itens.sort((a, b) => {
    if (a.status === 'semPrazo' && b.status !== 'semPrazo') return 1;
    if (b.status === 'semPrazo' && a.status !== 'semPrazo') return -1;
    return (a.dias ?? Infinity) - (b.dias ?? Infinity);
  });
  return itens;
}

export function resumoKpis(itens: ItemVencimento[], totalEquip: number): {
  total: number; aVencer30: number; vencidos: number; conformidade: number;
} {
  const comPrazo = itens.filter((i) => i.status !== 'semPrazo');
  const vencidos = comPrazo.filter((i) => i.status === 'crit').length;
  const aVencer30 = comPrazo.filter((i) => i.status === 'warn').length;
  const conformidade = comPrazo.length === 0 ? 100 : Math.round(((comPrazo.length - vencidos) / comPrazo.length) * 1000) / 10;
  return { total: totalEquip, aVencer30, vencidos, conformidade };
}

/** Texto humano do prazo ("Vencido há 2 dias" / "Vence em 3 dias" / "Vence hoje"). */
export function textoPrazo(item: ItemVencimento): string {
  if (item.dias === undefined) return 'Sem prazo cadastrado';
  if (item.dias < 0) return `Vencido há ${Math.abs(item.dias)} dia${Math.abs(item.dias) === 1 ? '' : 's'}`;
  if (item.dias === 0) return 'Vence hoje';
  return `Vence em ${item.dias} dia${item.dias === 1 ? '' : 's'}`;
}
