/**
 * UM GERADOR, DOIS CONTEXTOS (21/09/2026).
 *
 * O documento avulso do ensaio e a seção do relatório final são o MESMO
 * desenho, com a composição recortada. Este arquivo trava isso por três vias:
 *
 * 1. a lista de folhas do avulso sai da MESMA tabela que o relatório usa
 *    (`DOCS_POR_FORMULARIO` → composição do vetorial);
 * 2. a tela do ensaio chama o gerador vetorial, e não monta iframes para quem
 *    tem folha vetorial;
 * 3. o que não tem equivalente vetorial — as folhas de calibração — continua
 *    no caminho antigo, declarado e com motivo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ENSAIOS_VETORIAIS, folhasDoEnsaio, temDocumentoVetorial } from './documentoVetorial';
import { DOCS_POR_FORMULARIO, type FormularioEnsaio } from './tipos';
import { secoesPresentes } from '../relatorios/pdfVetorial/composicao';

const PREVIEW = readFileSync('src/features/inspecoes/PreviewDocumento.tsx', 'utf8');
const MODULO = readFileSync('src/features/inspecoes/documentoVetorial.ts', 'utf8');

describe('quais ensaios têm documento vetorial', () => {
  it('os cinco ensaios do relatório — e só eles', () => {
    expect(ENSAIOS_VETORIAIS).toEqual(['checklist', 'visual_externo', 'visual_interno', 'ultrassom', 'th']);
    expect(temDocumentoVetorial('ultrassom')).toBe(true);
    // Certificado de calibração NÃO tem folha vetorial (§7-septies): ele é
    // montado num host isolado e rasterizado. Vetorizá-lo aqui seria criar o
    // desenho paralelo que esta mudança existe para acabar.
    expect(temDocumentoVetorial('manometro')).toBe(false);
    expect(temDocumentoVetorial('psv')).toBe(false);
  });

  it('cada ensaio vetorial recorta seções REAIS do relatório', () => {
    for (const ensaio of ENSAIOS_VETORIAIS) {
      const folhas = folhasDoEnsaio(ensaio);
      expect(folhas.length).toBeGreaterThan(0);
      // A composição do vetorial precisa reconhecer pelo menos uma seção; se
      // reconhecer nenhuma, o documento sairia vazio.
      const secoes = secoesPresentes(folhas);
      expect(Object.values(secoes).some(Boolean)).toBe(true);
    }
  });

  it('a lista de folhas é a MESMA do caminho antigo — uma tabela só', () => {
    for (const ensaio of Object.keys(DOCS_POR_FORMULARIO) as FormularioEnsaio[]) {
      expect(folhasDoEnsaio(ensaio)).toEqual(DOCS_POR_FORMULARIO[ensaio]);
    }
  });

  it('o ultrassom recorta exatamente a seção de ultrassom', () => {
    const secoes = secoesPresentes(folhasDoEnsaio('ultrassom'));
    expect(secoes.ultrassom).toBe(true);
    expect(secoes.capa).toBe(false);
    expect(secoes.parecer).toBe(false);
    expect(secoes.th).toBe(false);
  });
});

describe('a tela do ensaio usa o gerador do relatório', () => {
  it('chama o gerador vetorial, e não um caminho próprio', () => {
    expect(MODULO).toContain('gerarRelatorioVetorial');
    expect(MODULO).toContain("modo: 'preview'");
    // O container de origem é o que faz a grade certa ser escolhida.
    expect(MODULO).toContain('containerOrigemId');
    // Nada de gerador paralelo: o módulo não desenha folha nenhuma.
    expect(MODULO).not.toContain('new Documento(');
    expect(MODULO).not.toContain('folhaUltrassom');
  });

  it('a prévia decide pelo tipo do ensaio, e o iframe é o caminho de exceção', () => {
    expect(PREVIEW).toContain('temDocumentoVetorial(formulario)');
    expect(PREVIEW).toContain('<VisualizadorPdfBytes');
    // O caminho dos templates continua existindo — para os certificados.
    expect(PREVIEW).toContain('usePalcoDocumento');
    const iVetorial = PREVIEW.indexOf('temDocumentoVetorial(formulario)');
    const iIframe = PREVIEW.indexOf('DocumentoEmIframes');
    expect(iVetorial).toBeGreaterThan(0);
    expect(iIframe).toBeGreaterThan(iVetorial);
  });

  it('a prévia segue avisando que não é o documento emitido', () => {
    expect(PREVIEW).toContain('Prévia — não é o documento emitido');
  });
});
