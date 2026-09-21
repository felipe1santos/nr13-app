import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { mensagemDeErroEdge } from '../services/edgeErro';
import { logout } from '../services/auth';
import { camposAssinaturaAdmin, COLUNAS_ASSINATURA } from '../features/assinatura/maquinaEstados';
import BotaoInstalarPWA from '../app/BotaoInstalarPWA';
import type { UsoStats, StorageStats } from './adminMetricas';
import {
  MENSALIDADE_PADRAO,
  calcularFaturamento,
  fmtBRL,
  serieDiaria,
  type PontoSerie,
} from '../features/admin/painelAdmin';
import PainelVisaoGeral from '../features/admin/PainelVisaoGeral';
import PainelClientes, { type ContaCliente } from '../features/admin/PainelClientes';
import ModalNovoCliente, { type DadosNovoCliente } from '../features/admin/ModalNovoCliente';
import ModalEditarCliente from '../features/admin/ModalEditarCliente';
import {
  tagDaConta,
  somarMensalidades,
  ROTULO_TAG,
  type TagConta,
} from '../features/admin/classificarConta';
import { gravarTema, lerTema, proximoTema, type TemaAdmin } from '../features/admin/temaAdmin';
import { lerInfra, type InfraSupabase } from '../features/admin/infraSupabase';
import './admin.css';
// DEPOIS do admin.css de propósito: o tema escuro sobrescreve as cores claras
// daquele arquivo, e em empate de especificidade quem vem por último vence.
import './admin-tema.css';
/** Abas do painel. As duas primeiras são leitura; as outras, gestão de contas. */
type Aba = 'visao' | 'faturamento' | 'clientes' | 'trial' | 'acessos' | 'leads';
/** Uma linha de `admin_series_uso()` — ver `supabase/admin_series.sql`. */
interface LinhaSerieUso {
  dia: string;
  relatorios: number;
  equipamentos: number;
  inspecoes: number;
  fotos: number;
}
interface Profile {
  id: string;
  email: string | null;
  plano: string | null;
  ativo: boolean;
  role: string;
  acesso_expira_em: string | null;
  criado_em: string | null;
  aprovado_em: string | null;
  aprovado_por: string | null;
  // Controle de acesso multi-papel (null/'' = conta pagante pré-migração ou mestre)
  papel?: string | null;
  org_id?: string | null;
  // Cadastro automático de trial (trial_setup.sql; ausentes antes da migração)
  origem_cadastro?: string | null;
  trial_fim?: string | null;
  nome?: string | null;
  telefone?: string | null;
  empresa_nome?: string | null;
  // Assinatura Kiwify (assinatura_setup.sql; ausentes antes da migração — select('*') simplesmente
  // não traz as colunas, e o rótulo/badge tratam null como 'trial', ver rotuloStatusAssinatura).
  assinatura_status?: string | null;
  assinatura_ate?: string | null;
  // Painel de clientes (painel_clientes.sql; ausentes antes da migração — a
  // tag cai na dedução e a mensalidade, no valor padrão).
  classificacao?: string | null;
  valor_mensal?: number | null;
  kiwify_email?: string | null;
  kiwify_subscription_id?: string | null;
}
interface LoginEvent {
  user_id: string;
  tipo: string; // 'login' | 'logout'
  sessao_id: string | null;
  criado_em: string;
}
interface AuthMeta {
  id: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}
interface Metricas {
  sessoesHoje: number;
  sessoesTotal: number;
  duracaoMediaMin: number | null;
}
// Métricas de uso e de armazenamento. Os tipos e as funções puras moram em
// `adminMetricas.ts`, que é onde o contrato com o SQL é testado.
function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}
function fmtSomenteData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}
function ehHoje(iso: string): boolean {
  const d = new Date(iso);
  const h = new Date();
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
}
// Dias restantes do acesso (null = sem expiração; negativo = expirado).
function diasRestantes(acessoExpiraEm: string | null): number | null {
  if (!acessoExpiraEm) return null;
  const d = new Date(acessoExpiraEm);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}
// Calcula métricas de uso por usuário a partir dos eventos login/logout.
function calcularMetricas(eventos: LoginEvent[]): Map<string, Metricas> {
  const porUsuario = new Map<string, LoginEvent[]>();
  for (const e of eventos) {
    const arr = porUsuario.get(e.user_id) ?? [];
    arr.push(e);
    porUsuario.set(e.user_id, arr);
  }
  const out = new Map<string, Metricas>();
  for (const [userId, evs] of porUsuario) {
    const logins = evs.filter((e) => e.tipo === 'login');
    const sessoesHoje = logins.filter((e) => ehHoje(e.criado_em)).length;
    const sessoesTotal = logins.length;
    // Duração média: pareia login/logout por sessao_id.
    const duracoes: number[] = [];
    const porSessao = new Map<string, { login?: string; logout?: string }>();
    for (const e of evs) {
      if (!e.sessao_id) continue;
      const s = porSessao.get(e.sessao_id) ?? {};
      if (e.tipo === 'login') s.login = e.criado_em;
      if (e.tipo === 'logout') s.logout = e.criado_em;
      porSessao.set(e.sessao_id, s);
    }
    for (const s of porSessao.values()) {
      if (s.login && s.logout) {
        const ms = new Date(s.logout).getTime() - new Date(s.login).getTime();
        if (ms > 0) duracoes.push(ms);
      }
    }
    const duracaoMediaMin =
      duracoes.length > 0
        ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length / 60000)
        : null;
    out.set(userId, { sessoesHoje, sessoesTotal, duracaoMediaMin });
  }
  return out;
}
/**
 * Cliente pagante = conta que o dono do produto LIBEROU e que segue valendo.
 *
 * Não dá para deduzir isso de um campo de cobrança: em 11/08/2026 nenhuma conta
 * tinha `kiwify_subscription_id`, e o `plano` da maioria é o valor legado
 * 'demonstracao' — a `cmam.caldeiras`, cliente real, tem exatamente os mesmos
 * campos de várias contas de teste do próprio dono. O que separa, na prática, é
 * o ato de liberar: sair de `plano = 'trial'` e continuar ativo, sem prazo
 * vencido.
 *
 * Conta de teste que foi convertida cai aqui naturalmente, porque "Liberar
 * acesso completo" grava `plano = 'completo'` — é o caso do
 * `engyuricesar@gmail.com`, que veio de `origem_cadastro = 'trial'`.
 */
export function ehPagante(p: Profile): boolean {
  if (!p.ativo) return false;
  if (p.plano === 'trial') return false;
  const venceu = p.acesso_expira_em && new Date(p.acesso_expira_em).getTime() < Date.now();
  return !venceu;
}
function statusUsuario(p: Profile): { label: string; cls: string } {
  const trial = p.origem_cadastro === 'trial';
  if (!p.ativo) return { label: 'Pendente', cls: 'pendente' };
  if (p.acesso_expira_em && new Date(p.acesso_expira_em).getTime() < Date.now())
    return { label: trial && p.plano === 'trial' ? 'Trial expirado' : 'Expirado', cls: 'expirado' };
  if (trial && p.plano !== 'trial') return { label: 'Convertido', cls: 'ativo' };
  if (p.plano === 'trial') return { label: 'Trial ativo', cls: 'ativo' };
  return { label: 'Ativo', cls: 'ativo' };
}
export default function Admin() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [eventos, setEventos] = useState<LoginEvent[]>([]);
  const [metas, setMetas] = useState<Map<string, AuthMeta>>(new Map());
  const [uso, setUso] = useState<Map<string, UsoStats>>(new Map());
  const [storage, setStorage] = useState<Map<string, StorageStats>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [modalNovo, setModalNovo] = useState(false);
  /** A conta aberta no modal de edição — a lista em si é só leitura. */
  const [editando, setEditando] = useState<ContaCliente | null>(null);
  // Menu "Ações": posição fixa (viewport) para não ser cortado pelo overflow da tabela.
  const [superAberto, setSuperAberto] = useState(false);
  const [aba, setAba] = useState<Aba>('visao');
  // Tema do painel. Inicializado do localStorage no primeiro render (e não num
  // efeito) para a tela não nascer escura e piscar para clara em quem escolheu
  // o claro.
  const [tema, setTema] = useState<TemaAdmin>(() => lerTema());
  // Janela dos gráficos, em dias. 30 é o padrão do painel do Supabase e o
  // período que casa com o ciclo de cobrança.
  const [janela, setJanela] = useState<7 | 30 | 90>(30);
  // Infra do projeto Supabase (egress/requisições/CPU). `null` = a Edge
  // `admin_infra` não está publicada ou sem token — a faixa mostra "—" com a
  // instrução, e nada mais da tela depende disso.
  const [infra, setInfra] = useState<InfraSupabase | null>(null);
  // Série diária de atividade (admin_series_uso). `null` = admin_series.sql
  // ainda não rodou neste ambiente.
  const [serieUso, setSerieUso] = useState<LinhaSerieUso[] | null>(null);
  // Leads do trial: seleção + compositor de e-mail
  // Leads importados (tabela leads_importados; null = leads_setup.sql não rodou)
  // Eventos Kiwify sem conta vinculada (tabela kiwify_eventos; null = assinatura_setup.sql não
  // rodou — a seção fica escondida em vez de quebrar a página).
  // Usuário escolhido no <select> de cada linha de evento órfão, por id do evento.
  const superRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const emailLogado = (localStorage.getItem('nr13_usuario_logado') ?? '').toLowerCase();
  async function sair() {
    await logout();
    navigate('/login');
  }
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [resProfiles, resEventos] = await Promise.all([
        supabase.from('profiles').select('*').order('criado_em', { ascending: false }),
        supabase.from('login_events').select('user_id, tipo, sessao_id, criado_em'),
      ]);
      if (resProfiles.error) throw resProfiles.error;
      setProfiles((resProfiles.data as Profile[]) ?? []);
      setEventos((resEventos.data as LoginEvent[]) ?? []);
      // Metadados do Auth (último login real, e-mail confirmado) via Edge Function.
      const { data: metaData, error: metaErr } = await supabase.functions.invoke('admin', {
        body: { action: 'auth_meta' },
      });
      if (!metaErr && metaData?.metas) {
        const m = new Map<string, AuthMeta>();
        for (const meta of metaData.metas as AuthMeta[]) m.set(meta.id, meta);
        setMetas(m);
      }
      // Métricas de uso (equipamentos/inspeções/relatórios/PDF/sub-logins) via RPC.
      // Antes de rodar supabase/admin_stats.sql a função não existe: colunas ficam "—".
      const { data: usoData, error: usoErr } = await supabase.rpc('admin_usage_stats');
      if (!usoErr && Array.isArray(usoData)) {
        const m = new Map<string, UsoStats>();
        for (const s of usoData as UsoStats[]) m.set(s.escopo, s);
        setUso(m);
      }
      // Peso do BUCKET por organização. Função separada porque lê
      // `storage.objects`, que é outro schema — e porque uma delas pode existir
      // sem a outra durante o deploy. Ausente = a seção de armazenamento não
      // aparece; o resto da tela não depende dela.
      const { data: stData, error: stErr } = await supabase.rpc('admin_storage_stats');
      if (!stErr && Array.isArray(stData)) {
        const m = new Map<string, StorageStats>();
        for (const s of stData as StorageStats[]) m.set(s.escopo, s);
        setStorage(m);
      }
      // Série diária de atividade para os gráficos. Antes de rodar
      // supabase/admin_series.sql a função não existe: os gráficos que dependem
      // dela mostram "sem dados" e os que vêm de login_events seguem normais.
      const { data: serieData, error: serieErr } = await supabase.rpc('admin_series_uso', {
        dias: 90,
      });
      setSerieUso(serieErr || !Array.isArray(serieData) ? null : (serieData as LinhaSerieUso[]));
      // Infra do projeto (egress, requisições, CPU/RAM) via Edge `admin_infra`.
      // Nunca lança e nunca bloqueia: sem a função publicada, devolve null.
      setInfra(await lerInfra());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar dados.');
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    // carregar() liga o spinner e busca os dados no mount; setState aqui é intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);
  // Fecha o painel do superadmin ao clicar fora.
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (superRef.current && !superRef.current.contains(e.target as Node)) setSuperAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);
  const metricas = useMemo(() => calcularMetricas(eventos), [eventos]);
  // Superadmin (a conta logada, role admin) sai da lista — os dados dela ficam
  // no canto superior.
  const meuPerfil = useMemo(
    () => profiles.find((p) => (p.email ?? '').toLowerCase() === emailLogado) ?? null,
    [profiles, emailLogado],
  );
  /** Os números do topo da Visão geral. */
  const resumo = useMemo(() => {
    const visiveis = profiles.filter((p) => p.role !== 'admin' && (!p.papel || p.papel === 'mestre'));
    const total = visiveis.length;
    const pendentes = visiveis.filter((p) => !p.ativo).length;
    const vencendo = visiveis.filter((p) => {
      const d = diasRestantes(p.acesso_expira_em);
      return d !== null && d >= 0 && d <= 30;
    }).length;
    const ativosHoje = new Set(
      eventos.filter((e) => e.tipo === 'login' && ehHoje(e.criado_em)).map((e) => e.user_id),
    ).size;
    return { total, pendentes, ativosHoje, vencendo };
  }, [profiles, eventos]);
  /**
   * Os três baldes do faturamento, pela TAG de cada conta.
   *
   * 'suspenso' fica de fora de propósito: bloqueado, vencido ou em teste não
   * diz nada sobre receita.
   */
  const contas = useMemo(() => {
    const mestres = profiles.filter((p) => !p.papel || p.papel === 'mestre');
    const pagantes: Profile[] = [];
    const cortesia: Profile[] = [];
    const internas: Profile[] = [];
    for (const p of mestres) {
      const tag = tagDaConta(p);
      if (tag === 'pagante') pagantes.push(p);
      else if (tag === 'vitalicio') cortesia.push(p);
      else if (tag === 'interna') internas.push(p);
    }
    return { pagantes, cortesia, internas };
  }, [profiles]);
  const assinantes = contas.pagantes;
  /**
   * O MRR é a SOMA das mensalidades de cada pagante, não pagantes × valor
   * único: com preços diferentes por cliente, o número antigo não era o
   * faturamento de ninguém. Quem está sem valor informado entra pelo padrão —
   * zerar em silêncio encolheria a receita sem ninguém mexer em preço.
   */
  const faturamento = useMemo(() => {
    const { mrr } = somarMensalidades(assinantes, MENSALIDADE_PADRAO);
    const base = calcularFaturamento(assinantes.length, MENSALIDADE_PADRAO);
    return { ...base, mrr, anual: mrr * 12 };
  }, [assinantes]);
  /**
   * Séries dos gráficos.
   *
   * Duas fontes, e a diferença importa na leitura:
   *  · `login_events` e `profiles.criado_em` têm carimbo de tempo REAL de quando
   *    o fato aconteceu — acesso e cadastro são exatos.
   *  · `admin_series_uso` agrupa por `app_storage.atualizado_em`, que é
   *    ATIVIDADE na chave, não criação (ver o cabeçalho do admin_series.sql).
   * Os rótulos na tela dizem qual é qual; trocar um pelo outro faria "vasos
   * criados" contar edição de ficha antiga.
   */
  const series = useMemo(() => {
    const agora = new Date();
    const acessos = serieDiaria(
      eventos.filter((e) => e.tipo === 'login').map((e) => e.criado_em),
      janela,
      agora,
    );
    const cadastros = serieDiaria(
      profiles.filter((p) => p.role !== 'admin').map((p) => p.criado_em),
      janela,
      agora,
    );
    // A RPC devolve um dia por linha; expandir para uma lista de "eventos" e
    // reusar `serieDiaria` mantém UM único lugar que preenche dia vazio com
    // zero — duas implementações de calendário divergiriam na virada do mês.
    const doBanco = (campo: keyof Omit<LinhaSerieUso, 'dia'>): PontoSerie[] => {
      const porDia = new Map<string, number>();
      for (const l of serieUso ?? []) porDia.set(l.dia, (porDia.get(l.dia) ?? 0) + (l[campo] ?? 0));
      const vazio = serieDiaria([], janela, agora);
      return vazio.map((p) => ({ dia: p.dia, valor: porDia.get(p.dia) ?? 0 }));
    };
    return {
      acessos,
      cadastros,
      relatorios: doBanco('relatorios'),
      equipamentos: doBanco('equipamentos'),
      inspecoes: doBanco('inspecoes'),
      requisicoes: infra?.serieRequisicoes ?? null,
    };
  }, [eventos, profiles, serieUso, janela, infra]);
  /** Totais do parque, para os cartões de status no alto da Visão Geral. */
  const totais = useMemo(() => {
    let banco = 0;
    let base64 = 0;
    let equipamentos = 0;
    let relatorios = 0;
    for (const u of uso.values()) {
      banco += u.bytes_total ?? 0;
      base64 += u.bytes_base64 ?? 0;
      equipamentos += (u.equip_vaso ?? 0) + (u.equip_caldeira ?? 0) + (u.equip_autoclave ?? 0);
      relatorios += u.relatorios ?? 0;
    }
    let bucket = 0;
    let arquivos = 0;
    for (const s of storage.values()) {
      bucket += s.bytes ?? 0;
      arquivos += s.arquivos ?? 0;
    }
    return { banco, bucket, base64, equipamentos, relatorios, arquivos };
  }, [uso, storage]);
  /**
   * Cria a conta a partir do MODAL (21/09/2026).
   *
   * Grava de uma vez a TAG e a MENSALIDADE: antes o cliente nascia sem as duas
   * e alguém precisava lembrar de voltar na lista — e enquanto não voltasse,
   * ele não entrava no MRR.
   */
  async function criarUsuario(d: DadosNovoCliente) {
    const email = d.email.trim().toLowerCase();
    const dias = parseInt(d.dias, 10);
    if (!email || d.senha.length < 6) {
      setErro('Informe e-mail e senha de no mínimo 6 caracteres.');
      return;
    }
    setCriando(true);
    setErro(null);
    setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'create_user', email, senha: d.senha, liberar: true },
      });
      const falha = await mensagemDeErroEdge(error, data, 'criação da conta');
      if (falha) throw new Error(falha);
      // Dias de acesso, tag e mensalidade — tudo na mesma criação.
      if (data?.id) {
        const patch: Record<string, unknown> = { classificacao: d.tag };
        if (!isNaN(dias) && dias > 0) {
          const expira = new Date();
          expira.setDate(expira.getDate() + dias);
          expira.setHours(23, 59, 59, 0);
          patch.acesso_expira_em = expira.toISOString();
        }
        const valor = Number(String(d.valorMensal).replace(',', '.'));
        if (d.tag === 'pagante' && Number.isFinite(valor) && valor > 0) patch.valor_mensal = valor;
        await supabase.from('profiles').update(patch).eq('id', data.id);
      }
      setAviso(
        !isNaN(dias) && dias > 0
          ? `Usuário ${email} criado com ${dias} dias de acesso.`
          : `Usuário ${email} criado e liberado (sem expiração).`,
      );
      setModalNovo(false);
      await carregar();
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Falha ao criar usuário.');
    } finally {
      setCriando(false);
    }
  }
  /**
   * As contas que a aba de Clientes lista.
   *
   * Mestres (sub-login é acesso dentro da organização do cliente, não um
   * cliente) e sem quem nunca saiu do trial. A TAG vem calculada daqui, para o
   * painel não precisar conhecer a regra.
   */
  const contasCliente = useMemo<ContaCliente[]>(
    () =>
      profiles
        .filter((p) => (!p.papel || p.papel === 'mestre') && p.role !== 'admin' && p.plano !== 'trial')
        .map((p) => ({
          id: p.id,
          email: p.email,
          criado_em: p.criado_em,
          ativo: p.ativo,
          assinatura_status: p.assinatura_status,
          acesso_expira_em: p.acesso_expira_em,
          classificacao: p.classificacao,
          valor_mensal: p.valor_mensal,
          tag: tagDaConta(p),
        }))
        .sort(
          (a, b) =>
            (uso.get(b.id)?.relatorios ?? 0) - (uso.get(a.id)?.relatorios ?? 0) ||
            (a.email ?? '').localeCompare(b.email ?? ''),
        ),
    [profiles, uso],
  );
  /** A linha da tabela de volta ao perfil — as ações trabalham com o perfil. */
  function perfilDe(c: ContaCliente): Profile {
    const achado = profiles.find((p) => p.id === c.id);
    if (achado) return achado;
    // Não acontece na prática (a lista sai de `profiles`); o recuo evita um
    // `!` que esconderia uma dessincronia entre os dois.
    return {
      id: c.id,
      email: c.email,
      plano: null,
      ativo: c.ativo,
      role: 'user',
      acesso_expira_em: c.acesso_expira_em ?? null,
      criado_em: c.criado_em,
      aprovado_em: null,
      aprovado_por: null,
    };
  }
  /**
   * Grava TAG e MENSALIDADE de uma vez, a partir do modal de edição.
   *
   * Num `update` só: em duas chamadas, uma falha na segunda deixaria a conta
   * com a classificação nova e o valor velho — e ninguém veria, porque a
   * primeira teria dado certo.
   *
   * Nenhuma coluna de ACESSO é tocada aqui. Tag é rótulo de painel; mexer em
   * `plano`/`ativo`/validade para gravar um rótulo poderia derrubar o acesso
   * de um cliente pagante.
   */
  async function salvarClassificacao(p: Profile, tag: TagConta, bruto: string) {
    const texto = bruto.trim().replace(',', '.');
    const n = texto === '' ? null : Number(texto);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setErro('Valor inválido. Use apenas números, como 197 ou 149.90.');
      return;
    }
    const patch: Partial<Profile> = { classificacao: tag } as Partial<Profile>;
    // Só quem paga tem mensalidade: manter o valor numa conta que virou
    // vitalícia deixaria um número pronto para voltar ao MRR sem querer.
    (patch as Record<string, unknown>).valor_mensal = tag === 'pagante' ? n : null;
    await atualizarPerfil(
      p.id,
      patch,
      `${p.email}: ${ROTULO_TAG[tag]}${tag === 'pagante' && n !== null ? ` · ${fmtBRL(n)}/mês` : ''}.`,
    );
  }
  // ---- Ações ----
  async function atualizarPerfil(id: string, patch: Partial<Profile>, msg: string) {
    setAcaoEmAndamento(id);
    setErro(null);
    setAviso(null);
    try {
      let aplicado = patch;
      const { error } = await supabase.from('profiles').update(patch).eq('id', id);
      if (error) {
        // Banco ainda sem assinatura_setup.sql: as colunas de assinatura não existem e o
        // PostgREST recusa o update inteiro. Reenvia só as colunas legadas — nesse banco elas
        // ainda são as que valem — em vez de deixar o admin sem conseguir liberar ninguém.
        const semAssinatura = Object.fromEntries(
          Object.entries(patch).filter(([k]) => !COLUNAS_ASSINATURA.includes(k as never)),
        ) as Partial<Profile>;
        const mudou = Object.keys(semAssinatura).length !== Object.keys(patch).length;
        if (!mudou) throw error;
        const { error: erroLegado } = await supabase.from('profiles').update(semAssinatura).eq('id', id);
        if (erroLegado) throw error;
        aplicado = semAssinatura;
      }
      setProfiles((ps) => ps.map((p) => (p.id === id ? { ...p, ...aplicado } : p)));
      setAviso(msg);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha na ação.');
    } finally {
      setAcaoEmAndamento(null);
    }
  }
  function liberar(p: Profile) {
    void atualizarPerfil(
      p.id,
      {
        ativo: true,
        aprovado_em: new Date().toISOString(),
        aprovado_por: localStorage.getItem('nr13_usuario_logado') ?? 'admin',
        // Conta de teste liberada manualmente = convertida em assinante (sai dos bloqueios do trial).
        ...(p.plano === 'trial' ? { plano: 'completo' } : {}),
        // I1: sem isto, a conta liberada loga e não consegue salvar nada (a RLS olha o status
        // da assinatura). A validade da assinatura acompanha a validade legada da conta.
        ...camposAssinaturaAdmin(p.acesso_expira_em),
      },
      `Acesso liberado para ${p.email}.`,
    );
  }
  function bloquear(p: Profile) {
    void atualizarPerfil(p.id, { ativo: false }, `Acesso bloqueado para ${p.email}.`);
  }
  // Validade em DIAS a partir de hoje (vazio = remove a expiração).
  function definirValidade(p: Profile) {
    const atual = diasRestantes(p.acesso_expira_em);
    const entrada = window.prompt(
      `Quantos DIAS de acesso ${p.email} deve ter a partir de hoje?\n(vazio = acesso sem expiração)`,
      atual !== null && atual > 0 ? String(atual) : '',
    );
    if (entrada === null) return;
    const valor = entrada.trim();
    if (valor === '') {
      void atualizarPerfil(
        p.id,
        { acesso_expira_em: null, ...camposAssinaturaAdmin(null) },
        'Expiração removida.',
      );
      return;
    }
    const dias = parseInt(valor, 10);
    if (isNaN(dias) || dias <= 0) {
      setErro('Informe um número de dias válido (maior que zero).');
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setHours(23, 59, 59, 0);
    void atualizarPerfil(
      p.id,
      { acesso_expira_em: d.toISOString(), ...camposAssinaturaAdmin(d.toISOString()) },
      `Acesso de ${p.email} válido por ${dias} dias (até ${fmtSomenteData(d.toISOString())}).`,
    );
  }
  async function resetarSenha(p: Profile) {
    const nova = window.prompt(`Nova senha para ${p.email} (mín. 6 caracteres):`);
    if (nova === null) return;
    if (nova.length < 6) {
      setErro('Senha muito curta (mínimo 6).');
      return;
    }
    setAcaoEmAndamento(p.id);
    setErro(null);
    setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'reset_password', user_id: p.id, nova_senha: nova },
      });
      const falha = await mensagemDeErroEdge(error, data, 'troca de senha');
      if (falha) throw new Error(falha);
      setAviso(`Senha de ${p.email} redefinida.`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao resetar senha.');
    } finally {
      setAcaoEmAndamento(null);
    }
  }
  async function excluir(p: Profile) {
    if (
      !window.confirm(
        `EXCLUIR permanentemente ${p.email}?\n\nIsso apaga TUDO do usuário: conta, dados do sistema (equipamentos, inspeções, relatórios) e os sub-logins/acessos de portal criados por ele.\n\nEsta ação não pode ser desfeita.`,
      )
    )
      return;
    setAcaoEmAndamento(p.id);
    setErro(null);
    setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'delete_user', user_id: p.id },
      });
      const falha = await mensagemDeErroEdge(error, data, 'exclusão');
      if (falha) throw new Error(falha);
      setProfiles((ps) => ps.filter((x) => x.id !== p.id));
      setAviso(`Usuário ${p.email} excluído.`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao excluir.');
    } finally {
      setAcaoEmAndamento(null);
    }
  }
  const meuMeta = meuPerfil ? metas.get(meuPerfil.id) : undefined;
  const minhasMetricas = meuPerfil ? metricas.get(meuPerfil.id) : undefined;
  return (
    <div className="admin-standalone" data-tema={tema}>
      <header className="admin-topbar">
        <span className="admin-topbar-logo">NR-13 · Admin</span>
        <div className="admin-topbar-right">
          {/* Superadmin: dados só aqui (fora da tabela), com troca de senha e sem excluir */}
          <div className="admin-super" ref={superRef}>
            <button
              type="button"
              className="admin-super-btn"
              onClick={() => setSuperAberto((a) => !a)}
              title="Dados do superadmin"
            >
              <span className="admin-super-avatar">{emailLogado.slice(0, 2).toUpperCase()}</span>
              <span className="admin-super-email">{emailLogado}</span>
              <span className="admin-super-chev">▾</span>
            </button>
            {superAberto && (
              <div className="admin-super-panel">
                <div className="admin-super-panel-head">
                  <span className="admin-super-avatar grande">{emailLogado.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{emailLogado}</strong>
                    <span className="admin-super-papel">👑 Superadmin</span>
                  </div>
                </div>
                <div className="admin-super-dados">
                  <div><span>Status</span><strong>{meuPerfil ? statusUsuario(meuPerfil).label : '—'}</strong></div>
                  <div><span>Cadastro</span><strong>{fmtSomenteData(meuPerfil?.criado_em ?? null)}</strong></div>
                  <div><span>Último login</span><strong>{fmtData(meuMeta?.last_sign_in_at ?? null)}</strong></div>
                  <div><span>Sessões hoje</span><strong>{minhasMetricas?.sessoesHoje ?? 0}</strong></div>
                  <div><span>Sessões total</span><strong>{minhasMetricas?.sessoesTotal ?? 0}</strong></div>
                  <div><span>Expira em</span><strong>{meuPerfil?.acesso_expira_em ? fmtSomenteData(meuPerfil.acesso_expira_em) : 'Nunca'}</strong></div>
                </div>
                <button
                  type="button"
                  className="admin-super-trocar"
                  disabled={!meuPerfil}
                  onClick={() => {
                    setSuperAberto(false);
                    if (meuPerfil) void resetarSenha(meuPerfil);
                  }}
                >
                  Trocar minha senha
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="admin-tema-btn"
            title={tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
            aria-label={tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
            onClick={() => {
              const novo = proximoTema(tema);
              setTema(novo);
              gravarTema(novo);
            }}
          >
            {tema === 'escuro' ? '☀' : '☾'}
          </button>
          <BotaoInstalarPWA className="admin-instalar" />
          <button type="button" className="admin-topbar-sair" onClick={sair}>
            Sair
          </button>
        </div>
      </header>
      <div className="admin-page">
        <div className="admin-header">
          <h1>Painel de Administração</h1>
          <button type="button" className="admin-btn-refresh" onClick={carregar} disabled={carregando}>
            {carregando ? 'Carregando…' : '↻ Atualizar'}
          </button>
        </div>
      {/* Abas. As duas primeiras são leitura (dashboard e receita); as outras
          são gestão de conta e trazem junto os formulários e a busca. */}
      <div className="admin-abas">
        <button
          type="button"
          className={`admin-aba${aba === 'visao' ? ' ativa' : ''}`}
          onClick={() => setAba('visao')}
        >
          Visão geral
        </button>
        <button
          type="button"
          className={`admin-aba${aba !== 'visao' ? ' ativa' : ''}`}
          onClick={() => setAba('clientes')}
        >
          Clientes
        </button>
      </div>
      {erro && <p className="admin-erro">{erro}</p>}
      {aviso && <p className="admin-aviso">{aviso}</p>}
      {aba === 'visao' ? (
        <PainelVisaoGeral
          series={series}
          janela={janela}
          setJanela={setJanela}
          infra={infra}
          totais={totais}
          resumo={resumo}
          assinantes={assinantes.length}
          serieUsoAusente={serieUso === null}
        />
      ) : (
        <PainelClientes
          faturamento={faturamento}
          contas={contasCliente}
          uso={uso}
          storage={storage}
          metas={metas}
          metricas={metricas}
          ocupado={acaoEmAndamento}
          busca={busca}
          onBusca={setBusca}
          onEditar={(c) => setEditando(c)}
          onNovoCliente={() => setModalNovo(true)}
          infra={infra}
        />
      )}
      {uso.size === 0 && !carregando && (
        <p className="admin-nota">
          Métricas de uso (equipamentos, inspeções, relatórios…) exibem "—" até rodar
          <code> supabase/admin_stats.sql</code> no SQL Editor do Supabase.
        </p>
      )}
      {editando && (
        <ModalEditarCliente
          conta={editando}
          ocupado={acaoEmAndamento === editando.id}
          mensalidadePadrao={faturamento.mensalidade}
          onFechar={() => setEditando(null)}
          onSalvar={(tag, valor) => {
            const p = perfilDe(editando);
            // Tag e mensalidade saem numa gravação só: duas chamadas
            // deixariam a conta meio salva se a segunda falhasse.
            void salvarClassificacao(p, tag, valor).then(() => setEditando(null));
          }}
          onAlternarAcesso={() => {
            const p = perfilDe(editando);
            setEditando(null);
            if (p.ativo) bloquear(p);
            else liberar(p);
          }}
          onValidade={() => {
            const p = perfilDe(editando);
            setEditando(null);
            definirValidade(p);
          }}
          onExcluir={() => {
            const p = perfilDe(editando);
            setEditando(null);
            void excluir(p);
          }}
        />
      )}
      {modalNovo && (
        <ModalNovoCliente
          ocupado={criando}
          erro={erro}
          onFechar={() => setModalNovo(false)}
          onCriar={(d) => void criarUsuario(d)}
        />
      )}
      </div>
    </div>
  );
}
