import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  fluxoDaTela,
  montaIframes,
  motorPossivel,
  papelDaPrevia,
  precisaPalco,
} from './fluxoDocumento';

/**
 * 13E · o gate do DESLIGAMENTO.
 *
 * A 13D fez as duas prévias coexistirem: a nova aparecia e a antiga ficava
 * escondida por CSS — escondida, mas MONTADA. O usuário pagava 27 iframes,
 * palco, ponte e `sb-storage` para ver o documento novo.
 *
 * Aqui só existe um caminho por vez, e quatro decisões precisam concordar entre
 * si: montar os iframes, montar o palco, de onde sai o papel da prévia e qual
 * motor pode desenhar a finalização. Se uma delas sair de sincronia, o defeito
 * aparece no documento do cliente — por isso todas saem da MESMA função.
 */

describe('o fluxo da tela', () => {
  it('com a prévia nova, nada de iframe', () => {
    const f = fluxoDaTela('vetorial', false);
    expect(f).toBe('vetorial');
    expect(montaIframes(f)).toBe(false);
    expect(precisaPalco(f)).toBe(false);
  });

  it('com a prévia antiga, tudo como sempre foi', () => {
    const f = fluxoDaTela('iframe', false);
    expect(f).toBe('iframes');
    expect(montaIframes(f)).toBe(true);
    expect(precisaPalco(f)).toBe(true);
  });

  it('documento arquivado não monta documento nenhum — serve o arquivo', () => {
    expect(montaIframes(fluxoDaTela('iframe', true))).toBe(false);
    expect(precisaPalco(fluxoDaTela('iframe', true))).toBe(false);
  });

  it('palco e iframes andam juntos: um sem o outro é folha faltando ou trava à toa', () => {
    for (const previa of ['iframe', 'vetorial'] as const) {
      for (const arquivado of [true, false]) {
        const f = fluxoDaTela(previa, arquivado);
        expect(precisaPalco(f)).toBe(montaIframes(f));
      }
    }
  });
});

describe('o motor que a finalização pode usar', () => {
  it('sem iframes, o raster não é possível — ele fotografa a tela', () => {
    expect(motorPossivel('vetorial', 'raster')).toBe('vetorial');
  });

  it('o rollback para raster continua valendo no fluxo antigo', () => {
    expect(motorPossivel('iframes', 'raster')).toBe('raster');
    expect(motorPossivel('iframes', 'vetorial')).toBe('vetorial');
  });

  it('quem já escolheu vetorial não é afetado pelo fluxo', () => {
    expect(motorPossivel('vetorial', 'vetorial')).toBe('vetorial');
  });
});

describe('de onde sai o papel da PRÉVIA (o arquivado tem regra própria)', () => {
  it('fluxo novo imprime os bytes do mesmo gerador da emissão', () => {
    expect(papelDaPrevia('vetorial')).toBe('previa-vetorial');
  });

  it('fluxo antigo continua rasterizando a tela', () => {
    expect(papelDaPrevia('iframes')).toBe('raster-da-tela');
  });
});

describe('a tela obedece à decisão (leitura do fonte)', () => {
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');

  it('os 27 iframes só são renderizados no fluxo `iframes`', () => {
    expect(tela).toMatch(/montaIframes\(fluxo\) &&\s*\n\s*palco\.estado === 'pronto' &&/);
  });

  it('o palco é pulado quando não há iframes', () => {
    expect(tela).toContain('pular: !precisaPalco(fluxo)');
  });

  it('a finalização passa o motor pela peneira do fluxo', () => {
    expect(tela).toContain('motorPossivel(fluxo, motorDoRelatorio(meta, window.location.search))');
  });

  it('imprimir e baixar rascunho perguntam de onde sai o papel', () => {
    const ocorrencias = tela.match(/papelDaPrevia\(fluxo\) === 'previa-vetorial'/g) ?? [];
    expect(ocorrencias).toHaveLength(2);
  });

  it('a pré-rasterização do Ctrl+P nativo não roda sem iframes', () => {
    expect(tela).toMatch(/if \(!montaIframes\(fluxo\) \|\| tela !== 'visualizador' \|\| !documentos\) return;/);
  });

  it('nenhuma folha do relatório fica montada e escondida por CSS', () => {
    expect(tela).not.toContain("' oculta'");
    expect(readFileSync('src/pages/relatorios.css', 'utf8')).not.toContain('.relatorio-preview.oculta');
  });
});

describe('o que NÃO foi desligado', () => {
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');

  it('o rollback `?previa=iframe` continua no código', () => {
    expect(readFileSync('src/features/relatorios/previaDocumento.ts', 'utf8')).toContain("get('previa')");
  });

  it('o gerador raster continua importado — 13F é que prova código morto', () => {
    expect(tela).toContain("from '../features/relatorios/pdfService'");
  });

  it('o palco continua existindo para quem ainda usa iframes', () => {
    expect(tela).toContain('usePalcoDocumento');
  });

  it('o Prontuário não foi tocado por esta decisão', () => {
    expect(readFileSync('src/pages/Prontuarios.tsx', 'utf8')).not.toContain('fluxoDaTela');
  });
});

describe('a virada: sem configuração nenhuma, a organização já está no fluxo novo', () => {
  it('o default do módulo é `vetorial`, e o rollback é que precisa ser dito', () => {
    const fonte = readFileSync('src/features/relatorios/previaDocumento.ts', 'utf8');
    expect(fonte).toContain("=== 'iframe' ? 'iframe' : 'vetorial'");
    // Leitura que falha não pode remontar 27 iframes em silêncio.
    expect(fonte).toMatch(/catch \{\s*return 'vetorial';/);
  });
});
