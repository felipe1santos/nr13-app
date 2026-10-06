/**
 * A PENDÊNCIA OBRIGATÓRIA PRECISA LEVAR AONDE SE RESOLVE (06/10/2026).
 *
 * ## O defeito, medido em produção
 *
 * Conta `engyuricesar` (assinatura ativa, plano completo): três rascunhos de
 * 21/09 sem `nr13_laudo_<TAG>`. Clicar "Finalizar relatório" abria o modal com
 * "Resultado da inspeção (APTO / INAPTO) não marcado · Folha "Resultado da
 * inspeção e laudo"" e só o botão "Voltar e revisar".
 *
 * A folha citada NÃO existe para clicar: desde a 13E a prévia é vetorial e a
 * CONCLUSAO.html não é montada. O único lugar que grava o laudo é o botão
 * "Laudo" da barra — que o modal não citava nem oferecia. Em dois dos três
 * rascunhos o documento ainda dizia APTO (override de texto anterior à
 * b5a0112), então o usuário não tinha como saber que faltava alguma coisa.
 *
 * Este arquivo trava: o texto aponta o lugar certo, e a pendência do laudo
 * vira um botão que abre o painel.
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import ModalFinalizar from './ModalFinalizar';
import { validarParaFinalizar } from './validacaoFinalizacao';
import type { RelatorioMeta } from './tipos';

const meta = {
  codigo: 'REL-1',
  emissao: '21/09/2026',
  tipoInspecao: 'Inspeção Periódica',
  phNome: 'Eng. Fulano',
} as unknown as RelatorioMeta;

const semLaudo = () =>
  validarParaFinalizar({
    meta,
    documentos: ['CAPA.html', 'CONCLUSAO.html'],
    laudo: null,
    dadosContainer: {},
  });

describe('laudo pendente na finalização', () => {
  it('a pendência aponta o botão "Laudo", não uma folha que não existe na prévia', () => {
    const p = semLaudo().obrigatorios.find((x) => x.campo === 'laudo');
    expect(p).toBeTruthy();
    expect(p!.onde).not.toMatch(/Folha/);
    expect(p!.onde).toMatch(/Laudo/);
  });

  it('o modal oferece "Marcar laudo" quando há como resolver', () => {
    const html = renderToStaticMarkup(
      createElement(ModalFinalizar, {
        validacao: semLaudo(),
        ocupado: false,
        progresso: null,
        erro: '',
        aoFechar: vi.fn(),
        aoConfirmar: vi.fn(),
        aoResolver: vi.fn(),
      }),
    );
    expect(html).toContain('Marcar laudo');
    // O finalizar continua escondido: nenhuma regra foi afrouxada.
    expect(html).not.toMatch(/>Finalizar relatório<\/button>/);
  });

  it('sem quem resolva, o modal não desenha botão morto', () => {
    const html = renderToStaticMarkup(
      createElement(ModalFinalizar, {
        validacao: semLaudo(),
        ocupado: false,
        progresso: null,
        erro: '',
        aoFechar: vi.fn(),
        aoConfirmar: vi.fn(),
      }),
    );
    expect(html).not.toContain('Marcar laudo');
  });

  it('a tela liga a resolução do laudo ao painel do laudo', () => {
    const src = readFileSync('src/pages/Relatorios.tsx', 'utf8');
    const bloco = src.slice(src.indexOf('<ModalFinalizar'), src.indexOf('<ModalFinalizar') + 1200);
    expect(bloco).toMatch(/aoResolver=/);
    expect(bloco).toMatch(/setModalLaudo\(true\)/);
  });
});
