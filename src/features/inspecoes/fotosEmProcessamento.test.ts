import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  concluirProcessamentoFoto,
  fotosEmProcessamento,
  iniciarProcessamentoFotos,
  rotuloAguardandoFotos,
  zerarProcessamentoFotos,
} from './fotosEmProcessamento';

/**
 * 24/11/2026 · E2E em produção: salvar com foto ainda processando gravava o
 * registro sem as últimas fotos (3 de 5). O Salvar agora espera.
 */
describe('fotos em processamento', () => {
  it('conta as que faltam e nunca fica negativo', () => {
    zerarProcessamentoFotos();
    iniciarProcessamentoFotos(3);
    expect(fotosEmProcessamento()).toBe(3);
    concluirProcessamentoFoto();
    concluirProcessamentoFoto();
    concluirProcessamentoFoto();
    concluirProcessamentoFoto();
    expect(fotosEmProcessamento()).toBe(0);
    expect(rotuloAguardandoFotos(1)).toBe('Aguarde: processando 1 foto…');
    expect(rotuloAguardandoFotos(4)).toBe('Aguarde: processando 4 fotos…');
  });

  it('o editor avisa, e TODO formulário com o editor trava o Salvar enquanto houver foto', () => {
    const ler = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
    const editor = ler('./EditorFotosDescritas.tsx');
    expect(editor).toContain('iniciarProcessamentoFotos(arquivos.length)');
    expect(editor).toContain('concluirProcessamentoFoto()');
    for (const f of ['Acumulacao', 'Checklist', 'RelatorioImagens', 'TH', 'VisualExterno', 'VisualInterno']) {
      const src = ler(`./formularios/Formulario${f}.tsx`);
      expect(src, f).toContain('<EditorFotosDescritas');
      expect(src, f).toContain('useFotosEmProcessamento()');
      expect(src, f).toMatch(/disabled=\{[^}]*fotosProcessando > 0\}/);
    }
  });
});
