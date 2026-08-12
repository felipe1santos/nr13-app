import { describe, expect, it } from 'vitest';
import {
  hashDaEntrada,
  lacrarEntrada,
  verificarEntrada,
  verificarCadeia,
  type LivroEntrada,
} from '../livroLacre';

/**
 * O livro de registro é cumulativo e vive numa chave só (`nr13_livro_<TAG>`).
 * Congelar o livro inteiro a cada inspeção cresceria ao quadrado; o lacre por
 * hash custa ~180 bytes por entrada e prova o mesmo: que a entrada não mudou
 * depois de emitida, e que nenhuma foi removida ou reordenada.
 */
const base = (over: Partial<LivroEntrada> = {}): LivroEntrada => ({
  id: 'e1',
  data: '16/07/2026',
  tipo: 'Inspeção Periódica',
  descricao: 'Inspeção de segurança executada',
  relatorioCodigo: 'REL-1',
  phNome: 'Gabriel',
  phCrea: '5070146920',
  origem: 'auto',
  criadoEm: '2026-07-16T12:00:00.000Z',
  ...over,
});

describe('hash da entrada', () => {
  it('é estável para o mesmo conteúdo', async () => {
    expect(await hashDaEntrada(base())).toBe(await hashDaEntrada(base()));
  });

  it('NÃO depende da ordem das chaves do objeto', async () => {
    // Serialização canônica: sem isso, um `{...e}` reordenado quebraria o lacre
    // de entradas íntegras e o selo viraria ruído.
    const a = base();
    // Reconstrói o MESMO objeto com as chaves em ordem invertida.
    const invertido = Object.fromEntries(Object.entries(a).reverse()) as unknown as LivroEntrada;
    expect(Object.keys(invertido)[0]).not.toBe(Object.keys(a)[0]); // de fato reordenado
    expect(await hashDaEntrada(invertido)).toBe(await hashDaEntrada(a));
  });

  it('muda quando QUALQUER campo de conteúdo muda', async () => {
    const original = await hashDaEntrada(base());
    expect(await hashDaEntrada(base({ descricao: 'outra coisa' }))).not.toBe(original);
    expect(await hashDaEntrada(base({ data: '17/07/2026' }))).not.toBe(original);
    expect(await hashDaEntrada(base({ apto: false }))).not.toBe(original);
    expect(await hashDaEntrada(base({ phNome: 'Outro' }))).not.toBe(original);
  });

  it('IGNORA os próprios campos do lacre', async () => {
    // Senão o hash dependeria de si mesmo e nunca fecharia.
    const semLacre = await hashDaEntrada(base());
    const comLacre = await hashDaEntrada(base({ sha256: 'qualquer', shaAnterior: 'x', lacradaEm: '2026-01-01' }));
    expect(comLacre).toBe(semLacre);
  });
});

describe('lacrar e verificar', () => {
  it('lacrar grava hash, elo anterior e data — e a entrada passa a conferir', async () => {
    const e = await lacrarEntrada(base(), null);
    expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(e.shaAnterior).toBeNull();
    expect(e.lacradaEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await verificarEntrada(e)).toBe('integra');
  });

  it('editar campo de uma entrada lacrada é DETECTADO', async () => {
    const e = await lacrarEntrada(base(), null);
    expect(await verificarEntrada({ ...e, descricao: 'texto trocado depois' })).toBe('adulterada');
    expect(await verificarEntrada({ ...e, apto: false })).toBe('adulterada');
  });

  it('entrada ANTIGA (sem lacre) não é acusada de adulterada', async () => {
    // O livro tem anos de entradas anteriores a esta mudança. Chamá-las de
    // adulteradas seria alarme falso e destruiria a confiança no selo.
    expect(await verificarEntrada(base())).toBe('sem_lacre');
  });
});

describe('cadeia — remoção e reordenação', () => {
  const tres = async () => {
    const a = await lacrarEntrada(base({ id: 'a' }), null);
    const b = await lacrarEntrada(base({ id: 'b', data: '01/08/2026' }), a);
    const c = await lacrarEntrada(base({ id: 'c', data: '01/09/2026' }), b);
    return [a, b, c];
  };

  it('cadeia intacta confere', async () => {
    expect(await verificarCadeia(await tres())).toEqual({ ok: true, problemas: [] });
  });

  it('REMOVER uma entrada do meio quebra a cadeia', async () => {
    const [a, , c] = await tres();
    const r = await verificarCadeia([a, c]);
    expect(r.ok).toBe(false);
    expect(r.problemas).toContainEqual({ id: 'c', motivo: 'elo_quebrado' });
  });

  it('REORDENAR quebra a cadeia', async () => {
    const [a, b, c] = await tres();
    const r = await verificarCadeia([a, c, b]);
    expect(r.ok).toBe(false);
  });

  it('EDITAR uma entrada quebra a dela e o elo da seguinte', async () => {
    const [a, b, c] = await tres();
    const r = await verificarCadeia([{ ...a, descricao: 'mexido' }, b, c]);
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => p.id === 'a' && p.motivo === 'adulterada')).toBe(true);
  });

  it('livro só de entradas antigas não acusa problema', async () => {
    const r = await verificarCadeia([base({ id: 'v1' }), base({ id: 'v2' })]);
    expect(r).toEqual({ ok: true, problemas: [] });
  });

  it('entrada nova DEPOIS de antigas encadeia a partir da última lacrada', async () => {
    // Migração real: o livro já tem entradas sem lacre e passa a receber lacradas.
    const antiga = base({ id: 'velha' });
    const nova = await lacrarEntrada(base({ id: 'nova' }), null);
    const r = await verificarCadeia([antiga, nova]);
    expect(r.ok).toBe(true);
  });
});
