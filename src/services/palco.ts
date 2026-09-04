/**
 * O palco: a única coisa que ainda vive no `localStorage`.
 *
 * Os 40+ templates HTML em iframe leem `localStorage` de forma síncrona no
 * DOMContentLoaded. Em vez de reescrevê-los, o app materializa ali só as chaves
 * do documento que está sendo aberto, monta os iframes, e limpa depois.
 *
 * O limite de 5 MB continua valendo NESTE espaço — por isso tudo é orçado ANTES
 * de escrever, e a escrita é tudo-ou-nada com restauração dos valores
 * anteriores. Relatório pela metade é pior que relatório recusado: sai impresso
 * com folha faltando e ninguém percebe.
 */
import { chavesComPrefixo, chavesDaTag, obterRegistro } from './cacheLocal';
import { podar } from './camposPesados';
import { baixarFoto, blobParaDataUrl, ehRef, type RefFoto } from './fotos';
import { classificar, type ErroSync } from './errosSync';
import {
  adquirirTrava,
  ehDono,
  liberarTrava,
  type ContextoMontagem,
  type DonoRegistrado,
} from './palcoTrava';

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------
/** Orçamento do documento. NÃO é o teto de 5 MB: o resto fica para a sessão. */
export const ORCAMENTO_DOC = 3_400 * 1024;
/**
 * Teto por imagem já na variante de relatório, em BYTES DO ARQUIVO — não do
 * texto base64 que o carrega. Existe para barrar a imagem que estoura a
 * renderização do `html2canvas` numa folha.
 *
 * A unidade importa: `maiorFotoDoValor` media a string em UTF-16, que é 2,67×
 * o arquivo (base64 infla 33%, UTF-16 dobra), e o teto de 110 KB valia na
 * prática ~41 KB de JPEG. Passou despercebido enquanto só a foto de CAPA era
 * medida; ao estender a degradação para as fotos de campo, uma foto de inspeção
 * já degradada nos seis passos foi medida em "117 KB" e derrubou o documento
 * inteiro em produção (11/08/2026) — o arquivo real tinha ~44 KB e o total
 * cabia no orçamento.
 */
export const ORCAMENTO_IMG = 110 * 1024;
/** Reserva para o manifesto da montagem e a variação entre navegadores. */
export const MARGEM_METADADOS = 32 * 1024;
export const ORCAMENTO_EFETIVO = ORCAMENTO_DOC - MARGEM_METADADOS;

/**
 * Custo real no `localStorage`: chave + valor, em UTF-16 (2 bytes por unidade
 * de código). Contar só o valor, ou contar em UTF-8, subestima o consumo.
 */
export function tamanhoUtf16(chave: string, valor: string): number {
  return (chave.length + valor.length) * 2;
}

// ---------------------------------------------------------------------------
// Degradação
// ---------------------------------------------------------------------------
export interface PassoDegradacao {
  qualidade: number;
  /** `null` = mantém a largura original (só mexe na qualidade). */
  largura: number | null;
}

/** Ordem fixa e testável: três passos de qualidade, depois três de largura. */
export const PLANO_DEGRADACAO: readonly PassoDegradacao[] = [
  { qualidade: 0.6, largura: null },
  { qualidade: 0.45, largura: null },
  { qualidade: 0.35, largura: null },
  { qualidade: 0.35, largura: 900 },
  { qualidade: 0.35, largura: 700 },
  { qualidade: 0.35, largura: 560 },
];

export interface AdaptadorFoto {
  /** Devolve o valor da chave com as fotos recomprimidas no passo indicado. */
  recomprimir(valor: string, passo: PassoDegradacao): Promise<string>;
  /** Tamanho (UTF-16) da MAIOR foto dentro do valor. 0 se não houver foto. */
  maiorFoto(valor: string): number;
}

/**
 * Chaves que a degradação pode recomprimir.
 *
 * `nr13_fotos_` é a foto de capa — alguns KB. O peso de verdade está nas fotos
 * de CAMPO, que chegam ao palco dentro de `nr13_inspecao_atual` e
 * `nr13_injecao_atual` (checklists, visual externo/interno, TH, ultrassom), em
 * DUAS chaves porque os templates nunca foram uniformes (§2 do CLAUDE.md).
 *
 * Enquanto só `nr13_fotos_` entrava aqui, a degradação era decorativa: medido
 * na conta gabriel.dadona em 11/08/2026, com o palco em 2.780 KB de 3.368, ela
 * recomprimia ~1 KB de capa e ignorava ~2,7 MB de fotos de inspeção.
 *
 * NÃO acrescente chave de dado estruturado: recomprimir o JSON do memorial não
 * economizaria nada e corromperia o documento.
 */
const CHAVES_DEGRADAVEIS = ['nr13_fotos_', 'nr13_inspecao_atual', 'nr13_injecao_atual'];

export function ehChaveDeFoto(chave: string): boolean {
  return CHAVES_DEGRADAVEIS.some((p) => chave.startsWith(p));
}

// ---------------------------------------------------------------------------
// Conteúdo do palco
// ---------------------------------------------------------------------------
export interface ItemPalco {
  chave: string;
  valor: string;
}

/**
 * Globais que os templates leem.
 *
 * `nr13_inspecao_atual` e `nr13_injecao_atual` carregam os dados de campo do
 * container escolhido (checklists, visual externo/interno, TH, ultrassom) e são
 * lidas por quase todas as folhas do relatório — em DUAS chaves porque os
 * templates nunca foram uniformes (ver `gravarInspecaoOrigemAtual`). Sem elas
 * aqui, na v2 o documento monta com os ensaios em branco: o dado existe no Map,
 * mas o iframe só enxerga o `localStorage`.
 *
 * `nr13_relatorio_meta_atual` é a SEGUNDA chave mais lida de todo o sistema (36
 * ocorrências em `public/`) e ficou de fora até 13/08/2026. O estrago, medido na
 * conta gabriel.dadona com o documento montado: a CAPA saía com "Nº RELATÓRIO:
 * -", "DATA INSPEÇÃO: -" e "VALIDADE: -" enquanto SOLICITANTE e ENDEREÇO — que
 * vêm de `nr13_emp_<TAG>`, chave de TAG e portanto no palco — apareciam
 * preenchidos; e a folha INSPECOES não marcava natureza, tipo de exame nem
 * resultado, porque tudo isso sai de `meta.tipoInspecao`/`meta.documentos`.
 * Preencher "Configurações do Relatório" não adiantava: o valor era gravado no
 * Map e nunca chegava ao `localStorage` que o iframe enxerga.
 *
 * `nr13_prontuario_atual` é lida pelas 6 folhas do prontuário e pelo rodapé
 * (`pront-footer.js`).
 */
export const GLOBAIS = [
  'nr13_minha_empresa',
  'nr13_lista_phs',
  'nr13_inspecao_atual',
  'nr13_injecao_atual',
  'nr13_relatorio_meta_atual',
  'nr13_prontuario_atual',
];

/**
 * Famílias de escopo de ID (não de TAG) que algum template lê.
 *
 * `nr13_rastreab_` é varrida por PREFIXO dentro do `ULTRASSOM.html`, que
 * percorre o `localStorage` inteiro atrás do certificado do instrumento padrão.
 * Sem as chaves aqui, a varredura não acha nada e o bloco "INSTRUMENTO DE
 * MEDIÇÃO UTILIZADO" sai com "--" nos quatro campos, mesmo com o certificado
 * cadastrado. Vão PODADOS (`camposPesados.podar`), com ~1 KB por instrumento:
 * os templates leem só nome/nº de série/certificado/validade.
 *
 * A poda precisa ser feita AQUI, e não na gravação: na v1 o `localStorage` era o
 * cache e a divisão acontecia ao gravar (§2-bis), mas na v2 o `Map` guarda o
 * `valor` cru do Supabase, `pdfBase64` incluído. Sem podar na entrada do palco,
 * dois certificados escaneados de uma conta real ocupavam 794 KB + 614 KB de um
 * orçamento de 3.368 KB e recusavam o relatório inteiro (14/08/2026).
 *
 * `nr13_calibracao_item_` NÃO entra por prefixo: ela é global por organização e
 * uma conta com muitos equipamentos traria centenas de certificados que este
 * documento não imprime. Vem filtrada pela TAG, em `chavesDeCalibracaoDaTag`.
 */
export const POR_ID_NO_PALCO = ['nr13_rastreab_'];

/**
 * Família por id que entra FILTRADA pela TAG, não por varredura de prefixo.
 * Declarada aqui para a varredura de `public/` saber que ela está coberta.
 */
export const POR_ID_FILTRADO_POR_TAG = ['nr13_calibracao_item_'];

/**
 * Chaves que NENHUM template HTML lê — confirmado por varredura em `public/`.
 * Levá-las gastaria o orçamento com dado que ninguém renderiza.
 *
 * `nr13_docs_` (containers de inspeção) e `nr13_pront_fab_` (PDF do prontuário
 * do fabricante, até 8 MB) são consumidos só por código React. O segundo
 * apareceu na validação de 05/08/2026 contra dados reais: sozinho ocupava
 * 10.012 KB numa conta, três vezes o orçamento inteiro, e fazia o livro de
 * registro ser recusado sem motivo real.
 *
 * `nr13_componentes_cal_` e `nr13_lotes_cal_` entraram em 11/08/2026 pelo mesmo
 * caminho: o cadastro de válvulas/manômetros guarda uma FOTO base64 por
 * componente (`ComponenteCal.foto`), e essa foto só é desenhada no card da tela
 * de Calibrações. Na conta gabriel.dadona eram 8 componentes de 260–355 KB cada
 * = 2.518 KB dos 3.959 KB do documento — a chave sozinha recusava o relatório da
 * AUTOCLAVE ESTERILAV. O que o relatório de fato imprime são as folhas
 * `CERTIFICADO-CAL-*?calibId=<id>`, que leem `nr13_calibracao_item_<id>` (escopo
 * de id, nunca coletada por TAG) ou o snapshot congelado em `meta.certCalibracoes`.
 */
export const FORA_DO_PALCO = [
  'nr13_docs_',
  // 10B.2 · rascunho de registro do Livro. NENHUMA folha o lê — e não pode ler:
  // `LIVRO-REGISTRO.html` é documento legal e imprime só o que está trancado.
  'nr13_livro_rascunho_',
  'nr13_pront_fab_',
  // 12B · a foto real da placa. Nenhuma folha de `public/` a lê: a placa é
  // desenhada — ou embutida — pelo gerador vetorial a partir do modelo. Trazer
  // uma foto para o palco gastaria orçamento de um documento que já é apertado.
  'nr13_placa_',
  'nr13_componentes_cal_',
  'nr13_lotes_cal_',
  // Esta é lida por um template (`LIVRO-REGISTRO.html`) e mesmo assim fica de
  // fora, de propósito: guarda TODO o histórico da organização e cresce a cada
  // relatório emitido — 224 KB na conta gabriel.dadona em 13/08/2026, sem teto.
  // O único uso é `relatorioJaSalvo(codigo)`, que congela o texto do termo
  // depois do salvamento; desde §7-ter esse congelamento é feito pelo `ro=1`,
  // que bloqueia a escrita na origem. Trazer uma chave sem limite de tamanho
  // para dentro de um orçamento de 3.368 KB trocaria "termo editável" por
  // "documento recusado", que é o defeito pior.
  'nr13_historico_relatorios',
  // Os registros individuais que substituíram o array acima (14/08/2026). São
  // de escopo de TAG, então `chavesDaTag` os traria para o palco sozinho — e
  // cada um pesa ~125 KB de snapshots (logo, rubricas, certificados) que
  // NENHUMA folha lê: os templates leem `nr13_relatorio_meta_atual`, gravada
  // pela geração. Vinte relatórios de um equipamento estourariam o orçamento
  // inteiro por conta própria.
  //
  // O prefixo é `nr13_rel_` e não `nr13_relatorio_` justamente por causa desta
  // lista: `startsWith('nr13_relatorio_')` levaria junto a
  // `nr13_relatorio_meta_atual`, que é a 2ª chave mais lida do sistema e cuja
  // ausência já custou uma CAPA com "Nº RELATÓRIO: -" em 13/08/2026.
  'nr13_rel_',
  // Índice leve da listagem. Só a UI React o consome.
  'nr13_historico_indice_',
];

export const CHAVE_MANIFESTO = 'nr13_palco_manifesto';

interface EntradaManifestoPalco {
  chave: string;
  existiaAntes: boolean;
}
interface ManifestoPalco {
  ctx: ContextoMontagem;
  chaves: EntradaManifestoPalco[];
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------
export type FalhaPalco =
  | { tipo: 'ocupado'; dono: DonoRegistrado | null }
  | {
      tipo: 'acima_do_orcamento';
      total: number;
      orcamento: number;
      maiores: Array<{ chave: string; bytes: number }>;
    }
  | { tipo: 'imagem_indegradavel'; chave: string; bytes: number; limite: number }
  | { tipo: 'erro_ao_resolver_imagem'; chave: string; erro: ErroSync }
  | { tipo: 'escrita_falhou'; chave: string; erro: ErroSync }
  | { tipo: 'rollback_falhou'; chave: string; erro: ErroSync };

export type ResultadoPalco = { ok: true; ctx: ContextoMontagem } | { ok: false; falha: FalhaPalco };

function erroTecnico(erro: unknown, chave: string): ErroSync {
  return classificar(erro, {
    chave,
    mutationId: '—',
    dispositivo: '—',
    quando: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Estado da montagem desta aba
// ---------------------------------------------------------------------------
interface Anterior {
  chave: string;
  valor: string | null;
}

let montagem: { ctx: ContextoMontagem; anteriores: Anterior[] } | null = null;

export function zerarMontagemEmMemoria(): void {
  montagem = null;
}

// ---------------------------------------------------------------------------
// Orçamento e degradação
// ---------------------------------------------------------------------------
export function orcar(
  itens: ItemPalco[],
): { cabe: true; total: number } | Extract<FalhaPalco, { tipo: 'acima_do_orcamento' }> {
  const total = itens.reduce((s, i) => s + tamanhoUtf16(i.chave, i.valor), 0);
  if (total <= ORCAMENTO_EFETIVO) return { cabe: true, total };
  return {
    tipo: 'acima_do_orcamento',
    total,
    orcamento: ORCAMENTO_EFETIVO,
    maiores: itens
      .map((i) => ({ chave: i.chave, bytes: tamanhoUtf16(i.chave, i.valor) }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

/**
 * Aplica os passos até o documento caber E nenhuma foto passar do teto por
 * imagem. Recomprime SÓ chaves de foto: degradar o JSON do memorial não
 * economizaria nada e corromperia o documento.
 *
 * NÃO altera o original: trabalha sobre cópias e devolve itens novos. A foto
 * degradada existe só para o palco — o Map, o IndexedDB e o Supabase seguem com
 * a original.
 */
export async function degradarAteCaber(
  itens: ItemPalco[],
  foto: AdaptadorFoto,
): Promise<{ cabe: true; itens: ItemPalco[]; total: number } | { cabe: false; falha: FalhaPalco }> {
  let atuais = itens.map((i) => ({ ...i }));

  const avaliar = (): { cabe: boolean; falha?: FalhaPalco } => {
    const orcamento = orcar(atuais);
    if (!('cabe' in orcamento)) return { cabe: false, falha: orcamento };

    for (const item of atuais) {
      if (!ehChaveDeFoto(item.chave)) continue;
      const maior = foto.maiorFoto(item.valor);
      if (maior > ORCAMENTO_IMG) {
        return {
          cabe: false,
          falha: { tipo: 'imagem_indegradavel', chave: item.chave, bytes: maior, limite: ORCAMENTO_IMG },
        };
      }
    }
    return { cabe: true };
  };

  let veredito = avaliar();
  if (veredito.cabe) return { cabe: true, itens: atuais, total: orcar(atuais).total ?? 0 };

  for (const passo of PLANO_DEGRADACAO) {
    const proximos: ItemPalco[] = [];
    for (const item of atuais) {
      if (!ehChaveDeFoto(item.chave)) {
        proximos.push(item);
        continue;
      }
      try {
        proximos.push({ chave: item.chave, valor: await foto.recomprimir(item.valor, passo) });
      } catch (erro) {
        // Falha ao resolver/recomprimir uma imagem é reportada com a chave —
        // seguir em silêncio produziria um documento sem a foto.
        return {
          cabe: false,
          falha: { tipo: 'erro_ao_resolver_imagem', chave: item.chave, erro: erroTecnico(erro, item.chave) },
        };
      }
    }
    atuais = proximos;

    veredito = avaliar();
    if (veredito.cabe) {
      const o = orcar(atuais);
      return { cabe: true, itens: atuais, total: 'cabe' in o ? o.total : 0 };
    }
  }

  return { cabe: false, falha: veredito.falha! };
}

// ---------------------------------------------------------------------------
// Materialização atômica
// ---------------------------------------------------------------------------
/**
 * Escreve tudo ou nada. Os valores ANTERIORES são guardados antes da primeira
 * escrita e restaurados exatamente em caso de falha: remover as chaves gravadas
 * não bastaria, porque uma chave global como `nr13_minha_empresa` pode já
 * existir e seria perdida.
 */
export function materializar(
  ctx: ContextoMontagem,
  itens: ItemPalco[],
): { ok: true } | { ok: false; falha: FalhaPalco } {
  const anteriores: Anterior[] = [];

  for (const item of itens) {
    anteriores.push({ chave: item.chave, valor: localStorage.getItem(item.chave) });
    try {
      localStorage.setItem(item.chave, item.valor);
    } catch (erro) {
      const falhaEscrita = erroTecnico(erro, item.chave);
      // Rollback: restaura o que existia e remove só o que criamos.
      for (const a of anteriores) {
        try {
          if (a.valor === null) localStorage.removeItem(a.chave);
          else localStorage.setItem(a.chave, a.valor);
        } catch (erroRollback) {
          return {
            ok: false,
            falha: { tipo: 'rollback_falhou', chave: a.chave, erro: erroTecnico(erroRollback, a.chave) },
          };
        }
      }
      return { ok: false, falha: { tipo: 'escrita_falhou', chave: item.chave, erro: falhaEscrita } };
    }
  }

  const manifesto: ManifestoPalco = {
    ctx,
    chaves: anteriores.map((a) => ({ chave: a.chave, existiaAntes: a.valor !== null })),
  };
  try {
    localStorage.setItem(CHAVE_MANIFESTO, JSON.stringify(manifesto));
  } catch (erro) {
    for (const a of anteriores) {
      if (a.valor === null) localStorage.removeItem(a.chave);
      else localStorage.setItem(a.chave, a.valor);
    }
    return { ok: false, falha: { tipo: 'escrita_falhou', chave: CHAVE_MANIFESTO, erro: erroTecnico(erro, CHAVE_MANIFESTO) } };
  }

  montagem = { ctx, anteriores };
  return { ok: true };
}

function lerManifestoPalco(): ManifestoPalco | null {
  try {
    const cru = localStorage.getItem(CHAVE_MANIFESTO);
    if (!cru) return null;
    const m = JSON.parse(cru) as ManifestoPalco;
    return Array.isArray(m?.chaves) && m?.ctx ? m : null;
  } catch {
    return null; // manifesto corrompido: não sai apagando a esmo
  }
}

/**
 * Limpa o palco. SÓ o dono exato (org + aba + relatório + TAG + nonce) pode, e
 * só as chaves registradas na montagem atual — nunca varredura por prefixo.
 *
 * Com o snapshot em memória (mesma aba, mesma sessão), restaura os valores
 * anteriores.
 *
 * LIMITAÇÃO CONHECIDA (aceita em 05/08/2026): se a página recarregar entre a
 * montagem e a limpeza, o snapshot em memória se perde. Nesse caso a limpeza
 * remove apenas o que a montagem criou e DEIXA intactas as chaves que já
 * existiam antes — inclusive as globais, que podem ter ficado com o valor do
 * palco. Apagá-las seria pior que deixá-las: o dado verdadeiro segue no cache e
 * a próxima montagem sobrescreve. Persistir o snapshot no `localStorage`
 * resolveria, mas duplicaria o valor de chaves grandes como
 * `nr13_minha_empresa` (com logo), consumindo justamente o orçamento que este
 * módulo existe para proteger.
 */
export function limparPalco(ctx: ContextoMontagem): { ok: boolean; motivo?: 'nao_e_dono' } {
  if (!ehDono(ctx)) return { ok: false, motivo: 'nao_e_dono' };

  if (montagem && montagem.ctx.nonce === ctx.nonce) {
    for (const a of montagem.anteriores) {
      if (a.valor === null) localStorage.removeItem(a.chave);
      else localStorage.setItem(a.chave, a.valor);
    }
  } else {
    const m = lerManifestoPalco();
    if (m && m.ctx.nonce === ctx.nonce) {
      for (const e of m.chaves) if (!e.existiaAntes) localStorage.removeItem(e.chave);
    }
  }

  localStorage.removeItem(CHAVE_MANIFESTO);
  montagem = null;
  liberarTrava(ctx);
  return { ok: true };
}

/**
 * Libera o palco que ESTA aba montou, se houver. Usada na troca de conta e no
 * logout, onde não existe o `ctx` à mão. Se a aba não é dona de nada, é no-op —
 * nunca mexe no palco de outra aba.
 */
export function liberarPalcoDestaAba(): boolean {
  if (!montagem) return false;
  return limparPalco(montagem.ctx).ok;
}

/**
 * Solta a trava quando a página sai — F5, fechar a aba, navegar para fora.
 *
 * Sem isto, o registro de posse só saía pelo TTL de 60 s, e nesses 60 segundos
 * QUALQUER documento era recusado com "Este relatório já está aberto em outra
 * aba". A mensagem era falsa duas vezes: a aba era a mesma, e não havia
 * documento nenhum aberto. Acontecia porque o `tabId` vive em memória — o
 * recarregamento sorteia um id novo, e a aba deixa de reconhecer o próprio
 * registro. Medido em produção em 13/08/2026, abrindo um certificado de
 * calibração logo depois de recarregar com um relatório na tela.
 *
 * `pagehide` (e não `unload`) porque é o único que ainda dispara em iOS. O
 * trabalho é síncrono de propósito: durante a descarga da página não há tempo
 * para `await`. A ponte NÃO é drenada aqui, e não precisa — o que os templates
 * gravaram fica em `nr13_fila_ponte`, que é justamente o fallback para este
 * caso e é drenado no próximo boot.
 *
 * Se a página voltar do bfcache, a trava já foi solta e o palco limpo: os
 * iframes seguem desenhados (o DOM veio junto) e qualquer ação que remonte o
 * documento pede o palco de novo.
 */
export function liberarPalcoAoSair(alvo?: EventTarget): () => void {
  const destino = alvo ?? (globalThis as unknown as EventTarget | undefined);
  if (!destino || typeof destino.addEventListener !== 'function') return () => {};
  const aoSair = () => {
    liberarPalcoDestaAba();
  };
  destino.addEventListener('pagehide', aoSair);
  return () => destino.removeEventListener('pagehide', aoSair);
}

// ---------------------------------------------------------------------------
// Montagem completa
// ---------------------------------------------------------------------------
/**
 * Certificados de calibração DESTE equipamento, no formato por id que as folhas
 * `CERTIFICADO-CAL-*?calibId=<id>` leem.
 *
 * A chave `nr13_calibracao_item_<id>` não tem TAG no nome, então não aparece em
 * `chavesDaTag`. A lista de quem pertence a quem está em `nr13_calibracoes_<TAG>`
 * — a mesma origem que o Portal do Cliente usa em `hidratarItemLocal`. Filtrar
 * por aqui, em vez de varrer o prefixo, mantém o custo proporcional ao
 * equipamento aberto e não à organização inteira.
 */
function chavesDeCalibracaoDaTag(tag: string): string[] {
  const reg = obterRegistro(`nr13_calibracoes_${tag}`);
  if (!reg) return [];
  try {
    const lista: unknown = JSON.parse(reg.valor);
    if (!Array.isArray(lista)) return [];
    return lista
      .map((c) => (c as { id?: unknown })?.id)
      .filter((id): id is string => typeof id === 'string' && id !== '')
      .map((id) => `nr13_calibracao_item_${id}`);
  } catch {
    return []; // lista corrompida não pode derrubar a montagem do documento
  }
}

/** Coleta as chaves que os templates realmente leem para a TAG aberta. */
export function coletarItens(tag: string): ItemPalco[] {
  // Set: a mesma chave duas vezes faria `materializar` guardar o valor do palco
  // como "anterior" da segunda gravação, e o rollback restauraria o palco em vez
  // do estado original.
  const chaves = [
    ...new Set([
      ...chavesDaTag(tag),
      ...GLOBAIS,
      ...POR_ID_NO_PALCO.flatMap((p) => chavesComPrefixo(p)),
      ...chavesDeCalibracaoDaTag(tag),
    ]),
  ].filter((c) => !FORA_DO_PALCO.some((p) => c.startsWith(p)));
  const itens: ItemPalco[] = [];
  for (const chave of chaves) {
    const reg = obterRegistro(chave);
    // `podar` tira o campo que nenhum template lê (hoje só o `pdfBase64` do
    // `nr13_rastreab_`). Não altera o `Map`, o IndexedDB nem o Supabase: o
    // arquivo segue inteiro lá, resolvido por `resolverPdf()` quando o React
    // monta o PDF do relatório.
    if (reg) itens.push({ chave, valor: podar(chave, reg.valor) });
  }
  return itens;
}

/**
 * Traz para dentro do valor a imagem que hoje mora no bucket.
 *
 * Os 40+ templates HTML são páginas estáticas que leem `localStorage` de forma
 * síncrona e renderizam `<img src="...">`. Eles não sabem — e não vão aprender,
 * porque reescrevê-los é justamente o que o palco existe para evitar — pedir
 * arquivo ao Storage. Então na montagem do documento, e SÓ nela, a foto volta a
 * ser dataURL, escrita nos mesmos campos que os templates sempre leram (`src` e
 * `base64`).
 *
 * Isso não desfaz a mudança: o dataURL vive no palco, que é apagado ao fechar o
 * documento, e nunca volta para o `app_storage`. O banco continua guardando só
 * o caminho.
 */
/**
 * QUAL campo cada família de chave precisa receber a imagem — e SÓ ele.
 *
 * Até 14/08/2026 a hidratação gravava a mesma dataURL em `src` E em `base64`,
 * "porque não dá para saber qual campo o template daquela folha vai consultar".
 * Dá: cada família de chave é lida por um conjunto FECHADO de folhas, e a
 * varredura de `public/` (`palco.camposFoto.test.ts`) mostra que os dois
 * conjuntos são disjuntos e sempre foram:
 *
 *   `nr13_fotos_<TAG>`   → `.src`     — CAPA.html é a ÚNICA folha que a lê
 *                                        (`fotoCapa.src`, `fotos[0].src`)
 *   as chaves de campo    → `.base64`  — CHECKLIST-FOTOS, FOTOS-DOCUMENTACAO,
 *                                        VISUAL-EXTERNO/INTERNO-FOTOS,
 *                                        TESTE-HIDROSTATICO e a folha de fotos
 *                                        dele, todas por `foto.base64`
 *
 * O que isso custava: medido na conta engyuricesar em 14/08/2026, um container
 * com 8 fotos hidratava para 5.729 KB e ia ao palco DUAS vezes (`inspecao` e
 * `injecao`) = 11.458 KB, 3,4× o orçamento inteiro. Por foto: 134 KB de arquivo
 * viravam 1.432 KB no palco — ×1,33 do base64, ×2 do UTF-16, ×2 do campo
 * duplicado e ×2 da chave duplicada. Os dois primeiros são do navegador e não
 * têm saída; este corta o terceiro pela metade.
 *
 * CHAVE DESCONHECIDA RECEBE OS DOIS. Errar para o lado de gastar orçamento é
 * barato — o documento é recusado com uma mensagem clara. Errar para o lado de
 * faltar é SILENCIOSO: a folha imprime o quadro vazio e o relatório sai
 * assinado sem a foto do ensaio.
 */
const CAMPO_DA_FOTO: { prefixo: string; campo: 'src' | 'base64' }[] = [
  { prefixo: 'nr13_fotos_', campo: 'src' },
  { prefixo: 'nr13_inspecao_atual', campo: 'base64' },
  { prefixo: 'nr13_injecao_atual', campo: 'base64' },
];

export function camposDeFotoDaChave(chave: string): Array<'src' | 'base64'> {
  const achado = CAMPO_DA_FOTO.find((c) => chave.startsWith(c.prefixo));
  return achado ? [achado.campo] : ['src', 'base64'];
}

/**
 * As duas chaves de campo levam o MESMO container (§2 — "REGRA CRÍTICA DE
 * INJEÇÃO"), e por isso cada foto ia ao palco duas vezes. Mas os DADOS
 * precisam mesmo estar nas duas: `VISUAL-EXTERNO.html` lê `nr13_injecao_atual`
 * e acessa `checklist`; `VERIFICACAO-DOCUMENTACAO.html` lê
 * `nr13_inspecao_atual` e acessa `th`. Uma partição dos grupos INTEIROS
 * deixaria essas folhas sem resposta impressa.
 *
 * A partição possível é só das FOTOS, e aí os conjuntos são disjuntos: cada
 * grupo tem UMA folha que desenha as imagens dele, e essa folha lê UMA das duas
 * chaves (derivado de `FOLHA_FOTO_FONTE` em `relatoriosService.ts` — a mesma
 * tabela que decide quantas folhas de foto o relatório terá):
 *
 *   checklist       → CHECKLIST-FOTOS / FOTOS-DOCUMENTACAO  → nr13_inspecao_atual
 *   visual_externo  → VISUAL-EXTERNO-FOTOS                  → nr13_injecao_atual
 *   visual_interno  → VISUAL-INTERNO-FOTOS                  → nr13_injecao_atual
 *   th              → TESTE-HIDROSTATICO(-FOTOS)            → nr13_injecao_atual
 *
 * `ultrassom` não tem folha que imprima foto (`ULTRASSOM.html` desenha croqui e
 * grade, nunca `foto.base64`); vai com `injecao`, que é a chave que ela lê, e o
 * custo é zero quando não há foto lá.
 *
 * Na chave que NÃO carrega a foto, ela continua presente como `ref` — o dado
 * não some, só não vira imagem embutida. Nenhuma folha lê `ref`.
 */
const CHAVE_DA_FOTO_POR_GRUPO: Record<string, string> = {
  checklist: 'nr13_inspecao_atual',
  visual_externo: 'nr13_injecao_atual',
  visual_interno: 'nr13_injecao_atual',
  th: 'nr13_injecao_atual',
  teste_hidrostatico: 'nr13_injecao_atual',
  ultrassom: 'nr13_injecao_atual',
};

export const CHAVES_DE_CAMPO = ['nr13_inspecao_atual', 'nr13_injecao_atual'];

/**
 * Referências NOMEADAS: campos que guardam uma `RefFoto` fora do formato
 * `{ ref }` e que precisam virar imagem embutida noutro campo.
 *
 * Existe para a rubrica do Livro de Registro. Cada entrada guardava a assinatura
 * inteira em base64 (54,9 KB dos 56 KB de UMA entrada, medidos em produção), e o
 * livro é cumulativo — 20 inspeções = 20 cópias do mesmo desenho dentro de um
 * orçamento de 3.368 KB. Agora a entrada guarda `assinaturaRef` (~150 bytes) e o
 * palco devolve o `assinaturaImg` que `LIVRO-REGISTRO.html` já lia. O template
 * não mudou.
 */
const CAMPO_REF_NOMEADO: { prefixo: string; de: string }[] = [
  { prefixo: 'nr13_livro_', de: 'assinaturaRef' },
];

export function refsNomeadasDaChave(chave: string): string[] {
  // `nr13_livro_config_` também casa o prefixo, e não faz mal: é configuração de
  // exibição e nunca tem o campo.
  return CAMPO_REF_NOMEADO.filter((c) => chave.startsWith(c.prefixo)).map((c) => c.de);
}

/**
 * FASE 7A — referência resolvida NO LUGAR, para o campo que o template já lê.
 *
 * ── Por que aqui e não nos templates ────────────────────────────────────────
 *
 * Varredura de `public/` em 20/08/2026: **41 templates leem
 * `nr13_minha_empresa` diretamente** e 40 deles acessam `.logo` (91
 * ocorrências). Ensinar cada um a entender uma referência de Storage
 * significaria editar 41 arquivos HTML — e **um único esquecido imprime
 * documento assinado sem a logo, em silêncio**, que é o modo de falha mais caro
 * deste projeto.
 *
 * Então o palco resolve e **preenche o campo que eles já leem**. Nenhum
 * template muda. É o mesmo princípio de `CAMPO_REF_NOMEADO`, com uma diferença:
 * lá a imagem vai para um MAPA (porque o livro é cumulativo e repetiria a mesma
 * rubrica por entrada); aqui ela vai para o próprio campo, porque são
 * ocorrências únicas por documento.
 *
 * ── A REGRA QUE NÃO SE QUEBRA ───────────────────────────────────────────────
 *
 * **Só preenche campo VAZIO.** Se o campo já tem uma dataURL, ela é o conteúdo
 * congelado daquele documento e vence — sempre. E se a referência não resolver,
 * o campo fica **como estava**: nunca se busca a logo ou a rubrica ATUAL para
 * tapar o buraco. Trocar a identidade visual de um documento histórico por
 * causa de uma falha de rede seria pior do que imprimir sem a imagem.
 */
const REF_RESOLVIDA_NO_LUGAR: { prefixo: string; de: string; para: string }[] = [
  { prefixo: 'nr13_minha_empresa', de: 'logoRef', para: 'logo' },
  { prefixo: 'nr13_lista_phs', de: 'assinaturaRef', para: 'assinatura' },
  // O snapshot congelado que as folhas leem com `ctx=rel` durante a montagem.
  { prefixo: 'nr13_relatorio_meta_atual', de: 'logoRef', para: 'logo' },
  { prefixo: 'nr13_relatorio_meta_atual', de: 'assinaturaRef', para: 'assinatura' },
];

export function refsNoLugarDaChave(chave: string): { de: string; para: string }[] {
  return REF_RESOLVIDA_NO_LUGAR.filter((c) => chave.startsWith(c.prefixo)).map((c) => ({
    de: c.de,
    para: c.para,
  }));
}

/**
 * Onde as rubricas do livro são materializadas — UMA vez cada, por caminho.
 *
 * Embutir a imagem em cada entrada resolveria a exibição, mas devolveria no
 * palco o peso que a referência tirou do banco: a mesma rubrica de 111 KB
 * (UTF-16) repetida por entrada, 2,2 MB num livro de 20 inspeções, dentro de um
 * orçamento de 3.368 KB. O livro é cumulativo — é a única família que cresce
 * sozinha a cada inspeção.
 *
 * Então o palco grava um MAPA `caminho → dataURL`, com uma cópia por rubrica
 * DISTINTA, e as entradas seguem só com `assinaturaRef`.
 * `LIVRO-REGISTRO.html` resolve por esse mapa. Vinte entradas do mesmo
 * engenheiro custam 111 KB no total, não 2,2 MB.
 *
 * A chave é `nr13_rubricas_palco` e NÃO `nr13_livro_rubricas`: o prefixo
 * `nr13_livro_` é usado por `familiasChave` (viraria a TAG "rubricas") e por
 * `protegidaContraExclusao`. Nome que colide é defeito esperando data.
 *
 * Ela nasce e morre com o documento: é produzida na hidratação, entra no
 * manifesto como qualquer outra chave e sai na limpeza do palco. Nunca vai para
 * o cache nem para o servidor.
 */
export const CHAVE_RUBRICAS_PALCO = 'nr13_rubricas_palco';

/**
 * Esta chave deve embutir a imagem deste grupo do container?
 *
 * Grupo DESCONHECIDO entra nas duas, pelo mesmo motivo de `camposDeFotoDaChave`:
 * gastar orçamento vira recusa com mensagem, faltar vira folha em branco num
 * relatório assinado.
 */
export function grupoVaiNaChave(chave: string, grupo: string): boolean {
  if (!CHAVES_DE_CAMPO.includes(chave)) return true;
  const dono = CHAVE_DA_FOTO_POR_GRUPO[grupo];
  return dono === undefined || dono === chave;
}

/**
 * A ficha do equipamento guarda um HISTÓRICO de fotos, e a CAPA imprime UMA.
 *
 * Desde a Fase 5 a ficha tem uma "foto de identificação" e trocar não apaga a
 * anterior — o array só cresce. O palco hidratava TODAS as entradas: medido em
 * produção em 20/08/2026, um equipamento com 18 fotos produzia **1.100,9 KB**
 * numa chave só, de um orçamento de 3.368 KB, para desenhar uma imagem. Por
 * volta de 38 trocas essa chave sozinha ocuparia o orçamento e o documento
 * passaria a ser recusado.
 *
 * **O array continua INTEIRO no palco.** Nada é removido: `fotos.length` e
 * `fotos[0]` são lidos pelo template, e mexer neles mudaria a folha. O que muda
 * é só QUAIS entradas ganham a imagem embutida.
 */
const PREFIXO_FOTOS_FICHA = 'nr13_fotos_';

/**
 * Hidrata exatamente a foto que `CAPA.html` usaria — **a mesma cadeia, na mesma
 * ordem**, incluindo o fallback:
 *
 * ```js
 * let fotoCapa = fotos.find(f => f.isCapa);
 * if (fotoCapa && fotoCapa.src)              -> fotoCapa.src
 * else if (fotos.length > 0 && fotos[0].src) -> fotos[0].src
 * else                                       -> nr13_vaso_<TAG>.imagemPrint
 * ```
 *
 * O `&& .src` é o detalhe que obriga a repetir a cadeia inteira em vez de
 * hidratar só a marcada: se a imagem da marcada não vier (arquivo indisponível),
 * o template cai em `fotos[0].src` — e essa entrada precisa ter sido hidratada
 * para o fallback continuar existindo. Hidratar só a marcada mudaria o
 * comportamento no caminho de falha.
 */
async function hidratarIdentificacaoDaFicha(
  arr: unknown[],
  campos: Array<'src' | 'base64'>,
  dataUrlDe: (ref: RefFoto) => Promise<string | null>,
): Promise<boolean> {
  const entradas = arr.filter(
    (e): e is Record<string, unknown> => typeof e === 'object' && e !== null,
  );
  if (entradas.length === 0) return false;

  const marcada = entradas.find((e) => e.isCapa === true);
  const candidatos: Record<string, unknown>[] = [];
  if (marcada) candidatos.push(marcada);
  if (entradas[0] && entradas[0] !== marcada) candidatos.push(entradas[0]);

  for (const cand of candidatos) {
    // Base64 LEGADO já preenchido: o template usaria este e pararia aqui.
    if (typeof cand.src === 'string' && cand.src) return false;
    if (!ehRef(cand.ref)) continue;
    const url = await dataUrlDe(cand.ref as RefFoto);
    if (url) {
      for (const campo of campos) cand[campo] = url;
      return true;
    }
    // Sem imagem: o template cairia para o próximo da cadeia, e nós também.
  }
  return false;
}

export async function hidratarFotosDoBucket(itens: ItemPalco[]): Promise<ItemPalco[]> {
  const jaBaixadas = new Map<string, string | null>();

  async function dataUrlDe(ref: RefFoto): Promise<string | null> {
    const emCache = jaBaixadas.get(ref.path);
    if (emCache !== undefined) return emCache;
    let url: string | null;
    try {
      const blob = await baixarFoto(ref);
      url = blob ? await blobParaDataUrl(blob) : null;
    } catch {
      url = null; // foto indisponível não pode derrubar o documento inteiro
    }
    jaBaixadas.set(ref.path, url);
    return url;
  }

  // caminho → dataURL. Uma entrada por rubrica distinta em TODO o documento.
  const rubricas = new Map<string, string>();

  async function percorrer(
    no: unknown,
    campos: Array<'src' | 'base64'>,
    nomeadas: string[] = [],
    noLugar: { de: string; para: string }[] = [],
  ): Promise<boolean> {
    if (Array.isArray(no)) {
      let mudou = false;
      for (const filho of no) if (await percorrer(filho, campos, nomeadas, noLugar)) mudou = true;
      return mudou;
    }
    if (typeof no !== 'object' || no === null) return false;

    const obj = no as Record<string, unknown>;
    let mudou = false;
    // Referência nomeada (rubrica do livro): a imagem NÃO entra na entrada — vai
    // uma única vez para o mapa de rubricas, e o template resolve pelo caminho.
    for (const de of nomeadas) {
      const ref = obj[de];
      if (!ehRef(ref)) continue;
      const path = (ref as RefFoto).path;
      if (rubricas.has(path)) continue;
      const url = await dataUrlDe(ref as RefFoto);
      if (url) rubricas.set(path, url);
    }
    // FASE 7A — referência resolvida NO LUGAR (logo da empresa, rubrica do
    // funcionário, e os mesmos campos dentro do snapshot do relatório).
    for (const { de, para } of noLugar) {
      const ref = obj[de];
      if (!ehRef(ref)) continue;
      // Campo já preenchido = conteúdo congelado daquele documento. Vence sempre.
      const atual = obj[para];
      if (typeof atual === 'string' && atual) continue;
      const url = await dataUrlDe(ref as RefFoto);
      // Sem imagem: o campo fica COMO ESTAVA. Nunca se cai na logo/rubrica ATUAL
      // para tapar o buraco — isso trocaria a identidade visual de um documento
      // histórico por causa de uma falha de rede.
      if (!url) continue;
      obj[para] = url;
      mudou = true;
    }
    if (ehRef(obj.ref)) {
      const url = await dataUrlDe(obj.ref as RefFoto);
      if (url) {
        // SÓ o campo que as folhas daquela chave leem (ver `CAMPO_DA_FOTO`).
        //
        // Gravar os dois era a resposta antiga para "não dá para saber qual
        // campo o template vai consultar", e custava a imagem inteira em
        // dobro dentro de um orçamento de 3.368 KB: o palco da conta
        // gabriel.dadona saltou de 1.449 KB para 2.780 KB na migração das fotos
        // para o bucket, sem uma foto nova sequer.
        for (const campo of campos) obj[campo] = url;
        mudou = true;
      }
    }
    for (const valor of Object.values(obj)) {
      if (await percorrer(valor, campos, nomeadas, noLugar)) mudou = true;
    }
    return mudou;
  }

  const saida: ItemPalco[] = [];
  for (const item of itens) {
    const nomeadas = refsNomeadasDaChave(item.chave);
    const noLugar = refsNoLugarDaChave(item.chave);
    // Atalho barato: sem `"ref"` nem o campo nomeado daquela família, não há o
    // que hidratar — a maioria das chaves (memorial, categoria) cai aqui sem custo.
    if (
      !item.valor.includes('"ref"') &&
      !nomeadas.some((n) => item.valor.includes(`"${n}"`)) &&
      !noLugar.some((n) => item.valor.includes(`"${n.de}"`))
    ) {
      saida.push(item);
      continue;
    }
    try {
      const obj: unknown = JSON.parse(item.valor);
      const campos = camposDeFotoDaChave(item.chave);
      let mudou = false;

      if (item.chave.startsWith(PREFIXO_FOTOS_FICHA) && Array.isArray(obj)) {
        // Histórico da ficha: só a foto de identificação vira imagem. O array
        // vai inteiro, com todas as referências.
        mudou = await hidratarIdentificacaoDaFicha(obj, campos, dataUrlDe);
      } else if (CHAVES_DE_CAMPO.includes(item.chave) && obj && typeof obj === 'object' && !Array.isArray(obj)) {
        // Container de campo: o valor é `container.dados`, então as chaves de
        // topo SÃO os grupos (checklist, visual_externo, th…). Percorre só os
        // grupos cuja folha de fotos lê ESTA chave.
        for (const [grupo, conteudo] of Object.entries(obj as Record<string, unknown>)) {
          if (!grupoVaiNaChave(item.chave, grupo)) continue;
          if (await percorrer(conteudo, campos, nomeadas, noLugar)) mudou = true;
        }
      } else if (await percorrer(obj, campos, nomeadas, noLugar)) {
        mudou = true;
      }

      saida.push(mudou ? { chave: item.chave, valor: JSON.stringify(obj) } : item);
    } catch {
      saida.push(item); // valor não-JSON: segue intacto
    }
  }
  // O mapa só existe quando há rubrica por referência — livro antigo (base64 na
  // entrada) e documento sem livro não pagam nada por isto.
  if (rubricas.size > 0) {
    saida.push({ chave: CHAVE_RUBRICAS_PALCO, valor: JSON.stringify(Object.fromEntries(rubricas)) });
  }
  return saida;
}

/**
 * Fluxo completo: trava → coleta → hidrata as fotos → degrada → orça →
 * materializa. Só devolve `ok: true` depois de TUDO confirmado. Quem chama não
 * pode montar iframe nenhum antes disso.
 */
export async function montarPalcoDaTag(
  ctx: ContextoMontagem,
  foto: AdaptadorFoto,
  opcoes: { esperaMs?: number } = {},
): Promise<ResultadoPalco> {
  const trava = await adquirirTrava(ctx, opcoes);
  if (!trava.obtida) return { ok: false, falha: { tipo: 'ocupado', dono: trava.dono } };

  // A hidratação vem ANTES da degradação de propósito: é ela que devolve os
  // bytes da imagem, e é sobre esses bytes que o orçamento de 3.400 KB decide
  // se precisa recomprimir.
  const brutos = await hidratarFotosDoBucket(coletarItens(ctx.tag));
  const degradado = await degradarAteCaber(brutos, foto);
  if (!degradado.cabe) {
    liberarTrava(ctx);
    return { ok: false, falha: degradado.falha };
  }

  const escrita = materializar(ctx, degradado.itens);
  if (!escrita.ok) {
    liberarTrava(ctx);
    return { ok: false, falha: escrita.falha };
  }

  return { ok: true, ctx };
}
