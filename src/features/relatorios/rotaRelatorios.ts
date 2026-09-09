/**
 * Fase 9 · 9E.5 — quem decide qual tela `/relatorios` mostra.
 *
 * ── O DEFEITO QUE ISTO CONSERTA ─────────────────────────────────────────────
 * No rollout de 25/08/2026, com `busca_v9` LIGADA, clicar em "Visualizar" num
 * relatório não fazia nada. A tela nova delegava a abertura navegando para
 * `/relatorios?tag=…&rel=…`, confiando que "a tela legada sabe abrir a partir da
 * TAG" — mas a rota `/relatorios` decidia a tela pela FLAG e só por ela, então o
 * link levava de volta à mesma tela nova, que ignora `tag` e `rel`. Com a flag
 * ligada não existia caminho nenhum até o documento arquivado.
 *
 * ── A REGRA ─────────────────────────────────────────────────────────────────
 * A flag continua mandando no padrão — ela é a decisão de rollout. O que muda é
 * que a URL passa a ter uma saída explícita (`legado=1`), usada num caso só: o
 * relatório salvo ANTES do §7-quater, que não tem PDF arquivado e por isso só a
 * tela antiga sabe remontar. Todo o resto a V9 abre sozinha, pelo `pdfRef`.
 *
 * Isto é função pura porque a tela não pode ser testada aqui: a suíte roda em
 * `environment: 'node'`, sem DOM. A regra que quebrou em produção não pode
 * depender de um teste que este projeto não tem como escrever.
 */

/** A tela que `/relatorios` deve montar. */
export function modoRelatorios(search: string): 'v9' | 'legado' {
  // `editor=1` é a MESMA tela, com o nome certo.
  //
  // Aquele arquivo é duas coisas: o visualizador do relatório anterior ao
  // §7-quater E o único EDITOR do sistema — é ele que monta o documento a
  // partir dos dados. Chamar de "legado" o caminho por onde se cria um
  // relatório novo era descrever errado o que se está fazendo, e apareceu na
  // interface: o botão "+ Criar relatório" levava o usuário a uma URL escrita
  // `legado=1`. O parâmetro antigo continua valendo — os links já emitidos não
  // podem parar de abrir.
  if (new URLSearchParams(search).get('editor') === '1') return 'legado';
  // 9G.3 · a flag `busca_v9` saiu. A tela nova é a entrada; a antiga continua
  // alcançável SÓ por `legado=1`, e ela existe por um motivo que não expirou:
  // relatório anterior ao §7-quater não tem PDF arquivado, e remontá-lo é coisa
  // que só a tela antiga sabe fazer. Sem essa saída, o documento fica
  // inalcançável.
  return new URLSearchParams(search).get('legado') === '1' ? 'legado' : 'v9';
}

/**
 * QUAL DOS DOIS PAPÉIS aquele arquivo está exercendo.
 *
 * `pages/Relatorios.tsx` é DUAS telas num componente só, e confundi-las foi o
 * defeito relatado em 06/09/2026: `/relatorios?editor=1&tag=…&rel=…` mostrava
 * o "Histórico de Relatórios" daquele equipamento — uma segunda lista, com
 * outro "+ Criar Relatório" dentro — em pleno fluxo moderno.
 *
 * - `editor`  (`?editor=1`): CRIAR ou CONTINUAR um documento. A lista canônica
 *   é `/relatorios`, e este papel NUNCA mostra lista de relatório nenhuma. Se
 *   o `rel=` não resolver, o destino é `/relatorios` — não um histórico
 *   paralelo onde o usuário fica parado sem entender o que aconteceu.
 * - `legado` (`?legado=1`): abrir documento anterior ao §7-quater, que não tem
 *   PDF arquivado e só esta tela sabe remontar. AQUI o histórico por TAG é
 *   legítimo: é a única forma de achar um documento que não está na projeção.
 *
 * A decisão NÃO pode sair de "tem `tag` na URL?". Foi essa a pergunta que a
 * correção anterior usou, e as duas rotas têm `tag`.
 */
export function papelDaTelaLegada(search: string): 'editor' | 'legado' {
  return new URLSearchParams(search).get('editor') === '1' ? 'editor' : 'legado';
}
/** Para onde a tela legada deve ir ao abrir, quando a URL pede um documento. */
export interface AlvoLegado {
  tag: string;
  /** `null` = abre só o histórico da TAG; é destino útil, não falha. */
  rel: string | null;
}

export function alvoLegadoDaUrl(search: string): AlvoLegado | null {
  const p = new URLSearchParams(search);
  const tag = (p.get('tag') ?? '').trim();
  if (!tag) return null;
  const rel = (p.get('rel') ?? '').trim();
  return { tag, rel: rel === '' ? null : rel };
}

/** O link que leva um documento específico para a tela antiga. */
export function urlDoLegado(tag: string, rel: string): string {
  return `/relatorios?legado=1&tag=${encodeURIComponent(tag)}&rel=${encodeURIComponent(rel)}`;
}

/** O caminho para o EDITOR — criar relatório novo, ou continuar um rascunho. */
export function urlDoEditor(tag?: string, rel?: string): string {
  const p = new URLSearchParams({ editor: '1' });
  if (tag) p.set('tag', tag);
  if (rel) p.set('rel', rel);
  return `/relatorios?${p.toString()}`;
}

/**
 * A ESCOLHA PRONTA que `/relatorios` entrega ao editor pelo `state` da
 * navegação. Ver `ModalCriarRelatorio`.
 */
export interface EscolhaPronta {
  tag: string;
  tipo: string;
  documentos: string[];
  /**
   * `null` = relatório sem dados de campo. **`undefined` = state antigo**, de
   * antes de 09/09/2026, em que o container ainda era escolhido do lado do
   * editor. Os três casos são diferentes e a tela precisa distingui-los.
   */
  containerId?: string | null;
}

export function escolhaProntaDoState(state: unknown): EscolhaPronta | null {
  if (!state || typeof state !== 'object') return null;
  const s = state as Record<string, unknown>;
  if (typeof s.tag !== 'string' || s.tag.trim() === '') return null;
  if (!Array.isArray(s.documentos)) return null;
  return {
    tag: s.tag,
    tipo: String(s.tipo ?? ''),
    documentos: s.documentos.filter((d): d is string => typeof d === 'string'),
    ...(s.containerId === undefined ? {} : { containerId: (s.containerId as string | null) ?? null }),
  };
}

/**
 * COM QUE TELA O EDITOR NASCE — e a razão de esta função existir.
 *
 * O bloco "Para qual equipamento?" é o valor INICIAL de `useState<Tela>`, e o
 * efeito de montagem só troca a tela depois. Quando a criação já vinha
 * decidida, o modal do container abria em cima do seletor de equipamento: a
 * pergunta que o usuário acabou de responder, de volta na tela, atrás de um
 * modal. Não era um piscar — ficava lá até o "Gerar Documento".
 *
 * A decisão precisa ser SÍNCRONA, antes da primeira pintura, e é por isso que
 * ela é uma função pura sobre o `state` e não um `useEffect`.
 *
 * - `montando`: veio decidido de `/relatorios`, ou a URL aponta para UM
 *   documento (`rel=`). Nenhuma pergunta a fazer.
 * - `criacao`: veio o equipamento e as folhas, mas não o container (state
 *   antigo). O fundo é a tela do equipamento JÁ escolhido, nunca o seletor.
 * - `historico`: `?legado=1&tag=…` sem documento — ali o histórico por TAG É o
 *   destino, e começar nele evita o mesmo piscar.
 * - `equipamentos`: ninguém decidiu nada — `?editor=1` puro, sem TAG. Aí o
 *   seletor é o destino certo, e ele continua existindo para isso.
 *
 * A URL entrou nesta conta em 09/09/2026, medido: "continuar editando" gera
 * `?editor=1&tag=…&rel=…` SEM state, e o seletor de equipamento aparecia por
 * quatro quadros antes de o rascunho abrir. O `rel=` já diz que o destino é um
 * documento; perguntar o equipamento nunca foi uma opção nesse caminho.
 */
export function telaInicialDoEditor(
  state: unknown,
  search: string,
): 'montando' | 'criacao' | 'historico' | 'equipamentos' {
  const escolha = escolhaProntaDoState(state);
  if (escolha) return escolha.containerId === undefined ? 'criacao' : 'montando';
  const alvo = alvoLegadoDaUrl(search);
  if (!alvo) return 'equipamentos';
  if (alvo.rel) return 'montando';
  // TAG sem documento: no legado é o histórico daquela TAG; no editor não há
  // destino, e o efeito devolve para `/relatorios` — em qualquer dos dois, o
  // seletor de equipamento não é resposta.
  return papelDaTelaLegada(search) === 'legado' ? 'historico' : 'montando';
}
