import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { equipamentosDoCliente, nomesDoCliente, normalizarNome, resumoPrazos, totalInspecoes } from './clienteResumo';
import type { ItemCatalogo } from '../../services/buscaIndex';
import type { ItemVencimento } from '../../services/vencimentos';

const item = (tag: string, clienteNome: string | null, inspecoes: number | null = 1) =>
  ({ tag, clienteNome, inspecoes }) as unknown as ItemCatalogo;

const venc = (tag: string, status: ItemVencimento['status'], extra: Partial<ItemVencimento> = {}) =>
  ({ tag, nome: tag, tipoEquip: 'x', origem: 'inspecao', status, ...extra }) as ItemVencimento;

describe('equipamentos do cliente: igualdade de NOME, não busca textual', () => {
  it('normaliza caixa e espaços', () => {
    expect(normalizarNome('  Cliente   E2E sa ')).toBe('CLIENTE E2E SA');
    expect(nomesDoCliente({ razaoSocial: 'A Ltda', nomeFantasia: 'a ltda' })).toEqual(['A LTDA']);
  });

  it('a busca do servidor casa "SA" em outro cliente; o filtro final não', () => {
    const itens = [item('V-1', 'CLIENTE E2E SA'), item('V-2', 'CLIENTE E2E SA ENGENHARIA'), item('V-3', null)];
    expect(equipamentosDoCliente(itens, { razaoSocial: 'Cliente E2E SA', nomeFantasia: '' }).map((i) => i.tag)).toEqual(['V-1']);
  });

  it('aceita o nome fantasia (o catálogo guarda razaoSocial || nomeFantasia) e não duplica TAG', () => {
    const itens = [item('V-1', 'LATICINIOS'), item('V-1', 'LATICINIOS'), item('V-2', 'LATICÍNIOS SERRA AZUL LTDA')];
    const r = equipamentosDoCliente(itens, { razaoSocial: 'Laticínios Serra Azul Ltda', nomeFantasia: 'Laticinios' });
    expect(r.map((i) => i.tag)).toEqual(['V-1', 'V-2']);
  });

  it('cliente sem nome não casa com equipamento sem cliente', () => {
    expect(equipamentosDoCliente([item('V-1', null)], { razaoSocial: '', nomeFantasia: '' })).toEqual([]);
  });
});

describe('prazos do cliente: o agregado do painel, filtrado pelas TAGs', () => {
  const painel = {
    truncado: false,
    itens: [
      venc('V-1', 'crit'),
      venc('MAN-1', 'warn', { origem: 'calibracao', pertenceA: 'V-1' }),
      venc('V-2', 'ok'),
      venc('X-9', 'crit'), // de outro cliente
    ],
  };

  it('conta o equipamento E os acessórios dele, e só os do cliente', () => {
    const r = resumoPrazos(['V-1', 'V-2'], painel);
    expect(r.vencidos).toBe(1);
    expect(r.aVencer30).toBe(1);
    expect(r.porTag.get('V-1')?.status).toBe('crit');
    expect(r.porTag.has('MAN-1')).toBe(false); // a linha da tabela é a da INSPEÇÃO
  });

  it('erro ou lista truncada: contador indefinido, nunca zero', () => {
    expect(resumoPrazos(['V-1'], null).vencidos).toBeUndefined();
    expect(resumoPrazos(['V-1'], { ...painel, erro: true }).vencidos).toBeUndefined();
    const truncado = resumoPrazos(['V-1'], { ...painel, truncado: true });
    expect(truncado.vencidos).toBeUndefined();
    expect(truncado.aVencer30).toBeUndefined();
  });

  it('soma de inspeções some quando alguma contagem é desconhecida', () => {
    expect(totalInspecoes([item('a', 'x', 2), item('b', 'x', 3)])).toBe(5);
    expect(totalInspecoes([item('a', 'x', 2), item('b', 'x', null)])).toBeUndefined();
    expect(totalInspecoes([])).toBe(0);
  });
});

describe('modal do cliente: leitura primeiro, e a gravação é esperada', () => {
  const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const MODAL = ler('src/features/cadastros/ModalCliente.tsx');
  const SERVICO = ler('src/features/cadastros/cadastroService.ts');
  const CSS = ler('src/features/cadastros/modalCliente.css');

  it('abre em leitura; só cliente novo (ou "Editar" da lista) abre em edição', () => {
    expect(MODAL).toContain("useState<Modo>(novo || acaoInicial === 'editar' ? 'edicao' : 'leitura')");
  });

  it('salvar e excluir devolvem a promessa e o modal espera antes de reler a lista', () => {
    expect(SERVICO).toContain('export function salvarCliente(cliente: Cliente): Promise<void>');
    expect(SERVICO).toContain('return salvar(KEY_CLIENTES, lista);');
    expect(MODAL).toContain('await salvarCliente(form);');
    expect(MODAL).toContain('await excluirCliente(cliente.id);');
  });

  it('excluir pede confirmação; fechar com alteração pede para descartar', () => {
    expect(MODAL).toContain("aoEscolher: () => setConfirmar('excluir')");
    expect(MODAL).toContain("setConfirmar('descartar')");
  });

  it('overlay cobre a tela inteira na camada nomeada, por portal no body', () => {
    expect(MODAL).toContain('createPortal(corpo, document.body)');
    expect(CSS).toMatch(/\.mcli-overlay \{[^}]*position: fixed;[^}]*inset: 0;[^}]*z-index: var\(--z-modal-app\);/);
  });

  it('o mapa (Google, cobrado) só carrega com a aba Localização aberta', () => {
    expect(MODAL).toContain("aba === 'local' ? urlMapaEmbed(cliente) : null");
  });

  it('aba ativa no acento com texto branco; raio 8; sem pílula', () => {
    expect(CSS).toMatch(/\.mcli-seg button\[aria-selected='true'\] \{[^}]*background: var\(--acao\);/);
    expect(CSS).toMatch(/\.mcli \{[^}]*border-radius: var\(--r-md\);/);
    expect(CSS).not.toMatch(/border-radius: 999px/);
  });
});
