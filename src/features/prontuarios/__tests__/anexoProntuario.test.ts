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

/** O CACHE deste aparelho. */
const banco = new Map<string, unknown>();
/** O que o SERVIDOR tem — só chega ao cache por leitura dirigida. */
const servidor = new Map<string, unknown>();
/** Chaves pedidas ao servidor, na ordem — prova que a leitura é dirigida. */
const pedidas: string[][] = [];
let redeFora = false;
/**
 * A semeadura NÃO atualiza a chave — é o que a v2 faz quando há item pendente
 * na fila para ela (`sync.itemDaChave`): o valor local vence no cache.
 */
let semearIgnora = false;
/** Chaves lidas uma a uma no servidor (`lerLinhaDoServidor`). */
const lidasServidor: string[] = [];
vi.mock('../../../services/leituraDirigida', () => ({
  lerLinhaDoServidor: async (k: string) => {
    lidasServidor.push(k);
    if (redeFora) return { estado: 'indisponivel' };
    if (!servidor.has(k)) return { estado: 'ausente' };
    return {
      estado: 'presente',
      linha: { valor: JSON.stringify(servidor.get(k)), versao: 7, atualizadoEm: '', dispositivo: null, excluida: false },
    };
  },
}));
vi.mock('../../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
  listarChavesComPrefixo: (p: string) => [...banco.keys()].filter((k) => k.startsWith(p)),
  semearEquipamentoDetalhado: async (chaves: string[]) => {
    pedidas.push([...chaves]);
    if (redeFora) return { postas: 0, falhou: true };
    let postas = 0;
    for (const k of chaves) {
      if (servidor.has(k) && !semearIgnora) {
        banco.set(k, structuredClone(servidor.get(k)));
        postas += 1;
      }
    }
    return { postas, falhou: false };
  },
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
import { sha256Hex } from '../../relatorios/artefatoRelatorio';

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
        sha256: await sha256Hex(bytes),
        geradoEm: '2026-09-19T21:00:00.000Z',
        paginas,
        pendente: false,
      };
    },
  };
}

beforeEach(() => {
  banco.clear();
  servidor.clear();
  pedidas.length = 0;
  lidasServidor.length = 0;
  redeFora = false;
  semearIgnora = false;
});

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
    expect(emissao.sha256).toBe(await sha256Hex(PDF));
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

/**
 * FASE 3 (23/09/2026) — uma fonte, duas visualizações, sem cache-miss virar
 * ausência. Letras = itens do pedido da rodada.
 */
describe('Fase 3 · prontuário existente', () => {
  const CHAVE = `nr13_pront_emitido_${TAG}`;
  const OUTRO_PDF = new Uint8Array([...PDF, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);

  const gerada = (sha: string): EmissaoProntuario => ({
    id: `PRONT-1-r1`,
    tag: TAG,
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

  it('A/B · ficha e lista: mesmo id, mesmo storageRef, mesmo SHA; baixar devolve os MESMOS bytes', async () => {
    const pub = publicadorFalso();
    const cofre = new Map<string, Blob>();
    const publicar = async (bytes: Uint8Array, paginas: number) => {
      const a = await pub.publicar(bytes, paginas);
      cofre.set(a.pdfRef.path, new Blob([bytes.slice()], { type: 'application/pdf' }));
      return a;
    };
    const { documento, emissao } = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar });
    const naFicha = listarEmissoes(TAG).find((e) => e.id === emissao.id)!;
    const naLista = listarDocumentos().find((d) => d.id === documento.id)!;
    expect(naFicha.id).toBe(naLista.id);
    // A lista não copia pdfRef/SHA: resolve a emissão PELO ID, como
    // `Prontuarios.tsx` faz ao abrir um anexo. Uma fonte só — o mesmo registro.
    const pelaLista = listarEmissoes(naLista.tag).find((e) => e.id === naLista.id)!;
    expect(pelaLista).toEqual(naFicha);
    expect(pelaLista.pdfRef.path).toBe(emissao.pdfRef.path);

    // Visualizar e baixar usam `bytesDaEmissao` — o arquivo do pdfRef, intacto.
    const { bytesDaEmissao } = await import('../emissaoProntuario');
    const blob = await bytesDaEmissao(naFicha, {
      artefatoDe: (r) => (r?.pdfRef ? (r as never) : null),
      baixarArtefato: async (a) => cofre.get(a.pdfRef.path) ?? null,
    });
    const baixados = new Uint8Array(await blob.arrayBuffer());
    expect(await sha256Hex(baixados)).toBe(naFicha.sha256);
    expect([...baixados]).toEqual([...PDF]);
  });

  it('D · mesmo PDF no mesmo equipamento: nenhum upload novo, registro existente devolvido', async () => {
    const pub = publicadorFalso();
    const a = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    const b = await anexarProntuarioExistente(
      { tag: TAG, arquivo: { ...arquivo, nome: 'renomeado.pdf' }, bytes: PDF },
      { publicar: pub.publicar },
    );
    expect(a.jaAnexado).toBeFalsy();
    expect(b.jaAnexado).toBe(true);
    expect(b.emissao.id).toBe(a.emissao.id);
    expect(pub.enviados).toHaveLength(1); // o segundo não sobe objeto órfão
    expect(listarEmissoes(TAG)).toHaveLength(1);
  });

  it('E · PDFs DIFERENTES no mesmo equipamento convivem (anexo1, anexo2)', async () => {
    const pub = publicadorFalso();
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: OUTRO_PDF }, { publicar: pub.publicar });
    const lista = listarAnexados(TAG);
    expect(lista).toHaveLength(2);
    expect(lista.map((e) => e.id.replace(/^PRONT-\d+-/, ''))).toEqual(['anexo1', 'anexo2']);
    expect(new Set(lista.map((e) => e.sha256)).size).toBe(2);
  });

  it('F · o mesmo PDF em OUTRO equipamento é outro documento', async () => {
    const pub = publicadorFalso();
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    const b = await anexarProntuarioExistente({ tag: 'ZZ-PRONT-02', arquivo, bytes: PDF }, { publicar: pub.publicar });
    expect(b.jaAnexado).toBeFalsy();
    expect(pub.enviados).toHaveLength(2);
  });

  it('G · F5 / aba nova: cache SEM a lista → leitura DIRIGIDA; o servidor decide a duplicidade', async () => {
    const sha = await sha256Hex(PDF);
    const doServidor = { ...gerada('x'), id: 'PRONT-9-anexo1', origem: 'anexado' as const, sha256: sha };
    servidor.set(CHAVE, [doServidor]);
    const pub = publicadorFalso();
    const r = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar });
    expect(r.jaAnexado).toBe(true);
    expect(r.emissao.id).toBe('PRONT-9-anexo1');
    expect(pub.enviados).toHaveLength(0);
    // Só a chave daquela TAG foi pedida — nunca o catálogo inteiro.
    expect(pedidas[0]).toEqual([CHAVE]);
  });

  it('H · cache parcial: anexo NOVO preserva o que o servidor já tinha e numera a partir dele', async () => {
    servidor.set(CHAVE, [gerada('g-servidor'), { ...gerada('a1'), id: 'PRONT-2-anexo1', origem: 'anexado' as const }]);
    const { emissao } = await anexarProntuarioExistente(
      { tag: TAG, arquivo, bytes: PDF },
      { publicar: publicadorFalso().publicar },
    );
    const lista = listarEmissoes(TAG);
    expect(lista).toHaveLength(3);
    expect(lista[0].sha256).toBe('g-servidor');
    expect(emissao.id).toMatch(/-anexo2$/);
  });

  it('I · offline e SEM cópia local: recusa ANTES do upload, com mensagem clara, sem gravar nada', async () => {
    redeFora = true;
    const pub = publicadorFalso();
    await expect(
      anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: pub.publicar }),
    ).rejects.toThrow(/Sem conexão com o servidor/);
    expect(pub.enviados).toHaveLength(0);
    expect(banco.has(CHAVE)).toBe(false);
    expect(listarDocumentos()).toEqual([]);
  });

  it('J · offline COM a lista em cache: anexa pela fila das fotos; registro sem Base64 nem bytes', async () => {
    banco.set(CHAVE, []);
    banco.set('nr13_pront_indice', []);
    redeFora = true;
    const pub = publicadorFalso();
    const offline = async (bytes: Uint8Array, paginas: number) => ({ ...(await pub.publicar(bytes, paginas)), pendente: true });
    const { emissao } = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: offline });
    expect(emissao.pdfPendente).toBe(true);
    expect(pedidas).toEqual([]); // o cache bastou — nada foi perguntado à rede
    const gravado = JSON.stringify(banco.get(CHAVE));
    expect(gravado).not.toContain('JVBER'); // base64 de "%PDF"
    expect(gravado).not.toMatch(/"(bytes|pdfBase64|conteudo)"/);
    expect(gravado.length).toBeLessThan(2048);
  });

  it('K · falha no Storage: nenhum registro, nenhuma linha no índice', async () => {
    const indexar = vi.fn();
    await expect(
      anexarProntuarioExistente(
        { tag: TAG, arquivo, bytes: PDF },
        { publicar: async () => { throw new Error('upload recusado'); }, indexar },
      ),
    ).rejects.toThrow('upload recusado');
    expect(banco.has(CHAVE)).toBe(false);
    expect(indexar).not.toHaveBeenCalled();
    expect(listarDocumentos()).toEqual([]);
  });

  it('L · falha ao gravar o registro: o índice NÃO ganha linha apontando para nada', async () => {
    const indexar = vi.fn();
    await expect(
      anexarProntuarioExistente(
        { tag: TAG, arquivo, bytes: PDF },
        {
          publicar: publicadorFalso().publicar,
          registrar: async () => { throw new Error('banco recusou'); },
          indexar,
        },
      ),
    ).rejects.toThrow('banco recusou');
    expect(indexar).not.toHaveBeenCalled();
    expect(listarDocumentos()).toEqual([]);
  });

  it('M · prontuário gerado, rascunho e emissão finalizada ficam intactos', async () => {
    const g = gerada('sha-finalizado');
    const rascunho = { tag: TAG, descricao: 'Vaso ZZ', campo: 'valor' };
    banco.set(CHAVE, [g]);
    banco.set(`nr13_prontuario_${TAG}`, rascunho);
    await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar: publicadorFalso().publicar });
    const lista = listarEmissoes(TAG);
    expect(lista[0]).toEqual(g); // pdfRef e SHA do finalizado, intactos
    expect(banco.get(`nr13_prontuario_${TAG}`)).toEqual(rascunho);
    expect(emissaoAtual(TAG)?.id).toBe(g.id);
  });

  it('N · índice fora do cache: a linha nova entra SEM apagar as do servidor (nada de base 0)', async () => {
    const linhaServidor = docDeEmissao({ ...gerada('outro'), tag: 'ZZ-OUTRA', id: 'PRONT-X-r1' }, 1, 'Outro', null);
    servidor.set('nr13_pront_indice', [linhaServidor]);
    const { documento } = await anexarProntuarioExistente(
      { tag: TAG, arquivo, bytes: PDF },
      { publicar: publicadorFalso().publicar },
    );
    expect(pedidas.some((p) => p.includes('nr13_pront_indice'))).toBe(true);
    expect(listarDocumentos().map((d) => d.id).sort()).toEqual([documento.id, 'PRONT-X-r1'].sort());
  });

  it('O · a tela diz que o PDF já estava anexado em vez de fechar calada', () => {
    const modal = readFileSync('src/features/prontuarios/ModalAnexarProntuario.tsx', 'utf8');
    expect(modal).toContain('r.jaAnexado');
    expect(modal).toContain('Este documento já é o prontuário vigente deste equipamento');
    expect(modal).toContain('Este documento já está no histórico deste equipamento');
  });

  it('P · a ficha tem Abrir E Baixar, os dois pelos bytes arquivados', () => {
    const ficha = readFileSync('src/features/prontuarios/ProntuarioDoEquipamento.tsx', 'utf8');
    expect(ficha).toContain('title="Abrir o prontuário"');
    expect(ficha).toContain('title="Baixar o PDF original"');
    expect(ficha.match(/bytesDaVersao\(vigente, tag\)/g)).toHaveLength(2);
    expect(readFileSync('src/features/prontuarios/bytesDaVersao.ts', 'utf8')).toContain(
      'bytesDaEmissao(e, { artefatoDe, baixarArtefato })',
    );
    expect(ficha).toContain('baixarArquivo(blob');
  });

  it('Q · bucket privado e isolamento por organização na pasta do arquivo', () => {
    const sql = readFileSync('supabase/fotos_storage.sql', 'utf8');
    for (const pol of ['inspecao_leitura', 'inspecao_escrita']) {
      const bloco = sql.slice(sql.indexOf(`create policy ${pol}`));
      expect(bloco.slice(0, 400)).toContain('(storage.foldername(name))[1] = public.org_atual()::text');
    }
    expect(sql).toContain("select public from storage.buckets where id = 'inspecao'");
    // e a pasta de documento final não aceita UPDATE/DELETE de usuário
    const imut = readFileSync('supabase/documentos_emitidos_imutaveis.sql', 'utf8');
    expect(imut).toMatch(/not in[\s\S]{0,120}'relatorios'/);
  });

  it('R · excluir o prontuário NÃO tira da lista o PDF anexado', async () => {
    const { removerDoIndice } = await import('../indiceProntuarios');
    const { documento } = await anexarProntuarioExistente(
      { tag: TAG, arquivo, bytes: PDF },
      { publicar: publicadorFalso().publicar },
    );
    await removerDoIndice(TAG);
    expect(listarDocumentos().map((d) => d.id)).toEqual([documento.id]);
    expect(listarAnexados(TAG)).toHaveLength(1);
  });
});

/**
 * HARDENING (23/09/2026) — CACHE PRESENTE PORÉM DESATUALIZADO.
 *
 * Upload no bucket de documentos é IRREVERSÍVEL (sem DELETE). Para decidir se
 * sobe, o servidor é a autoridade; o cache só acelera e cobre o offline.
 */
describe('dedup antes do upload: servidor é a autoridade quando online', () => {
  const CHAVE = `nr13_pront_emitido_${TAG}`;
  const antiga = (sha: string): EmissaoProntuario => ({
    id: 'PRONT-1-r1',
    tag: TAG,
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
  async function anexoDoOutroAparelho(): Promise<EmissaoProntuario> {
    return {
      ...antiga('x'),
      id: 'PRONT-5-anexo1',
      origem: 'anexado',
      sha256: await sha256Hex(PDF),
      pdfRef: { bucket: 'inspecao', path: 'org/relatorios/do-aparelho-a.pdf', mimeType: 'application/pdf', tamanho: PDF.length },
    };
  }

  it('S1 · cache ANTIGO sem o SHA, servidor COM ele: nada sobe, devolve o registro existente', async () => {
    const doA = await anexoDoOutroAparelho();
    banco.set(CHAVE, [antiga('g1')]); // o aparelho B ficou com a lista de antes
    servidor.set(CHAVE, [antiga('g1'), doA]); // o aparelho A já anexou o PDF
    const pub = publicadorFalso();
    const publicar = vi.fn(pub.publicar);

    const r = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar });

    expect(lidasServidor).toContain(CHAVE); // leitura dirigida, só esta chave
    expect(publicar).not.toHaveBeenCalled(); // nenhum objeto novo no Storage
    expect(r.jaAnexado).toBe(true);
    expect(r.emissao.id).toBe(doA.id);
    expect(r.emissao.pdfRef.path).toBe(doA.pdfRef.path);
    // o cache foi reconciliado com o servidor
    expect(listarEmissoes(TAG).map((e) => e.id)).toEqual(['PRONT-1-r1', doA.id]);
  });

  it('S2 · mesmo quando a semeadura NÃO atualiza o cache (item local pendente), o servidor decide', async () => {
    const doA = await anexoDoOutroAparelho();
    banco.set(CHAVE, [antiga('g1')]);
    servidor.set(CHAVE, [antiga('g1'), doA]);
    semearIgnora = true;
    const publicar = vi.fn(publicadorFalso().publicar);
    const r = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar });
    expect(publicar).not.toHaveBeenCalled();
    expect(r.jaAnexado).toBe(true);
    expect(r.emissao.id).toBe(doA.id);
  });

  it('S3 · cache antigo e PDF NOVO: sobe, e a gravação parte da lista do SERVIDOR', async () => {
    const doA = await anexoDoOutroAparelho();
    banco.set(CHAVE, [antiga('g1')]);
    servidor.set(CHAVE, [antiga('g1'), doA]);
    const outro = new Uint8Array([...PDF, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);
    const { emissao, jaAnexado } = await anexarProntuarioExistente(
      { tag: TAG, arquivo, bytes: outro },
      { publicar: publicadorFalso().publicar },
    );
    expect(jaAnexado).toBeFalsy();
    expect(emissao.id).toMatch(/-anexo2$/); // numerado depois do anexo de A
    expect(listarEmissoes(TAG).map((e) => e.id)).toEqual(['PRONT-1-r1', doA.id, emissao.id]);
  });

  it('S4 · servidor não responde (offline/timeout) e o cache tem a lista: política offline de antes', async () => {
    banco.set(CHAVE, [antiga('g1')]);
    banco.set('nr13_pront_indice', []);
    redeFora = true;
    const publicar = vi.fn(async (b: Uint8Array, p: number) => ({ ...(await publicadorFalso().publicar(b, p)), pendente: true }));
    const r = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar });
    expect(publicar).toHaveBeenCalledTimes(1);
    expect(r.emissao.pdfPendente).toBe(true);
  });

  it('S5 · servidor confirma que a chave NÃO existe: anexa normalmente', async () => {
    const publicar = vi.fn(publicadorFalso().publicar);
    const r = await anexarProntuarioExistente({ tag: TAG, arquivo, bytes: PDF }, { publicar });
    expect(lidasServidor).toEqual([CHAVE]);
    expect(publicar).toHaveBeenCalledTimes(1);
    expect(r.jaAnexado).toBeFalsy();
  });
});

describe('excluir o prontuário não promete apagar o anexo', () => {
  it('o modal diz que os PDFs anexados continuam', () => {
    const modal = readFileSync('src/features/prontuarios/ModalExcluirProntuario.tsx', 'utf8');
    expect(modal).toContain('<b>PDFs anexados</b>');
    expect(modal).toContain('continuam na ficha do equipamento e em Prontuários');
  });
});
