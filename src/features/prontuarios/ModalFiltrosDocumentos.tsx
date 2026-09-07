/**
 * O filtro da LISTA DE DOCUMENTOS de prontuário.
 *
 * ## Por que ele não é o filtro de antes
 *
 * O filtro anterior perguntava "com prontuário / sem prontuário ainda" — a
 * pergunta de uma lista de EQUIPAMENTOS, que era o que a tela mostrava. Desde
 * que a lista passou a ser de DOCUMENTOS, essa pergunta não tem resposta: toda
 * linha é um documento, então todas "têm prontuário". Ela saiu.
 *
 * As perguntas que sobram são as de quem procura um documento: quando foi
 * salvo ou emitido, de qual cliente, de qual equipamento, em que estado e em
 * que revisão.
 *
 * ## O que ele filtra, e de onde vem cada campo
 *
 * Tudo sai do índice (`indiceProntuarios`), que a lista já tem em memória.
 * Nenhum filtro daqui lê prontuário, abre PDF ou vai ao servidor.
 *
 * `tipo` e `categoria` só existem nas entradas gravadas a partir de 07/09/2026
 * — o índice antigo não os guardava. Em vez de mostrar um seletor que não
 * filtra nada, eles **só aparecem quando há valor para oferecer**: a mesma
 * regra do `null` que vale no resto do sistema, aplicada à interface.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import type { Cliente } from '../cadastros/tipos';
import type { DocumentoProntuario } from './indiceProntuarios';
import './modalFiltrosProntuarios.css';

export interface FiltroDocumentos {
  de: string;
  ate: string;
  cliente: string;
  tag: string;
  tipo: string;
  categoria: string;
  /** `''` = todas; `rascunho` e `emitido` são as duas situações reais. */
  situacao: '' | 'rascunho' | 'emitido';
  /** Número da revisão, como texto. `''` = todas. */
  revisao: string;
}

export const FILTRO_DOC_VAZIO: FiltroDocumentos = {
  de: '',
  ate: '',
  cliente: '',
  tag: '',
  tipo: '',
  categoria: '',
  situacao: '',
  revisao: '',
};

export function temFiltroDoc(f: FiltroDocumentos): boolean {
  return (Object.keys(FILTRO_DOC_VAZIO) as (keyof FiltroDocumentos)[]).some(
    (k) => f[k] !== FILTRO_DOC_VAZIO[k],
  );
}

/**
 * Atalhos de período, a partir de HOJE e sempre em `AAAA-MM-DD`.
 *
 * "Últimos 7 dias" inclui hoje — são 7 dias contando o de hoje, que é o que a
 * pessoa quer dizer. Contar 7 para trás a partir de ontem daria 8.
 */
export function periodoDe(
  qual: 'hoje' | '7' | '30',
  hoje = new Date(),
): { de: string; ate: string } {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ate = iso(hoje);
  if (qual === 'hoje') return { de: ate, ate };
  const d = new Date(hoje);
  d.setDate(d.getDate() - (qual === '7' ? 6 : 29));
  return { de: iso(d), ate };
}

/** O documento cai dentro do recorte? Pura, e por isso testável. */
export function passaNoFiltro(doc: DocumentoProntuario, f: FiltroDocumentos): boolean {
  const dia = (doc.atualizadoEm ?? '').slice(0, 10);
  // Documento sem data não é escondido por um filtro de data: ele não tem como
  // provar que está fora, e sumir em silêncio é o defeito que este sistema
  // persegue. Só sai quando o próprio campo de data é o recorte pedido.
  if (f.de && dia && dia < f.de) return false;
  if (f.ate && dia && dia > f.ate) return false;
  if ((f.de || f.ate) && !dia) return false;
  if (f.cliente && (doc.cliente ?? '') !== f.cliente) return false;
  if (f.tag && doc.tag !== f.tag) return false;
  if (f.tipo && (doc.tipo ?? '') !== f.tipo) return false;
  if (f.categoria && (doc.categoria ?? '') !== f.categoria) return false;
  if (f.situacao && doc.situacao !== f.situacao) return false;
  if (f.revisao && String(doc.revisao ?? '') !== f.revisao) return false;
  return true;
}

/** Logo do cliente, com o mesmo critério da tela de Empresas. */
function logoDe(c: Cliente | undefined): string {
  if (!c) return '';
  return c.logoUrl || '';
}

export default function ModalFiltrosDocumentos({
  valores,
  docs,
  clientes,
  aoAplicar,
  aoFechar,
}: {
  valores: FiltroDocumentos;
  /** A lista inteira — as opções saem dela, não de uma tabela inventada. */
  docs: readonly DocumentoProntuario[];
  clientes: readonly Cliente[];
  aoAplicar: (f: FiltroDocumentos) => void;
  aoFechar: () => void;
}) {
  const [f, setF] = useState<FiltroDocumentos>(valores);
  const [buscaEq, setBuscaEq] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FiltroDocumentos>(k: K, v: FiltroDocumentos[K]) =>
    setF((a) => ({ ...a, [k]: v }));

  useEffect(() => {
    primeiro.current?.focus();
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const foc = caixa.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (foc.length === 0) return;
      const p = foc[0];
      const u = foc[foc.length - 1];
      if (!e.shiftKey && document.activeElement === u) {
        e.preventDefault();
        p.focus();
      } else if (e.shiftKey && document.activeElement === p) {
        e.preventDefault();
        u.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  /* As opções saem do que EXISTE na lista — um seletor que oferece um valor
     sem documento nenhum atrás dele é um beco sem saída. */
  const unicos = (pega: (d: DocumentoProntuario) => string | null | undefined) =>
    [...new Set(docs.map(pega).filter(Boolean) as string[])].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true }),
    );

  const listaClientes = useMemo(() => unicos((d) => d.cliente), [docs]);
  const tipos = useMemo(() => unicos((d) => d.tipo), [docs]);
  const categorias = useMemo(() => unicos((d) => d.categoria), [docs]);
  const revisoes = useMemo(
    () => unicos((d) => (d.revisao ? String(d.revisao) : null)),
    [docs],
  );

  /** Equipamentos da lista, com o que identifica cada um. */
  const equipamentos = useMemo(() => {
    const mapa = new Map<string, { tag: string; nome: string | null; tipo: string | null; cliente: string | null }>();
    for (const d of docs) {
      if (!mapa.has(d.tag)) {
        mapa.set(d.tag, { tag: d.tag, nome: d.equipamento, tipo: d.tipo ?? null, cliente: d.cliente });
      }
    }
    return [...mapa.values()].sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR', { numeric: true }));
  }, [docs]);

  const equipamentosVisiveis = useMemo(() => {
    const t = buscaEq.trim().toLowerCase();
    if (!t) return equipamentos;
    return equipamentos.filter((e) =>
      [e.tag, e.nome, e.cliente].filter(Boolean).some((c) => String(c).toLowerCase().includes(t)),
    );
  }, [equipamentos, buscaEq]);

  const clientePorNome = useMemo(() => {
    const m = new Map<string, Cliente>();
    for (const c of clientes) {
      const nome = (c.razaoSocial || c.nomeFantasia || '').trim();
      if (nome) m.set(nome, c);
    }
    return m;
  }, [clientes]);

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Filtrar prontuários"
    >
      <div className="fj-modal-box mfp-box mfd-box" ref={caixa}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Prontuários</div>
            <h2>Filtrar documentos</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="mfp-corpo">
          <section className="mfp-secao">
            <h3>Período</h3>
            <div className="mfd-atalhos">
              {([
                ['hoje', 'Hoje'],
                ['7', 'Últimos 7 dias'],
                ['30', 'Últimos 30 dias'],
              ] as const).map(([q, rot]) => (
                <button
                  key={q}
                  type="button"
                  className="fj-btn fj-btn-ghost"
                  onClick={() => setF((a) => ({ ...a, ...periodoDe(q) }))}
                >
                  {rot}
                </button>
              ))}
              {(f.de || f.ate) && (
                <button
                  type="button"
                  className="fj-link"
                  onClick={() => setF((a) => ({ ...a, de: '', ate: '' }))}
                >
                  limpar período
                </button>
              )}
            </div>
            <div className="mfd-datas">
              <label>
                De
                <input ref={primeiro} type="date" value={f.de} onChange={(e) => set('de', e.target.value)} />
              </label>
              <label>
                Até
                <input type="date" value={f.ate} onChange={(e) => set('ate', e.target.value)} />
              </label>
            </div>
            <p className="mfp-nota">
              A data de cada linha é a da <b>emissão</b>, quando o documento foi emitido, e a do
              último <b>salvamento</b> quando ainda é rascunho.
            </p>
          </section>

          {listaClientes.length > 0 && (
            <section className="mfp-secao">
              <h3>Empresa / cliente</h3>
              <div className="mfd-empresas" role="listbox" aria-label="Empresa">
                <button
                  type="button"
                  role="option"
                  aria-selected={f.cliente === ''}
                  className={`mfd-empresa${f.cliente === '' ? ' ativa' : ''}`}
                  onClick={() => set('cliente', '')}
                >
                  <span className="mfd-logo mfd-logo-todas">
                    <Icone nome="building" tam={14} />
                  </span>
                  Todas as empresas
                </button>
                {listaClientes.map((nome) => {
                  const c = clientePorNome.get(nome);
                  const url = logoDe(c);
                  return (
                    <button
                      key={nome}
                      type="button"
                      role="option"
                      aria-selected={f.cliente === nome}
                      className={`mfd-empresa${f.cliente === nome ? ' ativa' : ''}`}
                      onClick={() => set('cliente', nome)}
                    >
                      {/* A logo é a REAL do cadastro. Sem logo, a inicial —
                          nunca uma imagem inventada para o cliente. */}
                      <span className="mfd-logo">
                        {url ? <img src={url} alt="" loading="lazy" /> : nome.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="mfd-empresa-nome">{nome}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {equipamentos.length > 1 && (
            <section className="mfp-secao">
              <h3>Equipamento</h3>
              <input
                className="mfd-busca"
                value={buscaEq}
                onChange={(e) => setBuscaEq(e.target.value)}
                placeholder="Buscar por TAG, nome ou cliente…"
              />
              <div className="mfd-equipamentos" role="listbox" aria-label="Equipamento">
                <button
                  type="button"
                  role="option"
                  aria-selected={f.tag === ''}
                  className={`mfd-equipamento${f.tag === '' ? ' ativo' : ''}`}
                  onClick={() => set('tag', '')}
                >
                  Todos os equipamentos
                </button>
                {equipamentosVisiveis.map((e) => (
                  <button
                    key={e.tag}
                    type="button"
                    role="option"
                    aria-selected={f.tag === e.tag}
                    className={`mfd-equipamento${f.tag === e.tag ? ' ativo' : ''}`}
                    onClick={() => set('tag', e.tag)}
                  >
                    <strong>{e.tag}</strong>
                    <span>{[e.nome, e.tipo, e.cliente].filter(Boolean).join(' · ') || '—'}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="mfd-linha">
            <section className="mfp-secao">
              <h3>Situação</h3>
              <select
                value={f.situacao}
                onChange={(e) => set('situacao', e.target.value as FiltroDocumentos['situacao'])}
              >
                <option value="">Todas</option>
                <option value="rascunho">Rascunho</option>
                <option value="emitido">Emitido</option>
              </select>
            </section>

            {revisoes.length > 0 && (
              <section className="mfp-secao">
                <h3>Revisão</h3>
                <select value={f.revisao} onChange={(e) => set('revisao', e.target.value)}>
                  <option value="">Todas</option>
                  {revisoes.map((r) => (
                    <option key={r} value={r}>
                      Rev. {r.padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </section>
            )}
          </div>

          {/* Tipo e categoria só existem nas entradas gravadas a partir de
              07/09/2026. Oferecer um seletor vazio seria pior do que não
              oferecer: ele filtraria tudo para fora sem explicação. */}
          {(tipos.length > 0 || categorias.length > 0) && (
            <div className="mfd-linha">
              {tipos.length > 0 && (
                <section className="mfp-secao">
                  <h3>Tipo do equipamento</h3>
                  <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
                    <option value="">Todos</option>
                    {tipos.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </section>
              )}
              {categorias.length > 0 && (
                <section className="mfp-secao">
                  <h3>Categoria</h3>
                  <select value={f.categoria} onChange={(e) => set('categoria', e.target.value)}>
                    <option value="">Todas</option>
                    {categorias.map((c) => (
                      <option key={c} value={c}>
                        Categoria {c}
                      </option>
                    ))}
                  </select>
                </section>
              )}
            </div>
          )}
        </div>

        <div className="mfp-acoes">
          <button
            type="button"
            className="fj-btn fj-btn-ghost mfp-limpar"
            onClick={() => setF(FILTRO_DOC_VAZIO)}
            disabled={!temFiltroDoc(f)}
          >
            Limpar
          </button>
          <div className="mfp-acoes-dir">
            <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="button" className="fj-btn fj-btn-primary" onClick={() => aoAplicar(f)}>
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
