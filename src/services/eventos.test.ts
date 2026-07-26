import { describe, expect, it, vi } from 'vitest';
import { assinarAviso, assinarDadosAlterados, emitirAviso, emitirDadosAlterados, type Aviso } from './eventos';

describe('barramento de dados alterados', () => {
  it('notifica os assinantes quando emitirDadosAlterados é chamado', () => {
    const cb = vi.fn();
    const cancelar = assinarDadosAlterados(cb);
    emitirDadosAlterados();
    expect(cb).toHaveBeenCalledTimes(1);
    cancelar();
    emitirDadosAlterados();
    // depois de cancelar a inscrição, não deve mais ser chamado
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('barramento de aviso (emitirAviso/assinarAviso)', () => {
  it('entrega o Aviso emitido para o assinante, com todos os campos', () => {
    const recebidos: Aviso[] = [];
    const cancelar = assinarAviso((a) => recebidos.push(a));

    const aviso: Aviso = { variante: 'sucesso', titulo: 'Salvo', texto: 'Tudo certo.' };
    emitirAviso(aviso);

    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]).toEqual(aviso);

    cancelar();
  });

  it('propaga variante, titulo, texto e a ação (rótulo + callback) sem alterar referência', () => {
    const aoClicar = vi.fn();
    const recebidos: Aviso[] = [];
    const cancelar = assinarAviso((a) => recebidos.push(a));

    emitirAviso({
      variante: 'erro',
      titulo: 'Falha ao gerar PDF',
      texto: 'Assine para continuar.',
      acao: { rotulo: 'Assinar agora', aoClicar },
    });

    expect(recebidos[0].variante).toBe('erro');
    expect(recebidos[0].acao?.rotulo).toBe('Assinar agora');
    recebidos[0].acao?.aoClicar();
    expect(aoClicar).toHaveBeenCalledTimes(1);

    cancelar();
  });

  it('desinscrever (função de cancelamento) para de notificar', () => {
    const cb = vi.fn();
    const cancelar = assinarAviso(cb);
    cancelar();
    emitirAviso({ variante: 'alerta', titulo: 'x', texto: 'y' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('múltiplos assinantes recebem o mesmo evento de forma independente', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cancelar1 = assinarAviso(cb1);
    const cancelar2 = assinarAviso(cb2);

    emitirAviso({ variante: 'alerta', titulo: 'x', texto: 'y' });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    cancelar1();
    cancelar2();
  });
});
