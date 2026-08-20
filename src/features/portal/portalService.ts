// Serviço do Portal do Cliente. O cliente NÃO usa lerTudo() (que puxaria a org
// inteira): chama a Edge Function `portal_cliente`, que devolve SOMENTE as chaves
// dos ativos vinculados ao cliente + globais liberadas (logo da executante etc.).
// As chaves são hidratadas no localStorage para os templates HTML (iframes de
// relatório/prontuário) funcionarem em modo leitura, igual no sistema interno.
import { supabase } from '../../services/supabase';
import type { InfoEquipamento } from '../../features/equipamento/tipos';
import { ler, semearCachePortal } from '../../services/storage';
import type { FotoArmazenada, RefFoto } from '../../services/fotos';

export interface AtivoPortal {
  tag: string;
  info: InfoEquipamento | null;
  fotoCapa: FotoArmazenada | null;
  categoria: string | null;
  pmta: string | null;
  resultado: string | null;
}

export async function carregarDadosPortal(): Promise<{ tags: string[]; falhasDeCota: number }> {
  const { data, error } = await supabase.functions.invoke('portal_cliente', { body: {} });
  if (error) throw new Error(error.message || 'Falha ao carregar o portal');
  if (data?.erro) throw new Error(String(data.erro));
  const chaves = (data?.chaves ?? {}) as Record<string, string>;

  // 1. CACHE — é daqui que TODA tela do Portal lê, via `ler()`.
  //
  // Até a Fase 0-B o Portal lia do `Map` hidratado por `RotaProtegida`, que
  // baixava a organização INTEIRA. Agora o cliente não hidrata (ver o comentário
  // lá) e o que ele enxerga é exatamente o que a Edge devolveu — filtrado no
  // servidor pelos ativos vinculados a ele.
  await semearCachePortal(chaves);

  // 2. localStorage — para os templates HTML em iframe, que leem de forma
  // síncrona no DOMContentLoaded e não sabem nada de `Map`.
  //
  // A falha de cota deixou de ser engolida: antes, estourar os 5 MB fazia as
  // chaves seguintes sumirem sem erro, sem log e sem aviso, e o cliente via um
  // ativo pela metade. Agora ela é contada e reportada — documento incompleto é
  // pior que documento recusado (mesma regra do palco, I-23).
  const falhas: string[] = [];
  for (const [chave, valor] of Object.entries(chaves)) {
    try {
      localStorage.setItem(chave, valor);
    } catch {
      falhas.push(chave);
    }
  }
  if (falhas.length > 0) {
    console.error(
      `[portal] ${falhas.length} chave(s) não couberam no armazenamento do navegador.`,
      falhas.slice(0, 10),
    );
    // FALHA DE COTA É ERRO, NÃO AVISO (Fase 4).
    //
    // Antes isto só logava e o Portal seguia abrindo. O resultado era o pior desfecho
    // possível: o cliente via um ativo sem o documento e concluía que ele não existe — não
    // que faltou espaço. É a mesma regra do palco (I-23): documento recusado é melhor que
    // documento incompleto, porque o incompleto ninguém percebe.
    throw new ErroCotaPortal(falhas.length);
  }

  return { tags: (data?.tags as string[]) ?? [], falhasDeCota: 0 };
}

/** Cota do navegador estourou ao materializar as chaves para os templates. */
export class ErroCotaPortal extends Error {
  readonly quantidade: number;
  constructor(quantidade: number) {
    super(
      `Não foi possível carregar ${quantidade === 1 ? 'um documento' : `${quantidade} documentos`} — ` +
        'o armazenamento do navegador está cheio. Feche outras abas do sistema e recarregue a página.',
    );
    this.name = 'ErroCotaPortal';
    this.quantidade = quantidade;
  }
}

/**
 * Busca UMA chave sob demanda, pela mesma Edge e com a mesma autorização.
 *
 * Existe porque a carga inicial deixou de mandar o `RelatorioSalvo` completo
 * (`nr13_rel_<id>_<TAG>`, ~9,3 KB) — a listagem só precisa do índice. O registro completo é
 * necessário apenas quando o cliente abre um relatório **legado**, sem `pdfRef`: o com
 * artefato serve o PDF direto e não usa `meta` nem `documentos` (§7-quater).
 *
 * A Edge revalida a chave contra as TAGs do cliente lidas do BANCO. O que vai daqui é só
 * "qual chave", nunca "de quem ela é".
 *
 * Devolve `null` quando a chave não existe ou não é do cliente — a Edge não distingue os dois
 * casos de propósito (mesma razão da D-26).
 */
export async function buscarChaveSobDemanda(chave: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('portal_cliente', {
    body: { chaves: [chave] },
  });
  if (error) throw new Error(error.message || 'Falha ao carregar o documento');
  const achadas = (data?.chaves ?? {}) as Record<string, string>;
  const valor = achadas[chave];
  if (typeof valor !== 'string') return null;
  // Deposita no cache para que `ler()` e os templates enxerguem, igual à carga inicial.
  await semearCachePortal({ [chave]: valor });
  try {
    localStorage.setItem(chave, valor);
  } catch {
    throw new ErroCotaPortal(1);
  }
  return valor;
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
