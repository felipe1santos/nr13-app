import { excluirChave, ler, salvar } from '../../services/storage';
import { baixarFoto, blobParaDataUrl, salvarArquivo, type RefFoto } from '../../services/fotos';
import { comprimirImagemComBlob } from '../../services/imagem';

/**
 * Fase 12B · a PLACA DE IDENTIFICAÇÃO do equipamento.
 *
 * ## Duas formas da mesma coisa
 *
 * | forma | de onde vem | quando aparece |
 * |---|---|---|
 * | **reconstruída** | os dados que já estão na ficha (TAG, fabricante, série, ano, código de projeto, fluido, categoria, PMTA, PTH, volume) | sempre que não há foto |
 * | **real** | uma foto da placa do equipamento, enviada pelo usuário | prevalece sobre a reconstruída |
 *
 * A reconstrução não INVENTA nada: o que não existe na ficha sai como traço,
 * igual ao resto do relatório. Uma placa reconstruída com dado chutado seria
 * pior que não ter placa — ela parece um registro do equipamento.
 *
 * Remover a foto devolve a reconstruída, sem nenhum passo extra: a chave
 * simplesmente deixa de existir.
 *
 * ## Onde o arquivo mora
 *
 * No mesmo lugar das outras fotos do sistema (`services/fotos.ts`): bucket
 * privado, cofre local e `RefFoto` no dado. **Nada de base64 no storage** — foi
 * exatamente isso que estourou a cota no prontuário do fabricante (§2-bis), e
 * não existe motivo para repetir com a placa.
 *
 * ## Fora do palco
 *
 * Nenhum template de `public/` lê esta chave: a placa é desenhada pelo gerador
 * vetorial a partir do modelo. Materializá-la no palco só gastaria orçamento de
 * um documento que já está apertado (§2-ter).
 */

export interface PlacaReal {
  ref: RefFoto;
  /** Largura ÷ altura da imagem original — o PDF precisa para não esticar. */
  proporcao: number;
  enviadoEm: string;
}

export const PREFIXO_PLACA = 'nr13_placa_';

export function chavePlaca(tag: string): string {
  return `${PREFIXO_PLACA}${tag}`;
}

/** O registro da foto real, se houver. `null` = usar a placa reconstruída. */
export function lerPlacaReal(tag: string): PlacaReal | null {
  if (!tag) return null;
  const p = ler<PlacaReal>(chavePlaca(tag));
  return p?.ref?.path ? p : null;
}

/** Existe foto real? Síncrono, para a UI decidir o que mostrar. */
export function temPlacaReal(tag: string): boolean {
  return lerPlacaReal(tag) !== null;
}

/**
 * Guarda a foto real da placa.
 *
 * Comprime antes de subir pelo mesmo caminho das fotos de inspeção: uma foto de
 * placa tirada no celular chega com 4–8 MB, e a placa é um retângulo de texto —
 * a compressão não custa legibilidade e evita subir o arquivo inteiro.
 */
export async function definirPlacaReal(tag: string, arquivo: File): Promise<PlacaReal> {
  const { blob, dataUrl } = await comprimirImagemComBlob(arquivo, 1400);
  const ref = await salvarArquivo(blob, 'placa', 'jpg', 'image/jpeg');
  const registro: PlacaReal = {
    ref,
    // A proporção é MEDIDA na imagem comprimida, não assumida. A primitiva de
    // foto do gerador cai em 4:3 quando não recebe proporção, e placa é um
    // retângulo largo — assumir 4:3 esticaria o texto da placa (foi o mesmo
    // defeito do croqui, corrigido na 12A).
    proporcao: await medirProporcao(dataUrl),
    enviadoEm: new Date().toISOString(),
  };
  await salvar(chavePlaca(tag), registro);
  return registro;
}

/** Largura ÷ altura de um dataURL. Cai em 4:3 só se a imagem não abrir. */
function medirProporcao(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 4 / 3);
    img.onerror = () => resolve(4 / 3);
    img.src = dataUrl;
  });
}

/**
 * Tira a foto real — a placa volta a ser a reconstruída.
 *
 * O ARQUIVO no bucket não é apagado: relatórios já finalizados que embutiram
 * essa imagem continuam existindo, e o arquivo é o que o `pdfRef` daquele
 * documento carrega. Remover aqui é desfazer a ESCOLHA, não apagar histórico.
 */
export async function removerPlacaReal(tag: string): Promise<void> {
  await excluirChave(chavePlaca(tag));
}

/**
 * A imagem da placa pronta para o PDF, ou `null` para desenhar a reconstruída.
 *
 * Resolve pelo cofre local antes do bucket (é o que `baixarFoto` faz), então
 * gerar um relatório logo depois de enviar a foto não gasta egress.
 */
export async function resolverPlacaReal(
  tag: string,
): Promise<{ dataUrl: string; proporcao: number } | null> {
  const placa = lerPlacaReal(tag);
  if (!placa) return null;
  try {
    const blob = await baixarFoto(placa.ref);
    if (!blob) return null;
    return { dataUrl: await blobParaDataUrl(blob), proporcao: placa.proporcao };
  } catch {
    // Placa que não resolve não pode derrubar a emissão do relatório: o
    // documento sai com a placa RECONSTRUÍDA, que é informação verdadeira.
    return null;
  }
}

/**
 * Os campos da placa reconstruída, na ordem em que uma placa real os traz.
 *
 * Função pura sobre o modelo já montado — nada de leitura de storage aqui, para
 * que o desenho e o teste vejam exatamente a mesma coisa.
 */
export function camposDaPlaca(
  equipamento: Record<string, string | null>,
  pressoes: { rotulo: string; kgf: string | null }[],
): [string, string | null][] {
  const pressao = (inicio: string) => pressoes.find((p) => p.rotulo.toUpperCase().startsWith(inicio))?.kgf ?? null;
  return [
    ['FABRICANTE', equipamento['FABRICANTE'] ?? null],
    ['IDENTIFICAÇÃO / TAG', equipamento['IDENTIFICAÇÃO / T.A.G.'] ?? null],
    ['Nº DE SÉRIE', equipamento['NÚMERO DE SÉRIE'] ?? null],
    ['ANO DE FABRICAÇÃO', equipamento['ANO DE FABRICAÇÃO'] ?? null],
    ['CÓDIGO DE PROJETO', equipamento['CÓDIGO DE PROJETO'] ?? null],
    ['FLUIDO', equipamento['FLUIDO DE OPERAÇÃO'] ?? null],
    ['PMTA (kgf/cm²)', pressao('PMTA')],
    ['PTH (kgf/cm²)', pressao('PTH')],
    ['VOLUME (m³)', equipamento['VOLUME (m³)'] ?? null],
    ['CATEGORIA NR-13', equipamento['CATEGORIA DO VASO'] ?? null],
  ];
}
