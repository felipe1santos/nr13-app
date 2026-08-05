/**
 * Trava de escrita: Portal do Cliente OU assinatura suspensa.
 *
 * Compartilhada pelas duas implementações de armazenamento (v1 e v2). Lê direto
 * do `localStorage`, e não de auth.ts/assinatura.ts, para evitar import circular
 * (auth.ts → storage.ts).
 *
 * A regra de rebaixamento por data replica `statusEfetivo()` de
 * `src/features/assinatura/maquinaEstados.ts`: `ate` nulo/ausente = sem
 * vencimento, nunca rebaixa; `ate` no passado bloqueia mesmo com status "ativa".
 * FAIL-CLOSED em data corrompida: um `ate` que não vira Date válida também
 * bloqueia — data ilegível não prova que a assinatura está em dia.
 */
export function bloqueadoParaEscrita(): boolean {
  try {
    if ((localStorage.getItem('nr13_papel') || '') === 'cliente') return true;
    const status = localStorage.getItem('nr13_assinatura_status') || '';
    if (status === 'somente_leitura') return true;
    if (status) {
      const ate = localStorage.getItem('nr13_assinatura_ate');
      if (ate) {
        const t = new Date(ate).getTime();
        if (!Number.isFinite(t) || t <= Date.now()) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Escrita recusada por assinatura/papel.
 *
 * Até 04/08/2026 este caminho gravava no cache e retornava em silêncio: a tela
 * dizia "salvo", o reconcile apagava 60s depois e o dado sumia. Agora a
 * gravação falha alto e NADA é persistido — nem Map, nem IndexedDB, nem fila.
 */
export class ErroBloqueado extends Error {
  constructor() {
    super('Alteração não salva: assinatura suspensa ou acesso somente leitura.');
    this.name = 'ErroBloqueado';
  }
}
