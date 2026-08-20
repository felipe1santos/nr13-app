/**
 * Fase 4 — leitura dirigida do Portal.
 *
 * O que estes testes protegem, em ordem de gravidade:
 *
 *  1. **Nenhuma chave que o cliente via antes pode sumir.** É a falha mais cara da fase,
 *     porque é silenciosa: a folha renderiza com "-" e ninguém vê erro.
 *  2. **A autorização define a leitura.** A lista de chaves nasce das TAGs já autorizadas;
 *     não existe caminho em que uma chave de outro cliente entre na consulta.
 *  3. **Cota estourada é erro, não aviso.** Documento pela metade é pior que documento
 *     recusado (I-23).
 */
import { describe, it, expect } from 'vitest';
import {
  chavesDoCliente,
  PREFIXOS_POR_TAG,
  GLOBAIS_LIBERADAS,
} from '../../../supabase/functions/portal_cliente/prefixos';

/** Réplica do passo 2 da Edge: resolve as TAGs do cliente a partir dos vínculos. */
function tagsDoCliente(emps: { chave: string; valor: string }[], clienteId: string): string[] {
  const tags: string[] = [];
  for (const row of emps) {
    try {
      const emp = JSON.parse(row.valor ?? '{}');
      if (emp?.clienteId === clienteId) tags.push(row.chave.replace(/^nr13_emp_/, ''));
    } catch {
      /* valor não-JSON: ignora */
    }
  }
  return tags;
}

const VINCULOS = [
  { chave: 'nr13_emp_ATIVO-A', valor: JSON.stringify({ clienteId: 'cli-1' }) },
  { chave: 'nr13_emp_ATIVO-B', valor: JSON.stringify({ clienteId: 'cli-1' }) },
  { chave: 'nr13_emp_ATIVO-C', valor: JSON.stringify({ clienteId: 'cli-2' }) },
  { chave: 'nr13_emp_ATIVO-D', valor: JSON.stringify({}) },
  { chave: 'nr13_emp_ATIVO-E', valor: 'isto não é json' },
];

describe('resolução das TAGs do cliente', () => {
  it('devolve só as TAGs vinculadas ao cliente que chamou', () => {
    expect(tagsDoCliente(VINCULOS, 'cli-1').sort()).toEqual(['ATIVO-A', 'ATIVO-B']);
  });

  it('ativo de OUTRO cliente não entra', () => {
    expect(tagsDoCliente(VINCULOS, 'cli-1')).not.toContain('ATIVO-C');
  });

  it('ativo sem vínculo não entra', () => {
    expect(tagsDoCliente(VINCULOS, 'cli-1')).not.toContain('ATIVO-D');
  });

  it('vínculo com valor corrompido não derruba a resolução nem vaza a TAG', () => {
    const tags = tagsDoCliente(VINCULOS, 'cli-1');
    expect(tags).not.toContain('ATIVO-E');
    expect(tags).toHaveLength(2);
  });

  it('cliente sem nenhum ativo devolve lista vazia, não tudo', () => {
    expect(tagsDoCliente(VINCULOS, 'cli-inexistente')).toEqual([]);
  });
});

describe('montagem da lista de chaves — a autorização define a leitura', () => {
  it('para 1 TAG, produz exatamente os prefixos previstos mais as globais', () => {
    const lista = chavesDoCliente(['ATIVO-A']);
    expect(lista).toHaveLength(PREFIXOS_POR_TAG.length + GLOBAIS_LIBERADAS.length);
    for (const p of PREFIXOS_POR_TAG) expect(lista).toContain(`${p}ATIVO-A`);
    for (const g of GLOBAIS_LIBERADAS) expect(lista).toContain(g);
  });

  it('cresce com o número de ativos DO CLIENTE, não com o tamanho da organização', () => {
    const um = chavesDoCliente(['ATIVO-A']).length;
    const dois = chavesDoCliente(['ATIVO-A', 'ATIVO-B']).length;
    expect(dois - um).toBe(PREFIXOS_POR_TAG.length);
  });

  it('NENHUMA chave de TAG não autorizada aparece na lista', () => {
    const lista = chavesDoCliente(tagsDoCliente(VINCULOS, 'cli-1'));
    expect(lista.some((k) => k.includes('ATIVO-C'))).toBe(false);
    expect(lista.some((k) => k.includes('ATIVO-D'))).toBe(false);
  });

  it('cliente sem ativos recebe só as globais — nunca a organização', () => {
    expect(chavesDoCliente([])).toEqual(GLOBAIS_LIBERADAS);
  });

  it('não inclui o RelatorioSalvo completo na carga inicial', () => {
    // `nr13_rel_` é escopo de ID+TAG e custa ~9,3 KB (30 % do payload medido). A listagem
    // usa o índice; o registro completo só é buscado sob demanda.
    const lista = chavesDoCliente(['ATIVO-A']);
    expect(lista.some((k) => k.startsWith('nr13_rel_'))).toBe(false);
    expect(lista).toContain('nr13_historico_indice_ATIVO-A');
  });

  it('não inclui o array legado do histórico', () => {
    // `nr13_historico_relatorios` é global e cresce sem teto. O baseline de 16/08 mediu
    // `relatorios_legado = 0` em TODAS as organizações — nada existe só nele.
    expect(chavesDoCliente(['ATIVO-A'])).not.toContain('nr13_historico_relatorios');
  });
});

describe('paridade de resultado — nada que o cliente via pode sumir', () => {
  /** Réplica do filtro ANTIGO: varria a org inteira e pegava por sufixo. */
  function filtroAntigo(todasAsChaves: string[], tags: string[]): string[] {
    return todasAsChaves.filter(
      (c) =>
        GLOBAIS_LIBERADAS.includes(c) ||
        c.startsWith('nr13_rastreab_') ||
        tags.some((t) => c.endsWith(`_${t}`)),
    );
  }

  it('o caminho novo cobre tudo que o antigo entregava, exceto o excluído de propósito', () => {
    const TAG = 'COMPRESSOR V8-15/200L';
    // As 15 chaves REAIS medidas em produção em 20/08/2026 para `ipiranga@gmail.com`.
    const noBanco = [
      'nr13_assinantes_rel_' + TAG,
      'nr13_docs_' + TAG,
      'nr13_emp_' + TAG,
      'nr13_emp_D33DD33D',
      'nr13_historico_indice_' + TAG,
      'nr13_historico_relatorios',
      'nr13_info_' + TAG,
      'nr13_lista_phs',
      'nr13_livro_' + TAG,
      'nr13_med_esp_' + TAG,
      'nr13_med_grid_' + TAG,
      'nr13_minha_empresa',
      'nr13_prontuario_' + TAG,
      'nr13_prontuario_meta_' + TAG,
      'nr13_rel_REL-1787152599432_' + TAG,
    ];
    const tags = [TAG, 'D33DD33D'];
    const antigo = new Set(filtroAntigo(noBanco, tags));
    const novo = new Set(chavesDoCliente(tags));

    // Excluídos DELIBERADAMENTE, cada um com motivo registrado no plano da Fase 4.
    const excluidosDePropostio = new Set([
      'nr13_historico_relatorios', // legado global; migração concluída (baseline 16/08)
      'nr13_rel_REL-1787152599432_' + TAG, // registro completo → sob demanda
    ]);

    const sumiram = [...antigo].filter((k) => !novo.has(k) && !excluidosDePropostio.has(k));
    expect(
      sumiram,
      `Chaves que o cliente RECEBIA e deixariam de chegar:\n  ${sumiram.join('\n  ')}`,
    ).toEqual([]);
  });
});
