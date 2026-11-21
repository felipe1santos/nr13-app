import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * FICHA · REVISÃO DE UI (21/11/2026).
 *
 * Trava o que esta rodada mudou e o que NÃO podia mudar junto:
 *  · a foto enviada aparece na hora (o bug do F5): gravar avisa a ficha, e a
 *    ficha relê `nr13_fotos_` no render;
 *  · a unidade na criação é um grupo de rádios (não select) e a escolhida é
 *    marcada e anunciada — o valor gravado continua o de sempre;
 *  · o botão da Categoria mora na mesma linha das caixas;
 *  · o seletor de empresa mostra a logo e é um listbox acessível, chamando o
 *    mesmo `aplicarCliente`.
 */
const banco = new Map<string, unknown>();
const ordem: string[] = [];
vi.mock('../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => {
    await Promise.resolve();
    banco.set(k, structuredClone(v));
    ordem.push(`salvar:${k}`);
  },
  excluirChave: async (k: string) => void banco.delete(k),
  listarChavesComPrefixo: (p: string) => [...banco.keys()].filter((k) => k.startsWith(p)),
}));
vi.mock('../../services/fotos', () => ({
  salvarFoto: async () => ({ bucket: 'inspecao', path: 'org/ZZ/x.jpg', mimeType: 'image/jpeg', tamanho: 1 }),
  resolverFoto: async () => null,
}));
vi.mock('./equipamentoService', () => ({
  criarEquipamento: async () => {},
  tagJaExiste: async () => false,
}));
vi.mock('../cadastros/cadastroService', () => ({ listarClientes: () => [] }));
vi.mock('../../services/googlePlaces', () => ({ faviconDe: (s: string) => `https://favicon/${s}` }));

import { assinarDadosAlterados } from '../../services/eventos';
import { gravarFotosDaFicha } from './gravarFotosDaFicha';
import FotoIdentificacao from './FotoIdentificacao';
import ModalCriarEquipamento from './ModalCriarEquipamento';
import SeletorEmpresa from './SeletorEmpresa';
import CategoriaNR13 from '../categoria/CategoriaNR13';
import { indicePorLetra, proximoIndice, ROTULO_MANUAL, rotuloCliente } from './opcoesSeletorEmpresa';
import type { Cliente } from '../cadastros/tipos';
import type { FotoEquipamento } from './tipos';

const TAG = 'ZZ-UI';
const fonte = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

beforeEach(() => {
  banco.clear();
  ordem.length = 0;
});

describe('bug: a foto enviada só aparecia depois do F5', () => {
  it('gravar a foto AVISA a ficha — e só depois de o valor estar gravado', async () => {
    const foto: FotoEquipamento = { id: 1, src: '', ref: { bucket: 'b', path: 'p', mimeType: 'image/jpeg', tamanho: 1 }, isCapa: true } as FotoEquipamento;
    const visto: unknown[] = [];
    const parar = assinarDadosAlterados(() => {
      ordem.push('aviso');
      visto.push(banco.get(`nr13_fotos_${TAG}`));
    });
    try {
      await gravarFotosDaFicha(TAG, [foto]);
    } finally {
      parar();
    }
    expect(ordem).toEqual([`salvar:nr13_fotos_${TAG}`, 'aviso']);
    // Quem reage ao aviso já enxerga a lista NOVA (é o que a ficha relê).
    expect(visto).toEqual([[foto]]);
  });

  it('FotoIdentificacao grava pelo caminho que avisa — anexar e remover', () => {
    const s = fonte('src/features/equipamento/FotoIdentificacao.tsx');
    expect(s).toContain('await gravarFotosDaFicha(tag, novas);');
    expect(s).not.toMatch(/await salvar\(`nr13_fotos_/);
  });

  it('a ficha assina o barramento e lê `nr13_fotos_` NO RENDER (não só na abertura)', () => {
    const s = fonte('src/pages/Equipamento.tsx');
    expect(s).toContain('useEffect(() => assinarDadosAlterados(() => setReleitura((n) => n + 1)), []);');
    // Fora de `useState(() => …)`: lido a cada render, a releitura enxerga a foto nova.
    expect(s).toContain('  const fotos = ler<FotoEquipamento[]>(`nr13_fotos_${tag}`) || [];');
  });
});

describe('caixa da foto de identificação', () => {
  it('sem foto: seta de upload, texto curto e um BOTÃO (alcança pelo teclado)', () => {
    const h = renderToStaticMarkup(createElement(FotoIdentificacao, { tag: TAG }));
    expect(h).toContain('ficha-foto-id sem-foto');
    expect(h).toContain('Enviar foto');
    expect(h).toMatch(/<button[^>]*class="ficha-foto-id-enviar"/);
    expect(h).not.toContain('Trocar a foto');
  });

  it('com foto: a miniatura é o botão de trocar, com o selo de trocar; remover tem nome', () => {
    banco.set(`nr13_fotos_${TAG}`, [{ id: 1, src: '', ref: { bucket: 'b', path: 'p', mimeType: 'image/jpeg', tamanho: 1 }, isCapa: true }]);
    const h = renderToStaticMarkup(createElement(FotoIdentificacao, { tag: TAG }));
    expect(h).toContain('ficha-foto-id com-foto');
    expect(h).toContain('aria-label="Trocar a foto de identificação"');
    expect(h).toContain('ficha-foto-id-trocar');
    expect(h).toContain('aria-label="Remover foto de identificação"');
  });
});

describe('criar equipamento: a unidade não passa despercebida', () => {
  const h = renderToStaticMarkup(createElement(ModalCriarEquipamento, { onClose: () => {}, onCriado: () => {} }));

  it('três rádios nativos (estado anunciado), SI marcado de início, nenhum select', () => {
    const radios = h.match(/<input[^>]*name="unidade"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => /checked/.test(r))).toHaveLength(1);
    expect(radios.find((r) => /checked/.test(r))).toContain('value="SI"');
    expect(h).not.toContain('<select');
  });

  it('a escolhida tem a classe do vermelho sólido; o aviso de que não volta está ligado ao grupo', () => {
    expect(h.match(/unidade-criacao-opcao marcada/g)).toHaveLength(1);
    expect(h).toContain('aria-describedby="unidade-criacao-ajuda"');
    expect(h).toContain('Não pode ser alterada depois de criado o equipamento.');
  });

  it('o CSS: vermelho no hover, vermelho sólido com texto branco na marcada, foco visível', () => {
    const css = fonte('src/features/equipamento/equipamento.css');
    expect(css).toMatch(/\.unidade-criacao-opcao:hover \{[^}]*#FEE2E2[^}]*#B42318/);
    expect(css).toMatch(/\.unidade-criacao-opcao\.marcada,[^{]*\{[^}]*background: #DC2626;[^}]*color: #fff;/);
    expect(css).toContain('.unidade-criacao .unidade-criacao-opcao:has(input:focus-visible)');
  });
});

describe('Categoria NR-13: botão na mesma linha das caixas', () => {
  it('campos e ação dentro da MESMA linha flexível', () => {
    const h = renderToStaticMarkup(createElement(CategoriaNR13, { tag: TAG, unidade: 'SI' }));
    const linha = h.slice(h.indexOf('ficha-categoria-linha'));
    expect(linha.indexOf('ficha-categoria-campos')).toBeGreaterThan(0);
    expect(linha.indexOf('Calcular Categoria')).toBeGreaterThan(linha.indexOf('Fluido de Operação'));
    const css = fonte('src/pages/equipamento-page.css');
    expect(css).toMatch(/\.equipamento-page \.ficha-categoria-linha \{[^}]*display: flex;[^}]*align-items: flex-end;/);
  });
});

describe('seletor de empresa com logo', () => {
  const CLI = [
    { id: 'c1', razaoSocial: 'ALFA LTDA', nomeFantasia: 'Alfa', logoUrl: 'https://alfa/logo.png' },
    { id: 'c2', razaoSocial: 'BETA SA', nomeFantasia: '' },
  ] as Cliente[];

  it('mesmo rótulo do <option> antigo', () => {
    expect(rotuloCliente(CLI[0])).toBe('ALFA LTDA (Alfa)');
    expect(rotuloCliente(CLI[1])).toBe('BETA SA');
  });

  it('teclado: setas, Home/End e busca por letra', () => {
    expect(proximoIndice(0, 'ArrowDown', 3)).toBe(1);
    expect(proximoIndice(2, 'ArrowDown', 3)).toBe(2);
    expect(proximoIndice(0, 'ArrowUp', 3)).toBe(0);
    expect(proximoIndice(1, 'End', 3)).toBe(2);
    expect(proximoIndice(2, 'Home', 3)).toBe(0);
    expect(proximoIndice(0, 'a', 3)).toBeNull();
    const rotulos = [ROTULO_MANUAL, 'ALFA LTDA', 'BETA SA'];
    expect(indicePorLetra(rotulos, 0, 'b')).toBe(2);
    expect(indicePorLetra(rotulos, 2, 'a')).toBe(1);
    expect(indicePorLetra(rotulos, 0, 'p')).toBe(0); // "Preencher manualmente"
    expect(indicePorLetra(rotulos, 0, 'z')).toBeNull();
  });

  it('fechado: botão com listbox anunciado e a LOGO do cliente escolhido à esquerda', () => {
    const h = renderToStaticMarkup(
      createElement(SeletorEmpresa, { clientes: CLI, valor: 'c1', aoEscolher: () => {}, idRotulo: 'rot' }),
    );
    expect(h).toContain('aria-haspopup="listbox"');
    expect(h).toContain('aria-expanded="false"');
    expect(h.indexOf('https://alfa/logo.png')).toBeLessThan(h.indexOf('ALFA LTDA (Alfa)'));
  });

  it('sem logo: a inicial; sem cliente: o lápis de "preencher manualmente"', () => {
    const beta = renderToStaticMarkup(
      createElement(SeletorEmpresa, { clientes: CLI, valor: 'c2', aoEscolher: () => {}, idRotulo: 'rot' }),
    );
    expect(beta).toMatch(/class="ficha-emp-logo"[^>]*>B<\/span>/);
    const manual = renderToStaticMarkup(
      createElement(SeletorEmpresa, { clientes: CLI, valor: '', aoEscolher: () => {}, idRotulo: 'rot' }),
    );
    expect(manual).toContain('ficha-emp-logo-manual');
    expect(manual).toContain(ROTULO_MANUAL);
  });

  it('DadosEmpresa escolhe pelo MESMO aplicarCliente', () => {
    const s = fonte('src/features/equipamento/DadosEmpresa.tsx');
    expect(s).toContain('aoEscolher={aplicarCliente}');
    expect(s).toContain("valor={empresa.clienteId || ''}");
  });
});

describe('cores pedidas pelo dono', () => {
  const css = fonte('src/pages/equipamento-page.css');
  it('lápis: verde de seleção sólido, ícone branco', () => {
    expect(css).toMatch(/button\.btn-editar-pencil:hover \{[^}]*background: var\(--sel\);[^}]*color: #fff;/);
  });
  it('voltar: amarelo no hover e ao clicar', () => {
    expect(css).toMatch(/a\.fx-voltar:active \{[^}]*background: #FACC15;[^}]*color: #1A1A1A;/);
  });
});
