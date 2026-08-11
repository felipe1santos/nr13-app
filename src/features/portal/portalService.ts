// Serviço do Portal do Cliente. O cliente NÃO usa lerTudo() (que puxaria a org
// inteira): chama a Edge Function `portal_cliente`, que devolve SOMENTE as chaves
// dos ativos vinculados ao cliente + globais liberadas (logo da executante etc.).
// As chaves são hidratadas no localStorage para os templates HTML (iframes de
// relatório/prontuário) funcionarem em modo leitura, igual no sistema interno.
import { supabase } from '../../services/supabase';
import type { InfoEquipamento } from '../../features/equipamento/tipos';
import { ler } from '../../services/storage';
import type { FotoArmazenada, RefFoto } from '../../services/fotos';

export interface AtivoPortal {
  tag: string;
  info: InfoEquipamento | null;
  fotoCapa: FotoArmazenada | null;
  categoria: string | null;
  pmta: string | null;
  resultado: string | null;
}

export async function carregarDadosPortal(): Promise<{ tags: string[] }> {
  const { data, error } = await supabase.functions.invoke('portal_cliente', { body: {} });
  if (error) throw new Error(error.message || 'Falha ao carregar o portal');
  if (data?.erro) throw new Error(String(data.erro));
  const chaves = (data?.chaves ?? {}) as Record<string, string>;
  for (const [chave, valor] of Object.entries(chaves)) {
    try {
      localStorage.setItem(chave, valor);
    } catch {
      // cota: segue com as demais
    }
  }
  return { tags: (data?.tags as string[]) ?? [] };
}

export function montarAtivos(tags: string[]): AtivoPortal[] {
  return tags.map((tag) => {
    const info = ler<InfoEquipamento>(`nr13_info_${tag}`);
    const fotos = ler<{ src: string; ref?: RefFoto; isCapa: boolean }[]>(`nr13_fotos_${tag}`) || [];
    const capa = fotos.find((f) => f.isCapa) ?? fotos[0] ?? null;
    const cat = ler<{ catFinal?: string }>(`nr13_cat_${tag}`);
    const calc = ler<{ pmta?: string; resultado?: string }>(`nr13_calc_${tag}`);
    return {
      tag,
      info,
      fotoCapa: capa ? { ref: capa.ref, base64: capa.src } : null,
      categoria: cat?.catFinal ?? null,
      pmta: calc?.pmta ?? null,
      resultado: calc?.resultado ?? null,
    };
  });
}
