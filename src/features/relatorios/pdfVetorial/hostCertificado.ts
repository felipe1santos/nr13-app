import { ler } from '../../../services/storage';
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
 * Isso NÃO usa `palco.ts`: aquele módulo tem trava por aba, manifesto e
 * orçamento de 3.368 KB para um documento inteiro. Aqui são quatro chaves e uma
 * folha, e reaproveitar a maquinaria do palco significaria disputar a trava com
 * o documento que talvez esteja aberto.
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

/** As chaves que precisam existir no `localStorage` para a folha se preencher. */
export function chavesDaFolha(documento: string): string[] {
  const id = calibIdDoDocumento(documento);
  return id ? [...GLOBAIS_DA_FOLHA, `nr13_calibracao_item_${id}`] : [...GLOBAIS_DA_FOLHA];
}

/**
 * Materializa as chaves e devolve a função que desfaz.
 *
 * Chave que **já existe** no `localStorage` não é tocada: no caminho v1, e com o
 * palco do documento montado, o valor que está lá é o certo — reescrevê-lo
 * arriscaria trocar um dado bom por uma releitura.
 */
function materializarChaves(documento: string): () => void {
  const anteriores: { chave: string; valor: string | null }[] = [];
  for (const chave of chavesDaFolha(documento)) {
    if (localStorage.getItem(chave) !== null) continue;
    const dado = ler<unknown>(chave);
    if (dado === null || dado === undefined) continue;
    anteriores.push({ chave, valor: null });
    try {
      localStorage.setItem(chave, JSON.stringify(dado));
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
): Promise<T> {
  const desfazer = materializarChaves(documento);
  const caixa = document.createElement('div');
  caixa.setAttribute('data-nr13-host-certificado', '');
  caixa.style.cssText = `position:fixed;left:-20000px;top:0;width:${LARGURA_A4_PX}px;height:${ALTURA_A4_PX}px;overflow:hidden;z-index:-1;`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('scrolling', 'no');
  iframe.style.cssText = `width:${LARGURA_A4_PX}px;height:${ALTURA_A4_PX}px;border:0;`;
  const sep = documento.includes('?') ? '&' : '?';
  // `ro=1`: a folha nasce somente-leitura. Ela não deveria gravar nada, e um
  // host invisível é o último lugar onde uma escrita acidental seria notada.
  iframe.src = `/arquivos-inspecao/${documento}${sep}tag=${encodeURIComponent(tag)}&page=1&ctx=rel&ro=1`;

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
