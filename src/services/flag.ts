/**
 * Feature flag do armazenamento v2 (Map + IndexedDB + palco).
 *
 * Com ela desligada o app usa o caminho v1 — `localStorage` como cache e upsert
 * direto no Supabase. Só continua existindo para o rollback: desligar uma
 * organização é uma decisão explícita (`definir_v2_org(org, false)`).
 *
 * O valor é espelhado no login a partir de `org_sync.v2_ativa` (servidor), que
 * é quem manda de verdade: a RLS recusa escrita direta quando a v2 está ativa
 * para a organização. Este espelho local só decide qual caminho o bundle usa.
 *
 * PADRÃO DESDE 11/08/2026: organização SEM linha em `org_sync` é v2. Ver o
 * comentário em `sincronizarFlagDoServidor`.
 */
import { supabase, escopoStorageAtual } from './supabase';

const CHAVE = 'nr13_armazenamento_v2';

/**
 * Fase 9 · leitura de `/equipamentos` pela projeção de busca.
 *
 * DEFAULT DESLIGADA, e é o oposto da `v2_ativa` de propósito: org sem a flag
 * continua com a hidratação integral, que funciona. Errar para o lado do OFF é
 * o lado barato — o contrário custaria uma tela vazia numa org sem backfill.
 *
 * É MECANISMO DE ROLLOUT, não arquitetura permanente: remover a flag e o
 * caminho antigo é entrega da 9G.
 */
const CHAVE_BUSCA = 'nr13_busca_v9';

/**
 * Fase 9 · 9D — o boot deixa de baixar a organização inteira.
 *
 * SEPARADA da `busca_v9` de propósito. A busca troca a FONTE da lista e não
 * mexe no `Map`; esta troca QUANDO o `Map` é preenchido, e alcança toda tela
 * que hoje lê do cache completo. É a etapa de maior risco da fase, então ela
 * precisa de rollback próprio: desligar o boot leve sem desligar a busca.
 *
 * DEFAULT DESLIGADA, pelo mesmo motivo da `busca_v9`.
 */
const CHAVE_BOOT = 'nr13_boot_v9';

/**
 * Fase 9 · 9F.1.4 — a tela `/inspecoes` pela projeção.
 *
 * FLAG POR TELA, como na 9C e na 9E: ligar uma não liga as outras, e o rollback
 * é desligar esta sem tocar em `busca_v9` nem em `boot_v9`.
 *
 * DEFAULT DESLIGADA, pelo mesmo motivo de sempre: organização sem a flag
 * continua na tela antiga, que funciona sem backfill nenhum.
 */
const CHAVE_INSPECOES = 'nr13_inspecoes_v9';

/**
 * Fase 9 · 9F.2.4 — a tela `/prontuarios` pela projeção.
 *
 * QUARTA flag por tela, mesma regra das outras três: ligar uma não liga as
 * demais, e o rollback é desligar esta sozinha.
 *
 * DEFAULT DESLIGADA. Aqui isso pesa mais que nas anteriores: com a flag ligada,
 * a tela deixa de hidratar a organização e o documento passa a depender da
 * semeadura sob demanda. Organização sem a flag continua na tela antiga, que
 * funciona sem backfill nenhum.
 */
const CHAVE_PRONTUARIOS = 'nr13_prontuarios_v9';

/**
 * Fase 9 · 9F.3.5 — a tela `/calibracoes` pela projeção.
 *
 * QUINTA flag por tela, mesma regra das outras quatro: ligar uma não liga as
 * demais, e o rollback é desligar esta sozinha.
 *
 * DEFAULT DESLIGADA. Com a flag ligada, a tela deixa de hidratar a organização
 * e o HISTÓRICO de calibrações do equipamento passa a depender da semeadura sob
 * demanda. Organização sem a flag continua na tela antiga, que funciona sem
 * backfill nenhum.
 */
const CHAVE_CALIBRACOES = 'nr13_calibracoes_v9';

/**
 * MEMOIZADA de propósito: qual implementação está ativa é decisão de SESSÃO,
 * tomada no login. Reler o `localStorage` a cada chamada deixaria o caminho
 * trocar no meio da sessão se algo limpasse o storage — e a v2, que não guarda
 * dado lá, passaria a despachar para a v1, que mostraria a conta VAZIA. É
 * justamente o sumiço que este projeto conserta.
 */
let emMemoria: boolean | null = null;
let buscaEmMemoria: boolean | null = null;
let bootEmMemoria: boolean | null = null;
let inspecoesEmMemoria: boolean | null = null;
let prontuariosEmMemoria: boolean | null = null;
let calibracoesEmMemoria: boolean | null = null;

export function armazenamentoV2Ativo(): boolean {
  if (emMemoria !== null) return emMemoria;
  try {
    emMemoria = localStorage.getItem(CHAVE) === '1';
  } catch {
    emMemoria = false; // sem localStorage, o caminho seguro é o antigo
  }
  return emMemoria;
}

/** Gravada no login a partir do que o servidor informou para a organização. */
export function definirArmazenamentoV2(ativo: boolean): void {
  emMemoria = ativo;
  try {
    if (ativo) localStorage.setItem(CHAVE, '1');
    else localStorage.removeItem(CHAVE);
  } catch {
    // Falhar aqui só significa não persistir para a próxima sessão; a decisão
    // desta continua valendo em memória.
  }
}

/**
 * Memoizada pelo mesmo motivo da `armazenamentoV2Ativo`: qual caminho a tela
 * usa é decisão de SESSÃO. Trocar no meio faria a lista alternar entre duas
 * fontes com cursores diferentes, e o usuário veria itens repetirem ou sumirem
 * no meio da rolagem.
 */
export function buscaV9Ativa(): boolean {
  if (buscaEmMemoria !== null) return buscaEmMemoria;
  try {
    buscaEmMemoria = localStorage.getItem(CHAVE_BUSCA) === '1';
  } catch {
    buscaEmMemoria = false;
  }
  return buscaEmMemoria;
}

/** Gravada no login a partir do que o servidor informou para a organização. */
export function definirBuscaV9(ativa: boolean): void {
  buscaEmMemoria = ativa;
  try {
    if (ativa) localStorage.setItem(CHAVE_BUSCA, '1');
    else localStorage.removeItem(CHAVE_BUSCA);
  } catch {
    // idem `definirArmazenamentoV2`: a decisão desta sessão continua valendo.
  }
}

/**
 * A tela nova de `/inspecoes` está ligada para esta organização?
 *
 * Memoizada como as outras: a fonte da lista é decisão de SESSÃO. Trocar no meio
 * faria a rolagem alternar entre duas fontes com cursores diferentes.
 */
export function inspecoesV9Ativa(): boolean {
  if (inspecoesEmMemoria !== null) return inspecoesEmMemoria;
  try {
    inspecoesEmMemoria = localStorage.getItem(CHAVE_INSPECOES) === '1';
  } catch {
    inspecoesEmMemoria = false;
  }
  return inspecoesEmMemoria;
}

/** Gravada no login a partir do que o servidor informou para a organização. */
export function definirInspecoesV9(ativa: boolean): void {
  inspecoesEmMemoria = ativa;
  try {
    if (ativa) localStorage.setItem(CHAVE_INSPECOES, '1');
    else localStorage.removeItem(CHAVE_INSPECOES);
  } catch {
    // idem `definirArmazenamentoV2`: a decisão desta sessão continua valendo.
  }
}

/**
 * A tela nova de `/prontuarios` está ligada para esta organização?
 *
 * Memoizada pela mesma razão das outras: qual tela responde é decisão de
 * SESSÃO, tomada no login.
 */
export function prontuariosV9Ativa(): boolean {
  if (prontuariosEmMemoria !== null) return prontuariosEmMemoria;
  try {
    prontuariosEmMemoria = localStorage.getItem(CHAVE_PRONTUARIOS) === '1';
  } catch {
    prontuariosEmMemoria = false;
  }
  return prontuariosEmMemoria;
}

/** Gravada no login a partir do que o servidor informou para a organização. */
export function definirProntuariosV9(ativa: boolean): void {
  prontuariosEmMemoria = ativa;
  try {
    if (ativa) localStorage.setItem(CHAVE_PRONTUARIOS, '1');
    else localStorage.removeItem(CHAVE_PRONTUARIOS);
  } catch {
    // idem `definirArmazenamentoV2`: a decisão desta sessão continua valendo.
  }
}

/**
 * A tela nova de `/calibracoes` está ligada para esta organização?
 *
 * Memoizada pela mesma razão das outras: qual tela responde é decisão de
 * SESSÃO, tomada no login.
 */
export function calibracoesV9Ativa(): boolean {
  if (calibracoesEmMemoria !== null) return calibracoesEmMemoria;
  try {
    calibracoesEmMemoria = localStorage.getItem(CHAVE_CALIBRACOES) === '1';
  } catch {
    calibracoesEmMemoria = false;
  }
  return calibracoesEmMemoria;
}

/** Gravada no login a partir do que o servidor informou para a organização. */
export function definirCalibracoesV9(ativa: boolean): void {
  calibracoesEmMemoria = ativa;
  try {
    if (ativa) localStorage.setItem(CHAVE_CALIBRACOES, '1');
    else localStorage.removeItem(CHAVE_CALIBRACOES);
  } catch {
    // idem `definirArmazenamentoV2`: a decisão desta sessão continua valendo.
  }
}

/**
 * O boot leve está ligado para esta organização?
 *
 * EXIGE A v2. `hidratarEssencial` e `carregarEquipamento` só existem lá; ligada
 * contra a v1, a primeira tela abriria com o cache vazio e concluiria "conta
 * sem equipamentos" — o sumiço que a v2 conserta. Conjunção aqui, e não no
 * servidor, porque quem sabe qual implementação este bundle usa é o bundle.
 */
export function bootV9Ativo(): boolean {
  if (!armazenamentoV2Ativo()) return false;
  if (bootEmMemoria !== null) return bootEmMemoria;
  try {
    bootEmMemoria = localStorage.getItem(CHAVE_BOOT) === '1';
  } catch {
    bootEmMemoria = false;
  }
  return bootEmMemoria;
}

/** Gravada no login a partir do que o servidor informou para a organização. */
export function definirBootV9(ativo: boolean): void {
  bootEmMemoria = ativo;
  try {
    if (ativo) localStorage.setItem(CHAVE_BOOT, '1');
    else localStorage.removeItem(CHAVE_BOOT);
  } catch {
    // idem `definirArmazenamentoV2`: a decisão desta sessão continua valendo.
  }
}

/** Descarta a decisão memoizada (troca de conta, e testes). */
export function zerarFlagEmMemoria(): void {
  emMemoria = null;
  buscaEmMemoria = null;
  bootEmMemoria = null;
  inspecoesEmMemoria = null;
  prontuariosEmMemoria = null;
  calibracoesEmMemoria = null;
}

/**
 * Pergunta ao SERVIDOR qual implementação esta organização usa e grava a
 * resposta. É o elo que faltava: sem ele `org_sync.v2_ativa` podia estar ligada
 * no banco e o bundle continuar despachando para a v1 — foi exatamente o estado
 * da conta `cmam.caldeiras` entre 05/08 e 10/08/2026. Nesse estado a guarda
 * `trg_guardar_app_storage` recusa TODA escrita direta (`nr13_escrita_direta_
 * bloqueada`), a v1 empilha tudo em `nr13_fila_sync` e o usuário vê o sistema
 * "salvando" sem que nada chegue ao banco.
 *
 * Chamar SEMPRE antes do primeiro acesso ao armazenamento (é o que
 * `carregarPerfil` faz, logo após gravar `nr13_org_id`).
 *
 * Falha de rede NÃO troca de caminho: mantém o que já valia. Rebaixar para a v1
 * porque a consulta não respondeu levaria a tela a ler o `localStorage` vazio da
 * v2 e concluir "conta sem equipamentos" — o sumiço que este código combate.
 */
export async function sincronizarFlagDoServidor(): Promise<boolean> {
  try {
    const escopo = await escopoStorageAtual();
    if (!escopo) return armazenamentoV2Ativo();
    const { data, error } = await supabase
      .from('org_sync')
      // TODAS as flags saem na MESMA consulta — nenhum round-trip novo no boot.
      .select('v2_ativa, busca_v9, boot_v9, inspecoes_v9, prontuarios_v9, calibracoes_v9')
      .eq('org_id', escopo.id)
      .maybeSingle();
    // Erro pode ser offline OU banco sem a migração armazenamento_v2.sql. Nos
    // dois casos o valor conhecido continua valendo.
    //
    // O recuo é em DEGRAUS, e desce um de cada vez. Pular direto para a
    // consulta mais antiga faria o banco que tem `busca_v9` mas ainda não tem
    // `boot_v9` — o estado da produção quando a 9D foi escrita — perder a
    // busca no boot seguinte: uma flag desligando a outra, sem ninguém pedir.
    if (error) return await sincronizarSemColunaCalibracoes(escopo.id);

    // AUSÊNCIA DE LINHA = ORGANIZAÇÃO NOVA = v2 (11/08/2026).
    //
    // A coluna nasceu `default false` e a ativação de 10/08 foi um tiro único
    // sobre as 27 organizações que existiam naquele dia. Toda conta criada
    // depois — todo trial, todo cliente novo — vinha sem linha e caía na v1:
    // `localStorage` como banco, teto de 5 MB da origem inteira, e o sumiço de
    // equipamentos de volta assim que a conta crescesse.
    //
    // Consulta que RESPONDE (sem `error`) e não traz linha é organização que
    // nunca passou por `definir_v2_org` — nova. Rollback deliberado grava a
    // linha com `false` e continua sendo respeitado logo abaixo.
    //
    // Por que errar para o lado da v2 é o lado barato: `aplicar_mutacao_storage`
    // NUNCA consulta `v2_ativa` (só cobra papel, prazo e assinatura), então uma
    // org que o servidor ainda considera v1 grava normalmente pela RPC. O erro
    // inverso é o que custou uma semana no `cmam`: bundle na v1 contra servidor
    // em v2, escrita direta recusada em silêncio e a conta aparecendo vazia.
    const linha = data as
      | {
          v2_ativa?: boolean;
          busca_v9?: boolean;
          boot_v9?: boolean;
          inspecoes_v9?: boolean;
          prontuarios_v9?: boolean;
          calibracoes_v9?: boolean;
        }
      | null;
    definirArmazenamentoV2(linha ? linha.v2_ativa === true : true);

    // A busca v9 NÃO herda a regra "sem linha = ligada". Org nova nasce com o
    // caminho antigo, que funciona sem backfill nenhum; ligar é ato explícito.
    definirBuscaV9(linha?.busca_v9 === true);
    // O boot leve idem, e com mais razão: ele alcança toda tela que lê do cache
    // completo.
    definirBootV9(linha?.boot_v9 === true);
    // 9F.1.4 · a tela de inspeções segue a mesma regra: ligar é ato explícito.
    definirInspecoesV9(linha?.inspecoes_v9 === true);
    // 9F.2.4 · idem para a tela de prontuários.
    definirProntuariosV9(linha?.prontuarios_v9 === true);
    // 9F.3.5 · idem para a tela de calibracoes.
    definirCalibracoesV9(linha?.calibracoes_v9 === true);
    return armazenamentoV2Ativo();
  } catch {
    return armazenamentoV2Ativo();
  }
}

/**
 * Recuo para banco SEM a migração `busca_v9_flag.sql`.
 *
 * ESTA FUNÇÃO EXISTE POR CAUSA DE UM BUG CONHECIDO, não por precaução: se a
 * consulta combinada falhar porque a coluna `busca_v9` não existe e nós
 * desistíssemos ali, a `v2_ativa` deixaria de ser sincronizada — que é
 * exatamente o estado que custou uma semana na conta `cmam.caldeiras` (bundle
 * na v1 contra servidor em v2, escrita recusada em silêncio, conta vazia).
 *
 * Então: erro na consulta combinada não desiste — repete pedindo só a coluna
 * antiga. A busca v9 fica DESLIGADA, que é o lado barato.
 */
/**
 * Primeiro degrau do recuo: banco SEM a coluna `boot_v9` (9D ainda não
 * aplicada), mas COM a `busca_v9`. Só o boot leve fica desligado.
 */
/**
 * Degrau NOVO (9F.1.4): banco sem a coluna `inspecoes_v9`, mas com as duas que
 * já estão em produção. Só a tela de inspeções fica desligada.
 *
 * Este é o estado do banco no instante entre publicar o bundle e aplicar o SQL —
 * ou seja, o estado NORMAL de todo deploy. Sem este degrau, o primeiro boot
 * depois da publicação apagaria `busca_v9` e `boot_v9` de quem as tem ligadas.
 */
/**
 * Degrau NOVO (9F.2.4): banco sem a coluna `prontuarios_v9`, mas com as três que
 * já estão em produção. Só a tela de prontuários fica desligada.
 *
 * Mesma razão do degrau da 9F.1.4, um nível acima: é o estado do banco entre
 * publicar o bundle e aplicar o SQL. Sem ele, o primeiro boot depois da
 * publicação apagaria `busca_v9`, `boot_v9` e `inspecoes_v9` de quem as tem
 * ligadas.
 */
/**
 * Degrau NOVO (9F.3.5): banco sem a coluna `calibracoes_v9`, mas com as quatro
 * que já estão em produção. Só a tela de calibrações fica desligada.
 *
 * Mesma razão dos degraus da 9F.1.4 e da 9F.2.4, um nível acima: é o estado do
 * banco entre publicar o bundle e aplicar o SQL — ou seja, o estado NORMAL de
 * todo deploy. Sem ele, o primeiro boot depois da publicação apagaria
 * `busca_v9`, `boot_v9`, `inspecoes_v9` e `prontuarios_v9` de quem as tem
 * ligadas: uma flag desligando as outras, sem ninguém pedir.
 */
async function sincronizarSemColunaCalibracoes(orgId: string): Promise<boolean> {
  definirCalibracoesV9(false);
  try {
    const { data, error } = await supabase
      .from('org_sync')
      .select('v2_ativa, busca_v9, boot_v9, inspecoes_v9, prontuarios_v9')
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) return await sincronizarSemColunaProntuarios(orgId);
    const linha = data as
      | {
          v2_ativa?: boolean;
          busca_v9?: boolean;
          boot_v9?: boolean;
          inspecoes_v9?: boolean;
          prontuarios_v9?: boolean;
        }
      | null;
    definirArmazenamentoV2(linha ? linha.v2_ativa === true : true);
    definirBuscaV9(linha?.busca_v9 === true);
    definirBootV9(linha?.boot_v9 === true);
    definirInspecoesV9(linha?.inspecoes_v9 === true);
    definirProntuariosV9(linha?.prontuarios_v9 === true);
    return armazenamentoV2Ativo();
  } catch {
    return armazenamentoV2Ativo();
  }
}

async function sincronizarSemColunaProntuarios(orgId: string): Promise<boolean> {
  definirProntuariosV9(false);
  try {
    const { data, error } = await supabase
      .from('org_sync')
      .select('v2_ativa, busca_v9, boot_v9, inspecoes_v9')
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) return await sincronizarSemColunaInspecoes(orgId);
    const linha = data as
      | { v2_ativa?: boolean; busca_v9?: boolean; boot_v9?: boolean; inspecoes_v9?: boolean }
      | null;
    definirArmazenamentoV2(linha ? linha.v2_ativa === true : true);
    definirBuscaV9(linha?.busca_v9 === true);
    definirBootV9(linha?.boot_v9 === true);
    definirInspecoesV9(linha?.inspecoes_v9 === true);
    return armazenamentoV2Ativo();
  } catch {
    return armazenamentoV2Ativo();
  }
}

async function sincronizarSemColunaInspecoes(orgId: string): Promise<boolean> {
  definirInspecoesV9(false);
  try {
    const { data, error } = await supabase
      .from('org_sync')
      .select('v2_ativa, busca_v9, boot_v9')
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) return await sincronizarSemColunaBoot(orgId);
    const linha = data as { v2_ativa?: boolean; busca_v9?: boolean; boot_v9?: boolean } | null;
    definirArmazenamentoV2(linha ? linha.v2_ativa === true : true);
    definirBuscaV9(linha?.busca_v9 === true);
    definirBootV9(linha?.boot_v9 === true);
    return armazenamentoV2Ativo();
  } catch {
    return armazenamentoV2Ativo();
  }
}

async function sincronizarSemColunaBoot(orgId: string): Promise<boolean> {
  definirBootV9(false);
  try {
    const { data, error } = await supabase
      .from('org_sync')
      .select('v2_ativa, busca_v9')
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) return await sincronizarSemColunaBusca(orgId);
    const linha = data as { v2_ativa?: boolean; busca_v9?: boolean } | null;
    definirArmazenamentoV2(linha ? linha.v2_ativa === true : true);
    definirBuscaV9(linha?.busca_v9 === true);
    return armazenamentoV2Ativo();
  } catch {
    return armazenamentoV2Ativo();
  }
}

async function sincronizarSemColunaBusca(orgId: string): Promise<boolean> {
  definirBuscaV9(false);
  definirBootV9(false);
  try {
    const { data, error } = await supabase
      .from('org_sync')
      .select('v2_ativa')
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) return armazenamentoV2Ativo(); // aí sim é rede/tabela ausente
    const linha = data as { v2_ativa?: boolean } | null;
    definirArmazenamentoV2(linha ? linha.v2_ativa === true : true);
    return armazenamentoV2Ativo();
  } catch {
    return armazenamentoV2Ativo();
  }
}

export const CHAVE_FLAG_V2 = CHAVE;
export const CHAVE_FLAG_BUSCA_V9 = CHAVE_BUSCA;
