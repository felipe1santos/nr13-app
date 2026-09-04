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
}

const chave = (tag: string) => `nr13_pront_emitido_${tag}`;

/** As emissões daquele equipamento, da mais antiga para a mais recente. */
export function listarEmissoes(tag: string): EmissaoProntuario[] {
  const lista = ler<EmissaoProntuario[]>(chave(tag));
  return Array.isArray(lista) ? lista : [];
}

/** A emissão vigente — a última. `null` quando o prontuário nunca foi emitido. */
export function emissaoAtual(tag: string): EmissaoProntuario | null {
  const lista = listarEmissoes(tag);
  return lista.length > 0 ? lista[lista.length - 1] : null;
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
  const registro: EmissaoProntuario = { ...nova, id: `PRONT-${Date.now()}-r${lista.length + 1}`, tag };
  await salvar(chave(tag), [...lista, registro]);
  return registro;
}

/**
 * O número de revisão de uma emissão: a posição dela na lista, base 1.
 *
 * Exposto porque a folha e a tela precisam dizer "revisão 2" sem inventar um
 * contador paralelo que possa divergir da lista.
 */
export function revisaoDe(tag: string, id: string): number {
  return listarEmissoes(tag).findIndex((e) => e.id === id) + 1;
}
