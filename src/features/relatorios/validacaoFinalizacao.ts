import type { RelatorioMeta } from './tipos';
import { resolverValor, type MapaOverrides } from './overridesRelatorio';
import { acumulacaoPreenchida, dadosPadraoAcumulacao, verificarAcumulacao, type DadosAcumulacao } from '../inspecoes/acumulacao';
import { listaDeItens, precisaConfirmarSemantica } from '../inspecoes/formularios/semanticaNc';
import { ITENS_VISUAL_EXTERNO } from '../inspecoes/formularios/FormularioVisualExterno';
import { ITENS_VISUAL_INTERNO } from '../inspecoes/formularios/FormularioVisualInterno';
import { itensDoExame } from '../caldeira/itensVisuaisCaldeira';
import { pendenciasParaEmissao } from '../inspecoes/fotosDescritas';
import { FOLHA_RELATORIO_IMAGENS } from './relatorioImagensNoRelatorio';
import { itemConteudoRelatorio } from '../normas/nr13';

/**
 * Fase 10B.1 · o que se confere ANTES de finalizar — e a diferença entre
 * impedir e avisar.
 *
 * Finalizar é irreversível: gera o PDF, calcula o SHA-256 e tranca o documento.
 * Por isso a conferência é separada em duas listas, e a separação é a regra:
 *
 *  · **OBRIGATÓRIO faltando BLOQUEIA.** São os campos sem os quais o documento
 *    não é um documento: sem código não há como referenciá-lo, sem data de
 *    emissão não há quando, sem engenheiro não há quem assina, sem folhas não
 *    há relatório, e sem laudo não há conclusão — que é a única coisa que o
 *    cliente lê;
 *  · **OPCIONAL em branco AVISA e deixa passar.** Campo em branco é comum e
 *    legítimo (nem toda inspeção tem teste hidrostático, nem todo exame gera
 *    observação). Transformar cada um deles em bloqueio ensinaria o usuário a
 *    preencher qualquer coisa para o botão liberar — e aí o campo passa a
 *    mentir, que é pior do que estar vazio.
 *
 * Tudo aqui é função PURA sobre os dados: a suíte roda em ambiente `node`, sem
 * DOM, e uma regra que decide se um documento pode ser trancado não pode morar
 * dentro do JSX, onde nenhum teste alcança.
 */
export interface Pendencia {
  /** Identificador estável — o teste ancora nele, não no texto. */
  campo: string;
  /** A frase que o usuário lê no modal. */
  texto: string;
  /** De onde vem: ajuda o usuário a saber ONDE corrigir. */
  onde: string;
}

export interface ResultadoValidacao {
  obrigatorios: Pendencia[];
  opcionais: Pendencia[];
  /** Só isto decide o botão. Opcional em branco nunca bloqueia. */
  podeFinalizar: boolean;
}

/** O laudo da conclusão (`nr13_laudo_<TAG>`), como a folha CONCLUSAO.html grava. */
export interface LaudoConclusao {
  apto?: boolean | null;
  relatorioCodigo?: string;
}

export interface EntradaValidacao {
  meta: RelatorioMeta | null;
  documentos: string[] | null;
  /** `nr13_laudo_<TAG>`. `null` = o usuário ainda não marcou SIM/NÃO. */
  laudo: LaudoConclusao | null;
  /** `container.dados` da inspeção de origem, quando o relatório veio de uma. */
  dadosContainer?: Record<string, unknown> | null;
  /**
   * Os overrides do documento aberto. A observação de uma não conformidade
   * pode ter sido escrita DENTRO do documento, e não no formulário — ela vale.
   */
  overrides?: MapaOverrides;
  /**
   * 21/10/2026 · PMTA do documento (adotada ?? calculada), em MPa — só o Ensaio
   * de Acumulação a usa, para o ALERTA de 1,06 × PMTA. Ausente = sem alerta.
   */
  pmtaMpa?: number | null;
  /**
   * 22/10/2026 · tipo do equipamento (`'caldeira'` | `'vaso'` | …) — decide qual
   * subitem da NR-13 o aviso do certificado da PSV cita. Ausente = vaso.
   */
  tipoEquipamento?: string | null;
  /**
   * O documento sai pelo gerador de CALDEIRA (`ehRelatorioCompletoDeCaldeira`)?
   * Só ele desenha o campo da justificativa da acumulação. Ausente = deduz do tipo.
   */
  relatorioDeCaldeira?: boolean;
}

/**
 * O relatório traz o NÚMERO de algum certificado de inspeção e teste da válvula
 * de segurança? (NR-13 2022: 13.4.4.12 "n" para caldeira, 13.5.4.11 "n" para
 * vaso.) Três caminhos por onde ele chega ao documento:
 * - a folha de calibração da PSV na composição (`CERTIIFCADO-CAL-PSV.html?calibId=`);
 * - o snapshot congelado na meta (`meta.certCalibracoes`) de uma PSV com número;
 * - o quadro 7.1.1 do checklist apontando para uma calibração de PSV com número.
 */
export function temCertificadoPsv(
  documentos: string[] | null,
  meta: RelatorioMeta | null,
  dadosContainer: EntradaValidacao['dadosContainer'],
): boolean {
  if ((documentos ?? []).some((d) => d.startsWith('CERTIIFCADO-CAL-PSV.html'))) return true;
  const numerado = (v: unknown, tipoCampo: string) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return o[tipoCampo] === 'psv' && typeof o.numeroCertificado === 'string' && o.numeroCertificado.trim() !== '';
  };
  if (Object.values(meta?.certCalibracoes ?? {}).some((c) => numerado(c, 'tipo'))) return true;
  const chk = dadosContainer?.checklist as { instrumentosRef?: Record<string, { snapshot?: unknown }> } | undefined;
  return Object.values(chk?.instrumentosRef ?? {}).some((r) => numerado(r?.snapshot, 'tipo'));
}

function vazio(v: string | undefined | null): boolean {
  return !v || v.trim() === '';
}

/** Uma folha está no relatório? Comparação exata, como a lista guarda. */
function tem(documentos: string[] | null, arquivo: string): boolean {
  return !!documentos?.includes(arquivo);
}

function bloco<T extends Record<string, unknown>>(
  dados: EntradaValidacao['dadosContainer'],
  chave: string,
): T | null {
  const v = dados?.[chave];
  return v && typeof v === 'object' ? (v as T) : null;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function validarParaFinalizar(e: EntradaValidacao): ResultadoValidacao {
  const obrigatorios: Pendencia[] = [];
  const opcionais: Pendencia[] = [];
  const m = e.meta;

  // ── Obrigatórios ─────────────────────────────────────────────────────────
  if (!m || vazio(m.codigo)) {
    obrigatorios.push({ campo: 'codigo', texto: 'Número do relatório não informado', onde: 'Configurações do relatório' });
  }
  if (!m || vazio(m.emissao)) {
    obrigatorios.push({ campo: 'emissao', texto: 'Data de emissão não informada', onde: 'Configurações do relatório' });
  }
  if (!m || vazio(m.tipoInspecao)) {
    obrigatorios.push({ campo: 'tipoInspecao', texto: 'Tipo de inspeção não informado', onde: 'Configurações do relatório' });
  }
  // Quem assina. O snapshot da meta é a fonte congelada; `phNome` é o espelho
  // legado, e vale como resposta — relatório antigo reaberto tem só ele.
  const temEngenheiro = !!m?.assinantes?.engenheiro?.nome?.trim() || !vazio(m?.phNome);
  if (!temEngenheiro) {
    obrigatorios.push({ campo: 'engenheiro', texto: 'Engenheiro responsável não selecionado', onde: 'Configurações do relatório' });
  }
  if (!e.documentos || e.documentos.length === 0) {
    obrigatorios.push({ campo: 'documentos', texto: 'O relatório não tem nenhuma folha', onde: 'Montagem do relatório' });
  }
  // O laudo só é exigido quando a folha de conclusão faz parte do relatório —
  // exigir a conclusão de um documento que não a imprime seria pedir para
  // preencher o que ninguém vai ler.
  if (tem(e.documentos, 'CONCLUSAO.html') && (!e.laudo || e.laudo.apto === undefined || e.laudo.apto === null)) {
    obrigatorios.push({ campo: 'laudo', texto: 'Resultado da inspeção (APTO / INAPTO) não marcado', onde: 'Botão "Laudo", na barra do documento' });
  }

  // Fase 5.2 · a seção 8.4 carrega a regra de emissão do Relatório de Imagens:
  // ao menos uma foto e todas descritas. Só se a seção foi escolhida.
  if (tem(e.documentos, FOLHA_RELATORIO_IMAGENS)) {
    const pend = pendenciasParaEmissao(bloco<Record<string, unknown>>(e.dadosContainer, 'imagens')?.fotos);
    if (pend.length > 0) {
      obrigatorios.push({
        campo: 'relatorioImagens',
        texto: `Relatório de Imagens (8.4): ${pend.map((p) => p.mensagem).join(' ')}`,
        onde: 'Inspeção · Relatório de Imagens',
      });
    }
  }

  // ── Opcionais (avisam, não bloqueiam) ────────────────────────────────────
  if (m && vazio(m.validade)) {
    opcionais.push({ campo: 'validade', texto: 'Validade do relatório não informada', onde: 'Configurações do relatório' });
  }
  if (m && vazio(m.execucaoInspecao)) {
    opcionais.push({ campo: 'execucaoInspecao', texto: 'Data de execução da inspeção não informada', onde: 'Configurações do relatório' });
  }
  if (m && vazio(m.proximaInspecaoInterna)) {
    opcionais.push({ campo: 'proximaInspecaoInterna', texto: 'Próxima inspeção interna não informada', onde: 'Configurações do relatório' });
  }
  if (m && vazio(m.proximaInspecaoExterna)) {
    opcionais.push({ campo: 'proximaInspecaoExterna', texto: 'Próxima inspeção externa não informada', onde: 'Configurações do relatório' });
  }
  const temTecnico = !!m?.assinantes?.tecnico?.nome?.trim() || !vazio(m?.tecnicoNome);
  if (!temTecnico) {
    opcionais.push({ campo: 'tecnico', texto: 'Técnico/inspetor não selecionado', onde: 'Configurações do relatório' });
  }

  // Teste hidrostático: só confere se a folha do TH está no relatório.
  if (tem(e.documentos, 'TESTE-HIDROSTATICO.html')) {
    const th = bloco<Record<string, unknown>>(e.dadosContainer, 'th');
    if (vazio(texto(th?.pressaoTeste))) {
      opcionais.push({ campo: 'th.pressaoTeste', texto: 'Pressão do teste hidrostático não informada', onde: 'Inspeção · Teste hidrostático' });
    }
    if (vazio(texto(th?.dataTeste))) {
      opcionais.push({ campo: 'th.dataTeste', texto: 'Data do teste hidrostático não informada', onde: 'Inspeção · Teste hidrostático' });
    }
    if (vazio(texto(th?.resultado))) {
      opcionais.push({ campo: 'th.resultado', texto: 'Resultado do teste hidrostático não informado', onde: 'Inspeção · Teste hidrostático' });
    }
    // 18/09/2026 · o fluido do TESTE deixou de ter padrão ("Água Potável") e de
    // ser copiado do fluido de operação. Sem ele, avisa — não bloqueia.
    if (vazio(texto(th?.fluido))) {
      opcionais.push({ campo: 'th.fluido', texto: 'Fluido do teste hidrostático não informado', onde: 'Inspeção · Teste hidrostático' });
    }
  }

  // 21/10/2026 · ENSAIO DE ACUMULAÇÃO (só caldeira oferece a folha). As regras
  // são as do formulário (`verificarAcumulacao`): erro bloqueia — o laudo
  // sairia contraditório —, alerta só avisa, porque a decisão é do PLH.
  if (tem(e.documentos, 'ENSAIO-ACUMULACAO.html')) {
    const onde = 'Inspeção · Ensaio de acumulação';
    const bruto = bloco<Partial<DadosAcumulacao>>(e.dadosContainer, 'acumulacao');
    if (!bruto || !acumulacaoPreenchida(bruto)) {
      obrigatorios.push({ campo: 'acumulacao', texto: 'Ensaio de acumulação escolhido, mas não preenchido', onde });
    } else {
      const d = { ...dadosPadraoAcumulacao(''), ...bruto } as DadosAcumulacao;
      for (const a of verificarAcumulacao(d, { pmtaMpa: e.pmtaMpa ?? null })) {
        (a.nivel === 'erro' ? obrigatorios : opcionais).push({ campo: `acumulacao.${a.campo}`, texto: a.texto, onde });
      }
      if (vazio(texto(d.resultado))) {
        opcionais.push({ campo: 'acumulacao.resultado', texto: 'Resultado do ensaio de acumulação não informado', onde });
      }
    }
  }

  // 22/10/2026 · RELATÓRIO DE CALDEIRA sem ensaio de acumulação feito: a folha
  // 3 pede "SE NÃO, JUSTIFIQUE", e a justificativa só existe como override do
  // documento ('ri.acumulacao.justificativa'). Sem ela, não finaliza.
  // Mesmas folhas que acendem a seção no gerador (`FOLHAS_CALDEIRA.relatorioInspecao`):
  // rascunho de caldeira anterior ao relatório próprio traz INSPECOES/CONCLUSAO.
  const relatorioInspecaoCaldeira =
    (e.relatorioDeCaldeira ?? (e.tipoEquipamento === 'caldeira' || tem(e.documentos, 'CALD-RELATORIO-INSPECAO.html'))) &&
    (!e.documentos?.length ||
      ['CALD-RELATORIO-INSPECAO.html', 'INSPECOES.html', 'CONCLUSAO.html'].some((f) => tem(e.documentos, f)));
  if (relatorioInspecaoCaldeira) {
    const bruto = bloco<Partial<DadosAcumulacao>>(e.dadosContainer, 'acumulacao');
    // Mesma regra do modelo (`acumulacaoFeita`): o dado preenchido, escolhida ou não a folha.
    const feito = !!bruto && acumulacaoPreenchida(bruto);
    const just = resolverValor('', (e.overrides ?? {})['ri.acumulacao.justificativa']) ?? '';
    if (!feito && vazio(just)) {
      obrigatorios.push({
        campo: 'ri.acumulacao.justificativa',
        texto: 'Ensaio de acumulação não realizado: escreva a justificativa no relatório de inspeção (folha 3)',
        onde: 'Documento · Relatório de inspeção',
      });
    }
  }

  // Exames visuais: a observação em branco é o exemplo que o dono deu.
  for (const [arquivo, chave, rotulo, prefixo, itensDaLista] of [
    ['VISUAL-EXTERNO.html', 'visual_externo', 'exame externo', 'exameExterno', ITENS_VISUAL_EXTERNO],
    ['VISUAL-INTERNO.html', 'visual_interno', 'exame interno', 'exameInterno', ITENS_VISUAL_INTERNO],
    // (o 5º elemento é a lista PADRÃO; a efetiva sai do catálogo do registro)
  ] as const) {
    const itensPadrao = itensDaLista;
    if (!tem(e.documentos, arquivo)) continue;
    const v = bloco<Record<string, unknown>>(e.dadosContainer, chave);
    // 22/10/2026 · as perguntas do CATÁLOGO do registro (caldeira ou a de sempre).
    const itens = itensDoExame(chave === 'visual_externo' ? 'externo' : 'interno', v, e.tipoEquipamento === 'caldeira', itensPadrao);
    const onde = `Inspeção · Visual ${chave === 'visual_externo' ? 'externo' : 'interno'}`;

    // ── 18/09/2026 · a pergunta de não conformidade ─────────────────────────
    // (1) Exame respondido ANTES de a pergunta aparecer na tela: SIM podia
    //     significar "está ok". Não se reinterpreta — bloqueia até alguém
    //     conferir no formulário e confirmar. Relatório já finalizado não passa
    //     por aqui (é arquivo, §7-quater).
    if (precisaConfirmarSemantica(v)) {
      obrigatorios.push({
        campo: `${chave}.semanticaNc`,
        texto: `Respostas do ${rotulo} precisam de revisão: foram marcadas antes de a pergunta "Foi encontrada alguma não conformidade?" aparecer na tela`,
        onde,
      });
    }
    // (2) Não conformidade marcada sem descrição. Conta o que a FOLHA imprime:
    //     marca e observação corrigidas no documento valem.
    const ovr = e.overrides ?? {};
    const semDescricao: number[] = [];
    itens.forEach((_, i) => {
      const n = i + 1;
      const resposta = texto((v?.itens as Record<string, unknown> | undefined)?.[String(n)]).trim().toLowerCase();
      const sim = (resolverValor(resposta === 'sim' ? 'X' : '', ovr[`${prefixo}.item-${n}.sim`]) ?? '').trim() !== '';
      const obsAuto = texto((v?.itemObs as Record<string, unknown> | undefined)?.[String(n)]);
      const obs = resolverValor(obsAuto, ovr[`${prefixo}.item-${n}.obs`]) ?? '';
      if (sim && obs.trim() === '') semDescricao.push(n);
    });
    if (semDescricao.length > 0) {
      obrigatorios.push({
        campo: `${chave}.ncSemObservacao`,
        texto: `${rotulo[0].toUpperCase()}${rotulo.slice(1)}: não conformidade sem descrição (${listaDeItens(semDescricao)})`,
        onde,
      });
    }
    if (vazio(texto(v?.observacoes))) {
      opcionais.push({ campo: `${chave}.observacoes`, texto: `Observação do ${rotulo} em branco`, onde });
    }
    if (vazio(texto(v?.resultado))) {
      opcionais.push({ campo: `${chave}.resultado`, texto: `Resultado do ${rotulo} não informado`, onde });
    }
  }

  // Medição de espessura.
  if (tem(e.documentos, 'ULTRASSOM.html')) {
    const u = bloco<Record<string, unknown>>(e.dadosContainer, 'ultrassom');
    if (vazio(texto(u?.aparelho))) {
      opcionais.push({ campo: 'ultrassom.aparelho', texto: 'Instrumento de medição do ultrassom não informado', onde: 'Inspeção · Medição de espessura' });
    }
    if (vazio(texto(u?.resultado))) {
      opcionais.push({ campo: 'ultrassom.resultado', texto: 'Resultado da medição de espessura não informado', onde: 'Inspeção · Medição de espessura' });
    }
  }

  // 22/10/2026 · NR-13 2022, alínea "n" do conteúdo mínimo do relatório: o número
  // do certificado de inspeção e teste da válvula de segurança. AVISO, nunca
  // bloqueio — decisão do dono: o engenheiro pode ter o certificado fora do
  // sistema e citá-lo no texto.
  if (!temCertificadoPsv(e.documentos, m, e.dadosContainer)) {
    opcionais.push({
      campo: 'certificadoPsv',
      texto:
        `Nenhum certificado de inspeção e teste da válvula de segurança vinculado — a NR-13 ` +
        `(subitem ${itemConteudoRelatorio(e.tipoEquipamento)}, alínea "n") pede o número dele no relatório`,
      onde: 'Calibrações · válvula de segurança',
    });
  }

  return { obrigatorios, opcionais, podeFinalizar: obrigatorios.length === 0 };
}
