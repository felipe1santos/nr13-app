/**
 * ANEXAR PRONTUÁRIO EXISTENTE (19/09/2026).
 *
 * O que este arquivo trava:
 *  · o PDF do usuário entra como documento de ORIGEM 'anexado', sem virar
 *    revisão do documento que o sistema gera;
 *  · os bytes não são tocados — o SHA gravado é o dos bytes enviados;
 *  · UM registro, UM arquivo: a ficha e `/prontuarios` mostram a MESMA linha;
 *  · arquivo que não é PDF (inclusive o renomeado) não vira registro nenhum;
 *  · os dois pontos de entrada chamam o MESMO serviço.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const banco = new Map<string, unknown>();
vi.mock('../../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
  listarChavesComPrefixo: (p: string) => [...banco.keys()].filter((k) => k.startsWith(p)),
}));

import {
  anexarProntuarioExistente,
  LIMITE_ANEXO_BYTES,
  rotuloOrigemDocumento,
  validarPdf,
} from '../anexoProntuario';
import {
  agendarConfirmacaoDeEnvios,
  confirmarEnvios,
  emissaoAtual,
  listarAnexados,
  listarEmissoes,
  registrarEmissao,
  revisaoDe,
  type EmissaoProntuario,
} from '../emissaoProntuario';
import { confirmarEnvioNoIndice, docDeEmissao, listarDocumentos, registrarDocumento } from '../indiceProntuarios';

const TAG = 'ZZ-PRONT-01';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3]);
const arquivo = { nome: 'prontuario-antigo.pdf', tamanho: PDF.length, mimeType: 'application/pdf' };

/** `publicarArtefato` de mentira: guarda os bytes e devolve o artefato. */
function publicadorFalso() {
  const enviados: Uint8Array[] = [];
  let n = 0;
  return {
    enviados,
    publicar: async (bytes: Uint8Array, paginas: number) => {
      enviados.push(bytes);
      n += 1;
      return {
        pdfRef: { bucket: 'inspecao', path: `org/relatorios/anexo-${n}.pdf`, mimeType: 'application/pdf', tamanho: bytes.length },
        sha256: `sha-de-${bytes.length}-${bytes[0]}`,
        geradoEm: '2026-09-19T21:00:00.000Z',
        paginas,
        pendente: false,
      };
    },
  };
}

beforeEach(() => banco.clear());

describe('validação do arquivo', () => {
  it('aceita um PDF de verdade', () => {
    expect(validarPdf(arquivo, PDF)).toEqual({ ok: true });
  });

  it('recusa o que não é PDF — inclusive o RENOMEADO para .pdf', () => {
    const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]); // assinatura de ZIP/OOXML
    expect(validarPdf({ ...arquivo, mimeType: '' }, docx)).toEqual({
      ok: false,
      erro: 'Este arquivo não é um PDF válido (o conteúdo não tem a assinatura de PDF).',
    });
    expect(validarPdf({ ...arquivo, nome: 'foto.jpg' }, PDF).ok).toBe(false);
    expect(validarPdf({ ...arquivo, mimeType: 'image/jpeg' }, PDF).ok).toBe(false);
  });

  it('recusa vazio e acima do limite', () => {
    expect(validarPdf(arquivo, new Uint8Array(0))).toEqual({ ok: false, erro: 'O arquivo está vazio.' });
    const gigante = new Uint8Array(LIMITE_ANEXO_BYTES + 1);
    gigante.set(PDF.slice(0, 5));
    expect(validarPdf({ ...arquivo, tamanho: gigante.length }, gigante).ok).toBe(false);
  });
});

describe('anexar: um registro, um arquivo, dois lugares', () => {
  it('grava origem anexado, SHA dos bytes e aparece na ficha E na lista com o MESMO id', async () => {
    const pub = publicadorFalso();
    const { documento, emissao } = await anexarProntuarioExistente(
      { tag: TAG, arquivo, bytes: PDF, enviadoPor: 'eng@exemplo' },
      { publicar: pub.publicar },
    );

    // os bytes enviados são os bytes recebidos — nada é reescrito no caminho
    expect(pub.enviados).toHaveLength(1);
    expect([...pub.enviados[0]]).toEqual([...PDF]);
    expect(emissao.sha256).toBe(`sha-de-${PDF.length}-37`);
    expect(emissao.origem).toBe('anexado');
    expect(emissao.arquivoNome).toBe('prontuario-antigo.pdf');
    expect(emissao.enviadoPor).toBe('eng@exemplo');
    expect(emissao.mimeType).toBe('application/pdf');

    // A FICHA lê as emissões da TAG…
    const naFicha = listarAnexados(TAG);
    expect(naFicha.map((e) => e.id)).toEqual([emissao.id]);
    // …e a LISTA lê o índice. Mesmo id, mesmo arquivo, mesmo SHA.
    const naLista = listarDocumentos().filter((d) => d.tag === TAG);
    expect(naLista).toHaveLength(1);
    expect(naLista[0].id).toBe(documento.id);
    expect(naLista[0].id).toBe(emissao.id);
    expect(naLista[0].origem).toBe('anexado');
    expect(naFicha[0].pdfRef.path).toBe(emissao.pdfRef.path);
    expect(naFicha[0].sha256).toBe(emissao.sha256);
  });

  it('duplo clique com o mesmo arquivo não cria dois documentos', async () => {
    const pub = publicadorFalso();
    const a = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    const b = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    expect(b.emissao.id).toBe(a.emissao.id);
    expect(listarEmissoes(TAG)).toHaveLength(1);
    expect(listarDocumentos().filter((d) => d.tag === TAG)).toHaveLength(1);
  });

  it('arquivo inválido não deixa registro nem sobe nada', async () => {
    const pub = publicadorFalso();
    await expect(
      anexarProntuarioExistente({ tag: TAG, arquivo: { ...arquivo, nome: 'x.docx' }, bytes: PDF }, { publicar: pub.publicar }),
    ).rejects.toThrow();
    expect(pub.enviados).toHaveLength(0);
    expect(listarEmissoes(TAG)).toEqual([]);
    expect(listarDocumentos()).toEqual([]);
  });

  it('sem equipamento não anexa', async () => {
    await expect(anexarProntuarioExistente({ tag: '  ', arquivo, bytes: PDF })).rejects.toThrow(/equipamento/i);
  });
});

describe('o anexo NÃO se passa pelo documento gerado', () => {
  const emissaoGerada = (sha: string): Omit<EmissaoProntuario, 'id' | 'tag'> => ({
    numero: 'PR-001',
    emissao: '19/09/2026',
    motor: 'vetorial',
    pdfRef: { bucket: 'inspecao', path: `org/relatorios/${sha}.pdf`, mimeType: 'application/pdf', tamanho: 10 },
    sha256: sha,
    paginas: 6,
    tamanho: 10,
    geradoEm: '2026-09-19T20:00:00.000Z',
    pdfPendente: false,
  });

  it('anexar não substitui a emissão vigente, e o anexo não vira revisão', async () => {
    const g1 = await registrarEmissao(TAG, emissaoGerada('g1'));
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: publicadorFalso().publicar });
    const g2 = await registrarEmissao(TAG, emissaoGerada('g2'));

    // a vigente continua sendo a ÚLTIMA gerada aqui
    expect(emissaoAtual(TAG)?.id).toBe(g2.id);
    // e a numeração das revisões ignora o anexo
    expect(revisaoDe(TAG, g1.id)).toBe(1);
    expect(revisaoDe(TAG, g2.id)).toBe(2);
    expect(revisaoDe(TAG, listarAnexados(TAG)[0].id)).toBe(0);
    // os três documentos convivem
    expect(listarEmissoes(TAG)).toHaveLength(3);
  });

  it('a linha do índice do anexo não tem revisão e mostra o nome do arquivo', async () => {
    const { documento } = await anexarProntuarioExistente(
      { tag: TAG, arquivo, bytes: PDF },
      { publicar: publicadorFalso().publicar },
    );
    expect(documento.revisao).toBeNull();
    expect(documento.situacao).toBe('emitido');
    expect(documento.equipamento).toBe('prontuario-antigo');
    expect(rotuloOrigemDocumento('anexado')).toBe('PDF ANEXADO');
  });

  it('a linha nasce com o EQUIPAMENTO — do cadastro local ou do catálogo', async () => {
    banco.set('nr13_info_' + TAG, { descricao: 'VASO DE PRESSAO ZZ 01' });
    banco.set('nr13_emp_' + TAG, { razaoSocial: 'CLIENTE ZZ LTDA' });
    const a = await anexarProntuarioExistente(
      { tag: TAG, arquivo, bytes: PDF },
      { publicar: publicadorFalso().publicar },
    );
    expect(a.documento.equipamento).toBe('VASO DE PRESSAO ZZ 01');
    expect(a.documento.cliente).toBe('CLIENTE ZZ LTDA');

    // Da LISTA, a TAG pode nem estar hidratada: o catálogo manda os rótulos.
    const b = await anexarProntuarioExistente(
      {
        tag: 'ZZ-PRONT-09',
        arquivo: { ...arquivo, nome: 'outro.pdf' },
        bytes: PDF,
        equipamento: 'CALDEIRA ZZ 09',
        cliente: 'CLIENTE DO CATALOGO',
      },
      { publicar: publicadorFalso().publicar },
    );
    expect(b.documento.equipamento).toBe('CALDEIRA ZZ 09');
    expect(b.documento.cliente).toBe('CLIENTE DO CATALOGO');
  });

  it('documento antigo, sem `origem`, continua sendo do sistema', async () => {
    const g = await registrarEmissao(TAG, emissaoGerada('antigo'));
    await registrarDocumento(docDeEmissao(g, 1, 'Vaso', 'Cliente'));
    expect(listarDocumentos()[0].origem).toBe('sistema');
    expect(emissaoAtual(TAG)?.id).toBe(g.id);
  });
});

describe('"aguardando sincronização" sai quando o arquivo sobe', () => {
  it('confirma só o que a fila já entregou, e não reescreve à toa', async () => {
    const pub = publicadorFalso();
    // Anexo feito OFFLINE: a publicação devolve `pendente`.
    const offline = async (bytes: Uint8Array, paginas: number) => ({
      ...(await pub.publicar(bytes, paginas)),
      pendente: true,
    });
    const { emissao } = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: offline });
    expect(emissao.pdfPendente).toBe(true);
    expect(listarDocumentos()[0].pdfPendente).toBe(true);

    // A fila ainda não subiu: nada muda.
    expect(await confirmarEnvios(TAG, async () => true)).toEqual([]);
    expect(listarEmissoes(TAG)[0].pdfPendente).toBe(true);

    // Subiu: o registro e a linha da lista param de anunciar pendência.
    const ids = await confirmarEnvios(TAG, async () => false);
    expect(ids).toEqual([emissao.id]);
    expect(listarEmissoes(TAG)[0].pdfPendente).toBe(false);
    await confirmarEnvioNoIndice(ids);
    expect(listarDocumentos()[0].pdfPendente).toBe(false);

    // Sem pendência, a fila nem é consultada.
    let perguntou = 0;
    expect(await confirmarEnvios(TAG, async () => { perguntou += 1; return false; })).toEqual([]);
    expect(perguntou).toBe(0);
  });

  it('o agendamento não pergunta nada quando não há pendência', async () => {
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: publicadorFalso().publicar });
    let perguntou = 0;
    agendarConfirmacaoDeEnvios(TAG, {
      arquivoPendente: async () => { perguntou += 1; return false; },
      aoConfirmar: () => {},
    });
    await Promise.resolve();
    expect(perguntou).toBe(0);
  });
});

describe('os dois pontos de entrada usam a mesma arquitetura', () => {
  const modal = readFileSync('src/features/prontuarios/ModalAnexarProntuario.tsx', 'utf8');

  it('um único modal, chamando o serviço único', () => {
    expect(modal).toContain('anexarProntuarioExistente(');
    expect(modal).toContain('validarPdf(');
    // Da lista, o equipamento vem do catálogo com busca no servidor.
    expect(modal).toContain('<CatalogoProntuariosV9');
    expect(modal).toContain('modo="selecao"');
  });

  it('a ficha passa a TAG e não pergunta o equipamento', () => {
    const ficha = readFileSync('src/features/prontuarios/ProntuarioDoEquipamento.tsx', 'utf8');
    expect(ficha).toContain('<ModalAnexarProntuario');
    expect(ficha).toContain('tag={tag}');
    expect(readFileSync('src/pages/Equipamento.tsx', 'utf8')).toContain('<ProntuarioDoEquipamento');
  });

  it('a lista abre o anexo pelos BYTES, nunca pelo visualizador', () => {
    const pagina = readFileSync('src/pages/Prontuarios.tsx', 'utf8');
    expect(pagina).toContain('<ModalAnexarProntuario');
    expect(pagina).toContain("if (doc.origem === 'anexado')");
    expect(pagina).toContain('bytesDaEmissao(emissao, { artefatoDe, baixarArtefato })');
  });

  it('o índice de prontuários entra no boot leve — navegador novo acha o documento', () => {
    expect(readFileSync('src/services/essencial.ts', 'utf8')).toContain("'nr13_pront_indice'");
    expect(readFileSync('src/services/familiasChave.ts', 'utf8')).toContain("'nr13_pront_indice'");
  });

  it('o arquivo vai para a pasta de documento final, que é imutável', () => {
    // `publicarArtefato` grava em `<org>/relatorios/<uuid>.pdf`, e essa pasta
    // perdeu UPDATE e DELETE na migration de 19/09/2026.
    expect(readFileSync('src/features/prontuarios/anexoProntuario.ts', 'utf8')).toContain('publicarArtefato');
    expect(readFileSync('src/features/relatorios/artefatoRelatorio.ts', 'utf8')).toContain(
      "export const ESCOPO_RELATORIOS = 'relatorios'",
    );
    expect(readFileSync('src/services/fotos.ts', 'utf8')).toContain("PASTAS_DOCUMENTO_FINAL = ['relatorios'");
  });
});
