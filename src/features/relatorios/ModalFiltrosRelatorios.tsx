/**
 * O filtro de `/relatorios` — modal, e não painel embaixo da barra.
 *
 * ## Por que saiu do painel
 *
 * O painel abria EMPURRANDO a lista para baixo: escolher um período fazia o
 * primeiro relatório sair da tela, e o resultado do filtro aparecia num lugar
 * que o usuário não estava mais olhando. Pior, ele aplicava a cada `onChange` —
 * mexer no "De" disparava uma consulta antes do "Até" existir, e a lista piscava
 * um recorte que ninguém pediu.
 *
 * ## As duas regras deste modal
 *
 * 1. **RASCUNHO até o Aplicar.** O estado daqui é local; a URL (que é a fonte da
 *    verdade da lista) só muda no "Aplicar". "Cancelar" descarta, e é por isso
 *    que ele pode existir — no painel antigo não havia o que cancelar, porque
 *    tudo já tinha acontecido.
 * 2. **Só filtro que a lista sabe aplicar de verdade.** Período e tipo vão na
 *    CONSULTA. Empresa, escopo e lista de arquivados são recortes do cliente que
 *    já existiam. A SITUAÇÃO é exata sem consulta nenhuma: rascunho é registro
 *    local (`nr13_rascunho_`), finalizado é o que vem do servidor, e arquivado
 *    já era o seletor de lista. Nenhum filtro daqui varre documento.
 */
import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import type { EscopoRelatorios } from '../../services/buscaRelatorios';
import type { ModoArquivo } from './arquivados';
import type { TipoInspecao } from './tipos';
import './modalFiltrosRelatorios.css';

/** Situação, como recorte. `''` = todas. */
export type RecorteSituacao = '' | 'rascunho' | 'finalizado' | 'arquivado';

export interface ValoresFiltro {
  de: string;
  ate: string;
  tipo: string;
  empresa: string;
  situacao: RecorteSituacao;
  escopo: EscopoRelatorios;
  arquivo: ModoArquivo;
}

/** Nenhum recorte — o estado em que a lista mostra o conjunto padrão. */
export const FILTRO_VAZIO: ValoresFiltro = {
  de: '',
  ate: '',
  tipo: '',
  empresa: '',
  situacao: '',
  escopo: 'ativos',
  arquivo: 'ativos',
};

/** Há algum recorte ativo? É o que acende o botão da barra. */
export function temAlgumFiltro(v: ValoresFiltro): boolean {
  return (
    v.de !== '' ||
    v.ate !== '' ||
    v.tipo !== '' ||
    v.empresa !== '' ||
    v.situacao !== '' ||
    v.escopo !== 'ativos' ||
    v.arquivo !== 'ativos'
  );
}

/**
 * Atalhos de período.
 *
 * Calculados a partir de HOJE, no fuso do aparelho, e sempre em `AAAA-MM-DD` —
 * o mesmo formato que a consulta espera. Nada de "últimos 30 dias" virar um
 * intervalo diferente conforme a hora do dia: a data é do dia, não do instante.
 */
export function atalhoPeriodo(qual: 'mes' | 'ano' | '12m', hoje = new Date()): { de: string; ate: string } {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ate = iso(hoje);
  if (qual === 'mes') return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate };
  if (qual === 'ano') return { de: iso(new Date(hoje.getFullYear(), 0, 1)), ate };
  const d = new Date(hoje);
  d.setFullYear(d.getFullYear() - 1);
  return { de: iso(d), ate };
}

export interface PropsModalFiltros {
  valores: ValoresFiltro;
  tipos: readonly TipoInspecao[];
  /** Empresas conhecidas; vazio enquanto o mapa TAG → empresa não carregou. */
  empresas: readonly string[];
  carregandoEmpresas: boolean;
  /** O mapa não alcançou o parque inteiro — a tela precisa DIZER. */
  empresasIncompletas: boolean;
  /** Quantos relatórios de equipamento excluído existem (rótulo da opção). */
  rotuloHistoricos?: string;
  aoAplicar: (v: ValoresFiltro) => void;
  aoFechar: () => void;
}

export default function ModalFiltrosRelatorios({
  valores,
  tipos,
  empresas,
  carregandoEmpresas,
  empresasIncompletas,
  rotuloHistoricos = '',
  aoAplicar,
  aoFechar,
}: PropsModalFiltros) {
  const [v, setV] = useState<ValoresFiltro>(valores);
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ValoresFiltro>(campo: K, valor: ValoresFiltro[K]) =>
    setV((atual) => ({ ...atual, [campo]: valor }));

  // Foco inicial no primeiro campo — quem abriu o filtro veio filtrar.
  useEffect(() => {
    primeiro.current?.focus();
  }, []);

  /**
   * ESC fecha e Tab circula DENTRO do modal.
   *
   * Sem a armadilha de foco, o Tab sai do modal e vai percorrer a lista atrás
   * dele — que continua no DOM, continua clicável pelo teclado, e o usuário
   * perde a noção de onde está. Com ela, o modal é o único lugar navegável
   * enquanto estiver aberto.
   */
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const primeiroEl = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiroEl.focus();
      } else if (e.shiftKey && document.activeElement === primeiroEl) {
        e.preventDefault();
        ultimo.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  function periodo(qual: 'mes' | 'ano' | '12m') {
    const { de, ate } = atalhoPeriodo(qual);
    setV((atual) => ({ ...atual, de, ate }));
  }

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Filtrar relatórios"
    >
      <div className="fj-modal-box mfr-box" ref={caixa}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Relatórios</div>
            <h2>Filtrar relatórios</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="mfr-corpo">
          <section className="mfr-secao">
            <h3>Período</h3>
            <div className="mfr-datas">
              <label>
                Início
                <input
                  ref={primeiro}
                  type="date"
                  value={v.de}
                  onChange={(e) => set('de', e.target.value)}
                />
              </label>
              <label>
                Fim
                <input type="date" value={v.ate} onChange={(e) => set('ate', e.target.value)} />
              </label>
            </div>
            <div className="mfr-atalhos">
              <button type="button" className="fj-btn fj-btn-ghost" onClick={() => periodo('mes')}>
                Este mês
              </button>
              <button type="button" className="fj-btn fj-btn-ghost" onClick={() => periodo('ano')}>
                Este ano
              </button>
              <button type="button" className="fj-btn fj-btn-ghost" onClick={() => periodo('12m')}>
                Últimos 12 meses
              </button>
              {(v.de || v.ate) && (
                <button
                  type="button"
                  className="fj-link mfr-limpa-periodo"
                  onClick={() => setV((a) => ({ ...a, de: '', ate: '' }))}
                >
                  limpar período
                </button>
              )}
            </div>
          </section>

          <section className="mfr-secao">
            <h3>Tipo</h3>
            <select value={v.tipo} onChange={(e) => set('tipo', e.target.value)}>
              <option value="">Todos os tipos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </section>

          <section className="mfr-secao">
            <h3>Situação</h3>
            {/* Exato sem consulta: rascunho é registro local, finalizado é o que
                veio do servidor, arquivado é o seletor de lista que já existia. */}
            <select
              value={v.situacao}
              onChange={(e) => {
                const s = e.target.value as RecorteSituacao;
                // "Só arquivados" É o modo de lista — manter os dois em
                // desacordo mostraria a lista sem arquivado nenhum e chamaria
                // isso de filtro por arquivado.
                setV((a) => ({
                  ...a,
                  situacao: s,
                  arquivo: s === 'arquivado' ? 'arquivados' : a.arquivo === 'arquivados' ? 'ativos' : a.arquivo,
                }));
              }}
            >
              <option value="">Todas as situações</option>
              <option value="rascunho">Rascunho (em edição)</option>
              <option value="finalizado">Finalizado</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </section>

          <section className="mfr-secao">
            <h3>Empresa / cliente</h3>
            <select
              value={v.empresa}
              onChange={(e) => set('empresa', e.target.value)}
              disabled={carregandoEmpresas}
            >
              <option value="">{carregandoEmpresas ? 'Carregando empresas…' : 'Todas as empresas'}</option>
              {empresas.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {empresasIncompletas && (
              <p className="mfr-nota">
                O parque é grande demais para varrer inteiro: o filtro por empresa pode não alcançar
                todos os equipamentos. Use também a busca por TAG.
              </p>
            )}
          </section>

          <section className="mfr-secao">
            <h3>Equipamentos</h3>
            <select
              value={v.escopo}
              onChange={(e) => set('escopo', e.target.value as EscopoRelatorios)}
            >
              <option value="ativos">Só os do cadastro atual</option>
              <option value="historicos">Só de equipamento excluído{rotuloHistoricos}</option>
              <option value="todos">Todos</option>
            </select>
          </section>

          {/* O seletor de lista continua existindo à parte da SITUAÇÃO porque
              ele responde outra pergunta: "quero VER os arquivados junto?" —
              enquanto a situação pergunta "quero SÓ os arquivados?". */}
          {v.situacao !== 'arquivado' && (
            <section className="mfr-secao">
              <h3>Arquivados</h3>
              <select value={v.arquivo} onChange={(e) => set('arquivo', e.target.value as ModoArquivo)}>
                <option value="ativos">Esconder os arquivados</option>
                <option value="todos">Mostrar junto com os demais</option>
              </select>
            </section>
          )}
        </div>

        <div className="mfr-acoes">
          <button
            type="button"
            className="fj-btn fj-btn-ghost mfr-limpar"
            onClick={() => setV(FILTRO_VAZIO)}
            disabled={!temAlgumFiltro(v)}
          >
            Limpar filtros
          </button>
          <div className="mfr-acoes-dir">
            <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="button" className="fj-btn fj-btn-primary" onClick={() => aoAplicar(v)}>
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
