/**
 * Manifesto de pendências: lista minúscula de METADADOS mantida no
 * `localStorage` para detectar que o IndexedDB foi despejado com alterações
 * ainda não sincronizadas dentro.
 *
 * LIMITE ASSUMIDO — não é um detalhe, é o contrato:
 * isto só funciona quando o IndexedDB é despejado ISOLADAMENTE (pressão de
 * cota, limpeza automática do navegador) e o `localStorage` sobrevive. Se o
 * usuário limpar TODOS os dados do site, os dois vão junto e o manifesto vai
 * junto com eles. Nesse caso o app só pode dar um alerta genérico — inventar
 * quais itens se perderam seria mentir. A proteção real contra esse cenário é
 * a janela curta de sincronização, não a detecção.
 *
 * NÃO IMPORTA `sync.ts`: recebe a fila por parâmetro. Sem isso haveria ciclo
 * (sync → manifesto → sync), e o manifesto passaria a conhecer o que não é da
 * conta dele.
 */
import { orgAtual, hidratado } from './cacheLocal';
import { classificar, type ErroSync } from './errosSync';

const PREFIXO = 'nr13_manifesto_pendencias_';

/** O que o manifesto aceita como entrada. NUNCA carrega o valor da mutação. */
export interface PendenciaResumida {
  mutationId: string;
  chave: string;
  criadoEm: string;
  dispositivo: string;
}

/** O que fica gravado. Só metadados: nada de valor, JSON, foto ou credencial. */
export interface EntradaManifesto {
  mutationId: string;
  chave: string;
  criadoEm: string;
  orgId: string;
  dispositivo: string;
}

export type LeituraManifesto =
  | { tipo: 'ausente' }
  | { tipo: 'invalido' }
  | { tipo: 'lido'; entradas: EntradaManifesto[] };

export type Diagnostico =
  | { tipo: 'ok' }
  | { tipo: 'nao_avaliado'; motivo: 'sem_organizacao' | 'nao_hidratado' }
  | { tipo: 'despejo_detectado'; perdidos: EntradaManifesto[] }
  | { tipo: 'estado_zerado' }
  | { tipo: 'manifesto_invalido' };

// O manifesto é diagnóstico, não dado: falhar ao gravá-lo não pode derrubar o
// salvamento. Mas também não pode sumir em `catch {}` — o erro fica aqui.
let ultimoErro: ErroSync | null = null;

export function erroDoManifesto(): ErroSync | null {
  return ultimoErro;
}

export function limparErroDoManifesto(): void {
  ultimoErro = null;
}

function registrarFalha(erro: unknown, chave: string): void {
  ultimoErro = classificar(erro, {
    chave,
    mutationId: '—',
    dispositivo: '—',
    quando: new Date().toISOString(),
  });
}

const chaveDe = (orgId: string) => `${PREFIXO}${orgId}`;

/** Copia APENAS os campos permitidos — qualquer extra é descartado aqui. */
function sanitizar(p: PendenciaResumida, orgId: string): EntradaManifesto {
  return {
    mutationId: p.mutationId,
    chave: p.chave,
    criadoEm: p.criadoEm,
    orgId,
    dispositivo: p.dispositivo,
  };
}

export function lerManifestoBruto(orgId: string): LeituraManifesto {
  let cru: string | null;
  try {
    cru = localStorage.getItem(chaveDe(orgId));
  } catch (erro) {
    registrarFalha(erro, chaveDe(orgId));
    return { tipo: 'invalido' };
  }
  if (cru === null) return { tipo: 'ausente' };

  try {
    const parsed: unknown = JSON.parse(cru);
    // Conteúdo corrompido NÃO vira lista vazia: lista vazia significa "nada
    // pendente", que é justamente a conclusão errada e tranquilizadora.
    if (!Array.isArray(parsed)) return { tipo: 'invalido' };
    const entradas = parsed.filter(
      (e): e is EntradaManifesto =>
        typeof e === 'object' && e !== null && typeof (e as EntradaManifesto).mutationId === 'string',
    );
    if (entradas.length !== parsed.length) return { tipo: 'invalido' };
    return { tipo: 'lido', entradas: entradas.filter((e) => e.orgId === orgId) };
  } catch {
    return { tipo: 'invalido' };
  }
}

function gravar(orgId: string, entradas: EntradaManifesto[]): void {
  try {
    localStorage.setItem(chaveDe(orgId), JSON.stringify(entradas));
  } catch (erro) {
    // A proteção real é o IndexedDB + a fila; o manifesto é diagnóstico.
    registrarFalha(erro, chaveDe(orgId));
  }
}

/**
 * Acrescenta pendências ao manifesto, por UNIÃO com o que já está gravado.
 *
 * Merge e não sobrescrita porque o `localStorage` é compartilhado entre abas e
 * cada aba só enxerga a própria memória. Sobrescrever com a visão parcial de
 * uma aba apagaria as pendências que a outra conhece.
 */
export function registrarPendencias(itens: PendenciaResumida[]): void {
  const org = orgAtual();
  if (!org) return;

  const atual = lerManifestoBruto(org);
  const base = atual.tipo === 'lido' ? atual.entradas : [];
  const porId = new Map(base.map((e) => [e.mutationId, e]));
  for (const item of itens) porId.set(item.mutationId, sanitizar(item, org));

  gravar(org, [...porId.values()]);
}

/** Tira UMA pendência confirmada, preservando as das outras abas. */
export function removerPendencia(mutationId: string): void {
  const org = orgAtual();
  if (!org) return;

  const atual = lerManifestoBruto(org);
  if (atual.tipo !== 'lido') return;
  gravar(
    org,
    atual.entradas.filter((e) => e.mutationId !== mutationId),
  );
}

/**
 * Troca o manifesto inteiro. Só deve ser usada com a visão AUTORITATIVA — a que
 * vem do IndexedDB, que é compartilhado entre as abas da mesma organização.
 * Lista vazia aqui significa "fila confirmadamente vazia".
 */
export function substituirManifesto(itens: PendenciaResumida[]): void {
  const org = orgAtual();
  if (!org) return;
  gravar(
    org,
    itens.map((i) => sanitizar(i, org)),
  );
}

/**
 * Avalia se houve perda. Só responde depois do boot completo: organização
 * definida e hidratação concluída. No meio do boot a fila está legitimamente
 * vazia, e concluir "estado zerado" ali seria um alarme falso a cada abertura.
 *
 * `temDadosNoServidor` vem de quem hidratou (lerTudo): é o que distingue conta
 * nova de conta que perdeu o cache.
 */
export function diagnosticarPerda(
  filaAtual: PendenciaResumida[],
  temDadosNoServidor: boolean,
): Diagnostico {
  const org = orgAtual();
  if (!org) return { tipo: 'nao_avaliado', motivo: 'sem_organizacao' };
  if (!hidratado()) return { tipo: 'nao_avaliado', motivo: 'nao_hidratado' };

  const manifesto = lerManifestoBruto(org);
  if (manifesto.tipo === 'invalido') return { tipo: 'manifesto_invalido' };

  if (manifesto.tipo === 'ausente') {
    // Sem manifesto: ou é o primeiro uso, ou a limpeza total do site levou tudo.
    // Só há motivo de alarme se o servidor tem dados e o local está zerado — e
    // aí não há como enumerar o que se perdeu.
    return temDadosNoServidor && filaAtual.length === 0
      ? { tipo: 'estado_zerado' }
      : { tipo: 'ok' };
  }

  const naFila = new Set(filaAtual.map((i) => i.mutationId));
  const perdidos = manifesto.entradas.filter((e) => !naFila.has(e.mutationId));
  return perdidos.length > 0 ? { tipo: 'despejo_detectado', perdidos } : { tipo: 'ok' };
}
