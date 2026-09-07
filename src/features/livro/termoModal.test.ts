/**
 * GATE do hotfix do modal "Novo registro" (07/09/2026).
 *
 * Dois defeitos relatados:
 *
 *  1. o Termo não podia ser esvaziado — apagar a última letra (ou Ctrl+A e
 *     Delete) fazia a sugestão inteira reaparecer;
 *  2. clicar no fundo do modal fechava tudo, com o formulário preenchido.
 *
 * A causa do primeiro é de ESTADO, não de tela: `termoTexto` era `string`, com
 * a regra "vazio = use a sugestão". `''` (apaguei) e "nunca preenchido" viravam
 * o mesmo valor. Aqui a distinção é `null` vs `''`, e estes casos travam isso
 * nas quatro superfícies: formulário, prévia, gravação e folha impressa.
 *
 * Estrutura + comportamento puro: a suíte roda sem DOM.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORM_OCORRENCIA_VAZIO, type FormOcorrencia } from './formRegistro';
import { termoSugerido } from './termoRegistro';

const modal = readFileSync('src/features/livro/ModalNovoRegistro.tsx', 'utf8');
const pagina = readFileSync('src/pages/LivroRegistro.tsx', 'utf8');
const servico = readFileSync('src/features/relatorios/relatoriosService.ts', 'utf8');
const folha = readFileSync('public/arquivos-inspecao/LIVRO-REGISTRO.html', 'utf8');

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * A MESMA regra do modal e da página, isolada: `null` = intocado (vale a
 * sugestão); qualquer string vence, inclusive a vazia.
 */
function termoEfetivo(form: FormOcorrencia, sugestao: string): string {
  return form.termoTexto !== null ? form.termoTexto : sugestao;
}

const BASE: FormOcorrencia = {
  ...FORM_OCORRENCIA_VAZIO,
  data: '2026-09-07',
  tipoOcorrencia: 'Reparo',
  oQueFoiFeito: 'Reparo de solda',
};
const sugestaoDe = (f: FormOcorrencia) =>
  termoSugerido({
    tipo: f.tipoOcorrencia,
    data: f.data,
    empresa: 'MDK ENG',
    descricao: f.oQueFoiFeito,
  });

describe('A · a sugestão aparece no campo intocado', () => {
  it('campo nasce `null` e mostra a sugestão', () => {
    expect(FORM_OCORRENCIA_VAZIO.termoTexto).toBeNull();
    const t = termoEfetivo(BASE, sugestaoDe(BASE));
    expect(t).toContain('Em 07/09/2026');
    expect(t).toContain('Reparo de solda');
  });
});

describe('B · apagar UMA letra preserva o que sobrou', () => {
  it('o texto encurtado é o que fica', () => {
    const digitado = 'Reparo executado conforme procedimento';
    const form = { ...BASE, termoTexto: digitado.slice(0, -1) };
    expect(termoEfetivo(form, sugestaoDe(form))).toBe('Reparo executado conforme procediment');
  });
});

describe('C · Ctrl+A + Delete deixa vazio', () => {
  it('string vazia é valor válido, e não volta para a sugestão', () => {
    const form = { ...BASE, termoTexto: '' };
    expect(termoEfetivo(form, sugestaoDe(form))).toBe('');
  });
});

describe('D · rerender não restaura a sugestão', () => {
  it('o mesmo estado devolve o mesmo texto, quantas vezes for', () => {
    const form = { ...BASE, termoTexto: '' };
    const s = sugestaoDe(form);
    expect([termoEfetivo(form, s), termoEfetivo(form, s), termoEfetivo(form, s)]).toEqual([
      '',
      '',
      '',
    ]);
  });
});

describe('E · mudar a DATA depois de editar não sobrescreve', () => {
  it('o termo do usuário sobrevive à troca de data', () => {
    const meu = 'Texto do inspetor.';
    const form = { ...BASE, termoTexto: meu };
    const depois = { ...form, data: '2026-12-25' };
    // A sugestão MUDA com a data — e é justamente por isso que ela não pode
    // ser aplicada por cima de um texto que já é de alguém.
    expect(sugestaoDe(depois)).not.toBe(sugestaoDe(form));
    expect(termoEfetivo(depois, sugestaoDe(depois))).toBe(meu);
  });
});

describe('F · mudar o TIPO depois de editar não sobrescreve', () => {
  it('nem quando o tipo troca a redação inteira (inspeção × ocorrência)', () => {
    const meu = 'Texto do inspetor.';
    const form = { ...BASE, termoTexto: meu, tipoOcorrencia: 'Inspeção Periódica' };
    expect(sugestaoDe(form)).toContain('executou-se inspeção');
    expect(termoEfetivo(form, sugestaoDe(form))).toBe(meu);
  });

  it('e o campo VAZIO também sobrevive à troca de tipo', () => {
    const form = { ...BASE, termoTexto: '', tipoOcorrencia: 'Inspeção Inicial' };
    expect(termoEfetivo(form, sugestaoDe(form))).toBe('');
  });
});

describe('G e H · a prévia recebe o termo efetivo, vazio incluído', () => {
  it('o modal monta a prévia com o mesmo valor do textarea', () => {
    // Uma fonte só: `termoEfetivo` alimenta o `value` e a prévia.
    expect(modal).toContain('const editouTermo = form.termoTexto !== null;');
    expect(modal).toContain('const termoEfetivo = editouTermo ? (form.termoTexto as string) : sugestao;');
    expect(modal).toContain('value={termoEfetivo}');
    expect(modal).toContain('termo: termoEfetivo,');
    // O `||` que reintroduziria o defeito não pode voltar.
    expect(semComentarios(modal)).not.toContain('form.termoTexto.trim()');
  });
});

describe('I e J · o rascunho preserva vazio e texto personalizado', () => {
  it('a gravação leva o termo efetivo, sem `||`', () => {
    expect(pagina).toContain('termoTexto: termoDoFormulario(),');
    expect(pagina).toContain('if (form.termoTexto !== null) return form.termoTexto;');
    expect(semComentarios(pagina)).not.toContain("form.termoTexto.trim() ||");
  });

  it('o serviço grava a string vazia em vez de trocá-la por ausente', () => {
    expect(servico).toContain('termoTexto: dados.termoTexto ?? undefined,');
    expect(semComentarios(servico)).not.toContain("dados.termoTexto?.trim() || undefined");
  });

  it('reabrir devolve a string vazia como vazio e ausente como intocado', () => {
    expect(pagina).toContain("termoTexto: (r as { termoTexto?: string }).termoTexto ?? null,");
  });

  it('a FOLHA respeita o termo vazio — e só ela monta o texto quando não há campo', () => {
    // `typeof texto === 'string'` distingue "apagado" de "entrada antiga sem o
    // campo". Com `if (texto && texto.trim())`, o papel remontava a frase.
    expect(folha).toContain("if (typeof texto === 'string') el.textContent = texto;");
    expect(folha).toContain(
      "aplicarTermoSomenteLeitura(entrada && typeof entrada.termoTexto === 'string' ? entrada.termoTexto : null);",
    );
  });
});

describe('K, L e M · o modal só fecha pelo X', () => {
  it('o clique no fundo não faz nada', () => {
    expect(modal).toContain('<div className="fj-modal-overlay reg-modal-overlay">');
    expect(semComentarios(modal)).not.toContain('e.target === e.currentTarget && aoFechar()');
  });

  it('ESC não fecha — e o foco continua preso', () => {
    const efeito = modal.slice(modal.indexOf('function aoTeclar'), modal.indexOf('const set ='));
    expect(efeito).not.toContain("e.key === 'Escape'");
    expect(efeito).toContain("e.key !== 'Tab'");
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('aria-labelledby={idTitulo}');
  });

  it('o X é o único caminho, e o "Cancelar" do rodapé saiu', () => {
    expect(modal).toContain('className="fj-modal-close" onClick={tentarFechar}');
    const rodape = modal.slice(modal.indexOf('reg-modal-acoes-btns'));
    expect(rodape).not.toContain('>\n              Cancelar\n            </button>');
  });
});

describe('N · o X pergunta quando há alteração não salva', () => {
  it('compara com o estado da abertura e abre a confirmação', () => {
    expect(modal).toContain('const inicial = useRef(JSON.stringify(form));');
    expect(modal).toContain("const alterado = JSON.stringify(form) !== inicial.current;");
    expect(modal).toContain('if (alterado) setConfirmandoSaida(true);');
    expect(modal).toContain('else aoFechar();');
  });

  it('a confirmação é do sistema, não `window.confirm`', () => {
    expect(modal).toContain('role="alertdialog"');
    expect(modal).toContain('Há alterações ainda não salvas.');
    expect(modal).toContain('Continuar editando');
    expect(modal).toContain('Descartar e fechar');
    // Sem os comentários: um deles cita o `window.confirm` para dizer que ele
    // NÃO é usado aqui.
    expect(semComentarios(modal)).not.toContain('window.confirm');
  });
});
