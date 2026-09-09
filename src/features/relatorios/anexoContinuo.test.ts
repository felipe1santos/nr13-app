import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 09/09/2026 · RELATÓRIO + ANEXOS SÃO **UM** DOCUMENTO.
 *
 * ## A separação que existia, e de onde ela vinha
 *
 * A prévia vetorial gerava com `certificados: false` — os anexos não entravam
 * nos bytes. O buraco era preenchido por outro caminho: `AnexosRastreabPreview`
 * rasterizava as páginas do certificado e as desenhava como `<img>` dentro de
 * `.relatorio-preview`, logo abaixo do visualizador.
 *
 * Esse bloco estava **fora** da guarda `montaIframes(fluxo)`. No fluxo de
 * iframes (o rollback) ele fazia sentido: as folhas do relatório também eram
 * HTML, e o anexo era mais uma folha da mesma pilha. No fluxo vetorial — padrão
 * desde a 13E — o `.relatorio-preview` fica vazio, e ele virava um segundo
 * documento: outro contêiner, outro fundo, outra rolagem, e um vão entre os
 * dois.
 *
 * ## O que este arquivo trava
 *
 * 1. a prévia gera COM certificados (mesmos bytes, mesma sequência);
 * 2. o bloco de imagens só existe no fluxo de iframes;
 * 3. os anexos entram por CÓPIA de página (pdf-lib), nunca rasterizados;
 * 4. nada é desenhado por cima deles — sem paginação, sem cabeçalho, sem SHA;
 * 5. o visualizador mede CADA página, então anexo em outro formato não deforma;
 * 6. a emissão continua produzindo um arquivo só, e o SHA é dele.
 */

const gerador = readFileSync('src/features/relatorios/pdfVetorial/gerarRelatorio.ts', 'utf8');
const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');
const rastreab = readFileSync('src/features/relatorios/rastreabilidadeService.ts', 'utf8');
const visualizador = readFileSync('src/components/VisualizadorPdf.tsx', 'utf8');
const artefato = readFileSync('src/features/relatorios/artefatoRelatorio.ts', 'utf8');

describe('a prévia mostra a mesma sequência que o arquivo emitido', () => {
  const previa = gerador.slice(gerador.indexOf('export async function gerarPreviaRelatorio'));

  it('gera COM os certificados', () => {
    expect(previa).toContain('certificados: true');
    expect(previa).not.toContain('certificados: false');
  });

  it('a prévia e a emissão chamam o MESMO gerador', () => {
    // Um segundo caminho de montagem é como a prévia deixa de representar o
    // documento sem ninguém perceber.
    expect(previa).toContain('await gerarRelatorioVetorial(tag, {');
  });

  it('o "Página X de Y" conta o arquivo inteiro, anexos incluídos', () => {
    expect(gerador).toContain('const anexas = await contarPaginasAnexadas(opcoes);');
    expect(gerador).toContain('const total = paginasDoCorpo + anexas;');
    // E a contagem respeita quem pediu para não anexar.
    expect(gerador).toContain("if (opcoes.certificados === false || documentos.length === 0) return 0;");
  });
});

describe('não existe um segundo visualizador no fluxo vetorial', () => {
  it('o bloco de imagens dos anexos só é montado no fluxo de iframes', () => {
    expect(tela).toContain('{montaIframes(fluxo) && (\n              <AnexosRastreabPreview');
  });

  it('a prévia vetorial usa UM visualizador, alimentado por bytes', () => {
    const previa = readFileSync('src/features/relatorios/PreviaVetorial.tsx', 'utf8');
    expect((previa.match(/<VisualizadorPdfBytes/g) ?? [])).toHaveLength(1);
  });
});

describe('as páginas do anexo chegam intactas', () => {
  it('entram por CÓPIA de página, não por rasterização', () => {
    // `copyPages` preserva o conteúdo e a geometria (MediaBox/CropBox) de cada
    // página do PDF de origem.
    expect(rastreab).toContain('const paginas = await doc.copyPages(anexo, anexo.getPageIndices());');
    expect(rastreab).toContain('for (const p of paginas) doc.addPage(p);');
    expect(rastreab).not.toMatch(/html2canvas|toDataURL|drawImage/);
  });

  it('nada é desenhado por cima delas', () => {
    // O corpo é desenhado ANTES; o anexo é acrescentado a um documento pronto.
    // Se algum dia alguém carimbar as páginas anexadas, é aqui que apareceria.
    const bloco = rastreab.slice(
      rastreab.indexOf('export async function anexarRastreabilidades'),
      rastreab.indexOf('export function padraoDoEnsaio'),
    );
    expect(bloco).not.toMatch(/drawText|drawRectangle|drawLine|setFont\(/);
  });

  it('certificado protegido não derruba o anexo inteiro', () => {
    expect(rastreab).toContain('ignoreEncryption: true');
  });

  it('anexo que não resolve volta NOMEADO, nunca some calado', () => {
    expect(rastreab).toContain('falhas.push(r.nome || r.id);');
  });
});

describe('anexo em outro tamanho de folha não é deformado', () => {
  it('o visualizador mede CADA página e escala por página', () => {
    expect(visualizador).toContain('const v = p.getViewport({ scale: 1 });');
    expect(visualizador).toContain('lista.push({ numero: n, largura: v.width, altura: v.height });');
    expect(visualizador).toContain('escalaDe(p.largura)');
  });

  it('a altura sai da página, não de um A4 assumido', () => {
    // Altura fixa com largura medida é exatamente como se estica um anexo
    // paisagem.
    expect(visualizador).toContain('height: Math.round(p.altura * escalaDe(p.largura))');
  });
});

describe('a emissão continua produzindo UM arquivo, e o SHA é dele', () => {
  it('o SHA é calculado sobre os bytes que já levam os anexos', () => {
    // Ordem no gerador: desenha o corpo → anexa → devolve `bytes`. Quem publica
    // recebe esses bytes e só então calcula o hash.
    const iAnexo = gerador.indexOf('await anexarRastreabilidades(');
    const iRetorno = gerador.indexOf('return {\n    bytes,');
    expect(iAnexo).toBeGreaterThan(0);
    expect(iRetorno).toBeGreaterThan(iAnexo);
    expect(artefato).toContain('sha256');
  });

  it('a contagem de páginas é relida do arquivo final', () => {
    // Somar "corpo + previsto" mentiria quando um anexo falha em abrir.
    expect(gerador).toContain('paginas = (await PDFDocument.load(bytes)).getPageCount();');
  });

  it('falha em anexar NÃO invalida o relatório — ela volta nomeada', () => {
    expect(gerador).toContain("falhasAnexo.push('certificados padrão');");
    expect(gerador).toContain("falhasAnexo.push('folhas de calibração');");
  });

  it('documento já arquivado não é regerado', () => {
    // §7-quater: com `pdfRef`, a tela serve o arquivo. A prévia nem é montada.
    expect(tela).toContain('relatorioArquivado');
    expect(tela).toContain("fluxo === 'vetorial' && !somenteLeitura && (");
  });
});

describe('o ícone da seção Relatórios', () => {
  const icones = readFileSync('src/components/Icone.tsx', 'utf8');
  const menu = readFileSync('src/app/menu.ts', 'utf8');

  it('o menu usa o ícone do documento que a seção produz', () => {
    // Era `barchart` — gráfico de barras para a tela que lista documentos.
    expect(menu).toContain("{ id: 'relatorios', to: '/relatorios', label: 'Relatórios', icone: 'pdf' },");
  });

  it('é desenhado no sprite, não um arquivo de imagem', () => {
    // Um PNG de 1240px sai borrado nos 17px do menu, e o sprite existe para não
    // depender de arquivo.
    expect(icones).toContain('  pdf: (');
    expect(icones).not.toMatch(/<img|\.png|\.webp/);
  });

  it('a folha herda a cor do item; só a TARJA é fixa', () => {
    const bloco = icones.slice(icones.indexOf('  pdf: ('), icones.indexOf('};', icones.indexOf('  pdf: (')));
    // Exatamente duas cores literais: o vermelho da tarja e o branco das letras.
    const cores = bloco.match(/#[0-9A-Fa-f]{3,6}/g) ?? [];
    expect(new Set(cores)).toEqual(new Set(['#D91E18', '#ffffff']));
    // E a folha continua sem cor própria — ela é `currentColor` pelo CSS do sprite.
    expect(bloco).toContain('<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />');
  });

  it('o resto do sprite continua sem cor própria', () => {
    const outros = icones.slice(icones.indexOf('const PATHS'), icones.indexOf('  pdf: ('));
    expect(outros).not.toMatch(/fill="#|stroke="#/);
  });
});
