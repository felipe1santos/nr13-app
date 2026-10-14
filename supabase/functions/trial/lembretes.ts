// Envio de lembretes do trial com RESERVA ANTES DO ENVIO (sem import remoto: testável no vitest).
//
// Antes: SELECT onde a marca é null → envia → UPDATE da marca. Duas chamadas simultâneas a
// `enviar_lembretes` (a ação é pública: basta a publishable key) liam as mesmas linhas e
// mandavam o mesmo e-mail N vezes — N chamadas = N cópias, queimando a cota do Resend.
//
// Agora cada perfil é RESERVADO por um UPDATE condicional (`marca is null`) que só uma
// chamada vence; quem perde a corrida não envia. Falha no envio devolve a marca a null
// (só se ainda for a nossa), para o cron da hora seguinte tentar de novo.

export const MAX_ENVIOS_POR_EXECUCAO = 50;

export type ColunaMarca = 'email_lembrete_em' | 'email_vencido_em';

export interface PerfilAlvo {
  id: string;
  email: string | null;
  trial_fim: string;
}

/** O mínimo do cliente supabase-js que este módulo usa. */
export interface ClienteMarcas {
  from(tabela: 'profiles'): {
    update(valores: Record<string, string | null>): {
      eq(col: string, v: string): {
        is(col: string, v: null): { select(cols: string): PromiseLike<{ data: unknown[] | null; error: unknown }> };
        eq(col: string, v: string): PromiseLike<{ error: unknown }>;
      };
    };
  };
}

export async function enviarComReserva(
  admin: ClienteMarcas,
  perfis: PerfilAlvo[],
  coluna: ColunaMarca,
  enviar: (p: PerfilAlvo) => Promise<boolean>,
  agoraIso: string,
): Promise<number> {
  let enviados = 0;
  let tentativas = 0;
  for (const p of perfis) {
    if (!p.email) continue;
    if (tentativas >= MAX_ENVIOS_POR_EXECUCAO) break;
    const { data, error } = await admin
      .from('profiles')
      .update({ [coluna]: agoraIso })
      .eq('id', p.id)
      .is(coluna, null)
      .select('id');
    if (error || !data || data.length === 0) continue; // outra execução já reservou
    tentativas++;
    const ok = await enviar(p);
    if (ok) {
      enviados++;
    } else {
      await admin.from('profiles').update({ [coluna]: null }).eq('id', p.id).eq(coluna, agoraIso);
    }
  }
  return enviados;
}

/**
 * Segredo opcional do cron. Com `TRIAL_CRON_SEGREDO` definido nos secrets da Edge, a ação
 * `enviar_lembretes` só roda com o header `x-cron-segredo` igual. Sem o secret, segue
 * aberta (compatível com o cron atual) — a reserva acima já impede duplicar envio.
 */
export function cronAutorizado(segredoEnv: string, header: string | null): boolean {
  if (!segredoEnv) return true;
  if (!header || header.length !== segredoEnv.length) return false;
  let dif = 0;
  for (let i = 0; i < header.length; i++) dif |= header.charCodeAt(i) ^ segredoEnv.charCodeAt(i);
  return dif === 0;
}
