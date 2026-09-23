/**
 * Traduz erro de sincronização para linguagem do usuário, SEM esconder nada.
 *
 * O texto cru do Postgres/Supabase pode expor nome de constraint, de coluna e
 * de policy — não vai para a tela principal de usuário nenhum. Mas fica INTEIRO
 * no `detalhe`, exibido no bloco recolhível "Detalhes técnicos" da tela de
 * Pendências e copiável para o suporte.
 *
 * A regra é: erro nunca some, erro nunca é despejado cru.
 */
export type CategoriaErro =
  | 'offline'
  | 'permissao'
  | 'cota'
  | 'sessao'
  | 'conflito'
  | 'obsoleto'
  /**
   * O servidor RECUSOU por regra de negócio, e vai recusar de novo para sempre.
   *
   * Diferente de `permissao` (que muda quando a assinatura é regularizada) e de
   * `offline` (que passa quando a rede volta): aqui não existe estado futuro em
   * que a operação passe. O caso concreto é a trava de imutabilidade do Livro de
   * Registro — excluir um equipamento tenta apagar `nr13_livro_<TAG>`, o banco
   * recusa com `nr13_livro_imutavel`, e a fila ficava retentando eternamente
   * com "⚠ 1 falha" na topbar. Retentar o que nunca vai passar não é
   * resiliência, é ruído.
   */
  | 'recusa_definitiva'
  /**
   * O SERVIDOR recusou porque ESTE aparelho está com o aplicativo desatualizado
   * para o modo de sincronização da organização.
   *
   * Caso concreto (`nr13_exclusao_sem_marca`, `supabase/sync_v2_por_org.sql`):
   * a organização passou a MARCAR exclusões (tombstone) e esta mutação sumiu
   * com um item da lista em vez de marcá-lo. Aceitar seria deixar o merge
   * DESFAZER a exclusão depois, em silêncio — que é exatamente o bloqueador
   * medido no ensaio de ativação.
   *
   * Não é `recusa_definitiva`: ali não existe estado futuro em que a operação
   * passe, e aqui existe. A alteração continua guardada, nada é apagado.
   *
   * Num aparelho de protocolo 2 (23/09/2026) a recuperação é AUTOMÁTICA quando
   * há prova — `sync.recuperarExclusaoSemMarca` refaz a exclusão com a marca —
   * e, sem prova, vira decisão do usuário em Pendências ("Usar a versão do
   * servidor"). Nunca fica retentando a mesma recusa.
   */
  | 'app_desatualizado'
  | 'desconhecido';

export type TipoAcao =
  | 'regularizar'
  | 'entrar'
  | 'liberar_espaco'
  | 'comparar'
  | 'tentar'
  | 'atualizar_app';

export interface ContextoErro {
  chave: string;
  mutationId: string;
  dispositivo: string;
  quando: string;
}

export interface ErroSync {
  categoria: CategoriaErro;
  titulo: string;
  explicacao: string;
  acao: { rotulo: string; tipo: TipoAcao } | null;
  detalhe: {
    codigo: string;
    mensagemOriginal: string;
    chave: string;
    mutationId: string;
    dispositivo: string;
    quando: string;
  };
}

type Texto = Pick<ErroSync, 'titulo' | 'explicacao' | 'acao'>;

const TEXTOS: Record<CategoriaErro, Texto> = {
  offline: {
    titulo: 'Sem conexão',
    explicacao: 'A alteração está guardada no aparelho e sobe sozinha quando a internet voltar.',
    acao: null,
  },
  permissao: {
    titulo: 'Sem permissão para gravar',
    explicacao: 'Sua assinatura está suspensa ou seu acesso não permite gravar este item.',
    acao: { rotulo: 'Regularizar', tipo: 'regularizar' },
  },
  cota: {
    titulo: 'Armazenamento do aparelho cheio',
    explicacao: 'Não há espaço livre neste dispositivo para guardar a alteração.',
    acao: { rotulo: 'Liberar espaço', tipo: 'liberar_espaco' },
  },
  sessao: {
    titulo: 'Sessão expirada',
    explicacao: 'Entre novamente para que as alterações pendentes sejam enviadas.',
    acao: { rotulo: 'Entrar', tipo: 'entrar' },
  },
  conflito: {
    titulo: 'Alterado em outro aparelho',
    explicacao: 'Este item foi modificado em outro dispositivo. As duas versões foram guardadas.',
    acao: { rotulo: 'Comparar versões', tipo: 'comparar' },
  },
  obsoleto: {
    titulo: 'Alteração mais antiga que a exclusão',
    explicacao: 'Este item foi excluído em outro aparelho depois desta alteração ter sido feita.',
    acao: { rotulo: 'Comparar versões', tipo: 'comparar' },
  },
  recusa_definitiva: {
    titulo: 'Alteração recusada pela regra do sistema',
    explicacao:
      'O servidor não permite esta alteração — registro de Livro de Segurança já emitido não pode ser apagado nem editado. A operação foi encerrada; nada mais será tentado.',
    acao: null,
  },
  app_desatualizado: {
    titulo: 'Exclusão sendo refeita no formato da organização',
    explicacao:
      'Esta organização registra exclusões com uma marca, e esta foi gravada sem ela. O aplicativo refaz a exclusão com a marca assim que conseguir conferir a lista no servidor — nada foi perdido. Se não for possível conferir, ela aparece em "Exclusão para refazer".',
    acao: { rotulo: 'Tentar de novo', tipo: 'tentar' },
  },
  desconhecido: {
    titulo: 'Não foi possível salvar no servidor',
    explicacao:
      'A alteração continua guardada no aparelho. Veja os detalhes técnicos ou tente de novo.',
    acao: { rotulo: 'Tentar de novo', tipo: 'tentar' },
  },
};

interface Extraido {
  codigo: string;
  mensagem: string;
  nome: string;
  status: number | null;
}

function extrair(erro: unknown): Extraido {
  if (typeof erro === 'object' && erro !== null) {
    const e = erro as Record<string, unknown>;
    return {
      codigo: String(e.code ?? e.status ?? ''),
      mensagem: String(e.message ?? ''),
      nome: String(e.name ?? ''),
      status: typeof e.status === 'number' ? e.status : null,
    };
  }
  return { codigo: '', mensagem: erro == null ? '' : String(erro), nome: '', status: null };
}

function categorizar(d: Extraido): CategoriaErro {
  const m = d.mensagem.toLowerCase();

  // Marcadores próprios primeiro: são inequívocos e vêm da nossa RPC.
  //
  // `nr13_livro_imutavel` vem do trigger de `supabase/livro_imutavel.sql` e é
  // uma recusa DEFINITIVA: a regra não muda com o tempo, com a rede nem com a
  // assinatura. Precisa vir antes de `nr13_escrita_direta_bloqueada` e do teste
  // de RLS porque é mais específico.
  if (m.includes('nr13_livro_imutavel')) return 'recusa_definitiva';
  // `nr13_documento_emitido` vem de `supabase/documentos_emitidos_imutaveis.sql`:
  // certificado de calibração emitido não se altera nem se exclui. Mesma natureza.
  if (m.includes('nr13_documento_emitido')) return 'recusa_definitiva';
  // `nr13_exclusao_sem_marca` vem de `supabase/sync_v2_por_org.sql`: a
  // organização ligou o tombstone e este aparelho tentou sumir com um item sem
  // marcá-lo. Fica ANTES do teste de RLS porque é mais específico, e é
  // categoria PRÓPRIA — `recusa_definitiva` encerraria a mutação dizendo que
  // nada mais será tentado, e aqui atualizar o aplicativo resolve.
  if (m.includes('nr13_exclusao_sem_marca')) return 'app_desatualizado';
  if (m.includes('nr13_versao_obsoleta')) return 'obsoleto';
  if (m.includes('nr13_escrita_direta_bloqueada')) return 'permissao';
  if (d.codigo === 'nr13_conflito') return 'conflito';

  if (d.nome === 'QuotaExceededError' || m.includes('quota')) return 'cota';

  if (
    (d.nome === 'TypeError' && m.includes('fetch')) ||
    m.includes('networkerror') ||
    m.includes('failed to fetch')
  ) {
    return 'offline';
  }

  if (d.codigo === '42501' || m.includes('row-level security')) return 'permissao';
  if (d.status === 401 || d.status === 403 || m.includes('jwt')) return 'sessao';

  return 'desconhecido';
}

export function classificar(erro: unknown, ctx: ContextoErro): ErroSync {
  const d = extrair(erro);
  const categoria = categorizar(d);
  return {
    categoria,
    ...TEXTOS[categoria],
    detalhe: {
      codigo: d.codigo || d.nome || '—',
      mensagemOriginal: d.mensagem,
      chave: ctx.chave,
      mutationId: ctx.mutationId,
      dispositivo: ctx.dispositivo,
      quando: ctx.quando,
    },
  };
}
