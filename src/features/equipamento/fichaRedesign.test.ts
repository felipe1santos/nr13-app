import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * FASE 4 · REDESIGN VISUAL DA FICHA (24/09/2026).
 *
 * Esta fase é VISUAL. O que este arquivo trava é o que NÃO podia mudar junto:
 *  · a leitura mostra DADO (texto), a edição mostra CAMPO — e só ela;
 *  · pressões adotadas, conversões, categoria, vida e memorial saem das MESMAS
 *    chaves, com as MESMAS contas de exibição de antes;
 *  · o resumo do topo é repetição visual, nunca uma segunda fonte;
 *  · o CSS novo não vaza para as outras telas que usam as mesmas classes.
 */
const banco = new Map<string, unknown>();
vi.mock('../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
  excluirChave: async (k: string) => void banco.delete(k),
  listarChavesComPrefixo: (p: string) => [...banco.keys()].filter((k) => k.startsWith(p)),
}));
vi.mock('../inspecoes/inspecaoService', () => ({ listarContainers: () => [] }));
vi.mock('../cadastros/cadastroService', () => ({ listarClientes: () => [] }));
vi.mock('../../services/fotos', () => ({
  salvarArquivo: async () => ({}),
  baixarFoto: async () => null,
  blobParaDataUrl: async () => '',
}));
vi.mock('../../services/auth', () => ({ isTrial: () => false }));

import { resumoDaFicha } from './resumoFicha';
import { formatarValor } from '../../calc/unidades';
import PressoesDocumentacao from './PressoesDocumentacao';
import VidaRemanescente from './VidaRemanescente';
import DadosEquipamento from './DadosEquipamento';
import DadosEmpresa from './DadosEmpresa';
import ProntuarioFabricante from './ProntuarioFabricante';
import CategoriaNR13 from '../categoria/CategoriaNR13';
import type { InfoEquipamento } from './tipos';

const TAG = 'ZZ-F4';
const INFO: InfoEquipamento = {
  tag: TAG,
  tipo: 'vaso',
  subtipo: '',
  fabricante: 'Atlas Industrial',
  numeroSerie: 'SN-1',
  pmtaAdotadaMpa: '2.2',
  pmoAdotadaMpa: '1.75',
  pthAdotadaMpa: '2.86',
} as InfoEquipamento;

const CAT = {
  volInput: 1.25,
  presInput: 2.2,
  unidInput: 'SI',
  fluidoInput: 'A - Hidrogênio',
  classe: 'A',
  grupo: 4,
  catFinal: 'III',
  isEnquadrado: true,
  PV_enq: '2750.0000',
  PV_cat: '2.7500',
};
const VIDA = {
  entrada: { tAtual: 11.5, dataAtual: '23/09/2026', tAnterior: 12, dataAnterior: '01/01/2020', tRequerida: 5.87 },
  taxaMmAno: 0.0743,
  sobremetalMm: 5.63,
  vidaAnos: 75.7412,
  prazoNR13Anos: 5,
  proximaInspecaoAnos: 5,
  calculadoEm: '23/09/2026',
};

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
/** Campos de EDIÇÃO — o que a leitura não pode ter. */
const campos = (h: string) => (h.match(/<(input|select|textarea)\b(?![^>]*type="(file|checkbox)")/g) ?? []).length;

beforeEach(() => banco.clear());

describe('resumo do topo: repetição visual, mesma fonte', () => {
  it('PMTA é a ADOTADA, formatada como o cartão de /equipamentos — nunca a calculada', () => {
    const r = resumoDaFicha({ info: INFO, categoria: CAT as never, vida: VIDA, unidade: 'SI' });
    const pmta = r.find((i) => i.chave === 'pmta')!;
    expect(pmta.rotulo).toBe('PMTA adotada');
    expect(pmta.valor).toBe(formatarValor(2.2, 'SI'));
    // sem adoção: travessão, sem cair na calculada (regra do §3-bis)
    const sem = resumoDaFicha({ info: { ...INFO, pmtaAdotadaMpa: undefined }, categoria: CAT as never, vida: VIDA, unidade: 'SI' });
    expect(sem.find((i) => i.chave === 'pmta')!.valor).toBe('—');
  });

  it('converte na unidade do EQUIPAMENTO pela mesma função de sempre', () => {
    for (const u of ['SI', 'TECNICO', 'PETROBRAS'] as const) {
      const r = resumoDaFicha({ info: INFO, categoria: null, vida: null, unidade: u });
      expect(r.find((i) => i.chave === 'pmta')!.valor).toBe(formatarValor(2.2, u));
    }
  });

  it('categoria, vida, fabricante e volume com o MESMO texto das seções', () => {
    const r = Object.fromEntries(
      resumoDaFicha({ info: INFO, categoria: CAT as never, vida: VIDA, unidade: 'SI' }).map((i) => [i.chave, i.valor]),
    );
    expect(r).toEqual({
      categoria: 'III',
      pmta: '2.20 MPa',
      vida: '75.74 anos', // `fmt(vidaAnos, 'anos')` da Vida Remanescente
      fabricante: 'Atlas Industrial',
      volume: '1.25 m³',
    });
    // salvo sem vida calculável = "indeterminada"; nada salvo = "—"
    expect(resumoDaFicha({ info: INFO, categoria: null, vida: { vidaAnos: null }, unidade: 'SI' })[2].valor).toBe('indeterminada');
    expect(resumoDaFicha({ info: INFO, categoria: null, vida: null, unidade: 'SI' })[2].valor).toBe('—');
  });
});

describe('leitura = dado; edição = campo', () => {
  it('Pressões salvas: texto, valor ADOTADO convertido como antes, unidade junto do valor', () => {
    const h = html(createElement(PressoesDocumentacao, { tag: TAG, info: INFO, unidade: 'TECNICO', onSalvo: () => {} }));
    expect(campos(h)).toBe(0);
    // mesma conta de `mpaParaExib`: 2.2 MPa × 10.19716 → 4 casas, sem zeros à direita
    expect(h).toContain(`${Number((2.2 * 10.19716).toFixed(4))} <span class="ficha-unid">kgf/cm²</span>`);
    expect(h).toContain(`${Number((1.75 * 10.19716).toFixed(4))} <span class="ficha-unid">kgf/cm²</span>`);
    expect(h).toContain('Adotado');
    expect(h).toContain('aria-label="Editar pressões adotadas"');
    // ordem de leitura PMO → PMTA → PTH
    expect(h.indexOf('PMO Adotada')).toBeLessThan(h.indexOf('PMTA Adotada'));
    expect(h.indexOf('PMTA Adotada')).toBeLessThan(h.indexOf('PTH Adotada'));
  });

  it('Pressões sem nada salvo abrem em EDIÇÃO (regra de sempre), com o contorno de edição', () => {
    const vazio = { ...INFO, pmtaAdotadaMpa: undefined, pmoAdotadaMpa: undefined, pthAdotadaMpa: undefined };
    const h = html(createElement(PressoesDocumentacao, { tag: TAG, info: vazio, unidade: 'SI', onSalvo: () => {} }));
    expect(campos(h)).toBe(3);
    expect(h).toContain('ficha-editando');
  });

  it('Categoria salva: texto, sem campo', () => {
    banco.set(`nr13_cat_${TAG}`, CAT);
    const h = html(createElement(CategoriaNR13, { tag: TAG, unidade: 'SI' }));
    expect(campos(h)).toBe(0);
    expect(h).toContain('III');
    expect(h).toContain('aria-label="Editar categoria NR-13"');
    expect(h).not.toContain('ficha-editando');
  });

  it('Vida salva: texto; RESULTADO antes das MEDIÇÕES, mesmos valores', () => {
    banco.set(`nr13_vida_${TAG}`, VIDA);
    const h = html(createElement(VidaRemanescente, { tag: TAG, info: INFO }));
    expect(campos(h)).toBe(0);
    expect(h).toContain('75.74 anos');
    expect(h).toContain('0.0743 mm/ano');
    expect(h).toContain('11.50 mm');
    expect(h.indexOf('Resultado')).toBeLessThan(h.indexOf('Medições'));
  });

  it('Dados do Equipamento e da Empresa: texto agrupado, sem campo', () => {
    banco.set(`nr13_emp_${TAG}`, { razaoSocial: 'CLIENTE ZZ LTDA', cidade: 'Serra' });
    const eq = html(createElement(DadosEquipamento, { info: INFO, onSalvo: () => {} }));
    const emp = html(createElement(DadosEmpresa, { tag: TAG }));
    expect(campos(eq)).toBe(0);
    expect(campos(emp)).toBe(0);
    for (const g of ['Identificação', 'Fabricação e projeto', 'Placa']) expect(eq).toContain(g);
    for (const g of ['Empresa', 'Endereço', 'Contato']) expect(emp).toContain(g);
    expect(eq).toContain('Atlas Industrial');
    expect(emp).toContain('CLIENTE ZZ LTDA');
  });

  it('os 12 campos do equipamento e os 12 da empresa continuam todos na leitura', () => {
    const eq = html(createElement(DadosEquipamento, { info: INFO, onSalvo: () => {} }));
    const emp = html(createElement(DadosEmpresa, { tag: TAG }));
    const n = (h: string) => (h.match(/class="lbl-view"/g) ?? []).length;
    expect(n(eq)).toBe(12);
    expect(n(emp)).toBe(12);
  });

  it('Prontuário do Fabricante salvo aparece como DOCUMENTO; sem arquivo, a área de envio', () => {
    expect(html(createElement(ProntuarioFabricante, { tag: TAG }))).toContain('pfab-dropzone');
    banco.set(`nr13_pront_fab_${TAG}`, {
      nome: 'fabricante.pdf',
      tamanho: 2048,
      enviadoEm: '2026-09-20T10:00:00.000Z',
      pdfRef: { bucket: 'inspecao', path: 'org/docs/fab.pdf', mimeType: 'application/pdf', tamanho: 2048 },
    });
    const h = html(createElement(ProntuarioFabricante, { tag: TAG }));
    expect(h).toContain('ficha-doc');
    expect(h).toContain('fabricante.pdf');
    expect(h).not.toContain('pfab-dropzone');
    for (const acao of ['Visualizar', 'Baixar', 'Substituir PDF', 'Remover']) expect(h).toContain(acao);
  });
});

describe('a lógica não mudou junto com o visual', () => {
  const fonte = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

  it('Pressões: gravação e conversão idênticas (MPa no storage)', () => {
    const s = fonte('src/features/equipamento/PressoesDocumentacao.tsx');
    expect(s).toContain('return n == null ? undefined : fmt(n / mult);');
    expect(s).toContain('pmtaAdotadaMpa: paraMpaStr(valores.pmta),');
    expect(s).toContain('pmoAdotadaMpa: paraMpaStr(valores.pmo),');
    expect(s).toContain('pthAdotadaMpa: paraMpaStr(valores.pth),');
    expect(s).toContain("return n == null ? '' : fmt(n * fatorUnidade(unidade).mult);");
  });

  it('Memorial continua mostrando a CALCULADA do nr13_calc_, e o fluxo de edição é a mesma rota', () => {
    const s = fonte('src/pages/Equipamento.tsx');
    expect(s).toContain('const pmtaMpaRaw = calculo ? parseFloat(calculo.pmta) : NaN;');
    expect(s).toContain("{pmtaMpa != null ? formatarValor(pmtaMpa, unidade) : '—'}");
    expect(s).toContain('<Link to={rotaMemorial(tag)} className="btn-mem-edit">');
    expect(s).toContain('onClick={abrirMemorialCompleto}');
    expect(s).toContain('Ver Memorial Salvo');
    expect(s).toContain('ficha-natureza-calculado');
  });

  it('o resumo não grava nada nem calcula nada', () => {
    const s = fonte('src/features/equipamento/resumoFicha.ts');
    expect(s).not.toMatch(/\bsalvar\b|\bler\b|calcular|storage/);
  });

  it('Empresa: cancelar RELÊ o que está gravado (antes mostrava o que não foi salvo)', () => {
    const s = fonte('src/features/equipamento/DadosEmpresa.tsx');
    expect(s).toContain("setEmpresa(ler<EmpresaEquipamento>(`nr13_emp_${tag}`) || {});");
    expect(s).toContain('onClick={cancelar}');
  });

  it('todo lápis da ficha tem nome acessível próprio', () => {
    for (const [arq, rot] of [
      ['src/features/categoria/CategoriaNR13.tsx', 'Editar categoria NR-13'],
      ['src/features/equipamento/PressoesDocumentacao.tsx', 'Editar pressões adotadas'],
      ['src/features/equipamento/VidaRemanescente.tsx', 'Editar vida remanescente'],
      ['src/features/equipamento/DadosEquipamento.tsx', 'Editar dados do equipamento'],
      ['src/features/equipamento/DadosEmpresa.tsx', 'Editar dados da empresa'],
    ]) {
      expect(fonte(arq)).toContain(`aria-label="${rot}"`);
    }
  });

  it('o CSS da Fase 4 não vaza: toda regra é da ficha', () => {
    const css = fonte('src/pages/equipamento-page.css');
    const bloco = css.slice(css.lastIndexOf('/*', css.indexOf('FASE 4 · REDESIGN VISUAL DA FICHA')));
    const seletores = bloco
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('}')
      .map((r) => r.split('{')[0].trim())
      .filter((sel) => sel && !sel.startsWith('@media'))
      .flatMap((sel) => sel.replace(/^@media[^{]*\{/, '').split(','))
      .map((sel) => sel.trim())
      .filter(Boolean);
    expect(seletores.length).toBeGreaterThan(40);
    for (const sel of seletores) {
      expect(sel, sel).toMatch(/^(\.equipamento-page\b|\.ficha-)/);
    }
  });
});
