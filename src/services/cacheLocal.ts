/**
 * O cache de leitura do app: um `Map` em memória, espelhado no IndexedDB.
 *
 * POR QUE EXISTE: até 04/08/2026 o cache era o `localStorage`, com 5 MB para a
 * origem inteira. Medido em produção, a conta `cmam.caldeiras` precisava de
 * 5.692 KB e NENHUM dos seus 38 equipamentos conseguia entrar no cache — a
 * hidratação, ordenada por nome, estourava a cota dentro de `nr13_fotos_` e
 * nunca chegava em `nr13_info_`. Memória e IndexedDB não têm esse teto.
 *
 * `obterRegistro` é SÍNCRONO de propósito: `ler()` do storage.ts é síncrono e
 * tem ~50 pontos de chamada. Trocar a assinatura estava fora de escopo.
 *
 * ATOMICIDADE: `gravarAtomico` grava dado, item de fila e tombstone na MESMA
 * transação e só confirma no commit. Em caso de falha o `Map` volta ao estado
 * anterior — sem isso, fechar o navegador entre as duas escritas deixaria dado
 * sem fila (nunca sobe) ou fila sem dado (sobe lixo).
 */
import { aplicarAtomico, listarTudo, type Operacao } from './db';
import { tagDaChave } from './familiasChave';

export interface Registro {
  valor: string;
  versao: number;
  atualizadoEm: string;
  dispositivo: string | null;
}

export interface GravacaoDado {
  chave: string;
  registro: Registro;
}

export interface RemocaoDado {
  chave: string;
  remover: true;
}

/**
 * Item de fila, visto estruturalmente. Declarado assim, e não importado de
 * `sync.ts`, para manter a fronteira do módulo: o cacheLocal persiste a fila,
 * mas não conhece rede nem o que a fila significa.
 */
export interface ItemComId {
  mutationId: string;
}

const memoria = new Map<string, Registro>();

/**
 * Índice TAG -> chaves. Substitui o casamento por sufixo `_<TAG>` do
 * `excluirVaso`, que apagava o equipamento errado quando uma TAG era sufixo de
 * outra ("B" casava "nr13_info_A_B").
 */
const porTag = new Map<string, Set<string>>();

let orgId: string | null = null;
let canal: BroadcastChannel | null = null;

let pronto = false;
let resolverPronto: (() => void) | null = null;
let promessaPronto = novaPromessaPronto();

function novaPromessaPronto(): Promise<void> {
  return new Promise<void>((r) => {
    resolverPronto = r;
  });
}

function indexar(chave: string): void {
  const tag = tagDaChave(chave);
  if (!tag) return;
  if (!porTag.has(tag)) porTag.set(tag, new Set());
  porTag.get(tag)!.add(chave);
}

function desindexar(chave: string): void {
  const tag = tagDaChave(chave);
  if (!tag) return;
  const set = porTag.get(tag);
  if (!set) return;
  set.delete(chave);
  if (set.size === 0) porTag.delete(tag);
}

function aplicarNaMemoria(d: GravacaoDado | RemocaoDado): void {
  if ('remover' in d) {
    memoria.delete(d.chave);
    desindexar(d.chave);
  } else {
    memoria.set(d.chave, d.registro);
    indexar(d.chave);
  }
}

export function definirOrg(id: string | null): void {
  orgId = id;
  canal?.close();
  canal = null;
  if (!id || typeof BroadcastChannel === 'undefined') return;

  // Propagação entre abas: sem isto, a aba B seguiria mostrando dado velho
  // depois de a aba A gravar — e poderia sobrescrever com versão desatualizada.
  // O nome do canal leva a org, então abas de contas diferentes não se falam.
  canal = new BroadcastChannel(`nr13_cache_${id}`);
  canal.onmessage = (e: MessageEvent) => {
    const m = e.data as { tipo?: string; chave?: string; registro?: Registro };
    if (!m?.chave) return;
    if (m.tipo === 'gravado' && m.registro) aplicarNaMemoria({ chave: m.chave, registro: m.registro });
    else if (m.tipo === 'removido') aplicarNaMemoria({ chave: m.chave, remover: true });
  };
}

export function orgAtual(): string | null {
  return orgId;
}

export function obterRegistro(chave: string): Registro | null {
  return memoria.get(chave) ?? null;
}

export function chaves(): string[] {
  return [...memoria.keys()];
}

export function chavesComPrefixo(prefixo: string): string[] {
  return [...memoria.keys()].filter((c) => c.startsWith(prefixo));
}

export function chavesDaTag(tag: string): string[] {
  return [...(porTag.get(tag) ?? [])];
}

export function hidratado(): boolean {
  return pronto;
}

export function aguardarHidratacao(): Promise<void> {
  return promessaPronto;
}

/** Conteúdo inteiro do Map, no formato que `lerTudo()` devolve. */
export function snapshot(): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, reg] of memoria) saida[chave] = reg.valor;
  return saida;
}

export function zerarMemoria(): void {
  memoria.clear();
  porTag.clear();
  pronto = false;
  promessaPronto = novaPromessaPronto();
}

/**
 * Grava dados (e opcionalmente itens de fila e tombstones) numa transação só.
 *
 * O `Map` é atualizado ANTES, para as leituras síncronas enxergarem, e
 * REVERTIDO se o commit falhar: a UI só pode dizer "salvo" depois que esta
 * Promise resolve.
 */
export async function gravarAtomico(
  dados: Array<GravacaoDado | RemocaoDado>,
  fila: ItemComId[] = [],
  tombstones: Array<{ chave: string; valor: unknown }> = [],
): Promise<void> {
  if (!orgId) throw new Error('cacheLocal sem organização definida');

  const anterior = new Map<string, Registro | null>();
  for (const d of dados) anterior.set(d.chave, memoria.get(d.chave) ?? null);

  for (const d of dados) aplicarNaMemoria(d);

  const ops: Operacao[] = [
    ...dados.map(
      (d): Operacao =>
        'remover' in d
          ? { store: 'dados', acao: 'delete', chave: d.chave }
          : { store: 'dados', acao: 'put', chave: d.chave, valor: d.registro },
    ),
    ...fila.map((i): Operacao => ({ store: 'fila', acao: 'put', chave: i.mutationId, valor: i })),
    ...tombstones.map(
      (t): Operacao => ({ store: 'tombstones', acao: 'put', chave: t.chave, valor: t.valor }),
    ),
  ];

  try {
    await aplicarAtomico(orgId, ops);
  } catch (erro) {
    for (const [chave, reg] of anterior) {
      if (reg) aplicarNaMemoria({ chave, registro: reg });
      else aplicarNaMemoria({ chave, remover: true });
    }
    throw erro;
  }

  for (const d of dados) {
    canal?.postMessage(
      'remover' in d
        ? { tipo: 'removido', chave: d.chave }
        : { tipo: 'gravado', chave: d.chave, registro: d.registro },
    );
  }
}

/**
 * Aplica registro vindo do servidor SÓ se for mais novo que o local.
 * Uma linha antiga do servidor não pode sobrescrever uma edição local recente.
 */
export async function aplicarRemoto(chave: string, remoto: Registro): Promise<void> {
  const local = memoria.get(chave);
  if (local && local.versao >= remoto.versao) return;
  await gravarAtomico([{ chave, registro: remoto }]);
}

/** Repovoa a memória a partir do IndexedDB. É o caminho do boot 100% offline. */
export async function hidratarDoDisco(): Promise<number> {
  if (!orgId) return 0;
  const linhas = await listarTudo<Registro>(orgId, 'dados');
  for (const { chave, valor } of linhas) {
    memoria.set(chave, valor);
    indexar(chave);
  }
  pronto = true;
  resolverPronto?.();
  return linhas.length;
}
