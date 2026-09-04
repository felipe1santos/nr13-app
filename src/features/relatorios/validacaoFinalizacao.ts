import type { RelatorioMeta } from './tipos';

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
    obrigatorios.push({ campo: 'laudo', texto: 'Resultado da inspeção (APTO / INAPTO) não marcado', onde: 'Folha "Resultado da inspeção e laudo"' });
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
  }

  // Exames visuais: a observação em branco é o exemplo que o dono deu.
  for (const [arquivo, chave, rotulo] of [
    ['VISUAL-EXTERNO.html', 'visual_externo', 'exame externo'],
    ['VISUAL-INTERNO.html', 'visual_interno', 'exame interno'],
  ] as const) {
    if (!tem(e.documentos, arquivo)) continue;
    const v = bloco<Record<string, unknown>>(e.dadosContainer, chave);
    if (vazio(texto(v?.observacoes))) {
      opcionais.push({ campo: `${chave}.observacoes`, texto: `Observação do ${rotulo} em branco`, onde: `Inspeção · Visual ${chave === 'visual_externo' ? 'externo' : 'interno'}` });
    }
    if (vazio(texto(v?.resultado))) {
      opcionais.push({ campo: `${chave}.resultado`, texto: `Resultado do ${rotulo} não informado`, onde: `Inspeção · Visual ${chave === 'visual_externo' ? 'externo' : 'interno'}` });
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

  return { obrigatorios, opcionais, podeFinalizar: obrigatorios.length === 0 };
}
