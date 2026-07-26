import { describe, it, expect, beforeEach } from 'vitest';
import {
  statusAssinaturaLocal,
  podeEscreverAssinatura,
  textoBloqueio,
  gravarEstadoLocal,
  limparEstadoLocal,
  marcarSucessoPendente,
  sucessoPendente,
  calcularDiasRestantes,
  montarUrlCheckout,
  rotuloStatusAssinatura,
  rotuloEventoKiwify,
} from '../../../services/assinatura';

// vitest roda em node (sem DOM): shim mínimo de localStorage (mesmo padrão de vencimentos.test.ts).
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

beforeEach(() => localStorage.clear());

describe('espelho local da assinatura', () => {
  it('sem nada gravado assume ativa (nao trava usuario por falta de dado)', () => {
    expect(statusAssinaturaLocal()).toBe('ativa');
    expect(podeEscreverAssinatura()).toBe(true);
  });

  it('respeita o status gravado', () => {
    gravarEstadoLocal({ status: 'graca', ate: new Date(Date.now() + 86_400_000).toISOString() });
    expect(statusAssinaturaLocal()).toBe('graca');
    expect(podeEscreverAssinatura()).toBe(true);
  });

  it('rebaixa quando a data ja passou', () => {
    gravarEstadoLocal({ status: 'ativa', ate: new Date(Date.now() - 1000).toISOString() });
    expect(statusAssinaturaLocal()).toBe('somente_leitura');
    expect(podeEscreverAssinatura()).toBe(false);
  });

  it('texto do bloqueio muda por estado', () => {
    gravarEstadoLocal({ status: 'somente_leitura', ate: null });
    expect(textoBloqueio()).toContain('suspensa');
    gravarEstadoLocal({ status: 'graca', ate: new Date(Date.now() + 86_400_000).toISOString() });
    expect(textoBloqueio()).toContain('cartão');
  });

  it('troca de conta sem logout explicito nao herda o espelho da conta anterior', () => {
    // Conta A fica bloqueada e fecha a aba sem clicar "Sair" (encerrarSessaoLocal nunca roda).
    gravarEstadoLocal({ status: 'somente_leitura', ate: null });
    marcarSucessoPendente();
    // Login da conta B no mesmo navegador: carregarPerfil() nao trouxe assinatura_status
    // (banco sem a migracao, ou perfil sem assinatura) -> chama limparEstadoLocal().
    limparEstadoLocal();
    expect(statusAssinaturaLocal()).toBe('ativa');
    expect(podeEscreverAssinatura()).toBe(true);
    expect(sucessoPendente()).toBe(false);
  });
});

describe('calcularDiasRestantes (BarraAssinatura)', () => {
  it('sem data de vencimento retorna null', () => {
    expect(calcularDiasRestantes(null)).toBeNull();
  });

  it('data invalida retorna null', () => {
    expect(calcularDiasRestantes('nao-e-data', new Date('2026-01-01T00:00:00Z'))).toBeNull();
  });

  it('arredonda para cima (2 dias e meio -> 3)', () => {
    const agora = new Date('2026-01-01T00:00:00Z');
    const ate = new Date(agora.getTime() + 2.5 * 86_400_000).toISOString();
    expect(calcularDiasRestantes(ate, agora)).toBe(3);
  });

  it('data exatamente agora retorna 0', () => {
    const agora = new Date('2026-01-01T00:00:00Z');
    expect(calcularDiasRestantes(agora.toISOString(), agora)).toBe(0);
  });

  it('data no passado nunca retorna negativo (chao em 0)', () => {
    const agora = new Date('2026-01-10T00:00:00Z');
    const ate = new Date('2026-01-01T00:00:00Z').toISOString();
    expect(calcularDiasRestantes(ate, agora)).toBe(0);
  });
});

describe('montarUrlCheckout (ModalAssinatura)', () => {
  it('anexa email e uid como query params (sck)', () => {
    const url = montarUrlCheckout('https://pay.kiwify.com.br/O9KdzEI', 'joao@teste.com', 'uid-123');
    expect(url).toBe('https://pay.kiwify.com.br/O9KdzEI?email=joao%40teste.com&sck=uid-123');
  });

  it('escapa caracteres especiais no email e no uid', () => {
    const url = montarUrlCheckout('https://exemplo.com/checkout', 'a+b@teste.com', 'uid com espaço');
    expect(url).toBe('https://exemplo.com/checkout?email=a%2Bb%40teste.com&sck=uid%20com%20espa%C3%A7o');
  });

  it('funciona com email vazio (usuario ainda nao carregado)', () => {
    const url = montarUrlCheckout('https://exemplo.com/checkout', '', '');
    expect(url).toBe('https://exemplo.com/checkout?email=&sck=');
  });
});

describe('rotuloStatusAssinatura (coluna "Assinatura" do Admin)', () => {
  it('traduz cada status conhecido', () => {
    expect(rotuloStatusAssinatura('ativa')).toBe('Ativa');
    expect(rotuloStatusAssinatura('graca')).toBe('Em graça');
    expect(rotuloStatusAssinatura('cancelada_no_prazo')).toBe('Cancelada');
    expect(rotuloStatusAssinatura('somente_leitura')).toBe('Suspensa');
    expect(rotuloStatusAssinatura('trial')).toBe('Trial');
  });

  it('null/undefined/desconhecido caem em Trial (banco sem a migracao ou status inedito)', () => {
    expect(rotuloStatusAssinatura(null)).toBe('Trial');
    expect(rotuloStatusAssinatura(undefined)).toBe('Trial');
    expect(rotuloStatusAssinatura('status-que-nao-existe')).toBe('Trial');
  });
});

describe('rotuloEventoKiwify (lista "Eventos Kiwify sem conta" do Admin)', () => {
  it('traduz os 6 eventos conhecidos', () => {
    expect(rotuloEventoKiwify('compra_aprovada')).toBe('Compra aprovada');
    expect(rotuloEventoKiwify('subscription_renewed')).toBe('Renovação');
    expect(rotuloEventoKiwify('subscription_late')).toBe('Cobrança atrasada');
    expect(rotuloEventoKiwify('subscription_canceled')).toBe('Cancelamento');
    expect(rotuloEventoKiwify('compra_reembolsada')).toBe('Reembolso');
    expect(rotuloEventoKiwify('chargeback')).toBe('Chargeback');
  });

  it('evento desconhecido cai no fallback underscore -> espaco', () => {
    expect(rotuloEventoKiwify('evento_futuro_nao_mapeado')).toBe('evento futuro nao mapeado');
  });
});
