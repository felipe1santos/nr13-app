/**
 * A NR-13 QUE O SISTEMA CITA É A DE 2022 — e só ela (22/10/2026).
 *
 * Queixa de cliente: o relatório citava a Portaria de 2018 (revogada) e
 * números de item que mudaram. Este teste VARRE o código de produto (src/ e
 * public/, sem testes) e quebra se voltar qualquer citação da redação antiga, e
 * confere que os textos padrão leem a constante central `nr13.ts`.
 *
 * Fonte de cada número: `docs/medicoes/2026-10-22-nr13-2022.md` (trecho oficial
 * da Portaria MTP nº 1.846/2022, gov.br).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  NR13_ITENS,
  NR13_PORTARIA,
  NR13_REFERENCIA,
  PLH,
  itemConteudoRelatorio,
  itemInspecaoSeguranca,
  itemRegistroSeguranca,
} from './nr13';

function arquivos(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === 'node_modules' || nome === '__tests__') continue;
      out.push(...arquivos(p, exts));
    } else if (exts.some((e) => nome.endsWith(e)) && !/\.test\.tsx?$/.test(nome)) {
      out.push(p);
    }
  }
  return out;
}

const PRODUTO = [...arquivos('src', ['.ts', '.tsx']), ...arquivos('public', ['.html', '.js'])];

/** Citações da redação de 2018 que não podem voltar. */
const PROIBIDAS: { rotulo: string; re: RegExp }[] = [
  { rotulo: 'Portaria 1.082 (2018, revogada)', re: /1\.082|1082\/2018/ },
  { rotulo: 'Portaria Mtb 3.214', re: /3\.214/ },
  { rotulo: '"Profissional Habilitado" sem "Legalmente"', re: /(?<!Legalmente )Profissional Habilitado/ },
  { rotulo: '"profissional habilitado" sem "legalmente"', re: /(?<!legalmente )profissionais? habilitados?/ },
  { rotulo: 'sigla PH isolada', re: /\(PH\)|PH ou Inspetor|de PH \(|do PH \(/ },
  { rotulo: '13.4.1.9 (hoje é encerramento de caldeira inadequada)', re: /\b13\.4\.1\.9\b/ },
  { rotulo: '13.5.1.8 (registro do vaso é 13.5.1.7)', re: /\b13\.5\.1\.8\b/ },
  { rotulo: '13.5.1.2 (categoria do vaso é 13.5.1.1)', re: /\b13\.5\.1\.2\b/ },
  { rotulo: '13.4.4.11 (acumulação é 13.4.4.9)', re: /\b13\.4\.4\.11\b/ },
  { rotulo: '13.4.4.16 (relatório de caldeira é 13.4.4.12)', re: /\b13\.4\.4\.16\b/ },
  { rotulo: '13.5.4.14 (relatório de vaso é 13.5.4.11)', re: /\b13\.5\.4\.14\b/ },
  { rotulo: '13.5.3.2 como instrumentos (é 13.3.6)', re: /\b13\.5\.3\.2\b/ },
];

describe('nenhuma citação da NR-13 de 2018 no produto', () => {
  it('varre src/ e public/ — e acha arquivos para varrer', () => {
    expect(PRODUTO.length).toBeGreaterThan(200);
    expect(PRODUTO.some((p) => p.endsWith('TERMO-ABERTURA.html'))).toBe(true);
  });

  for (const { rotulo, re } of PROIBIDAS) {
    it(rotulo, () => {
      const achados = PRODUTO.flatMap((p) =>
        readFileSync(p, 'utf8')
          .split('\n')
          .map((linha, i) => (re.test(linha) ? `${p}:${i + 1}: ${linha.trim().slice(0, 120)}` : null))
          .filter((x): x is string => x !== null),
      );
      expect(achados).toEqual([]);
    });
  }
});

describe('a constante central', () => {
  it('é a redação vigente, sem data de vigência', () => {
    expect(NR13_REFERENCIA).toBe('NR-13 — Portaria MTP nº 1.846/2022, alterada pela Portaria MTP nº 4.219/2022');
    expect(NR13_PORTARIA).toContain('1.846/2022');
    expect(NR13_PORTARIA).toContain('4.219/2022');
    expect(`${NR13_REFERENCIA} ${NR13_PORTARIA}`).not.toMatch(/vig[eê]ncia|vigor|outubro|novembro/i);
    expect(PLH).toBe('Profissional Legalmente Habilitado');
  });

  it('os subitens por tipo de equipamento', () => {
    expect(itemRegistroSeguranca('caldeira')).toBe('13.4.1.8');
    expect(itemRegistroSeguranca('vaso')).toBe('13.5.1.7');
    expect(itemRegistroSeguranca(null)).toBe('13.5.1.7');
    expect(itemInspecaoSeguranca('caldeira')).toBe('13.4.4');
    expect(itemInspecaoSeguranca('autoclave')).toBe('13.5.4');
    expect(itemConteudoRelatorio('caldeira')).toBe('13.4.4.12');
    expect(itemConteudoRelatorio('vaso')).toBe('13.5.4.11');
    expect(NR13_ITENS.acumulacao).toBe('13.4.4.9');
    expect(NR13_ITENS.categoriaCaldeira).toBe('13.4.1.1');
    expect(NR13_ITENS.categoriaVaso).toBe('13.5.1.1');
    expect(NR13_ITENS.instrumentos).toBe('13.3.6');
  });

  it('os textos padrão do documento leem a constante, não um literal', () => {
    const ler = (p: string) => readFileSync(p, 'utf8');
    expect(ler('src/features/relatorios/pdfVetorial/folhas.ts')).toContain('doc.texto(`(${NR13_PORTARIA})`, {');
    expect(ler('src/features/relatorios/pdfVetorial/folhas.ts')).toContain('NR13_ITENS.categoriaVaso');
    expect(ler('src/features/relatorios/pdfVetorial/folhasProntuario.ts')).toContain('${NR13_REFERENCIA}');
    const livro = ler('src/features/relatorios/pdfVetorial/livroRegistro.ts');
    expect(livro).toContain('itemRegistroSeguranca(tipoDoModelo(m))');
    expect(livro).toContain('itemInspecaoSeguranca(tipoDoModelo(m))');
    expect(livro).toContain('${PLH}: ${eng.nome}');
    expect(ler('src/features/livro/termoRegistro.ts')).toContain('${itemInspecaoSeguranca(d.tipoEquipamento)} da NR-13 (${NR13_PORTARIA})');
    expect(ler('src/features/relatorios/validacaoFinalizacao.ts')).toContain('itemConteudoRelatorio(e.tipoEquipamento)');
  });
});
