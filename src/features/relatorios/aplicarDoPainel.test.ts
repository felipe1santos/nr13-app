import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * O QUE SAI DE UM PAINEL VOLTA PARA O DOCUMENTO (10/09/2026).
 *
 * Medido em produção: clicar numa pendência do "O que falta", preencher o
 * Nº da A.R.T. no modal de Configurações e clicar em "Atualizar" não mudava
 * NADA na tela — o campo continuava amarelo e a pendência continuava na lista.
 * A prévia vetorial é gerada sob demanda, e `versaoDados` só a marcava como
 * atrasada; o botão que a refazia tinha outro nome e ficava em outro canto.
 *
 * Quem chega ao painel VINDO da barra já pediu para ver a mudança.
 */
describe('gate · painel que grava refaz a prévia', () => {
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');
  const previa = readFileSync('src/features/relatorios/PreviaVetorial.tsx', 'utf8');

  it('a tela tem um carimbo próprio para "um painel aplicou"', () => {
    expect(tela).toContain('const [aplicadoEm, setAplicadoEm] = useState(0);');
    expect(tela).toContain('aplicadoEm={aplicadoEm}');
  });

  it('Configurações grava, aplica e FECHA', () => {
    const corpo = tela.slice(tela.indexOf('async function atualizarMetadados()'));
    const fim = corpo.slice(0, corpo.indexOf('async function baixarPdf('));
    expect(fim).toContain('await gravarMetaAtual(meta)');
    expect(fim).toContain('setAplicadoEm(Date.now())');
    expect(fim).toContain('setModalConfig(false)');
  });

  it('Medições e Laudo fazem o mesmo', () => {
    const salvou = tela.match(/onSalvou=\{\(\) => \{ setVersao\(\(v\) => v \+ 1\); setAplicadoEm\(Date\.now\(\)\); \}\}/g) ?? [];
    expect(salvou).toHaveLength(2);
  });

  it('a prévia regera quando o carimbo muda — e NÃO na montagem', () => {
    const efeito = previa.slice(previa.indexOf('const primeiroAplicado = useRef(true);'));
    expect(efeito.slice(0, 400)).toContain('if (primeiroAplicado.current)');
    expect(efeito.slice(0, 400)).toContain('}, [aplicadoEm]);');
  });

  it('o botão diz o que faz', () => {
    // "Atualizar" não dizia o quê, e era possível clicar, ver a mesma folha e
    // concluir que o campo não tinha sido aceito.
    expect(tela).toContain('Aplicar ao documento');
  });

  it('trocar de folha ou salvar rascunho continua SEM regerar', () => {
    // A geração custa ~2 s num documento completo. Só o carimbo do painel
    // dispara; `versaoDados` segue apenas marcando a prévia como atrasada.
    expect(previa).toContain('const atrasada = versaoGerada !== null && versaoGerada !== versaoDados;');
    expect((tela.match(/setAplicadoEm\(/g) ?? []).length).toBe(3);
  });
});

describe('gate · a foto da placa pertence ao RELATÓRIO', () => {
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');
  const gerador = readFileSync('src/features/relatorios/pdfVetorial/gerarRelatorio.ts', 'utf8');

  it('o gerador só acha a foto com o id do relatório', () => {
    expect(gerador).toContain('resolverPlacaReal(tag, opcoes.idRelatorio)');
  });

  it('os três caminhos que desenham o documento passam o id', () => {
    // Prévia, "Baixar PDF" do rascunho e a FINALIZAÇÃO. Um deles sem o id
    // faria o mesmo documento sair com placas diferentes em cada caminho.
    expect(tela).toContain('gerarPreviaRelatorio(tag, documentos ?? [], overrides, meta?.codigo)');
    expect(tela).toContain('overrides, idRelatorio: meta.codigo }');
    expect(tela).toContain('idRelatorio: meta.codigo,');
  });

  it('o card da placa recebe o relatório a que a foto pertence', () => {
    expect(tela).toContain('idRelatorio={meta?.codigo ?? \'\'}');
  });
});
