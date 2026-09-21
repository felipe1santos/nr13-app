import type { Previa } from './previaDocumento';
import type { MotorPdf } from './motorPdf';

/**
 * Fase 13E · QUEM MONTA O DOCUMENTO NA TELA DE RELATÓRIOS.
 *
 * ## O que muda em relação à 13D
 *
 * Na 13D as duas prévias coexistiam: a nova aparecia e a antiga ficava
 * escondida por CSS. Escondida, mas MONTADA — 27 iframes carregados, o palco
 * materializado no `localStorage`, a ponte drenando, o `sb-storage` servindo
 * cada folha. O usuário pagava o custo inteiro do caminho antigo para ver o
 * novo.
 *
 * Aqui o caminho passa a ser um só por vez:
 *
 * | fluxo | o que a tela monta |
 * |---|---|
 * | `vetorial` | o PDF do Modelo Novo, e **nada** de iframe/palco/ponte |
 * | `iframes` | as 27 folhas HTML, exatamente como sempre |
 *
 * ## Por que isto é função pura, e não um `if` na tela
 *
 * Da decisão dependem quatro coisas que precisam concordar: montar (ou não) os
 * iframes, pular (ou não) o palco, de onde sai o papel da PRÉVIA e qual motor
 * pode desenhar a finalização. Espalhados pela tela, esses quatro `if` saem de
 * sincronia no primeiro ajuste — e o defeito só aparece no documento do
 * cliente. A suíte roda em `environment: 'node'`, sem DOM: regra que precisa de
 * teste não pode morar dentro do componente.
 */
export type FluxoDocumento = 'vetorial' | 'iframes';

/**
 * O fluxo desta tela.
 *
 * **Documento arquivado não entra na conta.** Com `pdfRef` a tela serve os bytes
 * emitidos (§7-quater) e não monta documento nenhum — nem iframes, nem prévia.
 * A pergunta só existe para documento em EDIÇÃO.
 */
export function fluxoDaTela(previa: Previa, arquivado: boolean): FluxoDocumento {
  if (arquivado) return 'vetorial';
  return previa === 'vetorial' ? 'vetorial' : 'iframes';
}

/** As 27 folhas HTML só são montadas no fluxo antigo. */
export function montaIframes(fluxo: FluxoDocumento): boolean {
  return fluxo === 'iframes';
}

/**
 * O palco existe para os iframes. Sem eles, materializar as chaves da TAG no
 * `localStorage` seria trabalho (e risco de cota) por nada — e é o palco que
 * toma a trava exclusiva da aba, impedindo o mesmo documento em duas abas.
 */
export function precisaPalco(fluxo: FluxoDocumento): boolean {
  return montaIframes(fluxo);
}

/**
 * O motor que a finalização PODE usar.
 *
 * O gerador raster fotografa `.relatorio-preview`; sem iframes montados não há
 * o que fotografar, e ele falharia com "o documento não está montado" no meio
 * de uma finalização — no pior momento possível. Então, no fluxo novo, o motor
 * é o vetorial mesmo que a organização tenha o raster configurado como
 * rollback.
 *
 * **O rollback continua existindo, e continua sendo um passo:** `?previa=iframe`
 * traz os iframes de volta, e aí o raster volta a ser possível. Os dois andam
 * juntos porque um depende do outro.
 */
export function motorPossivel(fluxo: FluxoDocumento, motorEscolhido: MotorPdf): MotorPdf {
  return fluxo === 'vetorial' ? 'vetorial' : motorEscolhido;
}

/**
 * De onde sai o papel de um documento **em edição** (o arquivado sempre serve o
 * `pdfRef` — ver `fonteImpressao.ts`).
 *
 * `previa-vetorial` = os bytes do mesmo gerador da emissão, abertos para o
 * leitor do sistema operacional imprimir. `raster-da-tela` = html2canvas sobre
 * os iframes, como antes.
 */
export function papelDaPrevia(fluxo: FluxoDocumento): 'previa-vetorial' | 'raster-da-tela' {
  return fluxo === 'vetorial' ? 'previa-vetorial' : 'raster-da-tela';
}

/**
 * O painel do LAUDO precisa estar na barra? (21/09/2026)
 *
 * O APTO/INAPTO tem duas superfícies possíveis: a folha `CONCLUSAO.html`
 * (clique no SIM/NÃO, fluxo antigo) e o painel React (`ModalLaudo`). A 13C
 * amarrou o botão da barra à chave `nr13_edicao_react`, que nasce em
 * `iframe` — e naquele momento isso bastava, porque com `iframe` a folha
 * estava na tela e resolvia.
 *
 * A 13E tirou os iframes do caminho padrão. Desde então, a organização que
 * nunca mexeu em nenhuma das duas chaves (a configuração PADRÃO) caía no pior
 * cruzamento possível:
 *
 * | prévia | edição | onde marcar o laudo |
 * |---|---|---|
 * | vetorial (padrão) | iframe (padrão) | **em lugar nenhum** |
 *
 * Sem folha e sem botão, o laudo não tinha como ser gravado; a validação o
 * exige para finalizar; e o documento ficava travado em "Voltar e revisar".
 * Medido em produção num cliente, com três relatórios parados.
 *
 * A regra: **sem folha para clicar, o painel é obrigatório.** Ele continua
 * aparecendo quando a organização escolheu a edição React de propósito.
 */
export function precisaPainelDeLaudo(fluxo: FluxoDocumento, superficie: 'iframe' | 'react'): boolean {
  return superficie === 'react' || !montaIframes(fluxo);
}
