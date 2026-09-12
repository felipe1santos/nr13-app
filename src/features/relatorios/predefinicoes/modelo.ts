import { ler, salvar } from '../../../services/storage';
import { usuarioLogado } from '../../../services/auth';
import {
  LINHAS_RECOMENDACAO,
  idPermitido,
  idRecomendacao,
  ordenarPorFolha,
} from './camposPredefiniveis';

/**
 * PREDEFINIÇÕES DO RELATÓRIO — o gerenciador (12/09/2026).
 *
 * ## De onde veio
 *
 * Nasceu em 10/09/2026 como "recomendações predefinidas": um conjunto guardava
 * as quatro linhas da tabela de recomendações e nada mais. Medido no E2E do
 * "RELATORIO DA IA": das 28 células digitadas depois do documento montado, 8
 * eram essas — mas as outras 20 também se repetem. Objetivo, escopo,
 * procedimento do teste hidrostático, prazos das próximas inspeções e o parecer
 * sobre a PMTA são redigitados, iguais, de uma inspeção para a outra.
 *
 * ## O que um conjunto é agora
 *
 * Um mapa `id semântico do campo → valor`, com nome e descrição. Os ids são os
 * MESMOS que o gerador vetorial registra ao desenhar (`folhas.ts`), filtrados
 * pela allowlist de `camposPredefiniveis.ts`. Não se guarda posição de célula
 * nem texto visível: o que identifica o campo é o id, que é estável.
 *
 * ## O que ele NÃO é
 *
 * Não é preenchimento automático. Aplicar é um gesto explícito, com uma tela de
 * revisão que mostra campo a campo o que vai entrar — e, quando o campo já tem
 * conteúdo, o que está lá HOJE ao lado do que a predefinição propõe. Texto
 * técnico entra num documento assinado por engenheiro; nenhuma frase deve
 * chegar lá sem alguém ter lido.
 *
 * ## Onde mora, e por que não há tabela nova
 *
 * `nr13_predef_relatorio`, chave GLOBAL da organização — o mesmo escopo de
 * `nr13_lista_phs` e `nr13_minha_empresa`. Sobe pelo caminho oficial (`salvar`
 * → fila durável → RPC `aplicar_mutacao_storage` → Postgres → ack), então
 * funciona offline e aparece no computador do escritório depois de ter sido
 * criada no celular.
 *
 * **O isolamento entre organizações não é feito aqui.** Ele já existe em três
 * camadas do caminho oficial: a RLS de `app_storage` filtra por
 * `org_id = org_atual()`; a RPC de escrita **não tem parâmetro `org_id`** (a
 * organização vem do servidor, não do cliente); e o cache local é um banco
 * IndexedDB por organização (`nr13_dados_<org_id>`). Criar tabela própria para
 * as predefinições significaria reescrever essas três camadas — e uma cópia
 * dessa regra é uma chance a mais de ela divergir.
 *
 * Nenhum template de `public/` lê esta chave: ela não vai para o palco.
 */

/**
 * Um conjunto de predefinição.
 *
 * `campos` é o coração: cada chave é um id da allowlist, cada valor é o texto
 * que vai para aquele campo.
 *
 * **Valor vazio é um valor.** Um conjunto "Inspeção periódica sem recomendações"
 * declara as quatro linhas de recomendação com `''` — e aplicá-lo LIMPA a
 * tabela de propósito. Isso cai exatamente no terceiro estado do override
 * (`branco`, ver `overridesRelatorio.ts`), que é o estado em que o valor
 * automático não volta sozinho. Descartar as chaves vazias tiraria do usuário a
 * única forma de dizer "aqui não vai nada".
 */
export interface Predefinicao {
  id: string;
  nome: string;
  descricao: string;
  /** `id semântico do campo` → valor. Só ids da allowlist sobrevivem ao saneamento. */
  campos: Record<string, string>;
  criadoEm: string;
  atualizadoEm: string;
  /** O e-mail de quem criou, quando o app sabe. Não é impresso em lugar nenhum. */
  criadoPor?: string;
  /** Sobe a cada gravação. Serve para explicar divergência entre aparelhos. */
  versao: number;
  /**
   * O conjunto EMBUTIDO do sistema.
   *
   * Nunca é persistido nem sai do saneamento com `true`: quem o marca é
   * `conjuntoSistema.ts`, na montagem da lista. Um registro gravado que se
   * dissesse do sistema conseguiria ser inapagável — e ninguém teria como
   * removê-lo.
   */
  sistema?: boolean;
}

export const CHAVE_PREDEF_RELATORIO = 'nr13_predef_relatorio';

/**
 * A chave ANTIGA, das recomendações (10/09 a 12/09/2026).
 *
 * Continua sendo LIDA, e o que houver nela é convertido para o modelo novo na
 * primeira leitura. Não é apagada: ela é o backup de quem ainda não rodou o
 * código novo — a mesma regra da migração do histórico (§7-sexies).
 */
export const CHAVE_PREDEF_LEGADO = 'nr13_predef_recomendacoes';

function limpar(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Texto de campo: as pontas são aparadas, o miolo (parágrafos) é preservado. */
function limparValor(v: unknown): string {
  return typeof v === 'string' ? v.replace(/^\s+|\s+$/g, '') : '';
}

/**
 * Saneia UM conjunto vindo do storage.
 *
 * Devolve `null` para o que não dá para aproveitar. A lista é lida na abertura
 * do documento e um registro corrompido — outro aparelho, versão antiga, edição
 * manual no storage — não pode derrubar a barra do relatório.
 *
 * **É aqui que a allowlist é aplicada.** Filtrar só na tela de criação deixaria
 * um registro forjado escrever em `capa.tag` ou `categoria.pmta` na hora de
 * aplicar; filtrando na leitura, o id proibido nunca chega a existir em memória.
 */
export function sanearPredefinicao(bruto: unknown, i = 0): Predefinicao | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const r = bruto as Record<string, unknown>;
  const nome = limpar(r.nome);
  if (!nome) return null;

  const campos: Record<string, string> = {};
  const cru = r.campos;
  if (cru && typeof cru === 'object' && !Array.isArray(cru)) {
    for (const [id, valor] of Object.entries(cru as Record<string, unknown>)) {
      if (!idPermitido(id)) continue;
      if (typeof valor !== 'string') continue;
      campos[id] = limparValor(valor);
    }
  }

  // Registro do modelo ANTIGO: as quatro linhas de recomendação em `itens[]`.
  if (Array.isArray(r.itens)) Object.assign(campos, camposDeItensLegados(r.itens));

  if (Object.keys(campos).length === 0) return null;

  const criadoEm = limpar(r.criadoEm);
  return {
    id: limpar(r.id) || `pref-${i + 1}`,
    nome,
    descricao: limpar(r.descricao),
    campos,
    criadoEm,
    atualizadoEm: limpar(r.atualizadoEm) || criadoEm,
    ...(limpar(r.criadoPor) ? { criadoPor: limpar(r.criadoPor) } : {}),
    versao: typeof r.versao === 'number' && r.versao > 0 ? Math.floor(r.versao) : 1,
  };
}

/**
 * A conversão do modelo antigo: `itens[{texto,prazo}]` → mapa de campos.
 *
 * Item sem texto sai — linha de recomendação com prazo e sem recomendação não
 * diz nada, e era assim que o saneamento antigo já se comportava. A conversão é
 * feita na LEITURA, não numa rotina de migração: assim ela vale para o registro
 * que chegar de um aparelho que ainda esteja na versão anterior.
 */
function camposDeItensLegados(itens: unknown[]): Record<string, string> {
  const campos: Record<string, string> = {};
  let n = 1;
  for (const i of itens) {
    if (n > LINHAS_RECOMENDACAO) break;
    const it = (i ?? {}) as Record<string, unknown>;
    const texto = limparValor(it.texto);
    if (texto === '') continue;
    campos[idRecomendacao(n, 'texto')] = texto;
    campos[idRecomendacao(n, 'prazo')] = limparValor(it.prazo);
    n++;
  }
  return campos;
}

/** Saneia a lista inteira. Nunca lança. */
export function sanearLista(bruto: unknown): Predefinicao[] {
  if (!Array.isArray(bruto)) return [];
  const saida: Predefinicao[] = [];
  for (const p of bruto) {
    const limpo = sanearPredefinicao(p, saida.length);
    if (limpo) saida.push(limpo);
  }
  return saida;
}

/**
 * As predefinições GRAVADAS da organização — sem o conjunto do sistema.
 *
 * Lê a chave nova e, se ela estiver vazia, cai na antiga: é o que faz a lista
 * criada antes de 12/09/2026 continuar aparecendo sem nenhuma rotina de
 * migração ter rodado. Nunca lança: sem registro, lista vazia.
 */
export function listarPredefinicoes(): Predefinicao[] {
  try {
    const nova = sanearLista(ler<unknown>(CHAVE_PREDEF_RELATORIO));
    if (nova.length > 0) return nova;
    return sanearLista(ler<unknown>(CHAVE_PREDEF_LEGADO));
  } catch {
    return [];
  }
}

/**
 * Grava a lista pelo caminho oficial.
 *
 * O conjunto do sistema é removido antes de gravar — ele é código, não dado, e
 * persistido viraria uma cópia que o próximo deploy não conseguiria corrigir.
 */
export async function gravarPredefinicoes(lista: Predefinicao[]): Promise<void> {
  const gravaveis = sanearLista(lista.filter((p) => !p.sistema));
  await salvar(CHAVE_PREDEF_RELATORIO, gravaveis);
}

/** Um id novo, estável o bastante para a lista de uma organização. */
export function novoId(): string {
  return `pref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Um conjunto vazio, pronto para o formulário de criação. */
export function predefinicaoVazia(): Predefinicao {
  const agora = new Date().toISOString();
  const por = usuarioLogado();
  return {
    id: novoId(),
    nome: '',
    descricao: '',
    campos: {},
    criadoEm: agora,
    atualizadoEm: agora,
    ...(por ? { criadoPor: por } : {}),
    versao: 1,
  };
}

/**
 * Insere ou substitui um conjunto, POR ID.
 *
 * Mudou de critério em 12/09/2026: o modelo antigo substituía pelo NOME, porque
 * o único gesto era "guardar as recomendações deste relatório" e repetir o nome
 * significava corrigir aquele conjunto. Agora existe Editar — e substituir por
 * nome faria uma edição que troca o nome apagar um conjunto homônimo de outra
 * pessoa. A checagem de nome repetido virou aviso na tela, não regra de dado.
 *
 * O conjunto editado sobe para o topo? **Não.** A lista se ordena por nome (ver
 * `ordenarLista`), e um conjunto que pula de lugar a cada correção de vírgula é
 * um conjunto que ninguém acha duas vezes no mesmo sítio.
 */
export function comPredefinicao(atuais: Predefinicao[], nova: Predefinicao): Predefinicao[] {
  const i = atuais.findIndex((p) => p.id === nova.id);
  const atualizada: Predefinicao = {
    ...nova,
    atualizadoEm: new Date().toISOString(),
    versao: i >= 0 ? atuais[i].versao + 1 : 1,
  };
  if (i < 0) return ordenarLista([...atuais, atualizada]);
  const copia = [...atuais];
  copia[i] = atualizada;
  return ordenarLista(copia);
}

export function semPredefinicao(atuais: Predefinicao[], id: string): Predefinicao[] {
  return atuais.filter((p) => p.id !== id);
}

/**
 * A CÓPIA editável de um conjunto — é assim que o do sistema se personaliza.
 *
 * Id novo, `sistema` descartado, nome com sufixo. Copiar em vez de destravar o
 * original é o que mantém o conjunto do sistema corrigível por deploy: quem
 * duplicou fica com a sua versão, e a referência continua sendo a referência.
 */
export function duplicar(p: Predefinicao, existentes: Predefinicao[]): Predefinicao {
  const agora = new Date().toISOString();
  const por = usuarioLogado();
  return {
    id: novoId(),
    nome: nomeDisponivel(`${p.nome} (cópia)`, existentes),
    descricao: p.descricao,
    campos: { ...p.campos },
    criadoEm: agora,
    atualizadoEm: agora,
    ...(por ? { criadoPor: por } : {}),
    versao: 1,
  };
}

/** `X (cópia)`, `X (cópia 2)`… — duas linhas com o mesmo rótulo são indistinguíveis. */
function nomeDisponivel(base: string, existentes: Predefinicao[]): string {
  const usados = new Set(existentes.map((p) => p.nome.trim().toLocaleLowerCase('pt-BR')));
  if (!usados.has(base.trim().toLocaleLowerCase('pt-BR'))) return base;
  for (let n = 2; n < 100; n++) {
    const tentativa = base.replace(/\)$/, ` ${n})`);
    if (!usados.has(tentativa.trim().toLocaleLowerCase('pt-BR'))) return tentativa;
  }
  return `${base} ${Date.now()}`;
}

/** Ordem alfabética, pt-BR — a lista é um catálogo, e catálogo se consulta por nome. */
export function ordenarLista(lista: Predefinicao[]): Predefinicao[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

/** Existe outro conjunto com este nome? Vira AVISO na tela, nunca bloqueio. */
export function nomeRepetido(lista: Predefinicao[], p: Predefinicao): boolean {
  const chave = p.nome.trim().toLocaleLowerCase('pt-BR');
  if (chave === '') return false;
  return lista.some((o) => o.id !== p.id && o.nome.trim().toLocaleLowerCase('pt-BR') === chave);
}

/** Filtro da busca: por NOME e por descrição, sem acento nem caixa. */
export function filtrarPorTexto(lista: Predefinicao[], termo: string): Predefinicao[] {
  const t = normalizar(termo);
  if (t === '') return lista;
  return lista.filter((p) => normalizar(`${p.nome} ${p.descricao}`).includes(t));
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

/** Os ids do conjunto, na ordem das folhas — a ordem em que o documento os mostra. */
export function idsDoConjunto(p: Predefinicao): string[] {
  return ordenarPorFolha(Object.keys(p.campos));
}

/** O resumo de uma linha da lista. */
export function resumoPredefinicao(p: Predefinicao): string {
  const n = Object.keys(p.campos).length;
  return `${n} campo${n === 1 ? '' : 's'} configurado${n === 1 ? '' : 's'}`;
}

/** `12/09/2026` a partir do ISO. Vazio se a data não existir ou não valer. */
export function dataBr(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}
