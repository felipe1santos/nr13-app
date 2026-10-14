import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cronAutorizado,
  enviarComReserva,
  MAX_ENVIOS_POR_EXECUCAO,
  type ClienteMarcas,
  type PerfilAlvo,
} from '../../../supabase/functions/trial/lembretes';

/** Banco falso: a coluna de marca por perfil, com o UPDATE condicional atômico do Postgres. */
function bancoFalso(ids: string[]) {
  const marca = new Map<string, string | null>(ids.map((id) => [id, null]));
  const admin: ClienteMarcas = {
    from: () => ({
      update: (valores) => ({
        eq: (_c, id) => ({
          is: () => ({
            select: async () => {
              await Promise.resolve(); // intercala as chamadas concorrentes
              const v = Object.values(valores)[0];
              if (marca.get(id) !== null) return { data: [], error: null };
              marca.set(id, v);
              return { data: [{ id }], error: null };
            },
          }),
          eq: async (_c2, atual) => {
            if (marca.get(id) === atual) marca.set(id, Object.values(valores)[0]);
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { admin, marca };
}

const perfis = (n: number): PerfilAlvo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.test`, trial_fim: '2026-10-14T00:00:00Z' }));

describe('enviar_lembretes — reserva antes do envio', () => {
  it('10 chamadas simultâneas enviam UM e-mail por perfil (antes: 10 por perfil)', async () => {
    const lista = perfis(3);
    const { admin } = bancoFalso(lista.map((p) => p.id));
    const enviar = vi.fn(async () => true);
    await Promise.all(
      Array.from({ length: 10 }, () => enviarComReserva(admin, lista, 'email_lembrete_em', enviar, '2026-10-14T10:00:00Z')),
    );
    expect(enviar).toHaveBeenCalledTimes(3);
  });

  it('falha no envio devolve a marca, para a próxima hora tentar', async () => {
    const lista = perfis(1);
    const { admin, marca } = bancoFalso(['u0']);
    await enviarComReserva(admin, lista, 'email_vencido_em', async () => false, 'T1');
    expect(marca.get('u0')).toBeNull();
  });

  it('uma execução envia no máximo MAX_ENVIOS_POR_EXECUCAO', async () => {
    const lista = perfis(MAX_ENVIOS_POR_EXECUCAO + 30);
    const { admin } = bancoFalso(lista.map((p) => p.id));
    const enviar = vi.fn(async () => true);
    await enviarComReserva(admin, lista, 'email_lembrete_em', enviar, 'T');
    expect(enviar).toHaveBeenCalledTimes(MAX_ENVIOS_POR_EXECUCAO);
  });

  it('segredo do cron: sem env fica aberto; com env exige o header igual', () => {
    expect(cronAutorizado('', null)).toBe(true);
    expect(cronAutorizado('abc123', null)).toBe(false);
    expect(cronAutorizado('abc123', 'abc124')).toBe(false);
    expect(cronAutorizado('abc123', 'abc123')).toBe(true);
  });

  it('a Edge usa a reserva — nenhum update de marca solto depois do envio', () => {
    const src = readFileSync(join(__dirname, '../../../supabase/functions/trial/index.ts'), 'utf8');
    const bloco = src.slice(src.indexOf("action === 'enviar_lembretes'"));
    expect(bloco).toContain('enviarComReserva(');
    expect(bloco).not.toMatch(/update\(\{\s*email_(lembrete|vencido)_em/);
  });
});
