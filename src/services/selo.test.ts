import { describe, it, expect } from 'vitest';
import {
  resumoSelo,
  rotuloEstado,
  pendenciaVelha,
  LIMITE_PENDENCIA_VELHA_MS,
} from './selo';
import type { EstadoItem, ItemFila } from './sync';

const item = (estado: EstadoItem, criadoEm = '2026-08-05T12:00:00.000Z'): ItemFila => ({
  mutationId: `m-${estado}-${criadoEm}`,
  op: 'set',
  chave: 'nr13_info_A',
  valor: '{}',
  versaoBase: 0,
  dispositivo: 'd1',
  criadoEm,
  tentativas: 0,
  estado,
});

describe('resumoSelo — os cinco estados são distinguíveis', () => {
  it('fila vazia -> tudo salvo', () => {
    expect(resumoSelo([])).toEqual({ rotulo: 'Tudo salvo', nivel: 'ok', pendentes: 0, falhas: 0 });
  });

  it('aguardando conta como pendência', () => {
    const r = resumoSelo([item('aguardando'), item('aguardando', '2026-08-05T13:00:00.000Z')]);
    expect(r).toMatchObject({ rotulo: '2 pendências', nivel: 'pendente', pendentes: 2 });
  });

  it('salvo_local também conta como pendência', () => {
    expect(resumoSelo([item('salvo_local')])).toMatchObject({ nivel: 'pendente', pendentes: 1 });
  });

  it('singular e plural corretos', () => {
    expect(resumoSelo([item('aguardando')]).rotulo).toBe('1 pendência');
    expect(resumoSelo([item('falha_definitiva')]).rotulo).toBe('1 falha');
    expect(
      resumoSelo([item('falha_definitiva'), item('conflito')]).rotulo,
    ).toBe('2 falhas');
  });

  it('falha domina pendência: o que exige ação aparece primeiro', () => {
    const r = resumoSelo([item('aguardando'), item('falha_definitiva')]);
    expect(r.nivel).toBe('falha');
    expect(r.falhas).toBe(1);
    expect(r.pendentes).toBe(1); // o número continua disponível
  });

  it('conflito é falha: exige decisão do usuário', () => {
    expect(resumoSelo([item('conflito')]).nivel).toBe('falha');
  });

  it('sincronizado não conta como nada', () => {
    expect(resumoSelo([item('sincronizado')])).toMatchObject({ nivel: 'ok', pendentes: 0 });
  });

  it('BLOQUEADO domina tudo: o usuário precisa saber ANTES de digitar', () => {
    const r = resumoSelo([item('aguardando'), item('falha_definitiva')], true);
    expect(r.nivel).toBe('bloqueado');
    expect(r.rotulo).toBe('Somente leitura');
    // Os números seguem visíveis para a tela de pendências.
    expect(r.pendentes).toBe(1);
    expect(r.falhas).toBe(1);
  });

  it('bloqueado com fila vazia ainda avisa', () => {
    expect(resumoSelo([], true).nivel).toBe('bloqueado');
  });
});

describe('rotuloEstado', () => {
  it('cada estado tem rótulo próprio e não vazio', () => {
    const estados: EstadoItem[] = [
      'salvo_local',
      'aguardando',
      'sincronizado',
      'falha_definitiva',
      'conflito',
    ];
    const rotulos = estados.map(rotuloEstado);
    expect(new Set(rotulos).size).toBe(estados.length); // todos distintos
    for (const r of rotulos) expect(r.length).toBeGreaterThan(0);
  });

  it('"salvo no aparelho" não diz "sincronizado"', () => {
    expect(rotuloEstado('salvo_local')).not.toContain('Sincronizado');
  });
});

describe('pendenciaVelha', () => {
  const AGORA = new Date('2026-08-05T12:00:00.000Z').getTime();

  it('recente não é velha', () => {
    expect(pendenciaVelha('2026-08-05T11:30:00.000Z', AGORA)).toBe(false);
  });

  it('exatamente no limite ainda não é velha', () => {
    const noLimite = new Date(AGORA - LIMITE_PENDENCIA_VELHA_MS).toISOString();
    expect(pendenciaVelha(noLimite, AGORA)).toBe(false);
  });

  it('passou do limite é velha', () => {
    const passou = new Date(AGORA - LIMITE_PENDENCIA_VELHA_MS - 1).toISOString();
    expect(pendenciaVelha(passou, AGORA)).toBe(true);
  });

  it('data ilegível não vira alarme falso', () => {
    expect(pendenciaVelha('lixo', AGORA)).toBe(false);
  });
});
