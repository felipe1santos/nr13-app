/**
 * GATE · abrir o Livro de Registro a qualquer momento (21/11/2026).
 *
 * Queixa de cliente: "apenas quando defini 'inicial' abre o registro de
 * segurança… precisa abrir o livro com equipamento em operação quando se perde
 * o livro original". O Termo de Abertura só existia auto-injetado no relatório.
 *
 * O que trava aqui:
 *  · o texto do termo (redação da folha TERMO-ABERTURA.html + motivo);
 *  · o motivo é obrigatório, e "primeiro livro" não serve a livro com lacre;
 *  · o caminho é ACRESCENTAR — rascunho → trancar —, nunca reescrever a chave
 *    oficial `nr13_livro_<TAG>` (§7-quinquies, `livro_imutavel.sql`).
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = new Map<string, unknown>();
vi.mock('../../services/storage', () => ({
  ler: (k: string) => (cache.has(k) ? cache.get(k) : null),
}));

const {
  MOTIVOS_ABERTURA,
  TIPO_ABERTURA,
  dadosAberturaDoCache,
  descricaoDoMotivo,
  ehAbertura,
  impedimentoDoMotivo,
  motivoPelaDescricao,
  podeTrocarDescricao,
  porExtenso,
  termoDeAbertura,
} = await import('./aberturaLivro');
const { sugestaoDoFormulario } = await import('./sugestaoTermo');
const { FORM_OCORRENCIA_VAZIO } = await import('./formRegistro');
const { tituloTermo } = await import('./termoRegistro');

const TAG = 'VP-ABERTURA-01';

beforeEach(() => {
  cache.clear();
  cache.set(`nr13_info_${TAG}`, { tipo: 'vaso', descricao: 'Pulmão de ar', fabricante: 'ACME', numeroSerie: 'S-77' });
  cache.set(`nr13_emp_${TAG}`, {
    razaoSocial: 'Cliente SA',
    cnpj: '00.000.000/0001-00',
    endereco: 'Rua A, 10',
    cidade: 'Campinas',
    estado: 'SP',
  });
});

describe('os dados do termo vêm das MESMAS chaves da folha TERMO-ABERTURA.html', () => {
  it('equipamento, cliente e o padrão de 50 folhas', () => {
    const d = dadosAberturaDoCache(TAG);
    expect(d).toMatchObject({
      tag: TAG,
      tipo: 'vaso',
      fabricante: 'ACME',
      numeroSerie: 'S-77',
      cliente: 'Cliente SA',
      cnpj: '00.000.000/0001-00',
      endereco: 'Rua A, 10, Campinas/SP',
      totalFolhas: 50,
    });
  });

  it('o total de folhas sai de `nr13_livro_config_<TAG>` quando existe', () => {
    cache.set(`nr13_livro_config_${TAG}`, { totalFolhas: 100 });
    expect(dadosAberturaDoCache(TAG).totalFolhas).toBe(100);
  });

  it('equipamento recém-criado, sem ficha nenhuma: não quebra, escreve os marcadores', () => {
    cache.clear();
    const t = termoDeAbertura({ data: '2026-11-21', motivo: 'primeiro', equipamento: dadosAberturaDoCache(TAG) });
    expect(t).toContain(`TAG ${TAG}`);
    expect(t).toContain('EMPRESA NÃO INFORMADA');
    expect(t).toContain('CNPJ não informado');
  });

  it('a folha HTML lê exatamente estas famílias', () => {
    const folha = readFileSync('public/arquivos-inspecao/TERMO-ABERTURA.html', 'utf8');
    for (const k of ['nr13_info_', 'nr13_emp_', 'nr13_livro_config_']) expect(folha).toContain(k);
  });
});

describe('o texto do Termo de Abertura', () => {
  const equipamento = () => dadosAberturaDoCache(TAG);

  it('segue a redação da folha, com data, folhas por extenso e o subitem da NR-13', () => {
    const t = termoDeAbertura({ data: '2026-11-21', motivo: 'primeiro', equipamento: equipamento() });
    expect(t).toContain('Em 21/11/2026, lavra-se o presente Termo de Abertura.');
    expect(t).toContain('Este livro contém 50 (cinquenta) folhas numeradas tipograficamente de 01 a 50');
    expect(t).toContain('Livro de Registro de Segurança do Vaso de Pressão Pulmão de ar, fabricado por ACME');
    expect(t).toContain('Número de Série: S-77');
    expect(t).toContain('subitem 13.5.1.7 da Norma Regulamentadora nº 13');
  });

  it('caldeira cita o subitem da caldeira', () => {
    cache.set(`nr13_info_${TAG}`, { tipo: 'caldeira' });
    const t = termoDeAbertura({ data: '2026-11-21', motivo: 'primeiro', equipamento: equipamento() });
    expect(t).toContain('Caldeira');
    expect(t).toContain('subitem 13.4.1.8');
  });

  it('o motivo vai ESCRITO no termo — livro extraviado não se passa por primeiro livro', () => {
    const primeiro = termoDeAbertura({ data: '2026-11-21', motivo: 'primeiro', equipamento: equipamento() });
    const extravio = termoDeAbertura({ data: '2026-11-21', motivo: 'extravio', equipamento: equipamento() });
    const encerrado = termoDeAbertura({ data: '2026-11-21', motivo: 'encerrado', equipamento: equipamento() });
    expect(primeiro).not.toContain('substitui');
    expect(extravio).toContain('substitui o Livro de Registro de Segurança anterior, que foi extraviado');
    expect(extravio).toContain('equipamento em operação');
    expect(encerrado).toContain('dá continuidade ao Livro de Registro de Segurança anterior, encerrado');
  });

  it('o extenso confere com o da folha', () => {
    expect(porExtenso(50)).toBe('cinquenta');
    expect(porExtenso(100)).toBe('cem');
    expect(porExtenso(101)).toBe('cento e um');
    expect(porExtenso(1200)).toBe('mil e duzentos');
  });

  it('o título do bloco vira "Termo de Abertura:"', () => {
    expect(tituloTermo(TIPO_ABERTURA)).toBe('Termo de Abertura:');
    expect(tituloTermo('Reparo')).toBe('Termo de Ocorrência:');
  });

  it('a sugestão do formulário (prévia E gravação) usa o termo de abertura', () => {
    const form = { ...FORM_OCORRENCIA_VAZIO, tipoOcorrencia: TIPO_ABERTURA, data: '2026-11-21', motivoAbertura: 'extravio' as const };
    const s = sugestaoDoFormulario(form, { tag: TAG, empresa: 'MDK' });
    expect(s).toContain('lavra-se o presente Termo de Abertura');
    expect(s).toContain('extraviado');
    // E um tipo comum continua no termo de ocorrência.
    const reparo = sugestaoDoFormulario({ ...form, tipoOcorrencia: 'Reparo', oQueFoiFeito: 'Solda' }, { tag: TAG, empresa: 'MDK' });
    expect(reparo).toContain('registrou-se a seguinte ocorrência');
  });
});

describe('o motivo', () => {
  it('é obrigatório', () => {
    expect(impedimentoDoMotivo('', 0)).not.toBe('');
    expect(impedimentoDoMotivo(undefined, 3)).not.toBe('');
  });

  it('"primeiro livro" não serve a um livro que já tem registro lacrado', () => {
    expect(impedimentoDoMotivo('primeiro', 0)).toBe('');
    expect(impedimentoDoMotivo('primeiro', 2)).toContain('já tem registros lacrados');
  });

  it('extravio e encerramento servem a qualquer livro — vazio ou não', () => {
    // O livro perdido pode nunca ter sido lançado no sistema: o caso do cliente.
    for (const m of ['extravio', 'encerrado'] as const) {
      expect(impedimentoDoMotivo(m, 0)).toBe('');
      expect(impedimentoDoMotivo(m, 5)).toBe('');
    }
  });

  it('volta da descrição gravada — inclusive o mais longo vencendo o prefixo', () => {
    for (const m of MOTIVOS_ABERTURA) expect(motivoPelaDescricao(m.descricao)).toBe(m.id);
    expect(motivoPelaDescricao(`${descricaoDoMotivo('extravio')} — detalhe`)).toBe('extravio');
    expect(motivoPelaDescricao('texto escrito à mão')).toBe('');
  });

  it('trocar o motivo não reescreve o que o usuário digitou', () => {
    expect(podeTrocarDescricao('')).toBe(true);
    expect(podeTrocarDescricao(descricaoDoMotivo('primeiro'))).toBe(true);
    expect(podeTrocarDescricao('Abertura após incêndio no almoxarifado')).toBe(false);
  });

  it('`ehAbertura` reconhece só o tipo da abertura', () => {
    expect(ehAbertura(TIPO_ABERTURA)).toBe(true);
    expect(ehAbertura('Inspeção Inicial')).toBe(false);
  });
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const pagina = semComentarios(readFileSync('src/pages/LivroRegistro.tsx', 'utf8'));
const modal = semComentarios(readFileSync('src/features/livro/ModalNovoRegistro.tsx', 'utf8'));
const modulo = semComentarios(readFileSync('src/features/livro/aberturaLivro.ts', 'utf8'));

describe('o caminho: explícito, a qualquer momento, e só ACRESCENTA', () => {
  it('a tela do livro tem o botão, sempre — e o chamado no livro vazio', () => {
    expect(pagina).toContain('function abrirModalAbertura()');
    expect(pagina).toContain('className="livro-doc-card livro-doc-abrir" onClick={abrirModalAbertura}');
    expect(pagina).toContain('Abrir o livro (Termo de Abertura)');
    // Nenhuma condição de "inspeção inicial" guarda o botão.
    const trecho = pagina.slice(pagina.indexOf('livro-doc-abrir') - 300, pagina.indexOf('livro-doc-abrir'));
    expect(trecho).not.toMatch(/Inicial/);
  });

  it('a abertura vira RASCUNHO pelo mesmo `salvarOcorrencia` — e o motivo é conferido antes', () => {
    const salvar = pagina.slice(pagina.indexOf('async function salvarOcorrencia'));
    expect(salvar.indexOf('impedimentoDoMotivo(')).toBeGreaterThan(-1);
    expect(salvar.indexOf('impedimentoDoMotivo(')).toBeLessThan(salvar.indexOf('salvarRascunhoLivro('));
  });

  it('nada aqui escreve na chave oficial do livro nem na configuração', () => {
    // Abrir livro novo = acrescentar. Quem grava é `rascunhosLivro` (rascunho)
    // e o trancamento (fim do array, lacrado). Reescrever `nr13_livro_<TAG>`
    // seria recusado pelo banco — e é exatamente o que não se faz.
    expect(modulo).not.toMatch(/salvar\(|gravar\(|excluirChave|nr13_livro_\$\{tag\}`\s*,/);
    expect(modulo).not.toContain("from '../../services/storage';\nimport { salvar");
    expect(modulo).toMatch(/import \{ ler \} from '..\/..\/services\/storage'/);
  });

  it('o modal pede o motivo e oferece a abertura na lista de tipos', () => {
    expect(modal).toContain('role="radiogroup"');
    expect(modal).toContain('MOTIVOS_ABERTURA.map');
    expect(modal).toContain('const conhecidos = [...TIPOS_OCORRENCIA, TIPO_ABERTURA];');
  });
});
