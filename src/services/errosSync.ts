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
  | 'desconhecido';

export type TipoAcao = 'regularizar' | 'entrar' | 'liberar_espaco' | 'comparar' | 'tentar';

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
