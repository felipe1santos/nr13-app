/**
 * O filtro de `/prontuarios` — modal, e não três selects sempre na tela.
 *
 * ## O que mudou, e por quê
 *
 * Os filtros ficavam expostos numa faixa permanente entre a busca e a lista:
 * tipo, empresa e a caixa "só equipamentos com prontuário". Três controles que a
 * maioria das visitas não usa, ocupando a altura em que a primeira linha da
 * lista deveria estar. Em 386px a faixa empilhava e empurrava a lista para fora
 * da primeira tela.
 *
 * ## As duas regras
 *
 * 1. **RASCUNHO até o Aplicar** — o estado daqui é local; quem manda na lista só
 *    muda no "Aplicar". É o que dá sentido ao "Cancelar".
 * 2. **Só filtro que a lista sabe aplicar.** `tipo` vai na CONSULTA (a RPC tem o
 *    parâmetro). Empresa, categoria, situação e o recorte por documento são do
 *    CLIENTE, sobre as páginas já carregadas — e é por isso que a tela avisa
 *    quando a varredura para no teto. Nenhum filtro daqui lê prontuário: a
 *    situação sai de `temProntuario`, que vem como coluna da projeção.
 */
import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import './modalFiltrosProntuarios.css';

/** Situação, como recorte. `''` = todas. */
export type SituacaoProntuario = '' | 'com' | 'sem';

export interface ValoresFiltroPront {
  tipo: string;
  empresa: string;
  categoria: string;
  situacao: SituacaoProntuario;
}

export const FILTRO_PRONT_VAZIO: ValoresFiltroPront = {
  tipo: '',
  empresa: '',
  categoria: '',
  situacao: '',
};

/**
 * O padrão da tela NÃO é o filtro vazio.
 *
 * `/prontuarios` abre mostrando os equipamentos que TÊM prontuário — é a lista
 * de prontuários, não a de equipamentos. Por isso o estado inicial já vem com
 * `situacao: 'com'`, e "Limpar filtros" devolve a esse estado, não ao vazio:
 * limpar não pode transformar a tela em outra coisa.
 */
export const FILTRO_PRONT_PADRAO: ValoresFiltroPront = { ...FILTRO_PRONT_VAZIO, situacao: 'com' };

/**
 * Há recorte ativo? É o que acende o botão da barra e habilita o "Limpar".
 *
 * O PADRÃO é parâmetro porque as duas listas têm padrões diferentes: a de
 * DOCUMENTOS abre mostrando tudo (rascunho e emitido são as duas metades da
 * mesma lista); a de EQUIPAMENTOS abre mostrando quem TEM prontuário. Comparar
 * as duas com o mesmo padrão acenderia o filtro numa tela que ninguém filtrou.
 */
export function temAlgumFiltroPront(
  v: ValoresFiltroPront,
  padrao: ValoresFiltroPront = FILTRO_PRONT_PADRAO,
): boolean {
  return (
    v.tipo !== padrao.tipo ||
    v.empresa !== padrao.empresa ||
    v.categoria !== padrao.categoria ||
    v.situacao !== padrao.situacao
  );
}

/**
 * O ASSUNTO da lista que está sendo filtrada.
 *
 * O modal é compartilhado com a tela de Calibrações (`CatalogoCalibracoesV9`),
 * e lá ele abria escrito "Prontuários / Filtrar prontuários", com a opção
 * "Com prontuário" filtrando, na verdade, quem tem CALIBRAÇÃO. O usuário lia
 * sobre um documento que não é o daquela tela.
 */
export interface AssuntoFiltro {
  titulo: string;
  singular: string;
  plural: string;
}

const ASSUNTO_PADRAO: AssuntoFiltro = {
  titulo: 'Prontuários',
  singular: 'prontuário',
  plural: 'prontuários',
};

export default function ModalFiltrosProntuarios({
  valores,
  tipos,
  empresas,
  categorias,
  varreduraIncompleta,
  modo = 'equipamentos',
  assunto = ASSUNTO_PADRAO,
  aoAplicar,
  aoFechar,
}: {
  valores: ValoresFiltroPront;
  tipos: readonly { valor: string; rotulo: string }[];
  empresas: readonly string[];
  categorias: readonly string[];
  /** A varredura parou no teto — o recorte do cliente pode não ver tudo. */
  varreduraIncompleta: boolean;
  /**
   * O que a lista atrás está listando.
   *
   * `documentos` é a lista canônica: cada linha é um prontuário emitido ou um
   * rascunho, e ali "tipo do equipamento" e "categoria" não são filtros — o
   * índice de documentos não carrega esses campos, e oferecer um seletor que
   * não filtra nada é pior do que não oferecer. `equipamentos` é o catálogo
   * dentro do modal de criar, onde os quatro fazem sentido.
   */
  modo?: 'documentos' | 'equipamentos';
  /** O documento de que esta lista trata — ver `AssuntoFiltro`. */
  assunto?: AssuntoFiltro;
  aoAplicar: (v: ValoresFiltroPront) => void;
  aoFechar: () => void;
}) {
  const padraoDoModo = modo === 'documentos' ? FILTRO_PRONT_VAZIO : FILTRO_PRONT_PADRAO;
  const [v, setV] = useState<ValoresFiltroPront>(valores);
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLSelectElement>(null);

  const set = <K extends keyof ValoresFiltroPront>(campo: K, valor: ValoresFiltroPront[K]) =>
    setV((atual) => ({ ...atual, [campo]: valor }));

  useEffect(() => {
    primeiro.current?.focus();
  }, []);

  // ESC fecha; Tab circula dentro do modal — mesma regra do filtro de
  // relatórios, para o teclado se comportar igual nos dois lugares.
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
      const p = focaveis[0];
      const u = focaveis[focaveis.length - 1];
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

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label={`Filtrar ${assunto.plural}`}
    >
      <div className="fj-modal-box mfp-box" ref={caixa}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">{assunto.titulo}</div>
            <h2>Filtrar {assunto.plural}</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="mfp-corpo">
          <section className="mfp-secao">
            <h3>Situação</h3>
            <select
              ref={primeiro}
              value={v.situacao}
              onChange={(e) => set('situacao', e.target.value as SituacaoProntuario)}
            >
              {modo === 'documentos' ? (
                <>
                  <option value="">Todos os documentos</option>
                  <option value="com">Só emitidos</option>
                  <option value="sem">Só rascunhos</option>
                </>
              ) : (
                <>
                  <option value="com">Com {assunto.singular}</option>
                  <option value="sem">Sem {assunto.singular} ainda</option>
                  <option value="">Todos os equipamentos</option>
                </>
              )}
            </select>
            <p className="mfp-nota">
              {modo === 'documentos'
                ? 'Rascunho é trabalho em aberto; emitido é documento definitivo, com código de verificação.'
                : `O padrão é mostrar quem já tem ${assunto.singular}. "Sem ${assunto.singular} ainda" é a lista de quem falta — útil para saber o que ainda precisa ser feito.`}
            </p>
          </section>

          {modo === 'equipamentos' && (
          <section className="mfp-secao">
            <h3>Tipo do equipamento</h3>
            <select value={v.tipo} onChange={(e) => set('tipo', e.target.value)}>
              <option value="">Todos os tipos</option>
              {tipos.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </section>
          )}

          <section className="mfp-secao">
            <h3>Empresa / cliente</h3>
            <select value={v.empresa} onChange={(e) => set('empresa', e.target.value)}>
              <option value="">Todas as empresas</option>
              {empresas.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </section>

          {modo === 'equipamentos' && (
          <section className="mfp-secao">
            <h3>Categoria</h3>
            <select value={v.categoria} onChange={(e) => set('categoria', e.target.value)}>
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  Categoria {c}
                </option>
              ))}
            </select>
          </section>
          )}

          {varreduraIncompleta && (
            <p className="mfp-nota mfp-aviso">
              <Icone nome="alerttri" tam={13} /> O parque é grande demais para varrer inteiro de uma
              vez: empresa e categoria podem não alcançar todos os equipamentos. Use também a busca
              por TAG.
            </p>
          )}
        </div>

        <div className="mfp-acoes">
          <button
            type="button"
            className="fj-btn fj-btn-ghost mfp-limpar"
            /* No modo DOCUMENTOS o padrão é mostrar tudo — rascunho e emitido
               são as duas metades da mesma lista. No de EQUIPAMENTOS o padrão é
               "com prontuário", senão limpar transformaria a lista de
               prontuários na lista de equipamentos. */
            onClick={() => setV(padraoDoModo)}
            disabled={!temAlgumFiltroPront(v, padraoDoModo)}
          >
            Limpar filtros
          </button>
          <div className="mfp-acoes-dir">
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
