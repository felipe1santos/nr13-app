import { ler } from '../../../services/storage';
import { hidratarFotosDoBucket, refsNoLugarDaChave, type ItemPalco } from '../../../services/palco';
import { ALTURA_A4_PX, aguardarRecursosIframe } from '../printService';

/**
 * Fase 13B · o HOST ISOLADO da folha de calibração.
 *
 * ## O que ele resolve
 *
 * O gerador vetorial dependia de `.relatorio-preview .pagina-relatorio-a4` para
 * rasterizar as folhas `CERTIFICADO-CAL-*`. Isso amarrava a emissão do PDF à
 * TELA: para conseguir uma folha de calibração era preciso ter os 27 iframes do
 * relatório montados e o palco inteiro materializado.
 *
 * Aqui a folha é montada **sozinha**, num contêiner fora da interface, usada, e
 * destruída. Nada do relatório precisa estar na tela.
 *
 * ## Por que continua raster
 *
 * Decisão B1 (04/09/2026). A folha de calibração é template nosso, mas
 * redesenhá-la em vetor mudaria a aparência de um documento que o dono pediu
 * para não mexer. Rasterizar **uma** folha não torna o relatório raster: o corpo
 * continua desenhado em vetor, e esta é a exceção declarada do §7-septies.
 *
 * O certificado do LABORATÓRIO (`nr13_rastreab_`) não passa por aqui — ele é
 * PDF de origem e entra por pdf-lib, com os bytes originais.
 *
 * ## As chaves, e por que elas precisam ser materializadas
 *
 * O template lê `localStorage` no `DOMContentLoaded`. No armazenamento v2 o
 * `localStorage` é só o PALCO: fora dele as chaves não existem. Como o host não
 * pode depender de o palco do documento estar montado — é justamente disso que
 * estamos nos livrando —, ele materializa **as poucas chaves que a folha lê**,
 * guarda os valores anteriores e os restaura ao terminar.
 *
 * Isso NÃO monta o palco: `palco.ts` tem trava por aba, manifesto e orçamento
 * de 3.368 KB para um documento inteiro. Aqui são quatro chaves e uma folha, e
 * montar o palco significaria disputar a trava com o documento que talvez esteja
 * aberto. Do palco vem só a função PURA que troca referência por imagem
 * (`hidratarFotosDoBucket`) — ver `materializarChaves`.
 */

/** As chaves globais que qualquer folha `CERTIFICADO-CAL-*` lê. */
const GLOBAIS_DA_FOLHA = ['nr13_minha_empresa', 'nr13_relatorio_meta_atual', 'nr13_injecao_atual'];

/** O `calibId` da folha, quando ela vem com um. */
export function calibIdDoDocumento(documento: string): string | null {
  const q = documento.split('?')[1];
  if (!q) return null;
  const id = new URLSearchParams(q).get('calibId');
  return id && id.trim() !== '' ? id : null;
}

/**
 * As chaves globais da folha AVULSA (emissão do certificado, fase 2 · C.3).
 *
 * Sem `nr13_relatorio_meta_atual`: ela é a meta do ÚLTIMO relatório montado
 * nesta aba, e a folha a prefere ao registro (`certCalibracoes[calibId]`) — um
 * certificado emitido fora de relatório sairia com o snapshot de outro
 * documento. Sem `nr13_injecao_atual` pelo mesmo motivo (motor do avulso).
 */
const GLOBAIS_DA_FOLHA_AVULSA = ['nr13_minha_empresa'];

/** As chaves que precisam existir no `localStorage` para a folha se preencher. */
export function chavesDaFolha(documento: string, avulsa = false): string[] {
  const id = calibIdDoDocumento(documento);
  const globais = avulsa ? GLOBAIS_DA_FOLHA_AVULSA : GLOBAIS_DA_FOLHA;
  return id ? [...globais, `nr13_calibracao_item_${id}`] : [...globais];
}

/** Opções do host. Sem nenhuma, é o comportamento do anexo ao relatório. */
export interface OpcoesFolhaIsolada {
  /**
   * Folha FORA do relatório (emissão do certificado): sem `ctx=rel`, sem a
   * meta do relatório, e com `fonte=registro` para o template ler o registro
   * da calibração e nada mais.
   */
  avulsa?: boolean;
  /**
   * Valores que a folha TEM de ler, gravados mesmo que a chave já exista (e
   * restaurados depois). É o que garante que a emissão imprime exatamente o
   * registro que será carimbado como emitido — e não uma cópia que o palco de
   * outra tela deixou no `localStorage`.
   */
  sobrepor?: Record<string, unknown>;
}

/**
 * Materializa as chaves e devolve a função que desfaz.
 *
 * Chave que **já existe** no `localStorage` não é tocada: no caminho v1, e com o
 * palco do documento montado, o valor que está lá é o certo — reescrevê-lo
 * arriscaria trocar um dado bom por uma releitura.
 *
 * ## A LOGO (revisão do engenheiro, 18/09/2026)
 *
 * Esta função gravava o valor CRU. Desde a Fase 7B o snapshot da empresa na
 * meta do relatório guarda só `logoRef` (a dataURL sai — `snapshotEmpresa`), e
 * quem trocava a referência pela imagem era o PALCO. O template da folha lê
 * `dados.logo`: não achava, e ficava com o placeholder `logo.webp`, que não
 * existe em `/arquivos-inspecao/` — 404, e o canto superior esquerdo do
 * certificado saía vazio SÓ quando ele era anexado ao relatório. Na tela de
 * Calibrações (que monta pelo palco) a logo aparecia.
 *
 * Agora as chaves com referência resolvida-no-lugar passam pela MESMA função do
 * palco (`hidratarFotosDoBucket` + `refsNoLugarDaChave`): um caminho só para a
 * logo do certificado avulso e do anexado, com a regra dele — só preenche campo
 * VAZIO, e sem imagem o campo fica como estava (nunca a logo de hoje num
 * documento de ontem). As demais chaves (`nr13_injecao_atual`, o item da
 * calibração) seguem cruas: hidratá-las baixaria as fotos de campo do container
 * inteiro para uma folha que não imprime nenhuma.
 */
export async function materializarChaves(
  documento: string,
  opcoes: OpcoesFolhaIsolada = {},
): Promise<() => void> {
  const anteriores: { chave: string; valor: string | null }[] = [];
  const itens: ItemPalco[] = [];
  const sobrepor = opcoes.sobrepor ?? {};
  for (const chave of chavesDaFolha(documento, !!opcoes.avulsa)) {
    if (chave in sobrepor) continue;
    if (localStorage.getItem(chave) !== null) continue;
    const dado = ler<unknown>(chave);
    if (dado === null || dado === undefined) continue;
    itens.push({ chave, valor: JSON.stringify(dado) });
  }
  for (const [chave, dado] of Object.entries(sobrepor)) {
    itens.push({ chave, valor: JSON.stringify(dado) });
  }
  const comRef = itens.filter((i) => refsNoLugarDaChave(i.chave).length > 0);
  const semRef = itens.filter((i) => refsNoLugarDaChave(i.chave).length === 0);
  let hidratadas: ItemPalco[] = comRef;
  try {
    hidratadas = await hidratarFotosDoBucket(comRef);
  } catch {
    // Falha de rede não impede a folha: ela sai com o que havia, e a ausência da
    // logo é detectada depois (`logoAusenteNaFolha`).
  }
  for (const { chave, valor } of [...hidratadas, ...semRef]) {
    anteriores.push({ chave, valor: localStorage.getItem(chave) });
    try {
      localStorage.setItem(chave, valor);
    } catch {
      // Cota estourada aqui não pode derrubar a emissão: a folha sai com o que
      // conseguir ler, e a falha aparece em `falhas` se ela vier vazia.
    }
  }
  return () => {
    for (const a of anteriores) {
      if (a.valor === null) localStorage.removeItem(a.chave);
      else localStorage.setItem(a.chave, a.valor);
    }
  };
}

/** O pixel transparente que os templates de certificado usam como "sem logo". */
export const LOGO_VAZIA = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/**
 * A folha de certificado montada ficou SEM a logo que a empresa tem?
 *
 * É o detector do defeito acima: `esperada` diz se o cadastro (ou o snapshot)
 * tem logo; a folha "falhou" se, mesmo assim, o `<img id="imgLogo">` não recebeu
 * uma imagem de verdade — continua no placeholder, vazio ou no `logo.webp`.
 */
export function logoAusenteNaFolha(docFolha: Document | null | undefined, esperada: boolean): boolean {
  if (!esperada) return false;
  const img = docFolha?.getElementById('imgLogo') as HTMLImageElement | null;
  if (!img) return true;
  const src = img.getAttribute('src') ?? '';
  return src === '' || src === LOGO_VAZIA || /(^|\/)logo\.webp$/i.test(src);
}

/** O cadastro/snapshot que a folha vai ler tem logo (dataURL ou referência)? */
export function empresaTemLogo(): boolean {
  const meta = ler<{ empresa?: { logo?: string; logoRef?: { path?: string } } }>('nr13_relatorio_meta_atual');
  const emp = meta?.empresa ?? ler<{ logo?: string; logoRef?: { path?: string } }>('nr13_minha_empresa');
  return !!(emp?.logo || emp?.logoRef?.path);
}

/** Largura A4 em px CSS a 96 dpi — o par de `ALTURA_A4_PX`. */
export const LARGURA_A4_PX = Math.ceil((210 * 96) / 25.4);

/**
 * Monta UMA folha fora da tela, entrega o corpo dela, e limpa tudo depois.
 *
 * O contêiner fica em `position: fixed` fora da área visível — e não em
 * `display: none`, que faria o `html2canvas` medir tudo como zero.
 */
export async function comFolhaIsolada<T>(
  documento: string,
  tag: string,
  usar: (alvo: HTMLElement, doc: Document) => Promise<T>,
  opcoes: OpcoesFolhaIsolada = {},
): Promise<T> {
  const desfazer = await materializarChaves(documento, opcoes);
  const caixa = document.createElement('div');
  caixa.setAttribute('data-nr13-host-certificado', '');
  caixa.style.cssText = `position:fixed;left:-20000px;top:0;width:${LARGURA_A4_PX}px;height:${ALTURA_A4_PX}px;overflow:hidden;z-index:-1;`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('scrolling', 'no');
  iframe.style.cssText = `width:${LARGURA_A4_PX}px;height:${ALTURA_A4_PX}px;border:0;`;
  const sep = documento.includes('?') ? '&' : '?';
  // `ro=1`: a folha nasce somente-leitura. Ela não deveria gravar nada, e um
  // host invisível é o último lugar onde uma escrita acidental seria notada.
  const contexto = opcoes.avulsa ? '&fonte=registro' : '&ctx=rel';
  iframe.src = `/arquivos-inspecao/${documento}${sep}tag=${encodeURIComponent(tag)}&page=1${contexto}&ro=1`;

  caixa.appendChild(iframe);
  document.body.appendChild(caixa);

  try {
    await new Promise<void>((resolve) => {
      let pronto = false;
      const acabou = () => {
        if (!pronto) {
          pronto = true;
          resolve();
        }
      };
      iframe.addEventListener('load', () => acabou(), { once: true });
      // Rede lenta ou template quebrado não podem travar a emissão para sempre.
      window.setTimeout(acabou, 8000);
    });
    // Um quadro depois do `load` para o script do template terminar de preencher.
    await new Promise((r) => setTimeout(r, 350));
    await aguardarRecursosIframe(iframe.contentDocument);
    const alvo = iframe.contentDocument?.body;
    if (!alvo) throw new Error('a folha de calibração não abriu no host isolado');
    return await usar(alvo, iframe.contentDocument!);
  } finally {
    caixa.remove();
    desfazer();
  }
}
