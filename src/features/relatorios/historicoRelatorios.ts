/**
 * Histórico de relatórios: UM REGISTRO POR RELATÓRIO + ÍNDICE LEVE POR TAG.
 *
 * POR QUE MUDOU (14/08/2026). Até aqui o histórico inteiro da organização vivia
 * numa chave só, `nr13_historico_relatorios`, com um array de `RelatorioSalvo`.
 * Cada entrada carrega os snapshots congelados da emissão (§7-bis): `meta.empresa`
 * com a LOGO em base64, `meta.assinantes` com DUAS rubricas PNG em base64,
 * `meta.certCalibracoes` e o `livroSnapshot`. Medido na conta `engyuricesar` em
 * 14/08/2026, uma entrada pesa ~125 KB. Consequências, todas proporcionais ao
 * número de relatórios já emitidos:
 *
 *   - salvar um relatório REESCREVIA o array inteiro (read-modify-write);
 *   - a hidratação incremental (§2-ter) não ajudava em nada: a linha muda a cada
 *     save, então volta INTEIRA do servidor em todo boot seguinte;
 *   - `listarHistorico` e `vencimentos` faziam `JSON.parse` do array completo
 *     para ler seis datas;
 *   - a fila de sync guardava mais uma cópia do valor por mutação pendente.
 *
 * Com 100 relatórios isso é uma linha de ~12 MB reescrita e retransmitida a cada
 * emissão. O crescimento é quadrático em tráfego e linear-pesado em memória.
 *
 * ── O QUE **NÃO** MUDOU, DE PROPÓSITO ────────────────────────────────────────
 * O conteúdo do `RelatorioSalvo` é o MESMO, byte a byte. Os snapshots continuam
 * snapshots: `meta.empresa`, `meta.assinantes` e `meta.certCalibracoes` seguem
 * sendo cópias congeladas dentro do registro, não referências a dado vivo.
 * Trocá-los por ponteiros mutáveis desfaria a imutabilidade do §7-bis — mudar a
 * logo hoje voltaria a mudar relatório assinado ano passado. Aqui só mudou o
 * CONTÊINER: de um array gigante para uma chave por relatório.
 *
 * O `pdfRef` + `sha256` (§7-quater) continuam sendo a fonte do documento
 * finalizado. Nada neste módulo gera, remonta ou toca o PDF.
 *
 * ── O MODELO ────────────────────────────────────────────────────────────────
 *
 *   `nr13_rel_<id>_<TAG>`             1 relatório completo. É a VERDADE.
 *   `nr13_historico_indice_<TAG>`     lista leve para tela: id, código, datas.
 *   `nr13_historico_relatorios`       LEGADO. Só leitura, nunca mais escrito.
 *
 * O índice é DERIVADO, e é isso que resolve a concorrência sem RPC nova: se dois
 * aparelhos salvarem relatórios do mesmo equipamento ao mesmo tempo, a última
 * gravação do índice vence e uma entrada se perde — mas os dois REGISTROS
 * existem, cada um na sua chave, e `listarIndice` reconstrói o que faltar
 * (`reparar`). Perder o índice custa uma listagem mais lenta; perder o registro
 * custaria o relatório, e isso não pode acontecer.
 *
 * Por que o índice é POR TAG e não global: uma chave global voltaria a ser
 * reescrita a cada emissão de qualquer equipamento (o problema que este módulo
 * resolve) e recriaria a corrida entre equipamentos diferentes. Por TAG, dois
 * relatórios de equipamentos distintos nunca disputam a mesma chave.
 *
 * Por que a TAG fica no FIM da chave do registro: a Edge Function
 * `portal_cliente` entrega ao cliente as chaves com `chave.endsWith('_' + tag)`.
 * Com o id por último, os relatórios sumiriam do Portal até um deploy da Edge.
 */
import { ler, lerCru, salvar, excluirChave, listarChavesDaTag, bloqueadoParaEscrita } from '../../services/storage';
import { ehRascunho, type RelatorioSalvo, type RelatorioIndiceItem } from './tipos';
import { esquecerRascunho, registrarRascunho } from './rascunhos';

/**
 * `nr13_rel_`, e NÃO `nr13_relatorio_`: `nr13_relatorio_meta_atual` é a segunda
 * chave mais lida do sistema, e qualquer filtro por prefixo (`FORA_DO_PALCO`,
 * por exemplo) que casasse `nr13_relatorio_` a levaria junto — foi exatamente
 * essa ausência que deixou a CAPA com "Nº RELATÓRIO: -" em 13/08/2026.
 * "nr13_relatorio_meta_atual".startsWith("nr13_rel_") é FALSO; a escolha do nome
 * curto é o que garante isso.
 */
export const PREFIXO_REL = 'nr13_rel_';
export const PREFIXO_INDICE = 'nr13_historico_indice_';
export const CHAVE_LEGADO = 'nr13_historico_relatorios';

/**
 * O id vira parte da chave, e a TAG é lida como "tudo depois do primeiro `_`"
 * (`familiasChave.tagAposId`). Um id com `_` moveria essa fronteira e o registro
 * seria indexado sob uma TAG que não existe — some do Portal, do índice e do
 * `excluirVaso`. Os ids reais são `REL-<timestamp>` e nunca têm `_`; a troca
 * existe para o caso de virem a ter.
 */
export function idSeguro(id: string): string {
  return String(id).replace(/_/g, '-');
}

export function chaveRelatorio(id: string, tag: string): string {
  return `${PREFIXO_REL}${idSeguro(id)}_${tag}`;
}

export function chaveIndice(tag: string): string {
  return `${PREFIXO_INDICE}${tag}`;
}

// ---------------------------------------------------------------------------
// Índice
// ---------------------------------------------------------------------------
/**
 * O resumo que a tela precisa — e SÓ ele.
 *
 * As datas de `meta` entram porque são o motivo de o Dashboard e
 * `listarVencimentos` existirem: sem elas no índice, calcular o vencimento de um
 * equipamento exigiria abrir todos os relatórios dele, que é justamente o que
 * este módulo veio evitar. São strings de 10 caracteres — o que fica de fora é o
 * que pesa: `meta.empresa` (logo), `meta.assinantes` (rubricas),
 * `meta.certCalibracoes`, `documentos` e `livroSnapshot`.
 */
export function resumir(r: RelatorioSalvo): RelatorioIndiceItem {
  return {
    id: r.id,
    tagVaso: r.tagVaso,
    nome: r.nome,
    tipo: r.tipo,
    data: r.data,
    status: r.status,
    codigo: r.meta?.codigo ?? '',
    emissao: r.meta?.emissao ?? '',
    validade: r.meta?.validade ?? '',
    execucaoInspecao: r.meta?.execucaoInspecao ?? '',
    proximaInspecaoInterna: r.meta?.proximaInspecaoInterna ?? '',
    proximaInspecaoExterna: r.meta?.proximaInspecaoExterna ?? '',
    validadeValvula: r.meta?.validadeValvula ?? '',
    pdfRef: r.pdfRef,
    sha256: r.sha256,
    geradoEm: r.geradoEm,
    paginas: r.paginas,
    pdfPendente: r.pdfPendente,
  };
}

function lerIndiceCru(tag: string): RelatorioIndiceItem[] {
  const lista = ler<RelatorioIndiceItem[]>(chaveIndice(tag));
  return Array.isArray(lista) ? lista.filter((i) => i && typeof i.id === 'string') : [];
}

/** Chaves de registro deste equipamento, pelo índice por TAG (sem varredura). */
function chavesDeRegistro(tag: string): string[] {
  return listarChavesDaTag(tag).filter((c) => c.startsWith(PREFIXO_REL));
}

// ---------------------------------------------------------------------------
// Legado
// ---------------------------------------------------------------------------
/**
 * O array antigo, agrupado por TAG e parseado UMA vez por sessão.
 *
 * Sem o memo, `listarIndice` custaria um `JSON.parse` de multi-MB por chamada —
 * e ela é chamada por equipamento na tela de Relatórios. O array legado não é
 * mais escrito por ninguém (é por isso que cachear é seguro); `zerarCacheLegado`
 * existe para os testes e para a migração, que precisa reler depois de gravar.
 */
let legadoCache: { cru: string | null; mapa: Map<string, RelatorioSalvo[]> } | null = null;

export function zerarCacheLegado(): void {
  legadoCache = null;
}

function legado(): Map<string, RelatorioSalvo[]> {
  // A identidade é o VALOR BRUTO, não a sessão: trocar de organização substitui a
  // string, e um memo por sessão devolveria o histórico da conta anterior.
  const cru = lerCru(CHAVE_LEGADO);
  if (legadoCache && legadoCache.cru === cru) return legadoCache.mapa;

  const mapa = new Map<string, RelatorioSalvo[]>();
  try {
    const todos = ler<RelatorioSalvo[]>(CHAVE_LEGADO);
    if (Array.isArray(todos)) {
      for (const r of todos) {
        if (!r || typeof r.id !== 'string' || typeof r.tagVaso !== 'string') continue;
        const lista = mapa.get(r.tagVaso) ?? [];
        lista.push(r);
        mapa.set(r.tagVaso, lista);
      }
    }
  } catch {
    // array corrompido: o histórico novo não pode ser derrubado por ele
  }
  legadoCache = { cru, mapa };
  return mapa;
}

export function legadoDaTag(tag: string): RelatorioSalvo[] {
  return legado().get(tag) ?? [];
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
/**
 * Lista leve do equipamento, do mais recente para o mais antigo.
 *
 * Une três origens, com precedência: índice → registros órfãos (reparo de
 * concorrência) → legado ainda não migrado. Nenhuma delas GRAVA: listar não pode
 * ter efeito colateral, senão abrir a tela num aparelho offline enfileiraria
 * escritas que o usuário não pediu.
 */
export function listarIndice(tag: string): RelatorioIndiceItem[] {
  if (!tag) return [];
  const porId = new Map<string, RelatorioIndiceItem>();
  // O filtro por status é defensivo: nenhum caminho de escrita põe rascunho no
  // índice, e nada deve depender disso continuar sendo verdade por acidente.
  for (const item of lerIndiceCru(tag)) if (!ehRascunho(item.status)) porId.set(item.id, item);

  // Reparo: registro gravado cujo índice se perdeu numa corrida entre aparelhos.
  //
  // RASCUNHO NÃO É REPARADO PARA DENTRO DO ÍNDICE (10B.1). O registro dele mora
  // na mesma chave do finalizado, e sem este filtro o reparo faria exatamente o
  // que o modelo evita: colocar um documento em edição no índice, de onde saem
  // vencimento, Portal e contagens.
  for (const chave of chavesDeRegistro(tag)) {
    const r = ler<RelatorioSalvo>(chave);
    if (r?.id && !ehRascunho(r.status) && !porId.has(r.id)) porId.set(r.id, resumir(r));
  }

  // Legado: ainda não migrado (ou migração parcial). O registro novo VENCE — na
  // migração ele é cópia fiel, e depois dela é o único que recebe edições.
  for (const r of legadoDaTag(tag)) if (!porId.has(r.id)) porId.set(r.id, resumir(r));

  return [...porId.values()].sort((a, b) => ts(b) - ts(a));
}

export function listarIndiceDeTodasAsTags(tags: string[]): Map<string, RelatorioIndiceItem[]> {
  return new Map(tags.map((t) => [t, listarIndice(t)] as const));
}

function ts(i: RelatorioIndiceItem): number {
  const d = paraData(i.emissao) ?? paraData(i.data);
  return d?.getTime() ?? 0;
}

/** `DD/MM/AAAA` e `AAAA-MM-DD` — os dois formatos que o histórico já contém. */
function paraData(v: string | undefined): Date | null {
  if (!v) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const iso = Date.parse(v);
  return Number.isNaN(iso) ? null : new Date(iso);
}

export function contarRelatorios(tag: string): number {
  return listarIndice(tag).length;
}

/**
 * UM relatório completo. Registro novo primeiro; legado como último recurso,
 * para a conta que ainda não migrou ou cuja migração não terminou.
 */
export function carregarRelatorio(id: string, tag: string): RelatorioSalvo | null {
  const r = ler<RelatorioSalvo>(chaveRelatorio(id, tag));
  if (r?.id) return r;
  return legadoDaTag(tag).find((x) => x.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------
/**
 * Grava o relatório e atualiza o índice daquele equipamento — DUAS chaves, nunca
 * o histórico inteiro. O registro vai PRIMEIRO: se a gravação do índice falhar
 * (cota, rede, aba fechada), o relatório existe e `listarIndice` o recupera pelo
 * reparo. A ordem inversa produziria um índice apontando para o nada.
 */
export async function salvarRelatorio(r: RelatorioSalvo): Promise<void> {
  // Fase 10B.1 · rascunho grava o REGISTRO e não o índice. O índice é a origem
  // da projeção, e da projeção saem vencimento, Portal e contagens — coisas que
  // um documento em edição não pode produzir. Ver `rascunhos.ts`.
  if (ehRascunho(r.status)) {
    await salvarRascunho(r);
    return;
  }

  await salvar(chaveRelatorio(r.id, r.tagVaso), r);

  const atual = listarIndice(r.tagVaso).filter((i) => i.id !== r.id);
  await salvar(chaveIndice(r.tagVaso), [resumir(r), ...atual].sort((a, b) => ts(b) - ts(a)));

  // Finalizou: some do índice de rascunhos. Sem isto o mesmo relatório
  // apareceria duas vezes na tela — uma editável e uma trancada.
  await esquecerRascunho(r.id);
}

/**
 * Grava um relatório EM RASCUNHO: o registro completo + o item no índice de
 * rascunhos. Nada toca `nr13_historico_indice_<TAG>`.
 *
 * O registro usa a MESMA chave do relatório finalizado (`nr13_rel_<id>_<TAG>`),
 * de propósito: finalizar reescreve no lugar, com o mesmo id, e o histórico não
 * ganha um segundo documento com o mesmo conteúdo.
 */
export async function salvarRascunho(r: RelatorioSalvo): Promise<void> {
  await salvar(chaveRelatorio(r.id, r.tagVaso), r);
  await registrarRascunho(r);
}

/**
 * Remove o relatório: o registro, a entrada do índice e a cópia dentro do array
 * legado, se houver.
 */
export async function excluirRelatorio(id: string, tag: string): Promise<void> {
  await excluirChave(chaveRelatorio(id, tag));
  await removerDoLegado(id, tag);
  const restante = listarIndice(tag).filter((i) => i.id !== id);
  await salvar(chaveIndice(tag), restante);
  // Rascunho excluído sai do índice de rascunhos junto. Sem isto a tela
  // continuaria oferecendo "continuar editando" um registro que não existe.
  await esquecerRascunho(id);
}

/**
 * Tira do array legado a entrada excluída.
 *
 * Precisa acontecer: o legado é fallback de LEITURA, então a cópia lá dentro
 * faria o relatório excluído reaparecer na listagem seguinte — e num aparelho
 * que ainda não migrou, voltaria para sempre. Este é o ÚNICO caminho do sistema
 * que ainda reescreve `nr13_historico_relatorios`, e é aceitável porque excluir
 * relatório é raro e porque aqui o array só ENCOLHE — o custo que esta mudança
 * combate é o da reescrita a cada EMISSÃO, não a cada exclusão.
 */
async function removerDoLegado(id: string, tag: string): Promise<void> {
  const todos = ler<RelatorioSalvo[]>(CHAVE_LEGADO);
  if (!Array.isArray(todos)) return;
  const restante = todos.filter((r) => !(r?.id === id && r?.tagVaso === tag));
  if (restante.length === todos.length) return; // não estava lá: nada a reescrever
  await salvar(CHAVE_LEGADO, restante);
  zerarCacheLegado();
}

// ---------------------------------------------------------------------------
// Migração
// ---------------------------------------------------------------------------
/**
 * Converte o array legado em registros individuais. IDEMPOTENTE: só grava o que
 * ainda não existe, e NUNCA apaga `nr13_historico_relatorios`.
 *
 * Manter o legado é deliberado. Ele é a única cópia de segurança desta migração
 * e o fallback de leitura de qualquer aparelho que ainda não tenha rodado o
 * código novo — sincronização v2 não é atômica entre dispositivos. O descarte é
 * um passo separado, para depois de a conversão estar validada em produção.
 *
 * Devolve o que foi convertido AGORA, para o chamador poder conferir contra o
 * total esperado.
 */
export async function migrarHistoricoDaTag(tag: string): Promise<number> {
  let convertidos = 0;
  for (const r of legadoDaTag(tag)) {
    if (ler<RelatorioSalvo>(chaveRelatorio(r.id, tag))) continue; // já migrado
    await salvar(chaveRelatorio(r.id, tag), r);
    convertidos++;
  }
  if (convertidos > 0) await salvar(chaveIndice(tag), listarIndice(tag));
  return convertidos;
}

export interface ResultadoMigracao {
  tags: number;
  relatorios: number;
  /** Entradas do legado que já estavam convertidas — a prova de idempotência. */
  jaExistiam: number;
  /** TAGs cuja contagem final ficou MENOR que a do legado. Deve vir vazio. */
  divergentes: string[];
}

/**
 * Migra a organização inteira e VALIDA a contagem por equipamento.
 *
 * A validação compara o total de ids únicos do legado com o que `listarIndice`
 * devolve depois. Um número menor significa relatório sumido da listagem — o
 * defeito exato que este projeto existe para não cometer — e vira `divergentes`
 * em vez de passar em silêncio. Não há rollback: nada foi apagado, e o legado
 * segue respondendo por quem faltar.
 */
export async function migrarHistoricoRelatorios(): Promise<ResultadoMigracao> {
  const mapa = legado();
  const res: ResultadoMigracao = { tags: 0, relatorios: 0, jaExistiam: 0, divergentes: [] };

  for (const [tag, lista] of mapa) {
    const esperados = new Set(lista.map((r) => r.id)).size;
    const convertidos = await migrarHistoricoDaTag(tag);
    res.tags++;
    res.relatorios += convertidos;
    res.jaExistiam += esperados - convertidos;
    if (listarIndice(tag).length < esperados) res.divergentes.push(tag);
  }
  return res;
}

/**
 * Roda a migração UMA vez por sessão, em segundo plano, sem travar a tela.
 *
 * Falhar aqui não pode quebrar nada: sem a conversão, `listarIndice` e
 * `carregarRelatorio` continuam servindo pelo legado. Por isso o erro é
 * registrado e engolido.
 */
let migracaoIniciada = false;

export function migrarHistoricoEmSegundoPlano(): void {
  if (migracaoIniciada) return;
  // Conta somente leitura (Portal do Cliente, assinatura vencida) NÃO migra: toda
  // gravação lançaria `ErroBloqueado` na primeira entrada e o resto nem seria
  // tentado. Lá o legado responde por tudo, que é exatamente para o que ele foi
  // mantido — e o cliente não deve gravar nada na organização do inspetor.
  if (bloqueadoParaEscrita()) return;
  migracaoIniciada = true;
  void migrarHistoricoRelatorios()
    .then((res) => {
      if (res.relatorios > 0) console.info('[historico] relatórios migrados:', res);
      if (res.divergentes.length > 0) {
        console.error('[historico] TAGs com contagem menor após migrar:', res.divergentes);
      }
    })
    .catch((e) => console.error('[historico] migração falhou; seguindo pelo legado', e));
}

export function zerarMigracaoEmMemoria(): void {
  migracaoIniciada = false;
}
