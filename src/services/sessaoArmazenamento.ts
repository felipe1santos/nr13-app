/**
 * Ciclo de vida do armazenamento: troca de organização e logout.
 *
 * O ponto que este módulo protege é simples de enunciar e fácil de errar: dado
 * de uma organização não pode aparecer em outra, nem por um frame. Por isso a
 * troca zera o `Map` ANTES de qualquer coisa e só libera as telas depois de a
 * nova organização estar hidratada.
 *
 * E o oposto também vale: o banco local NÃO é apagado no logout. Pode haver
 * inspeção feita offline lá dentro, e apagá-la em silêncio destruiria trabalho
 * de campo. Apagar é ação explícita e separada.
 */
import * as cache from './cacheLocal';
import * as sync from './sync';
import { fecharDb, apagarDb } from './db';
import { liberarPalcoDestaAba } from './palco';
import { zerarFlagEmMemoria } from './flag';
import { classificar, type ErroSync } from './errosSync';

export type EstadoSessao = 'ocioso' | 'trocando' | 'pronto' | 'falhou';

let estado: EstadoSessao = 'ocioso';
let erroDaTroca: ErroSync | null = null;

export function estadoSessao(): EstadoSessao {
  return estado;
}

export function erroDaSessao(): ErroSync | null {
  return erroDaTroca;
}

/**
 * Enquanto verdadeiro, as telas não podem listar nem gravar.
 *
 * Durante a transição o `Map` está legitimamente vazio, e uma tela que lesse
 * ali concluiria "conta sem equipamentos" — o mesmo susto que este projeto
 * inteiro existe para eliminar. Falha na troca também mantém bloqueado: melhor
 * uma tela travada com erro visível do que uma tela vazia mentindo.
 */
export function bloqueadoParaUso(): boolean {
  return estado === 'trocando' || estado === 'falhou';
}

export function zerarEstadoSessao(): void {
  estado = 'ocioso';
  erroDaTroca = null;
}

/** Derruba tudo que é da organização atual, SEM tocar em disco. */
function soltarOrganizacaoAtual(): void {
  cache.zerarMemoria(); // Map da anterior morre primeiro
  liberarPalcoDestaAba(); // palco montado por ESTA aba
  sync.zerarFilaMemoria(); // só memória: o IndexedDB continua com a fila
  sync.zerarTombstonesMemoria();
  fecharDb(); // conexão da organização anterior
  cache.definirOrg(null);
  zerarFlagEmMemoria(); // a decisão v1/v2 é recalculada na próxima conta
}

/**
 * Troca a organização ativa. Sequência obrigatória, nesta ordem:
 * bloquear → soltar a anterior → definir a nova → hidratar → liberar.
 */
export async function trocarOrganizacao(
  novaOrg: string,
): Promise<{ ok: true } | { ok: false; erro: ErroSync }> {
  estado = 'trocando';
  erroDaTroca = null;

  soltarOrganizacaoAtual();

  try {
    cache.definirOrg(novaOrg);
    await cache.hidratarDoDisco();
    await sync.carregarFilaDoDisco();
    await sync.carregarTombstonesDoDisco();
    estado = 'pronto';
    return { ok: true };
  } catch (erro) {
    // Falhou: NÃO restaura a anterior. Voltar os dados de A numa tela que já
    // se diz de B é pior que ficar travado com o erro na cara.
    soltarOrganizacaoAtual();
    estado = 'falhou';
    erroDaTroca = classificar(erro, {
      chave: `organizacao:${novaOrg}`,
      mutationId: '—',
      dispositivo: '—',
      quando: new Date().toISOString(),
    });
    return { ok: false, erro: erroDaTroca };
  }
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
export type ResultadoSaida =
  | { pode: true }
  | { pode: false; pendencias: number; maisAntiga: string | null };

/**
 * Chamada ANTES do logout. Nunca sair em silêncio com pendência dentro: são
 * alterações que só existem neste aparelho e que a v1 não sabe drenar.
 */
export function podeSairSemPerder(): ResultadoSaida {
  const fila = sync.listarFila();
  if (fila.length === 0) return { pode: true };
  const datas = fila.map((i) => i.criadoEm).sort();
  return { pode: false, pendencias: fila.length, maisAntiga: datas[0] ?? null };
}

export type ResultadoLogout =
  | { ok: true; bancoPreservado: boolean }
  | { ok: false; motivo: 'pendencias'; pendencias: number; maisAntiga: string | null };

/**
 * Encerra a sessão do armazenamento.
 *
 * Com pendências, exige `confirmouPendencias: true` — e mesmo assim PRESERVA o
 * banco local. Apagar é `apagarBancoLocal()`, ação separada e explícita.
 */
export async function encerrarSessao(
  opcoes: { confirmouPendencias?: boolean; sincronizarAntes?: boolean } = {},
): Promise<ResultadoLogout> {
  if (opcoes.sincronizarAntes) {
    await sync.drenar();
  }

  const saida = podeSairSemPerder();
  if (!saida.pode && !opcoes.confirmouPendencias) {
    return {
      ok: false,
      motivo: 'pendencias',
      pendencias: saida.pendencias,
      maisAntiga: saida.maisAntiga,
    };
  }

  soltarOrganizacaoAtual();
  estado = 'ocioso';
  erroDaTroca = null;
  return { ok: true, bancoPreservado: true };
}

/**
 * Apaga o banco local de uma organização. AÇÃO EXPLÍCITA E SEPARADA — nunca
 * consequência de logout. Recusa se houver pendência, a menos que quem chama
 * confirme que aceita perder.
 */
export async function apagarBancoLocal(
  orgId: string,
  opcoes: { aceitoPerderPendencias?: boolean } = {},
): Promise<{ ok: boolean; motivo?: 'pendencias' }> {
  const saida = podeSairSemPerder();
  if (!saida.pode && !opcoes.aceitoPerderPendencias) {
    return { ok: false, motivo: 'pendencias' };
  }
  soltarOrganizacaoAtual();
  await apagarDb(orgId);
  estado = 'ocioso';
  return { ok: true };
}
