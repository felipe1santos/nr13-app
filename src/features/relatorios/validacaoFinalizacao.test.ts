import { describe, expect, it } from 'vitest';
import { validarParaFinalizar, type EntradaValidacao } from './validacaoFinalizacao';
import type { RelatorioMeta } from './tipos';

function meta(p: Partial<RelatorioMeta> = {}): RelatorioMeta {
  return {
    codigo: 'REL-1',
    tipoInspecao: 'Inspeção Periódica',
    emissao: '10/09/2026',
    validade: '10/09/2027',
    execucaoInspecao: '09/09/2026',
    proximaInspecaoInterna: '10/09/2031',
    proximaInspecaoExterna: '10/09/2028',
    validadeValvula: '',
    phNome: 'Eng. Responsável',
    phCrea: 'CREA-1',
    tecnicoNome: 'Inspetor',
    documentos: [],
    ...p,
  } as RelatorioMeta;
}

function entrada(p: Partial<EntradaValidacao> = {}): EntradaValidacao {
  return {
    meta: meta(),
    documentos: ['CAPA.html', 'CONCLUSAO.html'],
    laudo: { apto: true },
    ...p,
  };
}

const campos = (l: { campo: string }[]) => l.map((p) => p.campo);

describe('o que BLOQUEIA a finalização', () => {
  it('relatório completo pode finalizar', () => {
    const r = validarParaFinalizar(entrada());
    expect(r.obrigatorios).toEqual([]);
    expect(r.podeFinalizar).toBe(true);
  });

  it('sem número, sem data de emissão, sem tipo e sem engenheiro', () => {
    const r = validarParaFinalizar(
      entrada({ meta: meta({ codigo: '  ', emissao: '', tipoInspecao: '' as never, phNome: '' }) }),
    );
    expect(campos(r.obrigatorios)).toEqual(['codigo', 'emissao', 'tipoInspecao', 'engenheiro']);
    expect(r.podeFinalizar).toBe(false);
  });

  it('sem nenhuma folha', () => {
    const r = validarParaFinalizar(entrada({ documentos: [] }));
    expect(campos(r.obrigatorios)).toContain('documentos');
    expect(r.podeFinalizar).toBe(false);
  });

  it('laudo não marcado bloqueia QUANDO a folha de conclusão está no relatório', () => {
    expect(campos(validarParaFinalizar(entrada({ laudo: null })).obrigatorios)).toContain('laudo');
    expect(campos(validarParaFinalizar(entrada({ laudo: { apto: null } })).obrigatorios)).toContain('laudo');
  });

  it('INAPTO é uma resposta — não bloqueia', () => {
    const r = validarParaFinalizar(entrada({ laudo: { apto: false } }));
    expect(campos(r.obrigatorios)).not.toContain('laudo');
    expect(r.podeFinalizar).toBe(true);
  });

  it('sem a folha de conclusão, o laudo não é exigido', () => {
    const r = validarParaFinalizar(entrada({ documentos: ['CAPA.html'], laudo: null }));
    expect(campos(r.obrigatorios)).not.toContain('laudo');
    expect(r.podeFinalizar).toBe(true);
  });

  it('o snapshot de assinantes vale como engenheiro (relatório novo não tem phNome)', () => {
    const r = validarParaFinalizar(
      entrada({
        meta: meta({
          phNome: '',
          assinantes: { engenheiro: { nome: 'Eng. Fulana' } as never, tecnico: null },
        }),
      }),
    );
    expect(campos(r.obrigatorios)).not.toContain('engenheiro');
  });
});

describe('o que AVISA e deixa passar', () => {
  it('campo opcional em branco nunca impede a finalização', () => {
    const r = validarParaFinalizar(
      entrada({ meta: meta({ validade: '', proximaInspecaoInterna: '', tecnicoNome: '' }) }),
    );
    expect(campos(r.opcionais)).toEqual(
      expect.arrayContaining(['validade', 'proximaInspecaoInterna', 'tecnico']),
    );
    expect(r.obrigatorios).toEqual([]);
    expect(r.podeFinalizar).toBe(true);
  });

  it('teste hidrostático só é conferido quando a folha do TH está no relatório', () => {
    const semTh = validarParaFinalizar(entrada({ dadosContainer: {} }));
    expect(campos(semTh.opcionais)).not.toContain('th.pressaoTeste');

    const comTh = validarParaFinalizar(
      entrada({
        documentos: ['CAPA.html', 'CONCLUSAO.html', 'TESTE-HIDROSTATICO.html'],
        dadosContainer: { th: { pressaoTeste: '', dataTeste: '', resultado: '' } },
      }),
    );
    expect(campos(comTh.opcionais)).toEqual(
      expect.arrayContaining(['th.pressaoTeste', 'th.dataTeste', 'th.resultado']),
    );
    expect(comTh.podeFinalizar).toBe(true);
  });

  it('observação do exame externo em branco — o exemplo do dono', () => {
    const r = validarParaFinalizar(
      entrada({
        documentos: ['CAPA.html', 'VISUAL-EXTERNO.html'],
        dadosContainer: { visual_externo: { observacoes: '   ', resultado: 'aprovado' } },
      }),
    );
    const obs = r.opcionais.find((p) => p.campo === 'visual_externo.observacoes');
    expect(obs?.texto).toBe('Observação do exame externo em branco');
    expect(r.podeFinalizar).toBe(true);
  });

  it('ultrassom preenchido não gera aviso', () => {
    const r = validarParaFinalizar(
      entrada({
        documentos: ['CAPA.html', 'ULTRASSOM.html'],
        dadosContainer: { ultrassom: { aparelho: 'DM5E', resultado: 'aprovado' } },
      }),
    );
    expect(campos(r.opcionais)).not.toContain('ultrassom.aparelho');
  });

  it('dados de container ausentes não quebram a validação', () => {
    const r = validarParaFinalizar(
      entrada({ documentos: ['TESTE-HIDROSTATICO.html', 'ULTRASSOM.html'], dadosContainer: null }),
    );
    expect(r.podeFinalizar).toBe(true);
    expect(campos(r.opcionais)).toContain('th.pressaoTeste');
  });
});
