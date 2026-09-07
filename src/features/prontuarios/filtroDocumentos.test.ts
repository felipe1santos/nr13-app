import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FILTRO_DOC_VAZIO,
  passaNoFiltro,
  periodoDe,
  temFiltroDoc,
} from './ModalFiltrosDocumentos';
import type { DocumentoProntuario } from './indiceProntuarios';
import { iniciaisDe, tomDoNome } from '../cadastros/AvatarPessoa';

const doc = (p: Partial<DocumentoProntuario> = {}): DocumentoProntuario => ({
  id: 'P-1',
  tag: 'VP-01',
  equipamento: 'Vaso pulmão',
  cliente: 'ACME',
  tipo: 'Vaso de Pressão',
  categoria: 'III',
  situacao: 'emitido',
  revisao: 1,
  numero: 'REL-1',
  atualizadoEm: '2026-09-06T10:00:00.000Z',
  temArquivo: true,
  paginas: 4,
  pdfPendente: false,
  ...p,
});

describe('o filtro de documentos', () => {
  it('o vazio não filtra nada', () => {
    expect(temFiltroDoc(FILTRO_DOC_VAZIO)).toBe(false);
    expect(passaNoFiltro(doc(), FILTRO_DOC_VAZIO)).toBe(true);
  });

  it('acende quando qualquer campo é preenchido', () => {
    expect(temFiltroDoc({ ...FILTRO_DOC_VAZIO, situacao: 'rascunho' })).toBe(true);
    expect(temFiltroDoc({ ...FILTRO_DOC_VAZIO, de: '2026-09-01' })).toBe(true);
    expect(temFiltroDoc({ ...FILTRO_DOC_VAZIO, revisao: '2' })).toBe(true);
  });

  it('recorta por período pelo DIA, não pelo instante', () => {
    const f = { ...FILTRO_DOC_VAZIO, de: '2026-09-06', ate: '2026-09-06' };
    // Mesmo dia, hora diferente: entra. Comparar ISO inteiro deixaria de fora
    // tudo que foi emitido depois das 00:00 do dia final.
    expect(passaNoFiltro(doc({ atualizadoEm: '2026-09-06T23:59:00.000Z' }), f)).toBe(true);
    expect(passaNoFiltro(doc({ atualizadoEm: '2026-09-05T23:59:00.000Z' }), f)).toBe(false);
    expect(passaNoFiltro(doc({ atualizadoEm: '2026-09-07T00:01:00.000Z' }), f)).toBe(false);
  });

  it('documento SEM data só sai quando o recorte é de data', () => {
    const semData = doc({ atualizadoEm: '' });
    expect(passaNoFiltro(semData, FILTRO_DOC_VAZIO)).toBe(true);
    expect(passaNoFiltro(semData, { ...FILTRO_DOC_VAZIO, cliente: 'ACME' })).toBe(true);
    // Pedindo período, ele não tem como provar que está dentro.
    expect(passaNoFiltro(semData, { ...FILTRO_DOC_VAZIO, de: '2026-09-01' })).toBe(false);
  });

  it('recorta por cliente, TAG, tipo, categoria, situação e revisão', () => {
    expect(passaNoFiltro(doc(), { ...FILTRO_DOC_VAZIO, cliente: 'OUTRA' })).toBe(false);
    expect(passaNoFiltro(doc(), { ...FILTRO_DOC_VAZIO, tag: 'VP-01' })).toBe(true);
    expect(passaNoFiltro(doc(), { ...FILTRO_DOC_VAZIO, tipo: 'Caldeira' })).toBe(false);
    expect(passaNoFiltro(doc(), { ...FILTRO_DOC_VAZIO, categoria: 'III' })).toBe(true);
    expect(passaNoFiltro(doc(), { ...FILTRO_DOC_VAZIO, situacao: 'rascunho' })).toBe(false);
    expect(passaNoFiltro(doc({ revisao: 2 }), { ...FILTRO_DOC_VAZIO, revisao: '2' })).toBe(true);
  });

  it('entrada antiga sem tipo/categoria não é escondida por acaso', () => {
    // O índice anterior a 07/09/2026 não guardava os dois campos. Sem filtro
    // deles, a linha continua aparecendo.
    const antiga = doc({ tipo: undefined, categoria: undefined });
    expect(passaNoFiltro(antiga, FILTRO_DOC_VAZIO)).toBe(true);
    // Com filtro, ela sai — e é por isso que o seletor só aparece quando há
    // valor para oferecer.
    expect(passaNoFiltro(antiga, { ...FILTRO_DOC_VAZIO, tipo: 'Vaso de Pressão' })).toBe(false);
  });
});

describe('atalhos de período', () => {
  const hoje = new Date(2026, 8, 7); // 07/09/2026

  it('hoje é o mesmo dia nos dois extremos', () => {
    expect(periodoDe('hoje', hoje)).toEqual({ de: '2026-09-07', ate: '2026-09-07' });
  });

  it('7 dias INCLUI hoje — são 7, não 8', () => {
    expect(periodoDe('7', hoje)).toEqual({ de: '2026-09-01', ate: '2026-09-07' });
  });

  it('30 dias idem', () => {
    expect(periodoDe('30', hoje)).toEqual({ de: '2026-08-09', ate: '2026-09-07' });
  });
});

describe('avatar do funcionário', () => {
  it('usa a primeira letra do primeiro e do último nome', () => {
    expect(iniciaisDe('João Silva')).toBe('JS');
    expect(iniciaisDe('Maria')).toBe('M');
  });

  it('ignora partículas — "João da Silva" é JS, não JD', () => {
    expect(iniciaisDe('João da Silva')).toBe('JS');
    expect(iniciaisDe('Ana dos Santos')).toBe('AS');
  });

  it('sem nome não inventa letra', () => {
    expect(iniciaisDe('')).toBe('');
    expect(iniciaisDe('   ')).toBe('');
  });

  it('a cor é estável para a mesma pessoa', () => {
    // É o que faz o avatar ajudar a achar alguém na lista, em vez de ser só
    // um círculo colorido.
    expect(tomDoNome('João Silva')).toBe(tomDoNome('João Silva'));
    expect(tomDoNome('João Silva')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('o shell das telas de lista (07/09/2026)', () => {
  /*
   * Medido em produção, com 1.154px de área disponível:
   *
   *   /relatorios   1.144px de largura, sem h1,  61px até o conteúdo
   *   /prontuarios  1.000px,            com h1, 157px
   *   /calibracoes  1.000px,            com h1, 174px
   *   /inspecoes    1.000px,            com h1, 208px
   *
   * Duas causas no CSS da página: `max-width: 1000px` numa área de 1.154 — a
   * lista virava uma caixa estreita com 154px de margem morta — e
   * `padding: 24px` + `gap: 18px` somados a um `<h1>` que repetia o título da
   * topbar.
   */
  const shells = [
    ['prontuarios', readFileSync('src/pages/prontuarios.css', 'utf8')],
    ['inspecoes', readFileSync('src/pages/inspecoes.css', 'utf8')],
    ['calibracoes', readFileSync('src/pages/calibracoes.css', 'utf8')],
  ] as const;

  for (const [nome, folha] of shells) {
    it(`/${nome} usa a mesma largura e o mesmo respiro de /relatorios`, () => {
      const regra = new RegExp(`\\.${nome}-page \\{([^}]*)\\}`).exec(folha)![1];
      expect(regra).toContain('max-width: 1400px;');
      expect(regra).toContain('padding: 14px 20px 28px;');
      expect(regra).toContain('gap: 12px;');
      expect(regra).not.toContain('max-width: 1000px');
    });
  }

  it('nenhuma das três repete na página o título que a topbar já mostra', () => {
    const telas = [
      readFileSync('src/pages/Prontuarios.tsx', 'utf8'),
      readFileSync('src/pages/Calibracoes.tsx', 'utf8'),
      readFileSync('src/features/inspecoes/InspecoesV9.tsx', 'utf8'),
    ];
    for (const t of telas) {
      const semComentario = t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      expect(semComentario).not.toMatch(/<h1>(Prontuários|Calibrações|Inspeções)<\/h1>/);
    }
  });
});

describe('o filtro da lista de documentos', () => {
  const modal = readFileSync('src/features/prontuarios/ModalFiltrosDocumentos.tsx', 'utf8');
  const lista = readFileSync('src/features/prontuarios/ListaProntuariosV9.tsx', 'utf8');

  it('"com prontuário / sem prontuário" saiu', () => {
    // Era a pergunta de uma lista de EQUIPAMENTOS. Numa lista de DOCUMENTOS
    // ela não tem resposta: toda linha é um documento.
    expect(modal).not.toContain('Com prontuário');
    expect(modal).not.toContain('Sem prontuário ainda');
    expect(lista).toContain('<ModalFiltrosDocumentos');
    expect(lista).not.toContain('ModalFiltrosProntuarios');
  });

  it('tem período, empresa, equipamento, situação e revisão', () => {
    for (const s of ['Período', 'Empresa / cliente', 'Equipamento', 'Situação', 'Revisão']) {
      expect(modal).toContain(`<h3>${s}</h3>`);
    }
  });

  it('os atalhos de período são os pedidos', () => {
    expect(modal).toContain('Últimos 7 dias');
    expect(modal).toContain('Últimos 30 dias');
    expect(modal).toContain('Hoje');
  });

  it('a empresa usa a logo REAL do cadastro, e a inicial quando não há', () => {
    expect(modal).toContain('c.logoUrl');
    expect(modal).toContain('nome.slice(0, 1).toUpperCase()');
    // Nada de imagem inventada para um cliente sem logo.
    expect(modal).not.toContain('placeholder.com');
    expect(modal).not.toContain('ui-avatars');
  });

  it('o seletor de equipamento diz TAG, nome, tipo e cliente, e tem busca', () => {
    expect(modal).toContain('mfd-busca');
    expect(modal).toContain('[e.nome, e.tipo, e.cliente]');
  });

  it('as opções saem do que EXISTE na lista', () => {
    // Um seletor que oferece um valor sem documento atrás dele é um beco sem
    // saída — e tipo/categoria só existem nas entradas novas.
    expect(modal).toContain('const unicos =');
    expect(modal).toContain('tipos.length > 0');
    expect(modal).toContain('categorias.length > 0');
  });

  it('tem Limpar, Cancelar e Aplicar, e só aplica no Aplicar', () => {
    expect(modal).toMatch(/>\s*Limpar\s*</);
    expect(modal).toMatch(/>\s*Cancelar\s*</);
    expect(modal).toMatch(/>\s*Aplicar\s*</);
    expect(modal).toContain('onClick={() => aoAplicar(f)}');
  });
});

describe('a prévia do prontuário subiu', () => {
  const pagina = readFileSync('src/pages/Prontuarios.tsx', 'utf8');
  const maisAcoes = readFileSync('src/features/prontuarios/MaisAcoesProntuario.tsx', 'utf8');

  it('a faixa de metadados saiu de cima do documento', () => {
    // Era um parágrafo de largura inteira entre a barra e a prévia.
    const semComentario = pagina.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(semComentario).not.toContain('className="pront-emissao"');
    expect(semComentario).not.toContain('Documento emitido em');
  });

  it('o mesmo texto virou a segunda linha da barra', () => {
    expect(pagina).toContain('`${emissao.paginas} páginas`');
    expect(pagina).toContain("`verificação ${emissao.sha256.slice(0, 8)}…`");
    // O código completo fica no tooltip: ele é longo e serve para conferir.
    expect(pagina).toContain('Código de verificação: ${emissao.sha256}');
  });

  it('o ERRO de emissão continua visível — ele não é metadado', () => {
    expect(pagina).toContain('pront-emissao-erro');
  });

  it('com documento emitido, "Editar" sai da linha principal', () => {
    // O que está na tela é um ARQUIVO que não se edita. Editar prepara a
    // PRÓXIMA revisão, e o menu diz isso.
    expect(pagina).toContain('{!emissao && (');
    expect(pagina).toContain('aoEditar={emissao ? () => setTela(\'formulario\') : undefined}');
    expect(maisAcoes).toContain('Editar dados (nova revisão)');
  });
});

describe('avatar do funcionário', () => {
  const pagina = readFileSync('src/pages/Funcionarios.tsx', 'utf8');
  const avatar = readFileSync('src/features/cadastros/AvatarPessoa.tsx', 'utf8');

  it('a linha mostra o avatar antes do nome', () => {
    expect(pagina).toContain('<AvatarPessoa nome={f.nome} />');
    expect(pagina.indexOf('<AvatarPessoa')).toBeLessThan(pagina.indexOf('className="cad-item-nome"'));
  });

  it('NÃO usa a assinatura como retrato', () => {
    // A rubrica vai ao documento assinado; usá-la como foto mostraria um
    // rabisco no lugar de uma pessoa e a exporia num lugar casual. O
    // cabeçalho do arquivo EXPLICA isso, então a busca é no código.
    const codigo = avatar.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codigo).not.toContain('assinatura');
  });

  it('não inventou campo de foto no cadastro', () => {
    const tipos = readFileSync('src/features/cadastros/tipos.ts', 'utf8');
    const bloco = /export interface Funcionario \{[\s\S]*?\n\}/.exec(tipos)![0];
    expect(bloco).not.toContain('foto');
  });
});

