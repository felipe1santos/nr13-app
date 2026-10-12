import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decidirAdocao, type PedidoAdocao } from '../../../supabase/functions/org_admin/adocao';

/**
 * A org_admin só adota um usuário já existente no Auth quando ele é sobra de uma
 * tentativa desta organização para o MESMO acesso (12/10/2026).
 *
 * O caso real: o mestre `gabriel.dadona` criou o acesso ao Portal de um cliente
 * com o PRÓPRIO e-mail; a regra antiga o adotou por ser "da organização", virou
 * `papel='cliente'`, teve a senha trocada, e todo login passou a cair no Portal.
 */

const ORG = 'org-mestre';
const MESTRE = ORG;

function pedido(over: Partial<PedidoAdocao> = {}): PedidoAdocao {
  return {
    existenteId: 'u-existente',
    metadata: null,
    perfil: null,
    chamadorId: MESTRE,
    orgId: ORG,
    papel: 'cliente',
    clienteId: 'cli-1',
    linhasDeDados: 0,
    ...over,
  };
}

describe('decidirAdocao', () => {
  it('RECUSA o e-mail do próprio mestre (o caso gabriel.dadona)', () => {
    const d = decidirAdocao(
      pedido({
        existenteId: MESTRE,
        perfil: { org_id: ORG, papel: 'mestre', cliente_id: null },
        linhasDeDados: 159,
      }),
    );
    expect(d.adotar).toBe(false);
    if (!d.adotar) expect(d.erro).toMatch(/próprio login principal/);
  });

  it('RECUSA conta principal independente (mestre órfão sem metadata desta org)', () => {
    const d = decidirAdocao(pedido({ perfil: { org_id: 'u-existente', papel: 'mestre', cliente_id: null } }));
    expect(d.adotar).toBe(false);
  });

  it('RECUSA mestre com dados mesmo com metadata desta org', () => {
    const d = decidirAdocao(
      pedido({
        metadata: { nr13_org_id: ORG, nr13_papel: 'cliente' },
        perfil: { org_id: 'u-existente', papel: 'mestre', cliente_id: null },
        linhasDeDados: 3,
      }),
    );
    expect(d.adotar).toBe(false);
  });

  it('ADOTA a sobra do trigger antigo: mestre vazio criado por esta org para este papel', () => {
    const d = decidirAdocao(
      pedido({
        metadata: { nr13_org_id: ORG, nr13_papel: 'cliente' },
        perfil: { org_id: 'u-existente', papel: 'mestre', cliente_id: null },
      }),
    );
    expect(d.adotar).toBe(true);
  });

  it('RECUSA converter um funcionário da org em acesso de cliente', () => {
    const d = decidirAdocao(pedido({ perfil: { org_id: ORG, papel: 'funcionario', cliente_id: null } }));
    expect(d.adotar).toBe(false);
  });

  it('RECUSA mover o acesso de um cliente para outro cliente', () => {
    const d = decidirAdocao(pedido({ perfil: { org_id: ORG, papel: 'cliente', cliente_id: 'cli-2' } }));
    expect(d.adotar).toBe(false);
  });

  it('ADOTA retentativa do MESMO acesso de cliente', () => {
    const d = decidirAdocao(pedido({ perfil: { org_id: ORG, papel: 'cliente', cliente_id: 'cli-1' } }));
    expect(d.adotar).toBe(true);
  });

  it('ADOTA retentativa do mesmo sub-login de equipe', () => {
    const d = decidirAdocao(
      pedido({ papel: 'funcionario', clienteId: null, perfil: { org_id: ORG, papel: 'funcionario', cliente_id: null } }),
    );
    expect(d.adotar).toBe(true);
  });

  it('RECUSA perfil de outra organização', () => {
    const d = decidirAdocao(pedido({ perfil: { org_id: 'outra', papel: 'cliente', cliente_id: 'cli-1' } }));
    expect(d.adotar).toBe(false);
  });

  it('sem perfil: só adota se a metadata da origem aponta esta org', () => {
    expect(decidirAdocao(pedido({ metadata: { nr13_org_id: ORG } })).adotar).toBe(true);
    expect(decidirAdocao(pedido({ metadata: { nr13_org_id: 'outra' } })).adotar).toBe(false);
    expect(decidirAdocao(pedido({ metadata: null })).adotar).toBe(false);
  });
});

describe('a Edge usa a regra', () => {
  const fonte = readFileSync(join(process.cwd(), 'supabase', 'functions', 'org_admin', 'index.ts'), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n');

  it('importa e chama decidirAdocao antes de trocar a senha', () => {
    expect(fonte).toContain("from './adocao.ts'");
    const i = fonte.indexOf('decidirAdocao(');
    const j = fonte.indexOf('updateUserById(existente.id');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it('a regra antiga ("qualquer perfil da mesma org") não voltou', () => {
    expect(fonte).not.toMatch(/perfilExist\.org_id === orgId \|\|/);
  });
});
