/**
 * Contrato com a RPC `aplicar_mutacao_storage` (supabase/armazenamento_v2.sql).
 *
 * POR QUE ISTO EXISTE SEPARADO: o cliente nunca deve INFERIR sucesso. Qualquer
 * resposta que não seja explicitamente 'aplicado' ou 'repetido' é tratada como
 * recusa, e o item continua na fila. Assumir sucesso em resposta desconhecida
 * apagaria a pendência e o dado sumiria — que é exatamente a classe de bug que
 * este projeto inteiro está consertando.
 */
export type StatusMutacao = 'aplicado' | 'repetido' | 'conflito' | 'recusado';

export type MotivoRecusa =
  | 'versao_obsoleta'
  | 'anterior_ao_corte'
  | 'tombstone_mais_novo'
  | 'sem_permissao';

export type RespostaMutacao =
  | { status: 'aplicado' | 'repetido'; versao: number }
  | {
      status: 'conflito';
      versao: number;
      valor: string | null;
      atualizadoEm: string;
      dispositivo: string | null;
    }
  | { status: 'recusado'; motivo: MotivoRecusa; versao: number };

const MOTIVOS: MotivoRecusa[] = [
  'versao_obsoleta',
  'anterior_ao_corte',
  'tombstone_mais_novo',
  'sem_permissao',
];

/** Recusa padrão: usada em toda resposta que não seja reconhecidamente válida. */
const RECUSA_PADRAO: RespostaMutacao = { status: 'recusado', motivo: 'sem_permissao', versao: 0 };

function numero(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function interpretarResposta(bruto: unknown): RespostaMutacao {
  if (typeof bruto !== 'object' || bruto === null) return RECUSA_PADRAO;
  const r = bruto as Record<string, unknown>;
  const versao = numero(r.versao);

  switch (r.status) {
    case 'aplicado':
      return { status: 'aplicado', versao };

    // REPETIDO MASCARA O RESULTADO ANTERIOR (22/09/2026).
    //
    // O caminho rápido de idempotência da RPC devolve
    // `resultado || {'status':'repetido'}` — o `||` do jsonb SOBRESCREVE o
    // status guardado. Um `mutationId` que da primeira vez deu CONFLITO ou
    // RECUSA volta, no reenvio, dizendo `repetido`, e o cliente tratava isso
    // como ACK: removia da fila e carimbava a versão do servidor sobre o valor
    // local que o servidor nunca aceitou.
    //
    // O código se defende disso hoje NÃO retentando item em conflito
    // (`tentarNovamente`), mas isso é uma trava por estado do cliente — e
    // `falha_definitiva` não tem trava nenhuma. Aqui a resposta é lida pelo que
    // ela CARREGA, que é prova e não convenção:
    //
    //   aplicado guardado → `{status, versao}` e mais nada
    //   conflito guardado → `valor` / `atualizado_em` / `dispositivo`
    //   recusado guardado → `motivo`
    //
    // Desmascarar aqui é o que torna seguro avançar a BASE no ACK: só o
    // `repetido` genuíno confirma o que este aparelho enviou.
    case 'repetido': {
      if (r.motivo !== undefined) {
        const motivo = MOTIVOS.includes(r.motivo as MotivoRecusa)
          ? (r.motivo as MotivoRecusa)
          : 'sem_permissao';
        return { status: 'recusado', motivo, versao };
      }
      if (r.atualizado_em !== undefined || r.valor !== undefined || r.dispositivo !== undefined) {
        return {
          status: 'conflito',
          versao,
          valor: r.valor == null ? null : String(r.valor),
          atualizadoEm: String(r.atualizado_em ?? ''),
          dispositivo: r.dispositivo == null ? null : String(r.dispositivo),
        };
      }
      return { status: 'repetido', versao };
    }

    case 'conflito':
      return {
        status: 'conflito',
        versao,
        valor: r.valor == null ? null : String(r.valor),
        atualizadoEm: String(r.atualizado_em ?? ''),
        dispositivo: r.dispositivo == null ? null : String(r.dispositivo),
      };

    case 'recusado': {
      // Motivo que este cliente não conhece cai em 'sem_permissao': trata como
      // falha definitiva e mostra ao usuário, em vez de silenciar.
      const motivo = MOTIVOS.includes(r.motivo as MotivoRecusa)
        ? (r.motivo as MotivoRecusa)
        : 'sem_permissao';
      return { status: 'recusado', motivo, versao };
    }

    default:
      return RECUSA_PADRAO;
  }
}
