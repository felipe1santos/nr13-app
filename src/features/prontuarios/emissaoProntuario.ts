import { ler, salvar } from '../../services/storage';
import type { PdfArtefato } from '../relatorios/artefatoRelatorio';

/**
 * Fase 12A · a EMISSÃO do prontuário — o documento vira ARQUIVO.
 *
 * ## O que não existia
 *
 * Até 04/09/2026 o prontuário só era IMPRESSO. Não havia geração de bytes, SHA,
 * upload nem `pdfRef`: cada impressão remontava as seis folhas com os dados
 * VIVOS, e duas impressões da mesma TAG em dias diferentes podiam sair
 * diferentes sem que ninguém percebesse. É o mesmo defeito que o §7-quater
 * corrigiu no relatório.
 *
 * A partir daqui o prontuário emitido é um artefato: bytes exatos, SHA-256,
 * Storage, `pdfRef` — e reabrir serve o ARQUIVO, não uma remontagem.
 *
 * ## Imutabilidade: emitir de novo NÃO sobrescreve
 *
 * `nr13_pront_emitido_<TAG>` guarda uma LISTA de emissões, e
 * `registrarEmissao` **acrescenta ao fim**. Um `pdfRef` já gravado nunca é
 * substituído: corrigir alguma coisa produz uma emissão NOVA, com número de
 * revisão próprio, e a anterior continua alcançável pelo seu próprio `pdfRef`.
 *
 * Sobrescrever seria pior que perder: o documento antigo continuaria existindo
 * no bucket, mas sem nada apontando para ele — um arquivo órfão com hash que
 * não confere com nenhum registro.
 */

export interface EmissaoProntuario {
  /** Id da emissão. Cresce por revisão, nunca é reaproveitado. */
  id: string;
  tag: string;
  /** Número do prontuário no momento da emissão (congelado). */
  numero: string | null;
  /** Data de emissão exibida no documento (congelada). */
  emissao: string | null;
  /** Qual motor produziu estes bytes — auditoria, não decisão. */
  motor: 'atual' | 'vetorial';
  pdfRef: PdfArtefato['pdfRef'];
  sha256: string;
  paginas: number;
  tamanho: number;
  geradoEm: string;
  /** Upload ainda não confirmado pelo servidor (vem do cofre, não do onLine). */
  pdfPendente: boolean;

  // ── PDF EXISTENTE ANEXADO (19/09/2026) ────────────────────────────────────
  /**
   * De onde vem o documento. Ausente = `'sistema'`: todo registro anterior a
   * 19/09/2026 foi gerado aqui, e o padrão do ausente precisa ser o que os
   * registros antigos significam — reinterpretar um documento histórico é o
   * erro que o §7-quater existe para não repetir.
   *
   * `'anexado'` é o PDF que o cliente já tinha. Ver `anexoProntuario.ts`.
   */
  origem?: 'sistema' | 'anexado';
  /** Nome do arquivo como o usuário o enviou — só no anexado. */
  arquivoNome?: string;
  mimeType?: string;
  observacao?: string;
  /** E-mail de quem anexou, quando a sessão o tinha. */
  enviadoPor?: string;
}

/** Documento gerado aqui? Ausente = sim (compatibilidade). */
export function ehAnexado(e: Pick<EmissaoProntuario, 'origem'> | null | undefined): boolean {
  return e?.origem === 'anexado';
}

const chave = (tag: string) => `nr13_pront_emitido_${tag}`;

/** As emissões daquele equipamento, da mais antiga para a mais recente. */
export function listarEmissoes(tag: string): EmissaoProntuario[] {
  const lista = ler<EmissaoProntuario[]>(chave(tag));
  return Array.isArray(lista) ? lista : [];
}

/**
 * A emissão vigente do NOSSO documento — a última GERADA aqui.
 *
 * O PDF anexado fica de fora de propósito: ele é documento de outro emitente
 * (19/09/2026). Devolvê-lo aqui faria o visualizador tratar o arquivo do
 * cliente como a emissão do sistema — imprimir por ele, contar revisão por ele
 * e anunciar "prontuário emitido" por causa de um PDF que nós não geramos.
 */
export function emissaoAtual(tag: string): EmissaoProntuario | null {
  const geradas = listarEmissoes(tag).filter((x) => !ehAnexado(x));
  return geradas.length > 0 ? geradas[geradas.length - 1] : null;
}

/** Os PDFs EXISTENTES anexados àquele equipamento, do mais antigo ao mais novo. */
export function listarAnexados(tag: string): EmissaoProntuario[] {
  return listarEmissoes(tag).filter(ehAnexado);
}

/**
 * Acrescenta uma emissão. **Nunca substitui** uma existente.
 *
 * Devolve a emissão gravada. Se já houver uma com o mesmo `sha256`, a lista não
 * cresce: emitir duas vezes sem mudar nada não precisa de duas linhas, e
 * duplicar o mesmo arquivo só polui o histórico.
 */
export async function registrarEmissao(
  tag: string,
  nova: Omit<EmissaoProntuario, 'id' | 'tag'>,
): Promise<EmissaoProntuario> {
  const lista = listarEmissoes(tag);
  const igual = lista.find((e) => e.sha256 === nova.sha256);
  if (igual) return igual;

  // O número da revisão entra no id. Só `Date.now()` colidia quando duas
  // emissões caíam no MESMO milissegundo — o teste pegou isso —, e id repetido
  // faz `revisaoDe` apontar para a emissão errada: o histórico de revisões
  // passaria a mentir sem nenhum erro na tela.
  const sufixo = nova.origem === 'anexado'
    ? `anexo${lista.filter(ehAnexado).length + 1}`
    : `r${lista.filter((e) => !ehAnexado(e)).length + 1}`;
  const registro: EmissaoProntuario = { ...nova, id: `PRONT-${Date.now()}-${sufixo}`, tag };
  await salvar(chave(tag), [...lista, registro]);
  return registro;
}

/**
 * O selo "aguardando sincronização" precisa SAIR quando o arquivo sobe.
 *
 * `pdfPendente` é o retrato do momento da gravação: um documento anexado sem
 * rede nasce `true`, a fila sobe o arquivo minutos depois e o registro continua
 * dizendo que falta subir — para sempre. Um aviso que não some deixa de ser
 * aviso: o usuário aprende a ignorá-lo, e aí o caso em que o arquivo REALMENTE
 * não subiu passa despercebido.
 *
 * Esta função relê a FILA (`arquivoPendente`, nunca `navigator.onLine`, que
 * mente) e regrava só o que mudou. Não toca em `pdfRef`, `sha256` nem em nada
 * que descreva o documento: o arquivo é o mesmo: o que muda é o que sabemos
 * sobre o upload dele.
 *
 * Devolve os ids confirmados — vazio quando não havia nada a fazer, e é por
 * isso que ela pode ser chamada toda vez que a tela abre sem escrever nada.
 */
export async function confirmarEnvios(
  tag: string,
  arquivoPendente: (path: string) => Promise<boolean>,
): Promise<string[]> {
  const lista = listarEmissoes(tag);
  const pendentes = lista.filter((e) => e.pdfPendente && e.pdfRef?.path);
  if (pendentes.length === 0) return [];

  const confirmados: string[] = [];
  for (const e of pendentes) {
    if (!(await arquivoPendente(e.pdfRef.path))) confirmados.push(e.id);
  }
  if (confirmados.length === 0) return [];

  await salvar(
    chave(tag),
    lista.map((e) => (confirmados.includes(e.id) ? { ...e, pdfPendente: false } : e)),
  );
  return confirmados;
}

/**
 * Dispara a confirmação FORA do React, uma vez por TAG por sessão.
 *
 * A tela não pode fazer isso num efeito: confirmar é `await` seguido de
 * `setState`, e `setState` dentro de efeito é o que o lint barra (com razão —
 * é render duplicado no mount). Aqui a escrita acontece no serviço, e a tela só
 * é avisada pelo barramento de eventos, que é o caminho que o resto do app já
 * usa quando um serviço mexe em dado que alguma tela está mostrando.
 *
 * Silenciosa por natureza: se a fila não respondeu, o selo continua onde está —
 * "não consegui confirmar" e "não subiu" levam à mesma tela, e a próxima
 * abertura tenta de novo.
 */
const jaConferidas = new Set<string>();

export function agendarConfirmacaoDeEnvios(
  tag: string,
  deps: {
    arquivoPendente: (path: string) => Promise<boolean>;
    aoConfirmar: (ids: string[]) => Promise<void> | void;
  },
): void {
  if (jaConferidas.has(tag)) return;
  if (!listarEmissoes(tag).some((e) => e.pdfPendente)) return;
  jaConferidas.add(tag);
  void (async () => {
    try {
      const ids = await confirmarEnvios(tag, deps.arquivoPendente);
      if (ids.length > 0) await deps.aoConfirmar(ids);
    } catch {
      jaConferidas.delete(tag); // falhou: a próxima abertura tenta de novo
    }
  })();
}

/**
 * O número de revisão de uma emissão: a posição dela na lista, base 1.
 *
 * Exposto porque a folha e a tela precisam dizer "revisão 2" sem inventar um
 * contador paralelo que possa divergir da lista.
 */
export function revisaoDe(tag: string, id: string): number {
  const lista = listarEmissoes(tag);
  const alvo = lista.find((e) => e.id === id);
  // O PDF ANEXADO não é revisão do nosso documento: ele é outro documento, de
  // outro emitente. Contá-lo faria a próxima emissão nossa pular de "Rev. 02"
  // para "Rev. 03" por causa de um arquivo que nós não geramos.
  if (!alvo || ehAnexado(alvo)) return 0;
  return lista.filter((e) => !ehAnexado(e)).findIndex((e) => e.id === id) + 1;
}

/**
 * Os bytes de uma emissão ARQUIVADA.
 *
 * ## O que esta função deliberadamente NÃO faz
 *
 * Não chama gerador, não monta folha, não lê `nr13_info_`, `nr13_calc_` nem
 * qualquer dado vivo do equipamento, não grava nada e não depende do palco.
 * Ela recebe o REGISTRO da emissão e devolve o arquivo apontado pelo `pdfRef` —
 * e é só isso que abrir um documento emitido pode significar.
 *
 * Isso não é detalhe de implementação: enquanto a abertura dependia da tela do
 * visualizador, abrir um documento de meses atrás exigia carregar o equipamento
 * inteiro e disputar a trava do palco — para exibir um arquivo que já estava
 * pronto no cofre. Pior, criava a possibilidade de o que aparece na tela ser
 * remontado dos dados de HOJE em vez de ser o documento daquela emissão.
 *
 * `baixarArtefato` tenta o cofre local antes do bucket, então reabrir um
 * documento recente não gasta egress.
 */
export async function bytesDaEmissao(
  e: Pick<EmissaoProntuario, 'pdfRef' | 'sha256' | 'paginas'>,
  deps: {
    artefatoDe: (r: Partial<PdfArtefato> | null | undefined) => PdfArtefato | null;
    baixarArtefato: (a: Pick<PdfArtefato, 'pdfRef'>) => Promise<Blob | null>;
  },
): Promise<Blob> {
  const art = deps.artefatoDe({ pdfRef: e.pdfRef, sha256: e.sha256, paginas: e.paginas });
  if (!art) throw new Error('Esta emissão não tem arquivo arquivado.');
  const blob = await deps.baixarArtefato(art);
  if (!blob) throw new Error('O arquivo não voltou nem do cofre local nem do bucket.');
  return blob;
}
