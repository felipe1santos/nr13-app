import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 08/09/2026 · O GATE TRANSVERSAL das IMAGENS QUE MORAM NO COFRE.
 *
 * ## O defeito que se repetiu três vezes
 *
 * Desde 10/08/2026 toda imagem grande do sistema mora no bucket e o registro
 * carrega só uma `RefFoto`. Os snapshots congelados do relatório (§7-bis)
 * seguem a mesma regra do §2-bis: **quando existe referência, a dataURL SAI do
 * snapshot** — é o que impede o histórico de inchar com base64.
 *
 * O gerador vetorial, porém, nasceu lendo só a dataURL. Cada imagem que migrou
 * para o cofre sumiu do documento, uma de cada vez, sem erro nenhum:
 *
 * | imagem | de onde some | quando foi achado |
 * |---|---|---|
 * | foto de capa | `nr13_fotos_<TAG>[].ref` | 06/09/2026 |
 * | logo da empresa | `snapshotEmpresa()` remove `logo`, deixa `logoRef` | 07/09/2026 |
 * | **rubrica do assinante** | `snapshotAssinantes()` remove `assinatura`, deixa `assinaturaRef` | 08/09/2026 |
 *
 * A terceira é a pior: um relatório de inspeção **sem a assinatura do
 * engenheiro** continua parecendo completo.
 *
 * ## A regra que este arquivo trava
 *
 * Toda imagem do documento tem de existir no modelo nas **duas** formas —
 * `x` (dataURL, legado) e `xRef` (cofre) — e o gerador tem de resolver a
 * referência antes de desenhar. Uma imagem nova que entre só com a dataURL
 * quebra aqui, com o nome dela na mensagem, em vez de sumir do PDF de um
 * cliente.
 *
 * ## Por que varredura de fonte
 *
 * A suíte roda em `environment: 'node'`. O caminho completo (baixar do bucket,
 * decodificar, desenhar) está provado em `emissaoVetorial.test.ts`, que gera o
 * PDF de verdade; o que se trava aqui é a ESTRUTURA — que o par exista e que
 * ninguém o desfaça sem ver este teste.
 */

const modelo = readFileSync('src/features/relatorios/pdfVetorial/modelo.ts', 'utf8');
const gerador = readFileSync('src/features/relatorios/pdfVetorial/gerarRelatorio.ts', 'utf8');
const servico = readFileSync('src/features/relatorios/relatoriosService.ts', 'utf8');

/** As imagens do documento: o campo no modelo e a chave de onde ela vem. */
const IMAGENS = [
  { nome: 'foto de capa', campo: 'fotoCapa', ref: 'fotoCapaRef' },
  { nome: 'logo da empresa', campo: 'empresa.logo', ref: 'empresa.logoRef' },
  { nome: 'rubrica do assinante', campo: 'rubrica', ref: 'rubricaRef' },
] as const;

describe('imagens do cofre: a referência nunca pode ser esquecida', () => {
  it.each(IMAGENS)('$nome: o modelo carrega as DUAS formas', ({ ref }) => {
    // O campo `…Ref` tem de existir no tipo — é ele que atravessa até o gerador.
    expect(modelo, `o modelo não expõe ${ref}`).toMatch(new RegExp(`${ref.split('.').pop()}\\s*[:?]`));
  });

  it.each(IMAGENS)('$nome: o gerador RESOLVE a referência antes de desenhar', ({ ref }) => {
    // Todas passam pelo mesmo `resolverFotos`, que é quem sabe ir ao cofre
    // local antes do bucket. Um caminho próprio por imagem foi exatamente o
    // que deixou cada uma se perder sozinha.
    const campoRef = ref.split('.').pop()!;
    expect(gerador, `${campoRef} não é resolvido no gerador`).toContain(campoRef);
  });

  it('o gerador usa UM resolvedor para as três, não três caminhos', () => {
    const chamadas = (gerador.match(/resolverFotos\(\[\{ dataUrl: '', descricao: '', ref:/g) ?? []).length;
    expect(chamadas, 'cada imagem do cofre deve passar por resolverFotos').toBeGreaterThanOrEqual(3);
  });

  it('os snapshots REMOVEM a dataURL quando há referência — é essa a razão do gate', () => {
    // Se um dia estes dois deixarem de remover, o gate acima perde o sentido e
    // este teste avisa que a premissa mudou (em vez de o leitor descobrir pelo
    // comentário desatualizado).
    expect(servico).toContain('const { logo: _dataUrl, ...resto } = viva;');
    expect(servico).toContain('? { assinaturaRef: f.assinaturaRef }');
    expect(servico).toContain(': { assinatura: f.assinatura }');
  });

  it('a rubrica do assinante é lida das DUAS formas, não só da dataURL', () => {
    // O defeito de 08/09/2026, na forma exata em que ele existia:
    // `rubrica: txt(meta?.assinantes?.engenheiro?.assinatura)` e nada mais.
    expect(modelo).toContain('rubricaDe(meta?.assinantes?.engenheiro)');
    expect(modelo).toContain('rubricaDe(meta?.assinantes?.tecnico)');
    expect(modelo).toContain('assinaturaRef');
    expect(modelo).not.toMatch(/rubrica: txt\(meta\?\.assinantes\?\.\w+\?\.assinatura\)/);
  });

  it('nada de Base64 novo: o cofre continua sendo o dono do arquivo', () => {
    // O gerador só LÊ a referência. Se algum dia ele voltar a gravar a dataURL
    // no registro, a cota do §2-bis volta junto.
    expect(gerador).not.toMatch(/salvar\(|guardarPdf\(|salvarArquivo\(/);
  });
});
