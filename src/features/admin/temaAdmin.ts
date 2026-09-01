/**
 * Tema do Painel Admin (escuro/claro), lembrado por aparelho.
 *
 * Fica no `localStorage` e não no perfil do Supabase de propósito: é preferência
 * de VISUALIZAÇÃO, não dado de negócio. Gravar no servidor custaria uma coluna,
 * uma migração e uma ida à rede para decidir a cor de uma tela — e ainda
 * imporia o tema do notebook ao celular do mesmo dono.
 *
 * O padrão é ESCURO: é o tema para o qual o painel foi desenhado (§ paleta do
 * `admin-tema.css`), e o claro é a variante.
 */

export type TemaAdmin = 'escuro' | 'claro';

export const CHAVE_TEMA = 'nr13_admin_tema';
export const TEMA_PADRAO: TemaAdmin = 'escuro';

export function ehTemaValido(v: unknown): v is TemaAdmin {
  return v === 'escuro' || v === 'claro';
}

export function proximoTema(t: TemaAdmin): TemaAdmin {
  return t === 'escuro' ? 'claro' : 'escuro';
}

/**
 * Lê o tema salvo. Valor ausente, corrompido ou de uma versão anterior cai no
 * padrão — nunca lança. Em navegador com armazenamento bloqueado (aba anônima
 * restrita, política de site), o próprio `getItem` pode lançar, e um painel que
 * não abre por causa da cor seria um defeito bem pior que perder a preferência.
 */
export function lerTema(store: Pick<Storage, 'getItem'> = localStorage): TemaAdmin {
  try {
    const v = store.getItem(CHAVE_TEMA);
    return ehTemaValido(v) ? v : TEMA_PADRAO;
  } catch {
    return TEMA_PADRAO;
  }
}

/** Grava o tema. Falha de armazenamento é ignorada pelo mesmo motivo. */
export function gravarTema(t: TemaAdmin, store: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    store.setItem(CHAVE_TEMA, t);
  } catch {
    /* preferência não persistida — a sessão atual segue com o tema escolhido */
  }
}
