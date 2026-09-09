import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

vi.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { resumirRascunho } from './rascunhos';
import { DESTINO_POR_CAMPO, secaoDoCampo } from './destinoPendencia';
import type { RelatorioSalvo } from './tipos';

/**
 * 09/09/2026 · A CADEIA da rodada de pendências, no que ela tem de regra.
 *
 * O gate de COBERTURA (amarelo → alerta) vive em `emissaoVetorial.test.ts`,
 * sobre o documento gerado de verdade. Aqui ficam as pontas: para onde o clique
 * leva, o que o índice leve do rascunho carrega, e a fronteira entre o rascunho
 * e o prazo oficial.
 */

describe('para onde o clique leva', () => {
  it('data e ART vão para as Configurações, com o campo a focar', () => {
    for (const [id, campo] of [
      ['datas.validade', 'validade'],
      ['proximas.interna', 'proximaInterna'],
      ['proximas.externa', 'proximaExterna'],
      ['capa.art', 'art'],
      ['inspecao.art', 'art'],
    ] as const) {
      expect(DESTINO_POR_CAMPO[id]?.onde, id).toBe('configuracoes');
      expect(DESTINO_POR_CAMPO[id]?.campo, id).toBe(campo);
    }
  });

  it('a A.R.T. da capa e a dos exames apontam para o MESMO campo', () => {
    // São duas linhas do documento e um dado só. Antes eram dois campos
    // documentais independentes, que podiam divergir no mesmo relatório.
    expect(DESTINO_POR_CAMPO['capa.art']?.campo).toBe(DESTINO_POR_CAMPO['inspecao.art']?.campo);
  });

  it('campo que se edita na folha NÃO tem painel — a navegação é até ele', () => {
    for (const id of ['escopo.texto', 'th.duracao', 'recomendacoes.1.texto', 'categoria.observacoes']) {
      expect(DESTINO_POR_CAMPO[id], id).toBeUndefined();
    }
  });

  it('a seção sai do id, não do rótulo', () => {
    expect(secaoDoCampo('th.duracao')).toBe('Teste hidrostático');
    expect(secaoDoCampo('proximas.prazo-interna')).toBe('Próximas inspeções');
    expect(secaoDoCampo('instrumentos.0.certificado')).toBe('Instrumentos de medição');
    expect(secaoDoCampo('checklist2.observacoes')).toBe('Checklist NR-13');
    // Prefixo novo não some da barra: cai num título genérico.
    expect(secaoDoCampo('coisanova.campo')).toBe('Documento');
  });
});

describe('o índice leve do rascunho carrega os metadados da lista', () => {
  const rascunho = (meta: Record<string, string>): RelatorioSalvo =>
    ({
      id: 'REL-1',
      tagVaso: 'ZZ-1',
      nome: 'Rascunho',
      tipo: 'Inspeção Periódica',
      status: 'Rascunho',
      meta: { codigo: 'REL-1', ...meta },
    }) as unknown as RelatorioSalvo;

  it('validade e próximas entram no item', () => {
    const i = resumirRascunho(
      rascunho({ validade: '10/10/2026', proximaInspecaoInterna: '01/11/2026', proximaInspecaoExterna: '01/12/2026' }),
    );
    expect(i.validade).toBe('10/10/2026');
    expect(i.proximaInterna).toBe('01/11/2026');
    expect(i.proximaExterna).toBe('01/12/2026');
  });

  it('vazio NÃO vira chave — o índice é leve de propósito', () => {
    const i = resumirRascunho(rascunho({ validade: '' }));
    expect('validade' in i).toBe(false);
    expect('proximaInterna' in i).toBe(false);
  });

  it('o item continua pequeno: nada de documentos, overrides ou snapshots', () => {
    const i = resumirRascunho(
      rascunho({ validade: '10/10/2026', proximaInspecaoInterna: '01/11/2026' }),
    ) as unknown as Record<string, unknown>;
    for (const proibido of ['documentos', 'meta', 'overrides', 'empresa', 'assinantes', 'livroSnapshot']) {
      expect(proibido in i, `${proibido} não pode entrar no índice leve`).toBe(false);
    }
    expect(JSON.stringify(i).length).toBeLessThan(400);
  });
});

describe('a fronteira: rascunho mostra data, mas não cria prazo oficial', () => {
  const rascunhos = readFileSync('src/features/relatorios/rascunhos.ts', 'utf8');
  const historico = readFileSync('src/features/relatorios/historicoRelatorios.ts', 'utf8');

  it('o rascunho NÃO entra no índice do equipamento — a origem do vencimento', () => {
    // A regra estava documentada e continua valendo: o vencimento sai de
    // `nr13_historico_indice_<TAG>`, e `registrarRascunho` grava só na chave
    // global de rascunhos. Acrescentar datas ao índice leve não muda isso.
    expect(rascunhos).toContain("export const CHAVE_RASCUNHOS = 'nr13_rascunhos';");
    const registrar = rascunhos.slice(rascunhos.indexOf('export async function registrarRascunho'));
    expect(registrar).not.toContain('historico_indice');
    expect(registrar).not.toContain('gravarIndice');
  });

  it('FINALIZAR tira do índice de rascunhos e grava o histórico', () => {
    // O outro lado da fronteira: ao finalizar, o documento passa a existir para
    // o vencimento — e deixa de existir como rascunho, senão apareceria duas
    // vezes na lista.
    expect(historico).toContain('esquecerRascunho');
    expect(historico).toContain('registrarRascunho');
  });

  it('a lista mostra as datas do rascunho a partir do índice, sem abrir o registro', () => {
    const tela = readFileSync('src/features/relatorios/RelatoriosV9.tsx', 'utf8');
    expect(tela).toContain('{ou(r.validade)}');
    expect(tela).toContain('proximaDoRascunho(r)');
    // Se a linha do rascunho passasse a ler o registro, a lista voltaria a ser
    // pesada — é o que o §7-sexies existe para impedir.
    expect(tela).not.toContain('carregarRelatorio(');
  });
});

describe('a barra navega, e o destaque é temporário', () => {
  const previa = readFileSync('src/features/relatorios/PreviaVetorial.tsx', 'utf8');
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');
  const css = readFileSync('src/pages/relatorios.css', 'utf8');

  it('o clique usa a PÁGINA e a posição do campo, não só a página', () => {
    expect(previa).toContain('fracaoY: campo.y / A4.altura');
    expect(previa).toContain('setIrParaPonto(');
  });

  it('o destaque some sozinho em 1,5 s', () => {
    expect(previa).toContain('setTimeout(() => setDestacado(null), 1500)');
    expect(css).toContain('.previa-alvo.is-destacado');
    expect(css).toContain('animation: nr13-pulsa-campo 1.5s ease-out;');
  });

  it('o campo de Configurações recebe foco e destaque', () => {
    expect(tela).toContain('alvo.classList.add(\'campo-destacado\')');
    expect(tela).toContain('window.setTimeout(() => alvo.classList.remove(\'campo-destacado\'), 1500)');
    expect(css).toContain('.rel-modal .campo-destacado');
  });

  it('quem pediu menos movimento fica com o realce, sem o pulso', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
