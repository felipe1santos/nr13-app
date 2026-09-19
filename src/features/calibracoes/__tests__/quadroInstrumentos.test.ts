import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const banco = new Map<string, unknown>();
vi.mock('../../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
  excluirChave: async (k: string) => void banco.delete(k),
}));
vi.mock('../../../services/fotos', () => ({ salvarArquivo: async () => ({}) }));

import {
  linhaQuadro,
  opcoesParaLinha,
  situacaoCalibracao,
  snapshotDaCalibracao,
  textoCertificado,
  type RefInstrumentoChecklist,
} from '../quadroInstrumentos';
import { montarTerceiro } from '../terceiro';
import type { DadosManometro } from '../tipos';

/**
 * Revisão do engenheiro, fase 2 (D) · o quadro 7.1.1 preenchido pela
 * calibração ESCOLHIDA na inspeção, pelo snapshot — sem redigitar e sem ler o
 * registro vivo.
 */
const TAG = 'ZZ-Q';
const MAN = { id: 'inst-man', calId: 'inst-man-cal', nome: 'Manômetro' };
const TERM = { id: 'inst-term', calId: 'inst-term-cal', nome: 'Termômetro' };

function interna(over: Partial<DadosManometro> = {}): DadosManometro {
  return {
    id: 'cal-1', tag: TAG, tipo: 'manometro', nome: 'PI-01', criadoEm: '', componenteId: 'comp-m',
    numeroCertificado: 'CERT-10', dataEmissao: '', empresa: '', endereco: '', instrumento: 'PI-01',
    fabricante: 'Wika', modelo: 'X', serie: '7', referencia: '0 a 10', dataCalibracao: '01/08/2026',
    dataProxCalibracao: '01/08/2027', tempAr: '', umidade: '', local: '', padraoInst: '', padraoSerie: '',
    padraoCert: '', padraoVal: '', statusConclusao: 'aprovado', textoMotivo: '', unidade: 'bar',
    origem: 'interna', status: 'emitido',
    emissao: { pdfRef: { bucket: 'inspecao', path: 'o/c/1.pdf', mimeType: 'application/pdf', tamanho: 1 }, sha256: 'f00', emitidoEm: '', paginas: 1, pendente: false },
    crescente: [], incertezaC: '', coefC: '', decrescente: [], incertezaD: '', coefD: '',
    ...over,
  };
}
const TERCEIRO = montarTerceiro(
  {
    tipo: 'termometro', nome: 'TI-01', fabricante: 'Incoterm', modelo: 'T', serie: '9', faixa: '0 a 150',
    unidade: '°C', laboratorio: 'Lab Metrologia SA', responsavelExterno: 'Beltrano',
    numeroCertificado: 'LAB-555', dataCalibracao: '05/08/2026', validade: '05/08/2027',
    statusConclusao: 'aprovado', observacoes: '',
  },
  TAG,
  { id: 'cal-2', componenteId: 'comp-t' },
  null,
);

const ref = (cal: Parameters<typeof snapshotDaCalibracao>[0]): RefInstrumentoChecklist => ({
  calibracaoId: cal.id,
  snapshot: snapshotDaCalibracao(cal, 'Empresa ZZ'),
  selecionadoEm: '2026-09-18T00:00:00Z',
});

beforeEach(() => banco.clear());

describe('quadro 7.1.1 · POSSUI / CALIBRADO / CERTIFICADO / VALIDADE', () => {
  it('interna emitida: SIM, SIM, nº + validade — emissor é a empresa, sem "(externo)"', () => {
    const l = linhaQuadro(MAN, { instrumentosRef: { 'inst-man': ref(interna()) } }, '2026-09-18');
    expect(l).toMatchObject({ possui: 'SIM', calibrado: 'SIM', certificado: 'CERT-10 · val. 01/08/2027', fonte: 'calibracao' });
  });

  it('terceiro: cita o LABORATÓRIO como emissor', () => {
    const l = linhaQuadro(TERM, { instrumentosRef: { 'inst-term': ref(TERCEIRO) } }, '18/09/2026');
    expect(l.certificado).toBe('LAB-555 · val. 05/08/2027 · Lab Metrologia SA (externo)');
    expect(l.calibrado).toBe('SIM');
  });

  it('CALIBRADO é derivado: vencida na data da inspeção → NÃO; reprovada → NÃO; sem validade → vazio', () => {
    expect(linhaQuadro(MAN, { instrumentosRef: { 'inst-man': ref(interna()) } }, '2027-09-01').calibrado).toBe('NÃO');
    expect(
      linhaQuadro(MAN, { instrumentosRef: { 'inst-man': ref(interna({ statusConclusao: 'reprovado' })) } }, '2026-09-18')
        .calibrado,
    ).toBe('NÃO');
    const semVal = snapshotDaCalibracao(interna({ dataProxCalibracao: '' }), 'E');
    expect(situacaoCalibracao(semVal, '2026-09-18')).toBe('sem_validade');
    expect(linhaQuadro(MAN, { instrumentosRef: { 'inst-man': { calibracaoId: 'x', snapshot: semVal, selecionadoEm: '' } } }, null).calibrado).toBe('');
  });

  it('ter um número de certificado NÃO basta para "calibrado"', () => {
    const vencida = snapshotDaCalibracao(interna({ dataProxCalibracao: '01/01/2020' }), 'E');
    expect(vencida.numeroCertificado).toBe('CERT-10');
    expect(situacaoCalibracao(vencida, '2026-09-18')).toBe('vencida');
  });

  it('inspeção antiga (sem vínculo): as marcações manuais, sem reinterpretar', () => {
    const l = linhaQuadro(MAN, { instrumentos: { 'inst-man': true, 'inst-man-cal': true } }, '2026-09-18');
    expect(l).toEqual({ nome: 'Manômetro', possui: 'SIM', calibrado: 'SIM', certificado: null, fonte: 'manual' });
    expect(linhaQuadro(MAN, {}, null)).toMatchObject({ possui: '', calibrado: '', certificado: null });
  });

  it('o quadro lê o SNAPSHOT: corrigir a calibração depois não muda a inspeção', () => {
    const r = ref(interna());
    banco.set(`nr13_calibracao_item_cal-1`, interna({ numeroCertificado: 'CERT-10-R1', dataProxCalibracao: '01/01/2030' }));
    expect(linhaQuadro(MAN, { instrumentosRef: { 'inst-man': r } }, '2026-09-18').certificado).toBe(
      'CERT-10 · val. 01/08/2027',
    );
  });

  it('snapshot de legado sem origem declara "não informada" — não chuta interna', () => {
    const s = snapshotDaCalibracao(interna({ origem: undefined, status: undefined, emissao: undefined }), 'E');
    expect(s.origem).toBe('nao_informada');
    expect(s.emitido).toBe(false);
    expect(textoCertificado(s)).toBe('CERT-10 · val. 01/08/2027');
  });
});

describe('opções que o inspetor vê', () => {
  it('filtra pelo tipo da linha, esconde revisões substituídas e trava rascunho', () => {
    banco.set(`nr13_componentes_cal_${TAG}`, [
      { id: 'comp-m', tipo: 'manometro', nome: 'PI-01', criadoEm: '' },
      { id: 'comp-t', tipo: 'termometro', nome: 'TI-01', criadoEm: '' },
    ]);
    banco.set(`nr13_calibracoes_${TAG}`, [
      interna(),
      interna({ id: 'cal-3', substitui: 'cal-1', numeroCertificado: 'CERT-10-R1', dataCalibracao: '02/08/2026' }),
      interna({ id: 'cal-4', status: 'rascunho', emissao: undefined, dataCalibracao: '03/08/2026' }),
      TERCEIRO,
    ]);
    const man = opcoesParaLinha(TAG, 'manometro');
    expect(man.map((o) => o.calibracao.id)).toEqual(['cal-4', 'cal-3']);
    expect(man[0].selecionavel).toBe(false);
    expect(man[1].selecionavel).toBe(true);
    expect(opcoesParaLinha(TAG, 'termometro').map((o) => o.calibracao.id)).toEqual(['cal-2']);
    expect(opcoesParaLinha(TAG, 'pressostato')).toEqual([]);
  });
});

describe('a cadeia até o papel', () => {
  it('modelo.ts monta o quadro por linhaQuadro, com a data da inspeção', () => {
    const src = readFileSync('src/features/relatorios/pdfVetorial/modelo.ts', 'utf8');
    expect(src).toContain('linhaQuadro(i, chk, meta?.execucaoInspecao || chk.dataInspecao)');
    expect(src).not.toContain('certificado: null,\n    })),');
  });

  it('a folha escreve "NÃO" quando a calibração não vale', () => {
    const src = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    expect(src).toContain("inst.calibrado === 'NÃO'");
  });

  it('o checklist guarda referência + snapshot, e CALIBRADO manual some com vínculo', () => {
    const src = readFileSync('src/features/inspecoes/formularios/FormularioChecklist.tsx', 'utf8');
    expect(src).toContain('instrumentosRef?: Record<string, RefInstrumentoChecklist>;');
    expect(src).toContain('{!ref && (');
    expect(src).toContain("situacaoCalibracao(ref.snapshot, d.dataInspecao) === 'valida'");
  });
});
