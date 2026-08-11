import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { Icone } from '../components/Icone';
import { logout } from '../services/auth';
import { rotuloStatusAssinatura, rotuloEventoKiwify } from '../services/assinatura';
import {
  DIAS_CICLO,
  camposVinculoManual,
  camposAssinaturaAdmin,
  COLUNAS_ASSINATURA,
} from '../features/assinatura/maquinaEstados';
import BotaoInstalarPWA from '../app/BotaoInstalarPWA';
import ModalLeadForm from '../features/admin/ModalLeadForm';
import ModalImportarLeads from '../features/admin/ModalImportarLeads';
import {
  excluirLeadImportado,
  listarLeadsImportados,
  type LeadImportado,
} from '../services/leadsImportados';
import './admin.css';

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
  kiwify_email?: string | null;
  kiwify_subscription_id?: string | null;
}

// Evento de pagamento Kiwify sem `profile_id` (webhook não conseguiu casar com nenhuma conta —
// ex.: e-mail do checkout diferente do e-mail de cadastro). Vínculo manual pelo admin (Task 10).
interface EventoKiwifyOrfao {
  id: string;
  recebido_em: string;
  evento: string;
  email: string | null;
  subscription_id: string | null;
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

// Métricas de uso vindas da função SQL admin_usage_stats (supabase/admin_stats.sql).
interface UsoStats {
  escopo: string;
  equip_vaso: number;
  equip_caldeira: number;
  equip_autoclave: number;
  inspecoes: number;
  relatorios: number;
  pdf_gerados: number;
  impressoes: number;
  subusuarios: number;
}

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

// "Último acesso em ..." — fuso de São Paulo, horário AM/PM (pedido do dono do painel).
function fmtUltimoAcessoSP(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const data = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = d
    .toLocaleTimeString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();
  return `Último acesso em ${data}, ${hora}`;
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

// Espelho da formatação aplicada pela Edge Function no e-mail dos leads:
// **negrito**, ==marca-texto==, [texto](link), !img(url). Usado só no preview.
function previewEmailHtml(texto: string): string {
  return texto
    .replaceAll('{nome}', 'Fulano da Silva')
    .replaceAll('{empresa}', 'Empresa Exemplo')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/!img\((https?:[^\s)]+)\)/g, '<img src="$1" style="max-width:100%;border-radius:8px;margin:8px 0;display:block;" />')
    .replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, '<a href="$2" style="color:#0a5a6e;font-weight:bold;">$1</a>')
    .replace(/==([^=\n]+)==/g, '<mark style="background:#fde68a;padding:0 4px;border-radius:3px;">$1</mark>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .split('\n')
    .map((l) => `<p style="margin:0 0 10px;">${l || '&nbsp;'}</p>`)
    .join('');
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

// Linha unificada da aba Leads: lead do trial 48h (conta em profiles) ou lead
// importado/cadastrado manualmente (tabela leads_importados — sem conta de acesso).
interface LeadRow {
  id: string;
  tipo: 'trial' | 'importado';
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  origem: string;
  criadoEm: string | null;
  trialFim: string | null;
  profile?: Profile;
  imp?: LeadImportado;
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

function BadgeDias({ expiraEm }: { expiraEm: string | null }) {
  const dias = diasRestantes(expiraEm);
  if (dias === null) return <span className="admin-dias sem">—</span>;
  if (dias < 0) return <span className="admin-dias expirado">Expirado</span>;
  if (dias <= 30) return <span className="admin-dias critico">{dias} dia{dias === 1 ? '' : 's'}</span>;
  return <span className="admin-dias ok">{dias} dias</span>;
}

export default function Admin() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [eventos, setEventos] = useState<LoginEvent[]>([]);
  const [metas, setMetas] = useState<Map<string, AuthMeta>>(new Map());
  const [uso, setUso] = useState<Map<string, UsoStats>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null);
  const [novoEmail, setNovoEmail] = useState('');
  const [novaSenhaUser, setNovaSenhaUser] = useState('');
  const [novoDias, setNovoDias] = useState('');
  const [criando, setCriando] = useState(false);
  // Menu "Ações": posição fixa (viewport) para não ser cortado pelo overflow da tabela.
  const [menuAcoes, setMenuAcoes] = useState<{ id: string; x: number; y: number } | null>(null);
  const [superAberto, setSuperAberto] = useState(false);
  const [aba, setAba] = useState<'clientes' | 'trial' | 'acessos' | 'leads'>('clientes');
  // Flag global do cadastro automático de trial (config_global; null = migração não rodou)
  const [cadastroAuto, setCadastroAuto] = useState<boolean | null>(null);
  const [salvandoFlag, setSalvandoFlag] = useState(false);
  // Leads do trial: seleção + compositor de e-mail
  const [selLeads, setSelLeads] = useState<Set<string>>(new Set());
  // Leads importados (tabela leads_importados; null = leads_setup.sql não rodou)
  const [leadsImp, setLeadsImp] = useState<LeadImportado[] | null>(null);
  // Eventos Kiwify sem conta vinculada (tabela kiwify_eventos; null = assinatura_setup.sql não
  // rodou — a seção fica escondida em vez de quebrar a página).
  const [orfaos, setOrfaos] = useState<EventoKiwifyOrfao[] | null>(null);
  // Usuário escolhido no <select> de cada linha de evento órfão, por id do evento.
  const [selOrfao, setSelOrfao] = useState<Record<string, string>>({});
  const [filtroOrigem, setFiltroOrigem] = useState<'todos' | 'trial' | 'importado'>('todos');
  const [leadForm, setLeadForm] = useState<{ lead: LeadImportado | null } | null>(null);
  const [importarAberto, setImportarAberto] = useState(false);
  const [emailAberto, setEmailAberto] = useState(false);
  const [emAssunto, setEmAssunto] = useState('');
  const [emCorpo, setEmCorpo] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  // Envolve a seleção do textarea com marcadores de formatação (ou insere no cursor).
  function envolverSelecao(esq: string, dir: string, exemplo: string) {
    const ta = corpoRef.current;
    if (!ta) return;
    const s = ta.selectionStart ?? emCorpo.length;
    const e = ta.selectionEnd ?? emCorpo.length;
    const sel = emCorpo.slice(s, e) || exemplo;
    setEmCorpo(emCorpo.slice(0, s) + esq + sel + dir + emCorpo.slice(e));
    window.setTimeout(() => ta.focus(), 0);
  }
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

      // Leads importados (planilha/cadastro manual). Antes de rodar leads_setup.sql
      // a tabela não existe: a aba mostra aviso de migração pendente.
      setLeadsImp(await listarLeadsImportados());

      // Flag do cadastro automático (trial). Antes de rodar trial_setup.sql a tabela
      // não existe: o toggle mostra aviso de migração pendente.
      const { data: flagData, error: flagErr } = await supabase
        .from('config_global')
        .select('valor')
        .eq('chave', 'cadastro_automatico')
        .maybeSingle();
      setCadastroAuto(
        flagErr || !flagData ? null : (flagData.valor as { ativo?: boolean } | null)?.ativo === true,
      );

      // Eventos Kiwify sem conta vinculada (Task 10). Antes de rodar
      // supabase/assinatura_setup.sql a tabela não existe: a consulta erra e a seção some
      // (null), em vez de derrubar o resto do painel.
      const { data: orfaosData, error: orfaosErr } = await supabase
        .from('kiwify_eventos')
        .select('id, recebido_em, evento, email, subscription_id')
        .is('profile_id', null)
        .order('recebido_em', { ascending: false })
        .limit(50);
      setOrfaos(orfaosErr ? null : ((orfaosData as EventoKiwifyOrfao[] | null) ?? []));
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

  // Fecha o painel do superadmin / menus de ações ao clicar fora.
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (superRef.current && !superRef.current.contains(e.target as Node)) setSuperAberto(false);
      if (!(e.target as HTMLElement).closest('.admin-acoes-drop')) setMenuAcoes(null);
    }
    function aoRolar() {
      setMenuAcoes(null); // menu é position:fixed — fecha ao rolar para não ficar deslocado
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('scroll', aoRolar, true);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('scroll', aoRolar, true);
    };
  }, []);

  const metricas = useMemo(() => calcularMetricas(eventos), [eventos]);

  // Superadmin (a conta logada, role admin) sai da tabela — dados dela ficam no canto superior.
  const meuPerfil = useMemo(
    () => profiles.find((p) => (p.email ?? '').toLowerCase() === emailLogado) ?? null,
    [profiles, emailLogado],
  );

  // E-mail da conta pagante dona de cada org (para a aba de sub-logins).
  const emailPorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) if (p.email) m.set(p.id, p.email);
    return m;
  }, [profiles]);

  // Candidatos ao vínculo manual de evento Kiwify órfão: contas pagantes (mestre/pré-migração),
  // sem superadmin nem sub-logins (esses não têm assinatura própria). NÃO filtra por `ativo`
  // (fix round 1, IMPORTANT 3): antes do fix do CRITICAL 1 abaixo, vincular uma conta bloqueada
  // era uma armadilha (o admin achava que tinha liberado, mas `ativo` continuava false e o login
  // recusava mesmo assim). Agora `camposVinculoManual` grava `ativo: true` junto — vincular UMA
  // conta bloqueada passa a ser um jeito válido de reativá-la (mesma lógica de
  // `liberarAcessoCompleto`), então mantemos todas na lista; o rótulo abaixo avisa quando isso
  // vai acontecer, para o admin nunca ser surpreendido.
  const contasPagantes = useMemo(
    () =>
      profiles
        .filter((p) => p.role !== 'admin' && (!p.papel || p.papel === 'mestre') && p.email)
        .slice()
        .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? '')),
    [profiles],
  );

  // Aba "Clientes": contas pagantes (mestres/pré-migração), ordenadas por atividade —
  // frequência de acesso + relatórios gerados; empate: último login mais recente primeiro.
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const ehSubLogin = (p: Profile) => !!p.papel && p.papel !== 'mestre';
    let lista = profiles.filter((p) => {
      if (p.role === 'admin') return false;
      if (aba === 'acessos') return ehSubLogin(p);
      if (ehSubLogin(p)) return false;
      // As duas listas são complementares e cobrem todo mundo: quem não é
      // pagante cai obrigatoriamente na de teste/expirados, para nenhuma conta
      // sumir do painel por causa de um critério que não previu seu caso.
      return aba === 'trial' ? !ehPagante(p) : ehPagante(p);
    });
    if (q) lista = lista.filter((p) => (p.email ?? '').toLowerCase().includes(q));
    const score = (p: Profile) =>
      (metricas.get(p.id)?.sessoesTotal ?? 0) + (uso.get(p.id)?.relatorios ?? 0);
    const ultimoLogin = (p: Profile) => {
      const iso = metas.get(p.id)?.last_sign_in_at;
      return iso ? new Date(iso).getTime() : 0;
    };
    return [...lista].sort((a, b) => score(b) - score(a) || ultimoLogin(b) - ultimoLogin(a));
  }, [profiles, busca, aba, metricas, uso, metas]);

  // Leads = cadastros do teste 48h (profiles) + importados/manuais (leads_importados),
  // numa lista única — mais recentes primeiro, com filtro por origem e busca.
  const leads = useMemo<LeadRow[]>(() => {
    const doTrial: LeadRow[] = profiles
      .filter((p) => p.origem_cadastro === 'trial' && p.role !== 'admin')
      .map((p) => ({
        id: p.id,
        tipo: 'trial',
        nome: p.nome ?? '',
        email: p.email ?? '',
        telefone: p.telefone ?? '',
        empresa: p.empresa_nome ?? '',
        origem: 'Teste 48h',
        criadoEm: p.criado_em,
        trialFim: p.trial_fim ?? null,
        profile: p,
      }));
    const importados: LeadRow[] = (leadsImp ?? []).map((l) => ({
      id: l.id,
      tipo: 'importado',
      nome: l.nome,
      email: l.email,
      telefone: l.telefone,
      empresa: l.empresa,
      origem: l.origem || 'Importado',
      criadoEm: l.criado_em,
      trialFim: null,
      imp: l,
    }));
    let lista = [...doTrial, ...importados];
    if (filtroOrigem !== 'todos') lista = lista.filter((l) => l.tipo === filtroOrigem);
    const q = busca.trim().toLowerCase();
    if (q) {
      lista = lista.filter((l) =>
        [l.email, l.nome, l.empresa, l.telefone, l.origem].some((v) => v.toLowerCase().includes(q)),
      );
    }
    return lista.sort(
      (a, b) => new Date(b.criadoEm ?? 0).getTime() - new Date(a.criadoEm ?? 0).getTime(),
    );
  }, [profiles, leadsImp, busca, filtroOrigem]);

  const emailsSelecionados = useMemo(
    () => leads.filter((l) => selLeads.has(l.id) && l.email).map((l) => l.email),
    [leads, selLeads],
  );

  function alternarLead(id: string) {
    setSelLeads((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function alternarTodosLeads() {
    setSelLeads((s) => (s.size === leads.length ? new Set() : new Set(leads.map((p) => p.id))));
  }

  // CSV com BOM (abre certo no Excel BR, separador ;)
  function baixarCsvLeads() {
    const cab = ['nome', 'email', 'telefone', 'empresa', 'origem', 'status', 'cadastro', 'fim_do_teste'];
    const linhas = leads.map((l) => [
      l.nome, l.email, l.telefone, l.empresa, l.origem,
      l.profile ? statusUsuario(l.profile).label : 'Lead',
      fmtSomenteData(l.criadoEm), fmtSomenteData(l.trialFim),
    ]);
    const csv =
      String.fromCharCode(0xFEFF) +
      [cab, ...linhas].map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads-nr13.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copiarLeads(campo: 'email' | 'telefone') {
    const valores = leads.map((l) => (campo === 'email' ? l.email : l.telefone)).filter(Boolean);
    try {
      await navigator.clipboard.writeText(valores.join('; '));
      setAviso(`${valores.length} ${campo === 'email' ? 'e-mails copiados' : 'telefones copiados'} para a área de transferência.`);
    } catch {
      setErro('Não foi possível copiar. Use o Exportar CSV.');
    }
  }

  function abrirCompositor() {
    setEmAssunto('Como foi seu teste do NR13 Sistema, {nome}?');
    setEmCorpo(
      'Olá {nome},\n\n' +
        'Vimos que você testou o NR13 Sistema na {empresa}. O que achou?\n\n' +
        'Se ficou alguma dúvida sobre memorial de cálculo, inspeções em campo, prontuários ou relatórios, é só responder este e-mail — a gente te ajuda.\n\n' +
        'Para contratar e liberar o acesso completo (incluindo download e impressão dos documentos), responda este e-mail ou fale com a nossa equipe.\n\n' +
        'Abraço,\nEquipe NR13 Sistema',
    );
    setEmailAberto(true);
  }

  async function enviarEmailLeads() {
    const destinatarios =
      emailsSelecionados.length > 0
        ? emailsSelecionados
        : leads.map((l) => l.email).filter(Boolean);
    if (destinatarios.length === 0) {
      setErro('Nenhum lead com e-mail para enviar.');
      return;
    }
    if (!window.confirm(`Enviar este e-mail para ${destinatarios.length} lead(s)?`)) return;
    setEnviandoEmail(true);
    setErro(null);
    setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'enviar_email_leads', assunto: emAssunto, corpo: emCorpo, destinatarios },
      });
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
      setEmailAberto(false);
      setAviso(
        `E-mail enviado para ${data.enviados} lead(s).` +
          (data.falhas?.length ? ` Falhou para: ${data.falhas.join(', ')}.` : ''),
      );
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar os e-mails.');
    } finally {
      setEnviandoEmail(false);
    }
  }

  // E-mails já no sistema (qualquer conta + leads importados) — dedup da importação.
  const emailsExistentes = useMemo(() => {
    const s = new Set<string>();
    for (const p of profiles) if (p.email) s.add(p.email.toLowerCase());
    for (const l of leadsImp ?? []) s.add(l.email.toLowerCase());
    return s;
  }, [profiles, leadsImp]);

  async function excluirLeadImp(l: LeadImportado) {
    if (!window.confirm(`Excluir o lead ${l.email}?\n\nEle sai da lista e dos próximos disparos de e-mail.`)) return;
    setErro(null);
    setAviso(null);
    try {
      await excluirLeadImportado(l.id);
      setLeadsImp((ls) => (ls ?? []).filter((x) => x.id !== l.id));
      setSelLeads((s) => {
        const n = new Set(s);
        n.delete(l.id);
        return n;
      });
      setAviso(`Lead ${l.email} excluído.`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao excluir o lead.');
    }
  }

  const resumo = useMemo(() => {
    // Cards focam os clientes PAGANTES (sub-logins ficam na aba própria).
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

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault();
    const email = novoEmail.trim().toLowerCase();
    const dias = parseInt(novoDias, 10);
    if (!email || novaSenhaUser.length < 6) {
      setErro('Informe e-mail e senha de no mínimo 6 caracteres.');
      return;
    }
    setCriando(true);
    setErro(null);
    setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin', {
        body: { action: 'create_user', email, senha: novaSenhaUser, liberar: true },
      });
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
      // Dias de acesso definidos já no cadastro (campo opcional).
      if (data?.id && !isNaN(dias) && dias > 0) {
        const expira = new Date();
        expira.setDate(expira.getDate() + dias);
        expira.setHours(23, 59, 59, 0);
        await supabase.from('profiles').update({ acesso_expira_em: expira.toISOString() }).eq('id', data.id);
      }
      setAviso(
        !isNaN(dias) && dias > 0
          ? `Usuário ${email} criado com ${dias} dias de acesso.`
          : `Usuário ${email} criado e liberado (sem expiração).`,
      );
      setNovoEmail('');
      setNovaSenhaUser('');
      setNovoDias('');
      await carregar();
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Falha ao criar usuário.');
    } finally {
      setCriando(false);
    }
  }

  // Liga/desliga o cadastro automático de leads (interruptor global do trial).
  async function alternarCadastroAuto() {
    if (cadastroAuto === null || salvandoFlag) return;
    const novo = !cadastroAuto;
    setSalvandoFlag(true);
    setErro(null);
    setAviso(null);
    try {
      const { error } = await supabase
        .from('config_global')
        .update({ valor: { ativo: novo }, atualizado_em: new Date().toISOString() })
        .eq('chave', 'cadastro_automatico');
      if (error) throw error;
      setCadastroAuto(novo);
      setAviso(novo ? 'Cadastro automático LIGADO — leads podem se cadastrar sozinhos.' : 'Cadastro automático desligado.');
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao alterar a configuração.');
    } finally {
      setSalvandoFlag(false);
    }
  }

  // Reenvia o e-mail de confirmação de cadastro (código) para conta ainda não confirmada.
  async function reenviarConfirmacao(p: Profile) {
    if (!p.email) return;
    setAcaoEmAndamento(p.id);
    setErro(null);
    setAviso(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: p.email });
      if (error) throw error;
      setAviso(`Confirmação reenviada para ${p.email}.`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao reenviar confirmação.');
    } finally {
      setAcaoEmAndamento(null);
    }
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

  // Vincula manualmente um evento Kiwify órfão (pagamento sem conta identificada) a um usuário:
  // ativa a assinatura por um novo ciclo (camposVinculoManual — inclui as colunas LEGADAS que o
  // login() de fato usa, ver comentário na função) e marca o evento como processado, para não
  // aparecer de novo na lista nem ser reprocessado por engano.
  async function vincularOrfao(evento: EventoKiwifyOrfao, usuarioId: string) {
    if (!usuarioId) {
      setErro('Escolha um usuário antes de vincular.');
      return;
    }
    // fix round 1, IMPORTANT 2a: confirmação explícita (padrão de liberarAcessoCompleto) — os
    // dois updates abaixo não são atômicos e não têm desfazer por aqui, então o admin precisa
    // ver com clareza QUAL conta vai receber QUAL pagamento antes de agir.
    const destino = profiles.find((p) => p.id === usuarioId);
    const confirmar = window.confirm(
      `Vincular o pagamento de "${evento.email ?? 'e-mail não informado'}" ` +
        `(evento: ${rotuloEventoKiwify(evento.evento)}, recebido em ${fmtData(evento.recebido_em)}) ` +
        `à conta ${destino?.email ?? usuarioId}?\n\n` +
        `Isso ativa a assinatura dessa conta por ${DIAS_CICLO} dias` +
        (destino && !destino.ativo ? ' e REATIVA o acesso (a conta está bloqueada hoje)' : '') +
        `. Não há como desfazer por aqui — confira o e-mail antes de confirmar.`,
    );
    if (!confirmar) return;

    setAcaoEmAndamento(evento.id);
    setErro(null);
    setAviso(null);
    try {
      const campos = camposVinculoManual(new Date(), evento.email, evento.subscription_id);
      const { error: e1 } = await supabase.from('profiles').update(campos).eq('id', usuarioId);
      if (e1) throw e1;

      // A partir daqui o perfil JÁ foi atualizado. Se o update abaixo falhar, o evento continua
      // "órfão" na tela — um novo clique vincularia o MESMO pagamento a OUTRA conta. Por isso
      // (fix round 1, IMPORTANT 2b) esse caso vira um aviso explícito em vez de cair no catch
      // genérico "Falha ao vincular evento" (que sugeriria que nada aconteceu).
      const { error: e2 } = await supabase
        .from('kiwify_eventos')
        .update({ profile_id: usuarioId, processado: true })
        .eq('id', evento.id);

      setProfiles((ps) => ps.map((p) => (p.id === usuarioId ? { ...p, ...campos } : p)));

      if (e2) {
        setErro(
          `A conta ${destino?.email ?? usuarioId} JÁ foi ativada, mas o evento não pôde ser marcado ` +
            `como vinculado (${e2.message}). NÃO repita o vínculo — ele voltaria a aparecer na lista ` +
            `e poderia ser aplicado a outra conta por engano; corrija direto no banco se persistir.`,
        );
        return;
      }

      setOrfaos((os) => (os ?? []).filter((o) => o.id !== evento.id));
      setSelOrfao((s) => Object.fromEntries(Object.entries(s).filter(([id]) => id !== evento.id)));
      setAviso(`Evento vinculado — assinatura ativada para ${destino?.email ?? usuarioId}.`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao vincular evento.');
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

  // Converte a conta de teste em assinante: remove os bloqueios do trial e (opcional) a validade.
  function liberarAcessoCompleto(p: Profile) {
    const manter = window.confirm(
      `Liberar acesso COMPLETO para ${p.email}?\n\nOK = libera e REMOVE a expiração.\nCancelar = não faz nada (use "Definir validade" para ajustar o prazo antes/depois).`,
    );
    if (!manter) return;
    void atualizarPerfil(
      p.id,
      // assinatura_ate null = sem vencimento (nunca rebaixa) — o par exato de acesso_expira_em null.
      { ativo: true, plano: 'completo', acesso_expira_em: null, ...camposAssinaturaAdmin(null) },
      `${p.email} agora tem acesso completo, sem expiração.`,
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
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
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
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
      setProfiles((ps) => ps.filter((x) => x.id !== p.id));
      setAviso(`Usuário ${p.email} excluído.`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao excluir.');
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  // Célula "Equipamentos": total + composição por tipo (V=vaso, C=caldeira, A=autoclave).
  function celEquip(s: UsoStats | undefined): string {
    if (!s) return '—';
    const total = s.equip_vaso + s.equip_caldeira + s.equip_autoclave;
    if (total === 0) return '0';
    const partes = [
      s.equip_vaso > 0 ? `${s.equip_vaso}V` : '',
      s.equip_caldeira > 0 ? `${s.equip_caldeira}C` : '',
      s.equip_autoclave > 0 ? `${s.equip_autoclave}A` : '',
    ].filter(Boolean);
    return `${total} (${partes.join(' · ')})`;
  }

  const meuMeta = meuPerfil ? metas.get(meuPerfil.id) : undefined;
  const minhasMetricas = meuPerfil ? metricas.get(meuPerfil.id) : undefined;

  return (
    <div className="admin-standalone">
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

      <div className="admin-cards">
        <div className="admin-card">
          <span className="admin-card-num">{resumo.total}</span>
          <span className="admin-card-label">Usuários</span>
        </div>
        <div className="admin-card pendente">
          <span className="admin-card-num">{resumo.pendentes}</span>
          <span className="admin-card-label">Pendentes</span>
        </div>
        <div className="admin-card ativo">
          <span className="admin-card-num">{resumo.ativosHoje}</span>
          <span className="admin-card-label">Ativos hoje</span>
        </div>
        <div className="admin-card vencendo">
          <span className="admin-card-num">{resumo.vencendo}</span>
          <span className="admin-card-label">Vencendo em 30 dias</span>
        </div>
      </div>

      {erro && <p className="admin-erro">{erro}</p>}
      {aviso && <p className="admin-aviso">{aviso}</p>}

      {/* Interruptor global do cadastro automático de leads (teste 48h) */}
      <div className="admin-novo" style={{ alignItems: 'center' }}>
        <span className="admin-novo-titulo">Cadastro automático (teste 48h)</span>
        {cadastroAuto === null ? (
          <span style={{ fontSize: 13, color: '#8a6d1a' }}>
            Rode <code>supabase/trial_setup.sql</code> no SQL Editor para habilitar esta opção.
          </span>
        ) : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={cadastroAuto}
                disabled={salvandoFlag}
                onChange={() => void alternarCadastroAuto()}
              />
              Permitir cadastro automático
            </label>
            <span style={{ fontSize: 12.5, color: 'var(--muted, #667085)' }}>
              {cadastroAuto
                ? 'LIGADO: o botão "Testar gratuitamente por 2 dias" aparece na tela de login.'
                : 'Desligado: novos leads veem "cadastro temporariamente indisponível".'}
            </span>
          </>
        )}
      </div>

      {/* Eventos Kiwify sem conta vinculada (Task 10): pagamento chegou mas o webhook não achou
          o perfil (e-mail do checkout diferente do e-mail de cadastro, por ex.). `orfaos === null`
          = supabase/assinatura_setup.sql ainda não rodou nesse ambiente — some em vez de quebrar. */}
      {orfaos === null ? null : (
        <div className="admin-orfaos">
          <div className="admin-orfaos-head">
            <span className="admin-novo-titulo">Eventos Kiwify sem conta ({orfaos.length})</span>
            <span className="admin-orfaos-sub">
              Pagamento recebido sem casar com nenhum usuário — vincule manualmente abaixo.
            </span>
          </div>
          {orfaos.length === 0 ? (
            <p className="admin-nota">Nenhum evento pendente de vínculo.</p>
          ) : (
            <div className="admin-tabela-wrap">
              <table className="admin-tabela">
                <thead>
                  <tr>
                    <th>Recebido em</th>
                    <th>Evento</th>
                    <th>E-mail do pagamento</th>
                    <th>Vincular a</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {orfaos.map((ev) => {
                    const ocupado = acaoEmAndamento === ev.id;
                    return (
                      <tr key={ev.id} className={ocupado ? 'ocupado' : ''}>
                        <td data-label="Recebido em">{fmtData(ev.recebido_em)}</td>
                        <td data-label="Evento">{rotuloEventoKiwify(ev.evento)}</td>
                        <td data-label="E-mail do pagamento">{ev.email ?? '—'}</td>
                        <td data-label="Vincular a">
                          <select
                            value={selOrfao[ev.id] ?? ''}
                            disabled={ocupado}
                            onChange={(e) => setSelOrfao((s) => ({ ...s, [ev.id]: e.target.value }))}
                          >
                            <option value="">Selecione o usuário…</option>
                            {contasPagantes.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.email}
                                {p.ativo ? '' : ' (bloqueada — será reativada)'}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td data-label="Ação">
                          <button
                            type="button"
                            className="b b-acoes"
                            disabled={ocupado || !selOrfao[ev.id]}
                            onClick={() => void vincularOrfao(ev, selOrfao[ev.id] ?? '')}
                          >
                            {ocupado ? 'Vinculando…' : 'Vincular'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <form className="admin-novo" onSubmit={criarUsuario}>
        <span className="admin-novo-titulo">Criar novo usuário</span>
        <input
          type="email"
          placeholder="e-mail do usuário"
          value={novoEmail}
          onChange={(e) => setNovoEmail(e.target.value)}
          autoComplete="off"
        />
        <input
          type="text"
          placeholder="senha (mín. 6)"
          value={novaSenhaUser}
          onChange={(e) => setNovaSenhaUser(e.target.value)}
          autoComplete="new-password"
        />
        <input
          type="number"
          min={1}
          className="admin-novo-dias"
          placeholder="dias de acesso (vazio = sem prazo)"
          value={novoDias}
          onChange={(e) => setNovoDias(e.target.value)}
        />
        <button type="submit" className="admin-novo-btn" disabled={criando}>
          {criando ? 'Criando…' : '+ Criar e liberar'}
        </button>
      </form>

      {/* Abas: clientes pagantes (foco) × acessos criados pelos clientes (sub-logins/portal) */}
      <div className="admin-abas">
        <button
          type="button"
          className={`admin-aba${aba === 'clientes' ? ' ativa' : ''}`}
          onClick={() => setAba('clientes')}
        >
          Clientes pagantes
        </button>
        <button
          type="button"
          className={`admin-aba${aba === 'trial' ? ' ativa' : ''}`}
          onClick={() => setAba('trial')}
        >
          Testes e expirados
        </button>
        <button
          type="button"
          className={`admin-aba${aba === 'acessos' ? ' ativa' : ''}`}
          onClick={() => setAba('acessos')}
        >
          Acessos dos clientes (sub-logins)
        </button>
        <button
          type="button"
          className={`admin-aba${aba === 'leads' ? ' ativa' : ''}`}
          onClick={() => setAba('leads')}
        >
          Leads{leads.length > 0 ? ` · ${leads.length}` : ''}
        </button>
      </div>

      <input
        className="admin-busca"
        type="search"
        placeholder={aba === 'leads' ? 'Buscar por nome, e-mail, empresa ou telefone…' : 'Buscar por e-mail…'}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {aba === 'leads' ? (
        <>
          {leadsImp === null && (
            <p className="admin-nota">
              Cadastro manual e importação de leads exigem rodar
              <code> supabase/leads_setup.sql</code> no SQL Editor do Supabase (uma vez).
            </p>
          )}
          <div className="admin-leads-bar">
            <span className="admin-leads-info">
              {selLeads.size > 0
                ? `${selLeads.size} selecionado(s) — o disparo vai só para eles`
                : 'Nenhum selecionado — ações valem para TODOS os leads listados'}
            </span>
            <div className="admin-leads-acoes">
              <select
                className="admin-leads-filtro"
                value={filtroOrigem}
                onChange={(e) => setFiltroOrigem(e.target.value as typeof filtroOrigem)}
                title="Filtrar por origem do lead"
              >
                <option value="todos">Todas as origens</option>
                <option value="trial">Teste 48h</option>
                <option value="importado">Importados / manuais</option>
              </select>
              <button
                type="button"
                onClick={() => setLeadForm({ lead: null })}
                disabled={leadsImp === null}
                title={leadsImp === null ? 'Rode supabase/leads_setup.sql para habilitar' : undefined}
              >
                + Cadastrar lead
              </button>
              <button
                type="button"
                onClick={() => setImportarAberto(true)}
                disabled={leadsImp === null}
                title={leadsImp === null ? 'Rode supabase/leads_setup.sql para habilitar' : undefined}
              >
                ⬆ Importar planilha
              </button>
              <button type="button" onClick={baixarCsvLeads} disabled={leads.length === 0}>
                ⬇ Exportar CSV
              </button>
              <button type="button" onClick={() => void copiarLeads('email')} disabled={leads.length === 0}>
                Copiar e-mails
              </button>
              <button type="button" onClick={() => void copiarLeads('telefone')} disabled={leads.length === 0}>
                Copiar telefones
              </button>
              <button type="button" className="principal" onClick={abrirCompositor} disabled={leads.length === 0}>
                ✉ Enviar e-mail {selLeads.size > 0 ? `(${selLeads.size})` : '(todos)'}
              </button>
            </div>
          </div>
          <div className="admin-tabela-wrap">
            <table className="admin-tabela">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && selLeads.size === leads.length}
                      onChange={alternarTodosLeads}
                      title="Selecionar todos"
                    />
                  </th>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>Empresa</th>
                  <th>Origem</th>
                  <th>Status</th>
                  <th>Cadastro</th>
                  <th>Fim do teste</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const st = l.profile ? statusUsuario(l.profile) : null;
                  return (
                    <tr key={l.id} className={selLeads.has(l.id) ? 'lead-sel' : ''}>
                      <td data-label="Selecionar">
                        <input type="checkbox" checked={selLeads.has(l.id)} onChange={() => alternarLead(l.id)} />
                      </td>
                      <td data-label="Nome" className="admin-email">{l.nome || '—'}</td>
                      <td data-label="E-mail">{l.email}</td>
                      <td data-label="Telefone">{l.telefone || '—'}</td>
                      <td data-label="Empresa">{l.empresa || '—'}</td>
                      <td data-label="Origem">
                        <span className={`admin-badge-origem ${l.tipo}`}>{l.origem}</span>
                      </td>
                      <td data-label="Status">
                        {st ? <span className={`admin-badge ${st.cls}`}>{st.label}</span> : '—'}
                      </td>
                      <td data-label="Cadastro">{fmtSomenteData(l.criadoEm)}</td>
                      <td data-label="Fim do teste">{fmtSomenteData(l.trialFim)}</td>
                      <td data-label="Ações" className="admin-lead-acoes-cel">
                        {l.imp ? (
                          <>
                            <button type="button" title="Editar lead" onClick={() => setLeadForm({ lead: l.imp! })}>
                              ✎
                            </button>
                            <button type="button" className="perigo" title="Excluir lead" onClick={() => void excluirLeadImp(l.imp!)}>
                              🗑
                            </button>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
                {leads.length === 0 && !carregando && (
                  <tr>
                    <td colSpan={10} className="admin-vazio">
                      Nenhum lead ainda — cadastre manualmente, importe uma planilha ou aguarde
                      cadastros pelo teste de 48h.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
      <div className="admin-tabela-wrap">
        <table className="admin-tabela">
          <thead>
            {aba === 'clientes' || aba === 'trial' ? (
            <tr>
              <th>E-mail</th>
              <th>Status</th>
              <th>Assinatura</th>
              <th>Dias restantes</th>
              <th>Cadastro</th>
              <th>Último acesso</th>
              <th>Sessões (hoje/total)</th>
              <th>Equipamentos</th>
              <th>Inspeções</th>
              <th>Relatórios</th>
              <th>PDFs</th>
              <th>Impressões</th>
              <th>Acessos criados</th>
              <th>Ações</th>
            </tr>
            ) : (
            <tr>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Conta pagante (dona)</th>
              <th>Status</th>
              <th>Último acesso</th>
              <th>Ações</th>
            </tr>
            )}
          </thead>
          <tbody>
            {filtrados.map((p) => {
              const st = statusUsuario(p);
              const m = metricas.get(p.id);
              const meta = metas.get(p.id);
              const s = uso.get(p.id);
              const ocupado = acaoEmAndamento === p.id;
              const ultimoAcesso = fmtUltimoAcessoSP(meta?.last_sign_in_at ?? null);
              const celAcoes = (
                <td data-label="Ações" className="admin-acoes">
                  <div className="admin-acoes-drop">
                    <button
                      type="button"
                      className="b b-acoes"
                      disabled={ocupado}
                      onClick={(e) => {
                        if (menuAcoes?.id === p.id) {
                          setMenuAcoes(null);
                          return;
                        }
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setMenuAcoes({ id: p.id, x: r.right, y: r.bottom + 4 });
                      }}
                    >
                      Ações ▾
                    </button>
                    {menuAcoes?.id === p.id && (
                      <div className="admin-menu" style={{ top: menuAcoes.y, left: menuAcoes.x - 190 }}>
                        {p.ativo ? (
                          <button type="button" onClick={() => { setMenuAcoes(null); bloquear(p); }}>
                            Bloquear acesso
                          </button>
                        ) : (
                          <button type="button" className="destaque" onClick={() => { setMenuAcoes(null); liberar(p); }}>
                            Liberar acesso
                          </button>
                        )}
                        <button type="button" onClick={() => { setMenuAcoes(null); definirValidade(p); }}>
                          Definir validade (dias)
                        </button>
                        {p.plano === 'trial' && (
                          <button type="button" className="destaque" onClick={() => { setMenuAcoes(null); liberarAcessoCompleto(p); }}>
                            Liberar acesso completo
                          </button>
                        )}
                        {meta && !meta.email_confirmed_at && (
                          <button type="button" onClick={() => { setMenuAcoes(null); void reenviarConfirmacao(p); }}>
                            Reenviar confirmação de e-mail
                          </button>
                        )}
                        <button type="button" onClick={() => { setMenuAcoes(null); void resetarSenha(p); }}>
                          Resetar senha
                        </button>
                        <button type="button" className="perigo" onClick={() => { setMenuAcoes(null); void excluir(p); }}>
                          Excluir usuário
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              );
              if (aba === 'acessos') {
                const rotulo =
                  p.papel === 'cliente' ? 'Cliente (portal)' : p.papel === 'gerente' ? 'Gerente' : 'Inspetor';
                return (
                  <tr key={p.id} className={ocupado ? 'ocupado' : ''}>
                    <td data-label="E-mail" className="admin-email">
                      {p.email}
                    </td>
                    <td data-label="Papel"><span className={`admin-badge-papel ${p.papel}`}>{rotulo}</span></td>
                    <td data-label="Conta pagante">{(p.org_id && emailPorId.get(p.org_id)) ?? '—'}</td>
                    <td data-label="Status">
                      <span className={`admin-badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td data-label="Último acesso">
                      {ultimoAcesso ? <span className="admin-ultimo-acesso">{ultimoAcesso}</span> : '—'}
                    </td>
                    {celAcoes}
                  </tr>
                );
              }
              const infoLead = [p.nome, p.empresa_nome, p.telefone].filter(Boolean).join(' · ');
              return (
                <tr key={p.id} className={ocupado ? 'ocupado' : ''}>
                  <td data-label="E-mail" className="admin-email">
                    {ehPagante(p) && (
                      <span className="admin-selo-pagante" title="Cliente pagante">
                        <Icone nome="shield" tam={14} />
                      </span>
                    )}
                    {p.email}
                    {p.origem_cadastro === 'trial' && (
                      <span className="admin-badge-trial" title="Conta criada pelo cadastro automático (teste 48h)"> TRIAL</span>
                    )}
                    {infoLead && (
                      <div style={{ fontSize: 11.5, color: 'var(--muted, #667085)', fontWeight: 400 }}>{infoLead}</div>
                    )}
                  </td>
                  <td data-label="Status">
                    <span className={`admin-badge ${st.cls}`}>{st.label}</span>
                  </td>
                  <td data-label="Assinatura">
                    <span className={`admin-badge-assinatura ${p.assinatura_status ?? 'trial'}`}>
                      {rotuloStatusAssinatura(p.assinatura_status)}
                    </span>
                  </td>
                  <td data-label="Dias restantes"><BadgeDias expiraEm={p.acesso_expira_em} /></td>
                  <td data-label="Cadastro">{fmtSomenteData(p.criado_em)}</td>
                  <td data-label="Último acesso">
                    {ultimoAcesso ? <span className="admin-ultimo-acesso">{ultimoAcesso}</span> : '—'}
                  </td>
                  <td data-label="Sessões">
                    {m ? `${m.sessoesHoje} / ${m.sessoesTotal}` : '0 / 0'}
                    {m?.duracaoMediaMin != null ? ` · ${m.duracaoMediaMin} min` : ''}
                  </td>
                  <td data-label="Equipamentos">{celEquip(s)}</td>
                  <td data-label="Inspeções">{s ? s.inspecoes : '—'}</td>
                  <td data-label="Relatórios">{s ? s.relatorios : '—'}</td>
                  <td data-label="PDFs">{s ? s.pdf_gerados : '—'}</td>
                  <td data-label="Impressões">{s ? s.impressoes : '—'}</td>
                  <td data-label="Acessos criados">{s ? s.subusuarios : '—'}</td>
                  {celAcoes}
                </tr>
              );
            })}
            {filtrados.length === 0 && !carregando && (
              <tr>
                <td colSpan={14} className="admin-vazio">
                  {aba === 'acessos' ? 'Nenhum sub-login criado pelos clientes ainda.' : 'Nenhum usuário encontrado.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}
        {aba !== 'leads' && uso.size === 0 && !carregando && (
          <p className="admin-nota">
            Métricas de uso (equipamentos, inspeções, relatórios…) exibem "—" até rodar
            <code> supabase/admin_stats.sql</code> no SQL Editor do Supabase.
          </p>
        )}
      </div>

      {/* Cadastro manual / edição de lead importado */}
      {leadForm && (
        <ModalLeadForm
          lead={leadForm.lead}
          onClose={() => setLeadForm(null)}
          onSalvo={(msg) => {
            setLeadForm(null);
            setAviso(msg);
            void carregar();
          }}
        />
      )}

      {/* Importação de leads por planilha */}
      {importarAberto && (
        <ModalImportarLeads
          emailsExistentes={emailsExistentes}
          onClose={() => setImportarAberto(false)}
          onImportado={(msg) => {
            setAviso(msg);
            void carregar();
          }}
        />
      )}

      {/* Compositor de e-mail para os leads ({nome} e {empresa} são substituídos por destinatário) */}
      {emailAberto && (
        <div className="admin-email-overlay" role="dialog" aria-modal="true">
          <div className="admin-email-modal">
            <h3>Enviar e-mail para os leads</h3>
            <p className="admin-email-sub">
              Destinatários: <strong>
                {emailsSelecionados.length > 0 ? `${emailsSelecionados.length} selecionado(s)` : `todos os ${leads.length} leads`}
              </strong>
              {' '}· Use <code>{'{nome}'}</code> e <code>{'{empresa}'}</code> para personalizar.
            </p>
            <label className="admin-email-label">Assunto</label>
            <input
              type="text"
              value={emAssunto}
              onChange={(e) => setEmAssunto(e.target.value)}
              className="admin-email-assunto"
            />
            <label className="admin-email-label">Mensagem</label>
            <div className="admin-email-toolbar">
              <button type="button" title="Negrito" onClick={() => envolverSelecao('**', '**', 'texto em destaque')}>
                <b>B</b>
              </button>
              <button type="button" title="Marca-texto" onClick={() => envolverSelecao('==', '==', 'palavra destacada')}>
                <mark>ab</mark>
              </button>
              <button type="button" title="Link" onClick={() => envolverSelecao('[', '](https://seulink.com.br)', 'clique aqui')}>
                🔗 Link
              </button>
              <button type="button" title="Imagem" onClick={() => envolverSelecao('!img(', ')', 'https://url-da-imagem.jpg')}>
                🖼 Imagem
              </button>
            </div>
            <textarea
              ref={corpoRef}
              value={emCorpo}
              onChange={(e) => setEmCorpo(e.target.value)}
              className="admin-email-corpo"
              rows={10}
            />
            <p className="admin-email-dica">
              Formatação: <code>**negrito**</code> · <code>==marca-texto==</code> ·{' '}
              <code>[texto](https://link)</code> · <code>!img(https://url-da-imagem)</code>. A logo do
              sistema entra automaticamente no topo quando o <code>app_url</code> estiver configurado.
            </p>
            {emCorpo.trim() && (
              <>
                <label className="admin-email-label">Pré-visualização</label>
                <div
                  className="admin-email-preview"
                  // preview local do próprio texto do admin, com HTML escapado (mesma regra da edge)
                  dangerouslySetInnerHTML={{ __html: previewEmailHtml(emCorpo) }}
                />
              </>
            )}
            <div className="admin-email-acoes">
              <button type="button" className="cancelar" onClick={() => setEmailAberto(false)} disabled={enviandoEmail}>
                Cancelar
              </button>
              <button
                type="button"
                className="enviar"
                onClick={() => void enviarEmailLeads()}
                disabled={enviandoEmail || !emAssunto.trim() || !emCorpo.trim()}
              >
                {enviandoEmail ? 'Enviando…' : 'Enviar agora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
