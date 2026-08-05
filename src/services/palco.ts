/**
 * O palco: a única coisa que ainda vive no `localStorage`.
 *
 * Os 40+ templates HTML em iframe leem `localStorage` de forma síncrona no
 * DOMContentLoaded. Em vez de reescrevê-los, o app materializa ali só as chaves
 * do documento que está sendo aberto, monta os iframes, e limpa depois.
 *
 * O limite de 5 MB continua valendo NESTE espaço — por isso tudo é orçado ANTES
 * de escrever, e a escrita é tudo-ou-nada com restauração dos valores
 * anteriores. Relatório pela metade é pior que relatório recusado: sai impresso
 * com folha faltando e ninguém percebe.
 */
import { chavesDaTag, obterRegistro } from './cacheLocal';
import { classificar, type ErroSync } from './errosSync';
import {
  adquirirTrava,
  ehDono,
  liberarTrava,
  type ContextoMontagem,
  type DonoRegistrado,
} from './palcoTrava';

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------
/** Orçamento do documento. NÃO é o teto de 5 MB: o resto fica para a sessão. */
export const ORCAMENTO_DOC = 3_400 * 1024;
/** Teto por imagem já na variante de relatório. */
export const ORCAMENTO_IMG = 110 * 1024;
/** Reserva para o manifesto da montagem e a variação entre navegadores. */
export const MARGEM_METADADOS = 32 * 1024;
export const ORCAMENTO_EFETIVO = ORCAMENTO_DOC - MARGEM_METADADOS;

/**
 * Custo real no `localStorage`: chave + valor, em UTF-16 (2 bytes por unidade
 * de código). Contar só o valor, ou contar em UTF-8, subestima o consumo.
 */
export function tamanhoUtf16(chave: string, valor: string): number {
  return (chave.length + valor.length) * 2;
}

// ---------------------------------------------------------------------------
// Degradação
// ---------------------------------------------------------------------------
export interface PassoDegradacao {
  qualidade: number;
  /** `null` = mantém a largura original (só mexe na qualidade). */
  largura: number | null;
}

/** Ordem fixa e testável: três passos de qualidade, depois três de largura. */
export const PLANO_DEGRADACAO: readonly PassoDegradacao[] = [
  { qualidade: 0.6, largura: null },
  { qualidade: 0.45, largura: null },
  { qualidade: 0.35, largura: null },
  { qualidade: 0.35, largura: 900 },
  { qualidade: 0.35, largura: 700 },
  { qualidade: 0.35, largura: 560 },
];

export interface AdaptadorFoto {
  /** Devolve o valor da chave com as fotos recomprimidas no passo indicado. */
  recomprimir(valor: string, passo: PassoDegradacao): Promise<string>;
  /** Tamanho (UTF-16) da MAIOR foto dentro do valor. 0 se não houver foto. */
  maiorFoto(valor: string): number;
}

export function ehChaveDeFoto(chave: string): boolean {
  return chave.startsWith('nr13_fotos_');
}

// ---------------------------------------------------------------------------
// Conteúdo do palco
// ---------------------------------------------------------------------------
export interface ItemPalco {
  chave: string;
  valor: string;
}

/** Globais que os templates leem. */
const GLOBAIS = ['nr13_minha_empresa', 'nr13_lista_phs'];

/**
 * Chaves que NENHUM template HTML lê — confirmado por varredura em `public/`:
 * `nr13_docs_` é consumido só por código React. Levá-las gastaria o orçamento
 * com dado que ninguém renderiza.
 */
const FORA_DO_PALCO = ['nr13_docs_'];

export const CHAVE_MANIFESTO = 'nr13_palco_manifesto';

interface EntradaManifestoPalco {
  chave: string;
  existiaAntes: boolean;
}
interface ManifestoPalco {
  ctx: ContextoMontagem;
  chaves: EntradaManifestoPalco[];
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------
export type FalhaPalco =
  | { tipo: 'ocupado'; dono: DonoRegistrado | null }
  | {
      tipo: 'acima_do_orcamento';
      total: number;
      orcamento: number;
      maiores: Array<{ chave: string; bytes: number }>;
    }
  | { tipo: 'imagem_indegradavel'; chave: string; bytes: number; limite: number }
  | { tipo: 'erro_ao_resolver_imagem'; chave: string; erro: ErroSync }
  | { tipo: 'escrita_falhou'; chave: string; erro: ErroSync }
  | { tipo: 'rollback_falhou'; chave: string; erro: ErroSync };

export type ResultadoPalco = { ok: true; ctx: ContextoMontagem } | { ok: false; falha: FalhaPalco };

function erroTecnico(erro: unknown, chave: string): ErroSync {
  return classificar(erro, {
    chave,
    mutationId: '—',
    dispositivo: '—',
    quando: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Estado da montagem desta aba
// ---------------------------------------------------------------------------
interface Anterior {
  chave: string;
  valor: string | null;
}

let montagem: { ctx: ContextoMontagem; anteriores: Anterior[] } | null = null;

export function zerarMontagemEmMemoria(): void {
  montagem = null;
}

// ---------------------------------------------------------------------------
// Orçamento e degradação
// ---------------------------------------------------------------------------
export function orcar(
  itens: ItemPalco[],
): { cabe: true; total: number } | Extract<FalhaPalco, { tipo: 'acima_do_orcamento' }> {
  const total = itens.reduce((s, i) => s + tamanhoUtf16(i.chave, i.valor), 0);
  if (total <= ORCAMENTO_EFETIVO) return { cabe: true, total };
  return {
    tipo: 'acima_do_orcamento',
    total,
    orcamento: ORCAMENTO_EFETIVO,
    maiores: itens
      .map((i) => ({ chave: i.chave, bytes: tamanhoUtf16(i.chave, i.valor) }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

/**
 * Aplica os passos até o documento caber E nenhuma foto passar do teto por
 * imagem. Recomprime SÓ chaves de foto: degradar o JSON do memorial não
 * economizaria nada e corromperia o documento.
 *
 * NÃO altera o original: trabalha sobre cópias e devolve itens novos. A foto
 * degradada existe só para o palco — o Map, o IndexedDB e o Supabase seguem com
 * a original.
 */
export async function degradarAteCaber(
  itens: ItemPalco[],
  foto: AdaptadorFoto,
): Promise<{ cabe: true; itens: ItemPalco[]; total: number } | { cabe: false; falha: FalhaPalco }> {
  let atuais = itens.map((i) => ({ ...i }));

  const avaliar = (): { cabe: boolean; falha?: FalhaPalco } => {
    const orcamento = orcar(atuais);
    if (!('cabe' in orcamento)) return { cabe: false, falha: orcamento };

    for (const item of atuais) {
      if (!ehChaveDeFoto(item.chave)) continue;
      const maior = foto.maiorFoto(item.valor);
      if (maior > ORCAMENTO_IMG) {
        return {
          cabe: false,
          falha: { tipo: 'imagem_indegradavel', chave: item.chave, bytes: maior, limite: ORCAMENTO_IMG },
        };
      }
    }
    return { cabe: true };
  };

  let veredito = avaliar();
  if (veredito.cabe) return { cabe: true, itens: atuais, total: orcar(atuais).total ?? 0 };

  for (const passo of PLANO_DEGRADACAO) {
    const proximos: ItemPalco[] = [];
    for (const item of atuais) {
      if (!ehChaveDeFoto(item.chave)) {
        proximos.push(item);
        continue;
      }
      try {
        proximos.push({ chave: item.chave, valor: await foto.recomprimir(item.valor, passo) });
      } catch (erro) {
        // Falha ao resolver/recomprimir uma imagem é reportada com a chave —
        // seguir em silêncio produziria um documento sem a foto.
        return {
          cabe: false,
          falha: { tipo: 'erro_ao_resolver_imagem', chave: item.chave, erro: erroTecnico(erro, item.chave) },
        };
      }
    }
    atuais = proximos;

    veredito = avaliar();
    if (veredito.cabe) {
      const o = orcar(atuais);
      return { cabe: true, itens: atuais, total: 'cabe' in o ? o.total : 0 };
    }
  }

  return { cabe: false, falha: veredito.falha! };
}

// ---------------------------------------------------------------------------
// Materialização atômica
// ---------------------------------------------------------------------------
/**
 * Escreve tudo ou nada. Os valores ANTERIORES são guardados antes da primeira
 * escrita e restaurados exatamente em caso de falha: remover as chaves gravadas
 * não bastaria, porque uma chave global como `nr13_minha_empresa` pode já
 * existir e seria perdida.
 */
export function materializar(
  ctx: ContextoMontagem,
  itens: ItemPalco[],
): { ok: true } | { ok: false; falha: FalhaPalco } {
  const anteriores: Anterior[] = [];

  for (const item of itens) {
    anteriores.push({ chave: item.chave, valor: localStorage.getItem(item.chave) });
    try {
      localStorage.setItem(item.chave, item.valor);
    } catch (erro) {
      const falhaEscrita = erroTecnico(erro, item.chave);
      // Rollback: restaura o que existia e remove só o que criamos.
      for (const a of anteriores) {
        try {
          if (a.valor === null) localStorage.removeItem(a.chave);
          else localStorage.setItem(a.chave, a.valor);
        } catch (erroRollback) {
          return {
            ok: false,
            falha: { tipo: 'rollback_falhou', chave: a.chave, erro: erroTecnico(erroRollback, a.chave) },
          };
        }
      }
      return { ok: false, falha: { tipo: 'escrita_falhou', chave: item.chave, erro: falhaEscrita } };
    }
  }

  const manifesto: ManifestoPalco = {
    ctx,
    chaves: anteriores.map((a) => ({ chave: a.chave, existiaAntes: a.valor !== null })),
  };
  try {
    localStorage.setItem(CHAVE_MANIFESTO, JSON.stringify(manifesto));
  } catch (erro) {
    for (const a of anteriores) {
      if (a.valor === null) localStorage.removeItem(a.chave);
      else localStorage.setItem(a.chave, a.valor);
    }
    return { ok: false, falha: { tipo: 'escrita_falhou', chave: CHAVE_MANIFESTO, erro: erroTecnico(erro, CHAVE_MANIFESTO) } };
  }

  montagem = { ctx, anteriores };
  return { ok: true };
}

function lerManifestoPalco(): ManifestoPalco | null {
  try {
    const cru = localStorage.getItem(CHAVE_MANIFESTO);
    if (!cru) return null;
    const m = JSON.parse(cru) as ManifestoPalco;
    return Array.isArray(m?.chaves) && m?.ctx ? m : null;
  } catch {
    return null; // manifesto corrompido: não sai apagando a esmo
  }
}

/**
 * Limpa o palco. SÓ o dono exato (org + aba + relatório + TAG + nonce) pode, e
 * só as chaves registradas na montagem atual — nunca varredura por prefixo.
 *
 * Com o snapshot em memória (mesma aba, mesma sessão), restaura os valores
 * anteriores. Sem ele — a página recarregou —, remove apenas o que a montagem
 * criou e DEIXA intactas as chaves que já existiam antes: apagá-las seria pior
 * que deixá-las, e o dado verdadeiro segue no cache.
 */
export function limparPalco(ctx: ContextoMontagem): { ok: boolean; motivo?: 'nao_e_dono' } {
  if (!ehDono(ctx)) return { ok: false, motivo: 'nao_e_dono' };

  if (montagem && montagem.ctx.nonce === ctx.nonce) {
    for (const a of montagem.anteriores) {
      if (a.valor === null) localStorage.removeItem(a.chave);
      else localStorage.setItem(a.chave, a.valor);
    }
  } else {
    const m = lerManifestoPalco();
    if (m && m.ctx.nonce === ctx.nonce) {
      for (const e of m.chaves) if (!e.existiaAntes) localStorage.removeItem(e.chave);
    }
  }

  localStorage.removeItem(CHAVE_MANIFESTO);
  montagem = null;
  liberarTrava(ctx);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Montagem completa
// ---------------------------------------------------------------------------
/** Coleta as chaves que os templates realmente leem para a TAG aberta. */
export function coletarItens(tag: string): ItemPalco[] {
  const chaves = [...chavesDaTag(tag), ...GLOBAIS].filter(
    (c) => !FORA_DO_PALCO.some((p) => c.startsWith(p)),
  );
  const itens: ItemPalco[] = [];
  for (const chave of chaves) {
    const reg = obterRegistro(chave);
    if (reg) itens.push({ chave, valor: reg.valor });
  }
  return itens;
}

/**
 * Fluxo completo: trava → coleta → degrada → orça → materializa.
 * Só devolve `ok: true` depois de TUDO confirmado. Quem chama não pode montar
 * iframe nenhum antes disso.
 */
export async function montarPalcoDaTag(
  ctx: ContextoMontagem,
  foto: AdaptadorFoto,
  opcoes: { esperaMs?: number } = {},
): Promise<ResultadoPalco> {
  const trava = await adquirirTrava(ctx, opcoes);
  if (!trava.obtida) return { ok: false, falha: { tipo: 'ocupado', dono: trava.dono } };

  const brutos = coletarItens(ctx.tag);
  const degradado = await degradarAteCaber(brutos, foto);
  if (!degradado.cabe) {
    liberarTrava(ctx);
    return { ok: false, falha: degradado.falha };
  }

  const escrita = materializar(ctx, degradado.itens);
  if (!escrita.ok) {
    liberarTrava(ctx);
    return { ok: false, falha: escrita.falha };
  }

  return { ok: true, ctx };
}
