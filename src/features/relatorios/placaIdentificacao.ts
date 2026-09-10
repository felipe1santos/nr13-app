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
 * ## A ESCOLHA É DE UM RELATÓRIO, NÃO DO EQUIPAMENTO (10/09/2026)
 *
 * A chave era `nr13_placa_<TAG>`, por EQUIPAMENTO. Consequência medida: uma
 * foto enviada num relatório passava a substituir a placa reconstruída em
 * TODOS os relatórios daquele equipamento, para sempre — inclusive nos que
 * seriam emitidos meses depois, por outra pessoa, sem que nada na tela dissesse
 * que aquela imagem tinha vindo de outro documento.
 *
 * Trocar a placa por uma foto é uma decisão PONTUAL: vale para o documento em
 * que foi tomada. A chave passou a ser `nr13_placa_<idRelatorio>_<TAG>` — o
 * mesmo formato dos overrides (`nr13_ovr_<id>_<TAG>`, id primeiro e TAG por
 * último, por causa do filtro da Edge do Portal).
 *
 * Sem `idRelatorio` não há foto: o padrão do documento é a placa
 * RECONSTRUÍDA, e um relatório novo nasce com ela.
 *
 * As chaves antigas por TAG ficam INERTES. Nada as lê e nada as escreve; os
 * relatórios já emitidos que embutiram aquela imagem continuam intactos, porque
 * documento finalizado é servido pelo `pdfRef` e nunca remontado (§7-quater).
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

/**
 * `nr13_placa_<idRelatorio>_<TAG>`.
 *
 * O id é sanitizado do mesmo jeito que em `chaveRelatorio()`: um `_` dentro
 * dele moveria a fronteira que `familiasChave` usa para achar a TAG.
 */
export function chavePlaca(tag: string, idRelatorio: string): string {
  return `${PREFIXO_PLACA}${idRelatorio.replace(/_/g, '-')}_${tag}`;
}

/**
 * O registro da foto real DESTE relatório, se houver.
 * `null` = usar a placa reconstruída, que é o padrão do documento.
 */
export function lerPlacaReal(tag: string, idRelatorio?: string | null): PlacaReal | null {
  if (!tag || !idRelatorio) return null;
  const p = ler<PlacaReal>(chavePlaca(tag, idRelatorio));
  return p?.ref?.path ? p : null;
}

/** Existe foto real neste relatório? Síncrono, para a UI decidir o que mostrar. */
export function temPlacaReal(tag: string, idRelatorio?: string | null): boolean {
  return lerPlacaReal(tag, idRelatorio) !== null;
}

/**
 * Guarda a foto real da placa.
 *
 * Comprime antes de subir pelo mesmo caminho das fotos de inspeção: uma foto de
 * placa tirada no celular chega com 4–8 MB, e a placa é um retângulo de texto —
 * a compressão não custa legibilidade e evita subir o arquivo inteiro.
 */
export async function definirPlacaReal(
  tag: string,
  idRelatorio: string,
  arquivo: File,
): Promise<PlacaReal> {
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
  await salvar(chavePlaca(tag, idRelatorio), registro);
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
export async function removerPlacaReal(tag: string, idRelatorio: string): Promise<void> {
  await excluirChave(chavePlaca(tag, idRelatorio));
}

/**
 * A imagem da placa pronta para o PDF, ou `null` para desenhar a reconstruída.
 *
 * Resolve pelo cofre local antes do bucket (é o que `baixarFoto` faz), então
 * gerar um relatório logo depois de enviar a foto não gasta egress.
 */
export async function resolverPlacaReal(
  tag: string,
  idRelatorio?: string | null,
): Promise<{ dataUrl: string; proporcao: number } | null> {
  const placa = lerPlacaReal(tag, idRelatorio);
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
 * ## O LAYOUT da placa reconstruída (08/09/2026)
 *
 * A primeira versão era uma grade de duas colunas com `RÓTULO` em negrito à
 * esquerda e o valor ao lado — uma tabela, e placa de equipamento não é tabela.
 * Numa placa de verdade o **valor é o que se lê de longe**: ele vem grande,
 * dentro de um quadro, e o nome do campo aparece pequeno **por baixo**.
 *
 * O modelo é a referência que o dono mandou (`2832c492-…`): fieiras de largura
 * cheia para o que é único (TAG, tipo, fabricante, código de projeto), fieiras
 * partidas para o que anda em par (série + ano, fluido + classe), as duas
 * pressões como mini-tabelas de três unidades (MPa · psi · kgf/cm²) e a
 * CATEGORIA num quadro alto no fim — que é o campo pelo qual um fiscal procura.
 *
 * ### Por que isto é uma função pura, e não desenho
 *
 * O desenho vive em `folhas.ts` e precisa de jsPDF. A ESCOLHA de quais campos
 * entram, em que ordem e com que peso é regra do documento, e é ela que tem de
 * ser testável sem gerar PDF. `peso` é fração da largura da placa; as fieiras
 * somam 1.
 *
 * **Nada é inventado.** Campo ausente na ficha entra com `null`, e o desenho o
 * imprime como travessão, igual ao resto do relatório.
 */

/** Uma célula da placa: um campo simples ou o bloco de três unidades de pressão. */
export type CelulaPlaca =
  | { tipo: 'campo'; rotulo: string; valor: string | null; peso: number }
  | {
      tipo: 'pressao';
      rotulo: string;
      peso: number;
      colunas: { unidade: string; valor: string | null }[];
    };

export interface FileiraPlaca {
  celulas: CelulaPlaca[];
  /**
   * Altura da fieira em múltiplos da fieira comum. Duas escapam do 1:
   * a de PRESSÕES, que empilha cabeçalho de unidade + valor dentro do mesmo
   * quadro (com fator 1 o texto saía com metade do corpo do resto da placa), e
   * a da CATEGORIA, que é o campo pelo qual um fiscal procura.
   */
  fator?: number;
}

/** Proporção largura ÷ altura da placa da referência (770 × 840 px). */
export const PROPORCAO_PLACA = 0.92;

export function layoutDaPlaca(
  equipamento: Record<string, string | null>,
  pressoes: { rotulo: string; mpa?: string | null; psi?: string | null; kgf: string | null }[],
  datas: { execucao?: string | null; validade?: string | null } = {},
): FileiraPlaca[] {
  const eq = (chave: string) => equipamento[chave] ?? null;
  const pressao = (inicio: string): { unidade: string; valor: string | null }[] => {
    const p = pressoes.find((x) => x.rotulo.toUpperCase().startsWith(inicio));
    return [
      { unidade: 'MPa', valor: p?.mpa ?? null },
      { unidade: 'psi', valor: p?.psi ?? null },
      { unidade: 'kgf/cm²', valor: p?.kgf ?? null },
    ];
  };
  const campo = (rotulo: string, valor: string | null, peso: number): CelulaPlaca =>
    ({ tipo: 'campo', rotulo, valor, peso });

  return [
    { celulas: [campo('IDENTIFICAÇÃO DO EQUIPAMENTO', eq('IDENTIFICAÇÃO / T.A.G.'), 1)] },
    { celulas: [campo('TIPO DE EQUIPAMENTO', eq('TIPO DE EQUIPAMENTO'), 1)] },
    { celulas: [campo('FABRICANTE', eq('FABRICANTE'), 1)] },
    {
      celulas: [
        campo('NÚMERO DE SÉRIE', eq('NÚMERO DE SÉRIE'), 0.66),
        campo('ANO DE FABRICAÇÃO', eq('ANO DE FABRICAÇÃO'), 0.34),
      ],
    },
    { celulas: [campo('CÓDIGO DE PROJETO', eq('CÓDIGO DE PROJETO'), 1)] },
    {
      celulas: [
        campo('FLUIDO DE OPERAÇÃO', eq('FLUIDO DE OPERAÇÃO'), 0.76),
        campo('CLASSE', eq('CLASSE DO FLUIDO'), 0.24),
      ],
    },
    {
      fator: 1.5,
      celulas: [
        { tipo: 'pressao', rotulo: 'PMTA', peso: 0.5, colunas: pressao('PMTA') },
        { tipo: 'pressao', rotulo: 'PTH', peso: 0.5, colunas: pressao('PTH') },
      ],
    },
    {
      celulas: [
        campo('VOLUME (m³)', eq('VOLUME (m³)'), 0.22),
        campo('GRUPO DE RISCO', eq('GRUPO DE RISCO'), 0.24),
        campo('EXECUÇÃO DA INSPEÇÃO', datas.execucao ?? null, 0.32),
        campo('VALIDADE', datas.validade ?? null, 0.22),
      ],
    },
    { fator: 2.1, celulas: [campo('CATEGORIA', eq('CATEGORIA DO VASO'), 1)] },
  ];
}
