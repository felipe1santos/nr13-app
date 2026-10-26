/**
 * Modal do cliente (v4 "Aço Frio", 25/10/2026).
 *
 * Desenho na identidade do sistema,
 * `docs/design/preview.html` (CLAUDE.md §15).
 *
 * ## Leitura primeiro, edição sob demanda
 *
 * Abre-se o cliente quase sempre para CONSULTAR (o CNPJ, o contato, o que está
 * vencido). Campos sempre editáveis faziam a consulta parecer um formulário e
 * convidavam a alteração acidental. Então o modal abre em LEITURA — o valor é
 * texto — e a edição é um estado explícito, com começo ("Editar") e fim
 * ("Salvar alterações" ou "Cancelar"). Edição GLOBAL, um ponto de salvamento:
 * a ficha é curta. Cliente NOVO abre direto na edição.
 *
 * Substitui as duas telas que existiam (detalhe e formulário). Nada do que
 * elas faziam saiu: busca no Google, todos os campos do cadastro, anotações,
 * criação/troca de senha/exclusão do acesso ao Portal (mestre) e o mapa.
 *
 * ## O que a prévia tinha e aqui não tem
 *
 * "Conformidade", "Faturado no ano" e a aba "Relatórios": nenhuma fonte do
 * sistema tem esses dados por cliente — ver `clienteResumo.ts`. "Agendar
 * inspeção" também ficou de fora: a Agenda não recebe um cliente pré-escolhido,
 * e um botão que só abre a Agenda vazia prometeria o que não faz.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../../components/Icone';
import MenuMais from '../../components/MenuMais';
import * as buscaIndex from '../../services/buscaIndex';
import type { ItemCatalogo } from '../../services/buscaIndex';
import { carregarPainel } from '../../services/vencimentosServidor';
import { isMestre } from '../../services/auth';
import { criarAcessoCliente, excluirSub, listarSubUsuarios, resetarSenhaSub, type SubUsuario } from '../../services/orgAdmin';
import { excluirPermissoes } from '../../services/permissoes';
import { buscarEmpresas, faviconDe, urlMapaEmbed, GOOGLE_MAPS_KEY, type ResultadoPlace } from '../../services/googlePlaces';
import { excluirCliente, listarClientes, salvarCliente } from './cadastroService';
import { equipamentosDoCliente, resumoPrazos, totalInspecoes, type ResumoPrazos } from './clienteResumo';
import LogoCliente from './LogoCliente';
import type { Cliente } from './tipos';
import './modalCliente.css';

type Modo = 'leitura' | 'edicao';
type Aba = 'dados' | 'equip' | 'portal' | 'local';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

/** No máximo 10 páginas de 50 por nome: um cliente com mais que isso é exceção. */
const PAGINAS_MAX = 10;

type EstadoEquip =
  | { tipo: 'carregando' }
  | { tipo: 'erro' }
  | { tipo: 'pronto'; itens: ItemCatalogo[]; prazos: ResumoPrazos; incompleto: boolean };

function dataBr(d: Date | undefined): string {
  return d ? d.toLocaleDateString('pt-BR') : '—';
}

function cidadeUf(c: Cliente): string {
  return c.cidade ? `${c.cidade}${c.estado ? `/${c.estado}` : ''}` : '';
}

export interface PropsModalCliente {
  /** Cliente a abrir. Para um novo, um registro vazio com id já gerado. */
  cliente: Cliente;
  novo: boolean;
  /** Pela lista, o ⋯ da linha pode abrir já em edição ou já na confirmação de exclusão. */
  acaoInicial?: 'editar' | 'excluir';
  aoFechar: () => void;
  /** A lista mudou (salvou, criou acesso, excluiu): o pai relê. */
  aoMudarLista: (lista: Cliente[]) => void;
}

export default function ModalCliente({ cliente: inicial, novo, acaoInicial, aoFechar, aoMudarLista }: PropsModalCliente) {
  const navigate = useNavigate();
  const idTitulo = useId();
  const idForm = useId();
  const caixa = useRef<HTMLDivElement>(null);

  const [cliente, setCliente] = useState<Cliente>(inicial);
  const [ehNovo, setEhNovo] = useState(novo);
  const [modo, setModo] = useState<Modo>(novo || acaoInicial === 'editar' ? 'edicao' : 'leitura');
  const [form, setForm] = useState<Cliente>(inicial);
  const [aba, setAba] = useState<Aba>('dados');
  const [tentouSalvar, setTentouSalvar] = useState(false);
  // Gravação em curso e a recusa dela (conta somente leitura, troca de conta):
  // a tela só sai da edição depois que o armazenamento confirmou.
  const [gravando, setGravando] = useState(false);
  const [erroGravar, setErroGravar] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<null | 'excluir' | 'descartar'>(
    !novo && acaoInicial === 'excluir' ? 'excluir' : null,
  );

  // Busca no Google Places (autofill do cadastro)
  const [buscaTexto, setBuscaTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoPlace[] | null>(null);
  const [buscaErro, setBuscaErro] = useState<string | null>(null);

  // Acesso ao Portal (Edge Function org_admin — só mestre)
  const [portalEmail, setPortalEmail] = useState('');
  const [portalSenha, setPortalSenha] = useState('');
  const [portalMsg, setPortalMsg] = useState<string | null>(null);
  const [criandoPortal, setCriandoPortal] = useState(false);
  const [loginsPortal, setLoginsPortal] = useState<SubUsuario[] | null>(null);

  const [equip, setEquip] = useState<EstadoEquip>({ tipo: 'carregando' });

  const alterado = modo === 'edicao' && JSON.stringify(form) !== JSON.stringify(cliente);
  const razaoVazia = !form.razaoSocial.trim();

  // ── Equipamentos e prazos do cliente ────────────────────────────────────────
  // Depende só dos NOMES (primitivos): é por eles que o catálogo responde.
  const razao = cliente.razaoSocial;
  const fantasia = cliente.nomeFantasia;
  useEffect(() => {
    if (ehNovo) return;
    const ctrl = new AbortController();
    let vivo = true;
    void (async () => {
      try {
        const nomes = [...new Set([razao, fantasia].map((n) => (n ?? '').trim()).filter(Boolean))];
        const todos: ItemCatalogo[] = [];
        let incompleto = false;
        for (const nome of nomes) {
          let cursor: string | null = null;
          for (let p = 0; p < PAGINAS_MAX; p++) {
            const pagina = await buscaIndex.listarPagina({ termo: nome }, cursor, ctrl.signal);
            todos.push(...pagina.itens);
            if (!pagina.temMais || !pagina.proximoCursor) break;
            cursor = pagina.proximoCursor;
            if (p === PAGINAS_MAX - 1) incompleto = true;
          }
        }
        const itens = equipamentosDoCliente(todos, { razaoSocial: razao, nomeFantasia: fantasia });
        let painel = null;
        try {
          painel = await carregarPainel();
        } catch {
          painel = null; // prazos ficam "—"; a lista de equipamentos continua valendo
        }
        if (vivo) setEquip({ tipo: 'pronto', itens, prazos: resumoPrazos(itens.map((i) => i.tag), painel), incompleto });
      } catch {
        if (vivo && !ctrl.signal.aborted) setEquip({ tipo: 'erro' });
      }
    })();
    return () => {
      vivo = false;
      ctrl.abort();
    };
  }, [ehNovo, razao, fantasia]);

  // ── Logins do Portal (só o mestre consegue listar) ──────────────────────────
  const idCliente = cliente.id;
  function recarregarLogins() {
    listarSubUsuarios()
      .then((subs) => setLoginsPortal(subs.filter((s) => s.papel === 'cliente' && s.cliente_id === idCliente)))
      .catch(() => setLoginsPortal(null)); // sem migração/offline: fica o portalEmail gravado
  }
  useEffect(() => {
    if (ehNovo || !isMestre()) return;
    let vivo = true;
    listarSubUsuarios()
      .then((subs) => vivo && setLoginsPortal(subs.filter((s) => s.papel === 'cliente' && s.cliente_id === idCliente)))
      .catch(() => vivo && setLoginsPortal(null));
    return () => {
      vivo = false;
    };
  }, [ehNovo, idCliente]);

  // ── Fechar: Esc e clique fora, com confirmação se há alteração ──────────────
  function pedirFechar() {
    if (alterado) {
      setConfirmar('descartar');
      return;
    }
    aoFechar();
  }
  const pedirFecharRef = useRef(pedirFechar);
  useEffect(() => {
    pedirFecharRef.current = pedirFechar;
  });
  const confirmarRef = useRef(confirmar);
  useEffect(() => {
    confirmarRef.current = confirmar;
  }, [confirmar]);
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Menu ⋯ aberto: o Esc é dele (fecha o menu), não do modal.
      if (caixa.current?.querySelector('.mmais [aria-expanded="true"]')) return;
      e.preventDefault();
      if (confirmarRef.current) setConfirmar(null);
      else pedirFecharRef.current();
    }
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);
  useEffect(() => {
    caixa.current?.focus();
    // A página por trás não rola enquanto o modal está aberto.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  // ── Ações ───────────────────────────────────────────────────────────────────
  function set(chave: keyof Cliente, valor: string) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  function editar(abaInicial: Aba = 'dados') {
    setForm({ ...cliente });
    setTentouSalvar(false);
    setResultados(null);
    setBuscaErro(null);
    setPortalMsg(null);
    setAba(abaInicial === 'equip' || abaInicial === 'local' ? 'dados' : abaInicial);
    setModo('edicao');
  }

  function cancelar() {
    if (ehNovo) {
      aoFechar();
      return;
    }
    setForm({ ...cliente });
    setTentouSalvar(false);
    setModo('leitura');
  }

  async function salvar() {
    if (razaoVazia) {
      setTentouSalvar(true);
      setAba('dados');
      return;
    }
    if (gravando) return;
    setGravando(true);
    setErroGravar(null);
    try {
      await salvarCliente(form);
      aoMudarLista(listarClientes());
      setCliente(form);
      setEhNovo(false);
      setModo('leitura');
    } catch (e) {
      setErroGravar(e instanceof Error ? e.message : 'Não foi possível salvar o cliente.');
    } finally {
      setGravando(false);
    }
  }

  async function excluir() {
    if (gravando) return;
    setGravando(true);
    setErroGravar(null);
    try {
      await excluirCliente(cliente.id);
      aoMudarLista(listarClientes());
      aoFechar();
    } catch (e) {
      setConfirmar(null);
      setErroGravar(e instanceof Error ? e.message : 'Não foi possível excluir o cliente.');
    } finally {
      setGravando(false);
    }
  }

  async function buscarNoGoogle() {
    const texto = buscaTexto.trim();
    if (!texto || buscando) return;
    setBuscando(true);
    setBuscaErro(null);
    setResultados(null);
    try {
      setResultados(await buscarEmpresas(texto));
    } catch (e) {
      setBuscaErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBuscando(false);
    }
  }

  function aplicarResultado(r: ResultadoPlace) {
    setForm((f) => ({
      ...f,
      razaoSocial: f.razaoSocial || r.nome,
      nomeFantasia: f.nomeFantasia || r.nome,
      endereco: r.endereco || r.enderecoCompleto,
      bairro: r.bairro,
      cidade: r.cidade,
      estado: r.estado,
      cep: r.cep,
      telefone: f.telefone || r.telefone,
      website: r.website,
      logoUrl: r.logoUrl,
      placeId: r.placeId,
      lat: r.lat,
      lng: r.lng,
    }));
    setResultados(null);
  }

  async function criarAcesso() {
    setPortalMsg(null);
    if (!portalEmail.trim() || portalSenha.length < 6) {
      setPortalMsg('Informe e-mail e senha com pelo menos 6 caracteres.');
      return;
    }
    setCriandoPortal(true);
    try {
      const email = portalEmail.trim();
      await criarAcessoCliente(email, portalSenha, cliente.id);
      // Grava o login no cliente para ficar visível no detalhe (a qualquer usuário).
      // Vai no CADASTRO salvo e no formulário em curso, sem salvar o resto do formulário.
      const salvo = { ...cliente, portalEmail: email };
      await salvarCliente(salvo);
      setCliente(salvo);
      setForm((f) => ({ ...f, portalEmail: email }));
      aoMudarLista(listarClientes());
      setPortalMsg(`Acesso do portal criado para ${email}.`);
      setPortalEmail('');
      setPortalSenha('');
      recarregarLogins();
    } catch (er) {
      setPortalMsg(er instanceof Error ? er.message : String(er));
    } finally {
      setCriandoPortal(false);
    }
  }

  async function resetarSenhaAcesso(login: SubUsuario) {
    const nova = window.prompt(`Nova senha para ${login.email} (mín. 6):`);
    if (!nova || nova.length < 6) return;
    try {
      await resetarSenhaSub(login.id, nova);
      window.alert('Senha atualizada.');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function excluirAcessoPortal(login: SubUsuario) {
    if (!window.confirm(`Excluir o acesso de ${login.email}? Essa ação não tem volta. Os dados do cliente continuam salvos.`)) return;
    try {
      await excluirSub(login.id);
      await excluirPermissoes(login.id);
      if (cliente.portalEmail) {
        const atualizado = { ...cliente, portalEmail: undefined };
        await salvarCliente(atualizado);
        setCliente(atualizado);
        aoMudarLista(listarClientes());
      }
      recarregarLogins();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function apagarLoginLegado() {
    if (!window.confirm(`Remover o login "${cliente.portalEmail}" deste cliente?`)) return;
    const atualizado = { ...cliente, portalEmail: undefined };
    try {
      await salvarCliente(atualizado);
      setCliente(atualizado);
      aoMudarLista(listarClientes());
    } catch (e) {
      setErroGravar(e instanceof Error ? e.message : 'Não foi possível remover o login.');
    }
  }

  // ── Derivados ───────────────────────────────────────────────────────────────
  const temPortal = Boolean(cliente.portalEmail) || Boolean(loginsPortal && loginsPortal.length > 0);
  const nEquip = equip.tipo === 'pronto' ? equip.itens.length : undefined;
  const sub = [cliente.cnpj, cidadeUf(cliente), nEquip !== undefined ? `${nEquip} ${nEquip === 1 ? 'equipamento' : 'equipamentos'}` : '']
    .filter(Boolean);
  const enderecoCompleto = [cliente.endereco, cliente.bairro, cidadeUf(cliente), cliente.cep].filter(Boolean).join(' — ');
  const mapa = useMemo(() => (aba === 'local' ? urlMapaEmbed(cliente) : null), [aba, cliente]);

  const kpi = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('pt-BR'));
  const vencidos = equip.tipo === 'pronto' ? equip.prazos.vencidos : undefined;
  const aVencer = equip.tipo === 'pronto' ? equip.prazos.aVencer30 : undefined;
  const inspecoes = equip.tipo === 'pronto' ? totalInspecoes(equip.itens) : undefined;

  const abas: { id: Aba; rotulo: string; n?: number }[] = [
    { id: 'dados', rotulo: 'Dados' },
    ...(ehNovo ? [] : [{ id: 'equip' as const, rotulo: 'Equipamentos', n: nEquip }]),
    { id: 'portal', rotulo: 'Portal' },
    ...(ehNovo || modo === 'edicao' ? [] : [{ id: 'local' as const, rotulo: 'Localização' }]),
  ];
  // Na edição a Localização some (o mapa não ajuda a preencher); a escolhida volta a Dados.
  const abaVisivel = abas.some((a) => a.id === aba) ? aba : 'dados';

  const campo = (rotulo: string, chave: keyof Cliente, extra: { tipo?: string; ph?: string; cheio?: boolean; max?: number; mono?: boolean } = {}) => {
    const id = `${idForm}-${chave}`;
    return (
      <div className={`mcli-f${extra.cheio ? ' cheio' : ''}`}>
        <label htmlFor={id}>{rotulo}</label>
        <input
          id={id}
          type={extra.tipo ?? 'text'}
          className={extra.mono ? 'mono' : undefined}
          value={(form[chave] as string | undefined) ?? ''}
          onChange={(e) => set(chave, e.target.value)}
          placeholder={extra.ph}
          maxLength={extra.max}
        />
      </div>
    );
  };

  const corpo = (
    <div
      className="mcli-overlay"
      onMouseDown={(e) => {
        // Clique FORA da caixa. Na edição não fecha: alteração não se perde por um clique errado.
        if (e.target === e.currentTarget && modo === 'leitura' && !confirmar) aoFechar();
      }}
    >
      <div
        className="mcli"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        ref={caixa}
        tabIndex={-1}
        hidden={confirmar !== null}
      >
        {/* ── Cabeçalho ── */}
        <header className="mcli-hd">
          <LogoCliente cliente={modo === 'edicao' ? form : cliente} tam={32} classe="mcli-logo" />
          <h2 id={idTitulo} className="mcli-tit">
            <span>{(modo === 'edicao' ? form.razaoSocial : cliente.razaoSocial) || 'Novo cliente'}</span>
            {modo === 'leitura' && temPortal && (
              <span className="badge b-ok">
                <Icone nome="checkcircle" tam={12} /> Portal ativo
              </span>
            )}
          </h2>
          <div className="mcli-acoes">
            {modo === 'leitura' ? (
              <>
                <button type="button" className="mcli-btn sec" onClick={() => editar()}>
                  <Icone nome="pencil" tam={14} /> Editar
                </button>
                <MenuMais
                  rotulo="Mais ações do cliente"
                  acoes={[
                    {
                      rotulo: 'Excluir cliente…',
                      destrutiva: true,
                      icone: <Icone nome="trash" tam={14} />,
                      aoEscolher: () => setConfirmar('excluir'),
                    },
                  ]}
                />
              </>
            ) : (
              <span className="badge b-warn">
                <Icone nome="pencil" tam={12} /> {ehNovo ? 'Novo cliente' : 'Editando'}
              </span>
            )}
            <button type="button" className="mcli-btn ic fechar" aria-label="Fechar" title="Fechar" onClick={pedirFechar}>
              <Icone nome="x" tam={16} />
            </button>
          </div>
          {sub.length > 0 && modo === 'leitura' && (
            <p className="mcli-sub">
              {cliente.cnpj && <span className="mono">{cliente.cnpj}</span>}
              {sub.slice(cliente.cnpj ? 1 : 0).map((s) => (
                <span key={s}>{s}</span>
              ))}
            </p>
          )}
        </header>

        {/* ── KPIs: uma faixa, células separadas por fio ── */}
        {!ehNovo && modo === 'leitura' && (
          <div className="mcli-kpis">
            <div className="mcli-kpi">
              <div className="mcli-kpi-rot">Equipamentos</div>
              <div className="mcli-kpi-val">{equip.tipo === 'carregando' ? '…' : kpi(nEquip)}</div>
            </div>
            <div className="mcli-kpi">
              <div className="mcli-kpi-rot">
                Vencidos
                {vencidos !== undefined && vencidos > 0 && (
                  <button type="button" className="mcli-link" onClick={() => setAba('equip')}>
                    Ver itens <Icone nome="arrowright" tam={12} />
                  </button>
                )}
              </div>
              <div className="mcli-kpi-val">
                {vencidos !== undefined && vencidos > 0 && <span className="ponto crit" aria-hidden="true" />}
                {equip.tipo === 'carregando' ? '…' : kpi(vencidos)}
              </div>
            </div>
            <div className="mcli-kpi">
              <div className="mcli-kpi-rot">A vencer em 30 dias</div>
              <div className="mcli-kpi-val">{equip.tipo === 'carregando' ? '…' : kpi(aVencer)}</div>
            </div>
            <div className="mcli-kpi">
              <div className="mcli-kpi-rot">Inspeções</div>
              <div className="mcli-kpi-val">{equip.tipo === 'carregando' ? '…' : kpi(inspecoes)}</div>
            </div>
          </div>
        )}

        {/* ── Corpo ── */}
        <div className="mcli-corpo">
          <div className="mcli-seg" role="tablist" aria-label="Seções do cliente">
            {abas.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={abaVisivel === a.id}
                onClick={() => setAba(a.id)}
              >
                {a.rotulo}
                {a.n !== undefined && <span className="n">{a.n}</span>}
              </button>
            ))}
          </div>

          {/* Dados · leitura */}
          {abaVisivel === 'dados' && modo === 'leitura' && (
            <dl className="mcli-leitura">
              <div><dt>Razão social</dt><dd>{cliente.razaoSocial || '—'}</dd></div>
              <div><dt>Nome fantasia</dt><dd>{cliente.nomeFantasia || '—'}</dd></div>
              <div><dt>CNPJ</dt><dd className="mono">{cliente.cnpj || '—'}</dd></div>
              <div><dt>Atividade</dt><dd>{cliente.atividade || '—'}</dd></div>
              <div><dt>Contato</dt><dd>{cliente.contato || '—'}</dd></div>
              <div><dt>Telefone</dt><dd className="mono">{cliente.telefone || '—'}</dd></div>
              <div><dt>E-mail</dt><dd>{cliente.email || '—'}</dd></div>
              <div>
                <dt>Site</dt>
                <dd>
                  {cliente.website ? (
                    <a className="mcli-link" href={cliente.website} target="_blank" rel="noreferrer">
                      {cliente.website.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="cheio"><dt>Endereço</dt><dd>{enderecoCompleto || '—'}</dd></div>
              {cliente.anotacoes && (
                <div className="cheio"><dt>Anotações</dt><dd className="pre">{cliente.anotacoes}</dd></div>
              )}
            </dl>
          )}

          {/* Dados · edição */}
          {abaVisivel === 'dados' && modo === 'edicao' && (
            <div className="mcli-edicao">
              {GOOGLE_MAPS_KEY && (
                <div className="mcli-google cheio">
                  <label htmlFor={`${idForm}-google`}>Buscar empresa no Google</label>
                  <div className="mcli-google-linha">
                    <input
                      id={`${idForm}-google`}
                      type="text"
                      value={buscaTexto}
                      onChange={(e) => setBuscaTexto(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.repeat && buscarNoGoogle()}
                      placeholder="Nome da empresa e cidade — ex.: ES Engenharia Vitória"
                    />
                    <button type="button" className="mcli-btn sec" disabled={buscando} onClick={buscarNoGoogle}>
                      <Icone nome="search" tam={14} /> {buscando ? 'Buscando…' : 'Buscar'}
                    </button>
                  </div>
                  {buscaErro && <p className="mcli-erro" role="alert"><Icone nome="alerttri" tam={13} /> {buscaErro}</p>}
                  {resultados && resultados.length === 0 && <p className="mcli-ajuda">Nenhum resultado.</p>}
                  {resultados && resultados.length > 0 && (
                    <div className="mcli-google-res">
                      {resultados.map((r) => (
                        <button type="button" key={r.placeId} onClick={() => aplicarResultado(r)}>
                          <span className="mcli-google-txt">
                            <strong>{r.nome}</strong>
                            <span>{r.enderecoCompleto}</span>
                          </span>
                          <span className="mcli-link">Usar dados →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mcli-f cheio">
                <label htmlFor={`${idForm}-razaoSocial`}>
                  Razão social <em>*</em>
                </label>
                <input
                  id={`${idForm}-razaoSocial`}
                  type="text"
                  className={tentouSalvar && razaoVazia ? 'erro' : undefined}
                  value={form.razaoSocial}
                  onChange={(e) => set('razaoSocial', e.target.value)}
                  placeholder="Razão social da empresa"
                  aria-invalid={tentouSalvar && razaoVazia}
                  aria-describedby={tentouSalvar && razaoVazia ? `${idForm}-razao-erro` : undefined}
                />
                {tentouSalvar && razaoVazia && (
                  <p className="mcli-erro" id={`${idForm}-razao-erro`} role="alert">
                    <Icone nome="alerttri" tam={13} /> Informe a razão social para salvar.
                  </p>
                )}
              </div>
              {campo('Nome fantasia', 'nomeFantasia')}
              {campo('CNPJ', 'cnpj', { ph: '00.000.000/0000-00', mono: true })}
              {campo('Atividade principal', 'atividade')}
              <div className="mcli-f">
                <label htmlFor={`${idForm}-website`}>Site</label>
                <input
                  id={`${idForm}-website`}
                  type="url"
                  value={form.website ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value, logoUrl: faviconDe(e.target.value) }))}
                  placeholder="https://empresa.com.br"
                />
              </div>
              {campo('Contato / representante', 'contato')}
              {campo('Telefone', 'telefone', { tipo: 'tel', ph: '(00) 00000-0000', mono: true })}
              {campo('E-mail', 'email', { tipo: 'email' })}
              {campo('Endereço', 'endereco', { ph: 'Rua, número, complemento', cheio: true })}
              {campo('Bairro', 'bairro')}
              {campo('CEP', 'cep', { ph: '00000-000', mono: true })}
              {campo('Cidade', 'cidade')}
              {campo('UF', 'estado', { ph: 'UF', max: 2 })}
              <div className="mcli-f cheio">
                <label htmlFor={`${idForm}-anotacoes`}>Anotações</label>
                <textarea
                  id={`${idForm}-anotacoes`}
                  value={form.anotacoes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, anotacoes: e.target.value }))}
                  placeholder="Observações internas sobre este cliente (horários, portaria, contatos extras...)"
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Equipamentos */}
          {abaVisivel === 'equip' && (
            <div className="mcli-equip">
              {equip.tipo === 'carregando' ? (
                <p className="mcli-ajuda" role="status">Carregando os equipamentos deste cliente…</p>
              ) : equip.tipo === 'erro' ? (
                <p className="mcli-ajuda" role="status">Não foi possível consultar os equipamentos agora.</p>
              ) : equip.itens.length === 0 ? (
                <p className="mcli-ajuda">Nenhum equipamento com este cliente na ficha.</p>
              ) : (
                <>
                  <table className="mcli-tabela">
                    <thead>
                      <tr><th>TAG</th><th>Equipamento</th><th>Próxima inspeção</th><th>Situação</th><th aria-label="Abrir" /></tr>
                    </thead>
                    <tbody>
                      {equip.itens.map((i) => {
                        const p = equip.prazos.porTag.get(i.tag);
                        return (
                          <tr key={i.tag} onClick={() => navigate(`/equipamento/${encodeURIComponent(i.tag)}`)}>
                            <td className="mono tag">
                              <button
                                type="button"
                                className="mcli-linha-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/equipamento/${encodeURIComponent(i.tag)}`);
                                }}
                              >
                                {i.tag}
                              </button>
                            </td>
                            <td className="mcli-eq">{i.descricao || (i.tipo ? ROTULO_TIPO[i.tipo] ?? i.tipo : '—')}</td>
                            <td>
                              <span className="mono">{dataBr(p?.vencimento)}</span>
                              {p?.dias !== undefined && (
                                <span className={`mcli-rel${p.dias < 0 ? ' crit' : ''}`}>
                                  {p.dias < 0 ? `há ${-p.dias} d` : `em ${p.dias} d`}
                                </span>
                              )}
                            </td>
                            <td>
                              {!p || p.status === 'semPrazo' ? (
                                <span className="badge b-neutro">Sem prazo</span>
                              ) : p.status === 'crit' ? (
                                <span className="badge b-crit"><Icone nome="alerttri" tam={12} /> Vencido</span>
                              ) : p.status === 'warn' ? (
                                <span className="badge b-warn"><Icone nome="clock" tam={12} /> A vencer</span>
                              ) : (
                                <span className="badge b-ok"><Icone nome="checkcircle" tam={12} /> Em dia</span>
                              )}
                            </td>
                            <td className="seta"><Icone nome="chevright" tam={14} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {equip.incompleto && <p className="mcli-ajuda">Mostrando os primeiros {equip.itens.length}. Use a busca de Equipamentos para ver todos.</p>}
                </>
              )}
            </div>
          )}

          {/* Portal */}
          {abaVisivel === 'portal' && (
            <div className="mcli-portal">
              {loginsPortal && loginsPortal.length > 0 ? (
                <ul className="mcli-logins">
                  {loginsPortal.map((s) => (
                    <li key={s.id}>
                      <Icone nome="key" tam={14} />
                      <span className="mcli-login-email">{s.email}</span>
                      <span className={`badge ${s.ativo ? 'b-ok' : 'b-neutro'}`}>{s.ativo ? 'Ativo' : 'Desativado'}</span>
                      {s.ultimo_acesso && <span className="mcli-ajuda">Último acesso: {new Date(s.ultimo_acesso).toLocaleString('pt-BR')}</span>}
                      {isMestre() && modo === 'leitura' && (
                        <span className="mcli-login-acoes">
                          <button type="button" className="mcli-btn ic" title="Trocar senha" aria-label={`Trocar senha de ${s.email}`} onClick={() => resetarSenhaAcesso(s)}>
                            <Icone nome="key" tam={14} />
                          </button>
                          <button type="button" className="mcli-btn ic perigo" title="Excluir acesso" aria-label={`Excluir acesso de ${s.email}`} onClick={() => excluirAcessoPortal(s)}>
                            <Icone nome="trash" tam={14} />
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : cliente.portalEmail ? (
                <ul className="mcli-logins">
                  <li>
                    <Icone nome="key" tam={14} />
                    <span className="mcli-login-email">{cliente.portalEmail}</span>
                    <span className="badge b-ok">Login do portal</span>
                    {isMestre() && modo === 'leitura' && (
                      <span className="mcli-login-acoes">
                        <button type="button" className="mcli-btn ic perigo" title="Remover login" aria-label="Remover login" onClick={() => void apagarLoginLegado()}>
                          <Icone nome="trash" tam={14} />
                        </button>
                      </span>
                    )}
                  </li>
                </ul>
              ) : (
                <p className="mcli-ajuda">Sem acesso ao Portal criado para este cliente.</p>
              )}

              {modo === 'leitura' && !ehNovo && isMestre() && !temPortal && (
                <button type="button" className="mcli-btn sec" onClick={() => editar('portal')}>
                  <Icone nome="key" tam={14} /> Criar acesso
                </button>
              )}

              {modo === 'edicao' && !ehNovo && isMestre() && (
                <div className="mcli-portal-novo">
                  <p className="mcli-ajuda">
                    Crie um login para esta empresa acompanhar os próprios equipamentos e documentos num portal
                    somente leitura. O acesso é criado na hora, sem depender do "Salvar alterações".
                  </p>
                  <div className="mcli-edicao">
                    <div className="mcli-f">
                      <label htmlFor={`${idForm}-portal-email`}>E-mail de acesso</label>
                      <input id={`${idForm}-portal-email`} type="email" value={portalEmail} onChange={(e) => setPortalEmail(e.target.value)} placeholder="cliente@empresa.com" />
                    </div>
                    <div className="mcli-f">
                      <label htmlFor={`${idForm}-portal-senha`}>Senha (mín. 6)</label>
                      <input id={`${idForm}-portal-senha`} type="text" value={portalSenha} onChange={(e) => setPortalSenha(e.target.value)} />
                    </div>
                  </div>
                  <button type="button" className="mcli-btn sec" disabled={criandoPortal} onClick={() => void criarAcesso()}>
                    {criandoPortal ? 'Criando…' : 'Criar acesso do cliente'}
                  </button>
                  {portalMsg && <p className="mcli-ajuda forte" role="status">{portalMsg}</p>}
                </div>
              )}
              {modo === 'edicao' && ehNovo && (
                <p className="mcli-ajuda">Salve o cliente primeiro; depois, em Editar, o acesso ao Portal pode ser criado.</p>
              )}
            </div>
          )}

          {/* Localização */}
          {abaVisivel === 'local' && (
            mapa ? (
              <div className="mcli-mapa">
                <iframe src={mapa} title={`Mapa — ${cliente.razaoSocial}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
              </div>
            ) : (
              <p className="mcli-ajuda">
                {GOOGLE_MAPS_KEY ? 'Sem endereço cadastrado para exibir o mapa.' : 'Configure VITE_GOOGLE_MAPS_KEY para exibir o mapa.'}
              </p>
            )
          )}
        </div>

        {/* ── Rodapé ── */}
        <footer className="mcli-ft">
          {erroGravar && (
            <p className="mcli-erro mcli-ft-erro" role="alert">
              <Icone nome="alerttri" tam={13} /> {erroGravar}
            </p>
          )}
          {modo === 'leitura' ? (
            <button type="button" className="mcli-btn sec" onClick={aoFechar}>
              Fechar
            </button>
          ) : (
            <>
              <button type="button" className="mcli-btn sec" onClick={cancelar}>
                Cancelar
              </button>
              <button type="button" className="mcli-btn pri" disabled={gravando} onClick={() => void salvar()}>
                {gravando ? 'Salvando…' : ehNovo ? 'Cadastrar cliente' : 'Salvar alterações'}
              </button>
            </>
          )}
        </footer>
      </div>

      {/* ── Confirmações: substituem a caixa, nunca empilham por cima dela ── */}
      {confirmar === 'excluir' && (
        <div className="mcli mcli-confirma" role="alertdialog" aria-modal="true" aria-labelledby={`${idTitulo}-cf`}>
          <header className="mcli-hd simples">
            <h2 id={`${idTitulo}-cf`} className="mcli-tit"><span>Excluir {cliente.razaoSocial}?</span></h2>
          </header>
          <div className="mcli-corpo">
            <p>
              O cadastro sai da lista de clientes. Os equipamentos, os relatórios emitidos e os documentos{' '}
              <b>não</b> são alterados — documento oficial não se altera nem se exclui.
            </p>
          </div>
          <footer className="mcli-ft">
            <button type="button" className="mcli-btn sec" autoFocus onClick={() => setConfirmar(null)}>
              Cancelar
            </button>
            <button type="button" className="mcli-btn perigo" disabled={gravando} onClick={() => void excluir()}>
              <Icone nome="trash" tam={14} /> Excluir cliente
            </button>
          </footer>
        </div>
      )}
      {confirmar === 'descartar' && (
        <div className="mcli mcli-confirma" role="alertdialog" aria-modal="true" aria-labelledby={`${idTitulo}-ds`}>
          <header className="mcli-hd simples">
            <h2 id={`${idTitulo}-ds`} className="mcli-tit"><span>Descartar as alterações?</span></h2>
          </header>
          <div className="mcli-corpo">
            <p>O que foi alterado neste cadastro ainda não foi salvo.</p>
          </div>
          <footer className="mcli-ft">
            <button type="button" className="mcli-btn sec" autoFocus onClick={() => setConfirmar(null)}>
              Continuar editando
            </button>
            <button type="button" className="mcli-btn perigo" onClick={aoFechar}>
              Descartar
            </button>
          </footer>
        </div>
      )}
    </div>
  );

  return createPortal(corpo, document.body);
}
