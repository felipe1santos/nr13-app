/**
 * PRONTUÁRIO EXISTENTE — o PDF que o cliente já tinha (19/09/2026).
 *
 * ## O caso real
 *
 * O equipamento chega com um prontuário antigo, em PDF, feito por outra
 * empresa ou num papel digitalizado. O usuário não quer refazê-lo dentro do
 * sistema: quer guardá-lo e vinculá-lo ao equipamento certo.
 *
 * ## O que ele NÃO é
 *
 * Não é um prontuário GERADO por aqui, e não pode se passar por um. Nada de
 * OCR, de extrair campos, de converter para o modelo interno, de rasterizar ou
 * de remontar: os bytes que o usuário enviou são o documento, e é com eles que
 * ele volta a ser aberto. A tela o marca como `PDF ANEXADO`; o registro o marca
 * em `origem: 'anexado'`.
 *
 * ## Por que reaproveita a emissão, em vez de uma família nova
 *
 * `nr13_pront_emitido_<TAG>` já é uma LISTA de documentos por equipamento, cada
 * um com `pdfRef`, `sha256`, tamanho e data, que `registrarEmissao` só
 * ACRESCENTA — nunca substitui (Fase 12A). O índice de `/prontuarios` já lê
 * essa lista, e a ficha passa a ler a mesma coisa. Criar uma segunda família
 * para o anexo criaria um segundo catálogo, duas listas para conciliar e duas
 * regras de imutabilidade — exatamente o que o pedido proíbe.
 *
 * Então o anexo é um documento da mesma lista, com `origem: 'anexado'`. Um
 * equipamento pode ter os dois: anexar NÃO apaga nem substitui o prontuário
 * construído aqui, e emitir não apaga o anexo.
 */
import { ler } from '../../services/storage';
import { publicarArtefato } from '../relatorios/artefatoRelatorio';
import { registrarEmissao, type EmissaoProntuario } from './emissaoProntuario';
import { docDeEmissao, registrarDocumento, type DocumentoProntuario } from './indiceProntuarios';
import type { ProntuarioDados } from './tipos';

/** Teto do arquivo. O mesmo do prontuário do fabricante, que é o vizinho direto. */
export const LIMITE_ANEXO_BYTES = 8 * 1024 * 1024;

/** Assinatura de um PDF: os cinco primeiros bytes são sempre `%PDF-`. */
const ASSINATURA = [0x25, 0x50, 0x44, 0x46, 0x2d];

export interface ArquivoEscolhido {
  nome: string;
  tamanho: number;
  /** O que o navegador declarou. Sozinho não vale — ver `validarPdf`. */
  mimeType: string;
}

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string };

/**
 * O arquivo é mesmo um PDF utilizável?
 *
 * Confere, nesta ordem: vazio, tamanho, extensão, MIME declarado e a ASSINATURA
 * real dos bytes. A assinatura é a única que não se falsifica renomeando: um
 * .docx ou um .jpg renomeado para `.pdf` passa nas quatro primeiras e morre
 * aqui. Função PURA — recebe os bytes, não lê arquivo nenhum — para poder ser
 * testada sem DOM e ser usada nos dois pontos de entrada.
 */
export function validarPdf(arquivo: ArquivoEscolhido, bytes: Uint8Array): ResultadoValidacao {
  if (!arquivo.nome.toLowerCase().endsWith('.pdf')) {
    return { ok: false, erro: 'O arquivo precisa ser um PDF.' };
  }
  if (arquivo.mimeType && arquivo.mimeType !== 'application/pdf') {
    return { ok: false, erro: 'O arquivo precisa ser um PDF.' };
  }
  if (!bytes || bytes.length === 0) {
    return { ok: false, erro: 'O arquivo está vazio.' };
  }
  if (bytes.length > LIMITE_ANEXO_BYTES) {
    return { ok: false, erro: `O PDF tem mais de ${LIMITE_ANEXO_BYTES / (1024 * 1024)} MB. Comprima o arquivo antes de anexar.` };
  }
  if (bytes.length < ASSINATURA.length || ASSINATURA.some((b, i) => bytes[i] !== b)) {
    return { ok: false, erro: 'Este arquivo não é um PDF válido (o conteúdo não tem a assinatura de PDF).' };
  }
  return { ok: true };
}

/** O que a tela manda para o serviço. `titulo` e `observacao` são opcionais. */
export interface PedidoAnexo {
  tag: string;
  arquivo: ArquivoEscolhido;
  bytes: Uint8Array;
  titulo?: string;
  observacao?: string;
  /** Quem anexou — o e-mail da sessão, quando houver. */
  enviadoPor?: string | null;
  /**
   * Descrição do equipamento e cliente, quando a TELA já os tem: a ficha os lê
   * do cadastro, e a lista os recebe do CATÁLOGO (projeção do servidor). São a
   * primeira escolha porque, sob boot leve, a TAG escolhida na lista pode nem
   * estar hidratada neste aparelho — e aí a leitura local abaixo não acha nada.
   */
  equipamento?: string | null;
  cliente?: string | null;
}

/**
 * Descrição e cliente a partir do que ESTE aparelho já tem.
 *
 * A ordem é a mesma de `reconciliar`: o prontuário do equipamento primeiro (é
 * o que a lista mostra nas outras linhas daquela TAG), depois o cadastro. Só
 * LÊ — não semeia nem vai à rede: a linha do índice é um rótulo, e buscar o
 * equipamento no servidor só para escrevê-lo transformaria anexar um PDF numa
 * ida à rede a mais, que pode falhar e derrubar o anexo.
 */
function rotulosLocais(tag: string): { equipamento: string | null; cliente: string | null } {
  const pront = ler<ProntuarioDados>(`nr13_prontuario_${tag}`);
  const info = ler<{ descricao?: string }>(`nr13_info_${tag}`);
  const emp = ler<{ razaoSocial?: string; nomeFantasia?: string }>(`nr13_emp_${tag}`);
  return {
    equipamento: pront?.descricao?.trim() || info?.descricao?.trim() || null,
    cliente:
      pront?.empresaRazaoSocial?.trim() || emp?.razaoSocial?.trim() || emp?.nomeFantasia?.trim() || null,
  };
}

export interface ResultadoAnexo {
  documento: DocumentoProntuario;
  emissao: EmissaoProntuario;
}

/**
 * Anexa o PDF existente: valida → publica o arquivo → grava o registro →
 * atualiza o índice.
 *
 * ## A ordem importa, e é a mesma do §7-quater
 *
 * O arquivo vai primeiro. `publicarArtefato` calcula o SHA-256 dos bytes,
 * guarda no cofre local e enfileira o upload — e só devolve com `pdfRef` e
 * `pendente` dizendo a verdade sobre o servidor. Se ele falhar, nada é gravado:
 * é melhor não ter registro do que ter um registro apontando para um arquivo
 * que não existe. O caminho inverso (registro antes do arquivo) produziria uma
 * linha na lista que não abre.
 *
 * Um arquivo órfão continua possível se o processo morrer entre o upload e a
 * gravação do registro — e ele é inofensivo: o bucket ganha um PDF que nenhuma
 * chave cita, ninguém o lista (a lista vem do índice) e ele não é servido ao
 * Portal (que autoriza por path CITADO em chave do cliente).
 *
 * ## Duplo clique não cria dois documentos
 *
 * `registrarEmissao` deduplica por `sha256`: dois envios do mesmo arquivo para
 * a mesma TAG devolvem o MESMO registro. A tela também trava o botão, mas a
 * garantia está aqui, onde o teste alcança.
 */
export async function anexarProntuarioExistente(
  pedido: PedidoAnexo,
  deps: {
    publicar?: typeof publicarArtefato;
    registrar?: typeof registrarEmissao;
    indexar?: typeof registrarDocumento;
    agora?: () => string;
  } = {},
): Promise<ResultadoAnexo> {
  const publicar = deps.publicar ?? publicarArtefato;
  const registrar = deps.registrar ?? registrarEmissao;
  const indexar = deps.indexar ?? registrarDocumento;

  const tag = pedido.tag?.trim();
  if (!tag) throw new Error('Escolha o equipamento antes de anexar o prontuário.');

  const valido = validarPdf(pedido.arquivo, pedido.bytes);
  if (!valido.ok) throw new Error(valido.erro);

  // `paginas: 0` — o anexo não é paginado por nós. Contar páginas exigiria
  // abrir o PDF do usuário com um parser, e um PDF protegido falharia ali:
  // recusar por isso seria recusar um documento legítimo por uma informação
  // que a tela nem precisa mostrar.
  const artefato = await publicar(pedido.bytes, 0);

  const emissao = await registrar(tag, {
    numero: pedido.titulo?.trim() || null,
    emissao: null,
    motor: 'atual',
    pdfRef: artefato.pdfRef,
    sha256: artefato.sha256,
    paginas: 0,
    tamanho: pedido.bytes.length,
    geradoEm: artefato.geradoEm,
    pdfPendente: !!artefato.pendente,
    origem: 'anexado',
    arquivoNome: pedido.arquivo.nome,
    mimeType: 'application/pdf',
    observacao: pedido.observacao?.trim() || undefined,
    enviadoPor: pedido.enviadoPor ?? undefined,
  });

  // O rótulo da linha é o EQUIPAMENTO, como em toda outra linha da lista. O
  // nome do arquivo entra só como último recurso (`docDeEmissao`), para a linha
  // nunca nascer sem nada que o usuário reconheça.
  const locais = rotulosLocais(tag);
  const documento = docDeEmissao(
    emissao,
    0,
    pedido.equipamento?.trim() || locais.equipamento,
    pedido.cliente?.trim() || locais.cliente,
  );
  await indexar(documento);
  return { documento, emissao };
}

/** O rótulo da origem, para a lista e para a ficha. */
export function rotuloOrigemDocumento(origem: EmissaoProntuario['origem']): string {
  return origem === 'anexado' ? 'PDF ANEXADO' : 'GERADO PELO SISTEMA';
}
