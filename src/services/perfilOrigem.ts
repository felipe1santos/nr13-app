/**
 * Metadata de origem do perfil, lida pelo trigger `handle_new_user`.
 *
 * POR QUE EXISTE (16/08/2026). A auditoria da Fase 0 (D-24) encontrou que
 * `handle_new_user` insere o profile SEM a coluna `papel`:
 *
 *   insert into public.profiles (id, email, ativo, role)   -- admin_setup.sql:69
 *
 * Como `papel` é `not null default 'mestre'`, TODA conta criada no Auth nasce
 * mestre. Para o auto-cadastro isso é correto por acaso — a conta é mesmo dona
 * da própria organização. Para um sub-login ou um acesso de cliente, não é: a
 * Edge `org_admin` só corrige DEPOIS, com um upsert, e entre as duas coisas
 * existe uma janela. Se o upsert falhar (rede, coluna ausente, erro do
 * PostgREST), o usuário fica no Auth com senha válida e perfil `papel='mestre'`
 * permanente. O próprio `org_admin` conhece esse estado e o trata como órfão
 * adotável na retentativa — ou seja, a janela era conhecida e compensada, nunca
 * eliminada.
 *
 * Com a metadata, o trigger insere o papel certo já no INSERT. A janela deixa de
 * existir em vez de ser remendada depois.
 *
 * COMPATIBILIDADE NAS DUAS DIREÇÕES, e é o que torna o deploy seguro em
 * qualquer ordem:
 *   - trigger novo + chamador antigo (sem metadata) → `'mestre'`, igual a hoje;
 *   - trigger antigo + chamador novo (com metadata) → metadata ignorada, igual a hoje.
 *
 * O prefixo `nr13_` evita colisão com metadata do próprio Supabase.
 *
 * ESTE FORMATO É REPLICADO na Edge `org_admin` (Deno não importa de `src/`).
 * Mudou aqui, muda lá — ver o comentário no `createUser` daquele arquivo.
 */
export const PAPEIS_VALIDOS = ['mestre', 'gerente', 'funcionario', 'cliente'] as const;

export type Papel = (typeof PAPEIS_VALIDOS)[number];

/**
 * Comparação SENSÍVEL A CAIXA, de propósito. As policies da D-04 comparam
 * `papel_atual() in ('mestre','gerente','funcionario')` — e essa comparação é
 * sensível a caixa no Postgres. Aceitar 'MESTRE' aqui criaria um papel que
 * parece válido no cliente e é recusado no banco, ou pior, o inverso.
 */
export function papelValido(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS_VALIDOS as readonly string[]).includes(valor);
}

/**
 * Monta a metadata de criação.
 *
 * Campo vazio NUNCA entra: o trigger distingue "ausente" de "vazio", e uma
 * string vazia viraria `org_id = ''`, que não casa com organização nenhuma —
 * um sub-login órfão, que é justamente o defeito que esta função combate.
 */
export function metadataPerfil(
  papel: Papel,
  opcoes: { orgId?: string; clienteId?: string } = {},
): Record<string, string> {
  const meta: Record<string, string> = { nr13_papel: papel };
  if (opcoes.orgId) meta.nr13_org_id = opcoes.orgId;
  if (opcoes.clienteId) meta.nr13_cliente_id = opcoes.clienteId;
  return meta;
}
