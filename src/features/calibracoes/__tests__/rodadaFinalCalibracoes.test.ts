import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Calibrações · rodada final antes do rollout (19/09/2026) — contador,
 * rodapé do certificado e proteção de alteração não salva.
 */
describe('contador de /calibracoes reflete o salvamento sem F5', () => {
  const cat = readFileSync('src/features/calibracoes/CatalogoCalibracoesV9.tsx', 'utf8');
  const pag = readFileSync('src/pages/Calibracoes.tsx', 'utf8');
  it('o catálogo sobrepõe a contagem local das TAGs tocadas à da projeção', () => {
    expect(cat).toContain('contagensLocais?: Record<string, number>;');
    expect(cat).toContain('contagensLocais[i.tag] !== undefined ? { ...i, calibracoes: contagensLocais[i.tag] } : i');
  });
  it('salvar (janela), registrar terceiro e excluir atualizam a contagem — só da TAG, sem recarregar a organização', () => {
    expect(pag).toContain('setContagensLocais((c) => ({ ...c, [t]: listarCalibracoes(t).length }))');
    // janela, terceiro e excluir
    expect(pag.match(/atualizarContagem\(/g)?.length).toBe(3);
    expect(pag).not.toContain('lerTudo(');
    expect(pag.match(/contagensLocais=\{contagensLocais\}/g)?.length).toBe(2);
  });
});

describe('certificado cabe na folha com margem antes do rodapé', () => {
  for (const arq of ['CERTIFICADO-CAL-MANOMETRO.html', 'CERTIIFCADO-CAL-PSV.html']) {
    const html = readFileSync(`public/arquivos-inspecao/${arq}`, 'utf8');
    it(`${arq}: rotina caberNaFolha com margem de 6 mm e A4`, () => {
      expect(html).toContain("var PASSOS = ['aperto-1', 'aperto-2', 'aperto-3'];");
      expect(html).toContain("pag.offsetHeight <= px('297mm') + 0.5 && foot.getBoundingClientRect().top - ultimo >= px('6mm')");
      // roda depois da injeção e de novo quando fontes/imagens carregam
      expect(html).toContain("document.addEventListener('DOMContentLoaded', function () { setTimeout(caberNaFolha, 0); });");
      expect(html).toContain('document.fonts.ready.then(caberNaFolha)');
      // fonte nunca abaixo de 10,5 px
      expect(html).not.toMatch(/aperto-\d[^{]*\{[^}]*font-size:\s*(?:[0-9](?:\.\d+)?|10(?:\.[0-4]\d*)?)px/);
    });
  }
});

describe('alteração não salva protegida em toda saída', () => {
  const j = readFileSync('src/features/calibracoes/JanelaCalibracao.tsx', 'utf8');
  it('✕/ESC (faixa), F5/fechar aba (beforeunload) e troca de rota (useBlocker)', () => {
    expect(j).toContain('Há alterações não salvas nesta calibração.');
    expect(j).toContain("window.addEventListener('beforeunload', aoSair);");
    expect(j).toContain('useBlocker(({ currentLocation, nextLocation }) => sujo && currentLocation.key !== nextLocation.key)');
  });
});
